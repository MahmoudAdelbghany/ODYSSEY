import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SITE_BY_ID, siteTerrain } from '../science/data.ts';
import { earthSiteProfile, missing, planetaryProfile, type Measurement } from '../science/profile.ts';
import { compareMeasurements } from '../science/mismatch.ts';
import { decomposeMission } from '../../src/mission/index.ts';
import { evaluateRequirement } from '../../src/mission/evaluate.ts';
import { EVIDENCE_REGISTRY, evidenceSpec, rockExposureBound, STATE_INFO, thresholdBasis } from '../../src/mission/evidence.ts';
import type { RequirementSpec } from '../../src/mission/types.ts';
import { comparisonBadge } from '../../src/workspace/labels.ts';
import { describeSearch, investigateDeterministic } from '../agent/investigate.ts';
import { initialState } from '../agent/state.ts';
import { TOOL_BY_NAME } from '../agent/tools.ts';
import { config } from '../config.ts';

const moon = planetaryProfile('moon_south_pole');
const site = (id: string) => SITE_BY_ID.get(id)!;
const profile = (id: string) => earthSiteProfile(site(id));
const BRIEF = 'Plan a seven-day simulated lunar surface expedition that includes geological sampling, rover navigation, equipment deployment, thermal survival and dust mitigation.';
const mission = decomposeMission(BRIEF, 'expedition', 'Lunar expedition', [], {
  archetypes: ['geological_sampling', 'rover_navigation', 'equipment_deployment', 'thermal_survival', 'dust_aeolian'].map((id) => ({ id, terms: [], source: 'brief' as const })),
});
const req = (metric: string) => mission.experiments.flatMap((e) => e.requirements).find((r) => r.metric === metric)!;
const evalAt = (r: RequirementSpec, id: string) => evaluateRequirement(r, site(id), siteTerrain.sites[id]);

test('every metric used by the demonstration mission has a registry entry', () => {
  for (const r of mission.experiments.flatMap((e) => e.requirements)) {
    assert.ok(EVIDENCE_REGISTRY[r.metric], `no evidence specification for ${r.metric}`);
  }
});

test('a metric without a registry mapping is "not investigated", never "no open data"', () => {
  const spec = evidenceSpec('notARealMetric' as never);
  assert.equal(spec.stateWithoutValue, 'not_investigated');
  assert.equal(STATE_INFO[spec.stateWithoutValue].outcome, 'investigation_needed');
});

test('a dataset found but not integrated is an integration gap, not a failed requirement', () => {
  const r = req('dustFlux');
  const ev = evalAt(r, 'bodele');
  assert.equal(ev.status, 'missing');
  assert.equal(ev.score, null);
  assert.equal(ev.evidence?.state, 'source_found_not_integrated');
  assert.equal(ev.evidence?.outcome, 'integration_needed');
  assert.ok(EVIDENCE_REGISTRY.dustFlux.datasets.some((d) => d.status === 'not_integrated' && /M2TMNXADG/.test(d.id)));
});

test('dust flux is never inferred from aerosol optical depth', () => {
  const aod = EVIDENCE_REGISTRY.dustFlux.datasets.find((d) => /aerosol optical depth/i.test(d.id));
  assert.equal(aod?.status, 'rejected');
});

test('a dataset that does not cover the location says so, and does not fail the site', () => {
  assert.equal(rockExposureBound('dryvalleys'), 'no_coverage');
  const ev = evalAt(req('rockExposure'), 'dryvalleys');
  assert.equal(ev.evidence?.state, 'not_covering_location');
  assert.equal(ev.status, 'missing');
});

test('an upper-bound proxy can disprove a requirement but never prove it', () => {
  const r = req('rockExposure');
  const low = evalAt(r, 'nullarbor');
  assert.equal(low.status, 'fail', 'a bare-ground bound below the limit rules the site out');
  assert.equal(low.evidence?.state, 'validated_proxy');
  const high = evalAt(r, 'atacama');
  assert.equal(rockExposureBound('atacama') && typeof rockExposureBound('atacama') === 'object' ? (rockExposureBound('atacama') as { value: number }).value : 0, 100);
  assert.equal(high.status, 'missing', '100% bare ground does not establish rock exposure');
  assert.equal(high.score, null);
  assert.equal(high.evidence?.state, 'field_measurement_required');
});

test('a geological unit is not evidence of rock exposure', () => {
  const macro = EVIDENCE_REGISTRY.rockExposure.datasets.find((d) => d.name === 'Macrostrat');
  assert.equal(macro?.status, 'rejected');
});

test('bearing strength needs field measurement and is never inferred from soil or lithology', () => {
  const ev = evalAt(req('bearingStrength'), 'mojave');
  assert.equal(ev.evidence?.state, 'field_measurement_required');
  assert.equal(ev.evidence?.outcome, 'field_measurement');
  assert.match(ev.evidence!.next, /ASTM D6951/);
  for (const d of EVIDENCE_REGISTRY.bearingStrength.datasets) assert.equal(d.status, 'rejected', `${d.name} must not be used as strength`);
});

test('thermal inertia is not inferred from temperature; the requirement uses SI units and the right direction', () => {
  const r = req('thermalInertia');
  assert.equal(r.direction, 'lower');
  assert.doesNotMatch(r.statement, /≥ 500/);
  const ati = EVIDENCE_REGISTRY.thermalInertia.datasets.find((d) => /Apparent/.test(d.id));
  assert.equal(ati?.status, 'rejected');
  assert.equal(evalAt(r, 'atacama').evidence?.state, 'field_measurement_required');
});

test('valid derived measurements are labelled as derived, with the DEM accuracy limit stated', () => {
  const ev = evalAt(req('roughness'), 'atacama');
  assert.equal(ev.evidence?.state, 'verified_derived');
  assert.notEqual(ev.value, null);
  assert.match(ev.evidence!.limitation, /< 2 m/);
  assert.match(req('roughness').statement, /120 m window/);
});

test('hand-assigned indices are unvalidated estimates, not derived measurements', () => {
  assert.equal(evalAt(req('access'), 'mojave').evidence?.state, 'unvalidated_estimate');
  assert.equal(evalAt(req('dust'), 'mojave').evidence?.state, 'unvalidated_estimate');
});

test('physically impossible conditions are physical mismatches, not evidence gaps', () => {
  const ev = evalAt(req('gravity'), 'atacama');
  assert.equal(ev.evidence?.outcome, 'physical_mismatch');
  assert.equal(ev.status, 'not-applicable');
});

test('Earth data present but the target missing is reported on the target side', () => {
  const c = compareMeasurements(profile('atacama').measurements['thermal.surfaceNight'], moon.measurements['thermal.surfaceNight']);
  assert.equal(c.classification, 'missing');
  assert.equal(c.gapSide, 'target');
  assert.equal(c.targetState, 'source_found_not_integrated');
  assert.equal(comparisonBadge(c).label, 'Target value missing');
});

test('target present but Earth missing is reported on the Earth side', () => {
  const c = compareMeasurements(profile('atacama').measurements['thermal.inertia'], moon.measurements['thermal.inertia']);
  assert.equal(c.gapSide, 'earth');
  assert.equal(c.gapOutcome, 'field_measurement');
  assert.equal(comparisonBadge(c).label, 'Needs field data');
});

test('a quantity that does not exist on the target is not applicable, not missing data', () => {
  assert.equal(moon.measurements['thermal.airRange'].evidenceState, 'not_applicable');
  const c = compareMeasurements(profile('atacama').measurements['atmosphere.aerosol'], moon.measurements['atmosphere.aerosol']);
  assert.equal(c.gapOutcome, 'not_applicable');
  assert.equal(comparisonBadge(c).label, 'Not applicable');
});

test('incompatible units are refused, never classified as a mismatch', () => {
  const e: Measurement = { ...profile('atacama').measurements['terrain.relief'], unit: 'ft' };
  const c = compareMeasurements(e, moon.measurements['terrain.relief']);
  assert.equal(c.classification, 'incompatible_support');
  assert.equal(c.gapOutcome, 'integration_needed');
});

test('a missing measurement is never a failed environmental match', () => {
  const c = compareMeasurements(missing('geology.mineralogy', 'x', 'source_found_not_integrated'), missing('geology.mineralogy', 'y'));
  assert.equal(c.classification, 'missing');
  assert.notEqual(c.gapOutcome, 'physical_mismatch');
});

test('lithology classes need a geological match, not a shared word', () => {
  // Pyroclastic breccia is not lunar impact breccia.
  const iceland = compareMeasurements(profile('iceland').measurements['geology.lithology'], moon.measurements['geology.lithology']);
  assert.equal(iceland.classification, 'mismatch');
  const anorthosite: Measurement = { ...profile('mojave').measurements['geology.lithology'], note: 'plutonic: anorthosite' };
  assert.equal(compareMeasurements(anorthosite, moon.measurements['geology.lithology']).classification, 'analog');
});

test('threshold provenance: recipe defaults are proposed assumptions, never presented as stated or sourced', () => {
  const t = thresholdBasis(req('slopeP95'));
  assert.equal(t.basis, 'archetype_assumption');
  assert.match(t.note, /not a NASA requirement/);
  assert.equal(thresholdBasis(req('dustFlux')).basis, 'agent_proposed');
  const stated = decomposeMission(`${BRIEF} Slopes must stay below 10°.`, 'expedition', 'Lunar expedition', []);
  const fromBrief = stated.experiments.flatMap((e) => e.requirements).filter((r) => r.source === 'brief');
  assert.ok(fromBrief.length >= 1, 'the stated slope limit must produce at least one brief requirement');
  for (const r of fromBrief) assert.equal(thresholdBasis(r).basis, 'user_stated');
});

test('an investigation never changes a value or a requirement status', () => {
  const r = req('bearingStrength');
  const before = evalAt(r, 'mojave');
  const record = investigateDeterministic('metric:bearingStrength', 'moon_south_pole');
  record.searches.push({ query: 'x', status: 'ok', results: [{ title: 'Bearing capacity 45 kPa measured at Mojave', url: 'https://www.usgs.gov/x' }] });
  const after = evalAt(r, 'mojave');
  assert.deepEqual(after.status, before.status);
  assert.equal(after.value, null);
  assert.match(describeSearch(record.searches[0]), /unverified/);
});

test('a failed or skipped search is not reported as proof that data does not exist', () => {
  assert.match(describeSearch({ query: 'q', status: 'failed', results: [], error: 'HTTP 500' }), /not evidence that no dataset exists/);
  assert.match(describeSearch({ query: 'q', status: 'skipped_budget', results: [] }), /says nothing about whether a dataset exists/);
  assert.match(describeSearch({ query: 'q', status: 'ok', results: [] }), /not proof/);
});

test('search budget exhaustion is recorded as skipped, without calling the network', async () => {
  const state = initialState('00000000-0000-0000-0000-000000000000', BRIEF);
  state.parsed = { target: 'moon_south_pole', body: 'Moon' } as never;
  state.budgets.searchCalls = config.budgets.maxSearchCalls;
  const tool = TOOL_BY_NAME.get('investigate_evidence_gap')!;
  const result = await tool.run({ key: 'metric:dustFlux', search: true }, { state, store: null as never, llm: null, signal: new AbortController().signal, sessionId: 't', emit: () => {} });
  const data = result.data as { searches: Array<{ status: string }>; state: string };
  assert.equal(data.searches[0].status, 'skipped_budget');
  assert.equal(data.state, 'source_found_not_integrated');
  assert.ok(state.evidenceInvestigations?.['metric:dustFlux']);
});

test('a dimension investigation points to other locations that carry the missing evidence', () => {
  const inv = investigateDeterministic('dimension:geology.lithology', 'moon_south_pole');
  assert.ok(inv.alternatives.some((a) => a.id === 'manicouagan'), 'Manicouagan is mapped as anorthosite in Macrostrat');
});

test('the lunar thermal inertia reference is the verified 55 ± 2, not a mangled snippet value', () => {
  const m = moon.measurements['thermal.inertia'];
  assert.equal(m.value, 55);
  assert.equal(m.uncertainty, 2);
  assert.match(m.source, /55 ±2/);
});

test('before the report, every required gap gets a recorded explanation', async () => {
  const { completeInvestigations, pendingGapKeys } = await import('../agent/investigate.ts');
  const state = initialState('00000000-0000-0000-0000-000000000001', BRIEF);
  state.mission = mission;
  const keys = pendingGapKeys(state);
  for (const k of ['metric:rockExposure', 'metric:bearingStrength', 'metric:thermalInertia', 'metric:dustFlux']) assert.ok(keys.includes(k), `${k} should be pending`);
  completeInvestigations(state, 'moon_south_pole');
  for (const k of keys) assert.ok(state.evidenceInvestigations?.[k], `${k} was not explained`);
  assert.equal(state.evidenceInvestigations?.['metric:dustFlux'].outcome, 'integration_needed');
  assert.equal(state.evidenceInvestigations?.['metric:bearingStrength'].outcome, 'field_measurement');
});
