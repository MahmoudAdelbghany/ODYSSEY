import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SITES, SITE_BY_ID } from '../science/data.ts';
import { DIMENSIONS, earthSiteProfile, maxContinuousDarknessDays, missing, planetaryProfile, type Measurement } from '../science/profile.ts';
import { alignBaseline, compareMeasurements, detectMismatches } from '../science/mismatch.ts';
import { MODELS, proposeInterventions } from '../science/interventions.ts';

const moon = planetaryProfile('moon_south_pole');
const mars = planetaryProfile('mars_jezero');
const site = (id: string) => earthSiteProfile(SITE_BY_ID.get(id)!);

test('every dimension is declared on every profile; missing stays MISSING, never zero', () => {
  for (const s of SITES.slice(0, 10)) {
    const p = earthSiteProfile(s);
    for (const d of DIMENSIONS) {
      const m = p.measurements[d.key];
      assert.ok(m, `${s.id} lacks ${d.key}`);
      if (m.status === 'MISSING') {
        assert.equal(m.value, null);
        assert.equal(m.range, null);
      }
    }
  }
  // Verified from the Hayne et al. 2017 abstract (55 ± 2, not the "552" a stripped snippet shows).
  assert.equal(moon.measurements['thermal.inertia'].status, 'PUBLISHED');
  assert.equal(moon.measurements['thermal.inertia'].value, 55);
  assert.equal(mars.measurements['radiation.doseRate'].status, 'MISSING', 'Mars dose is not asserted without verified full text');
});

test('a missing measurement is never classified as a match', () => {
  const c = compareMeasurements(missing('geology.mineralogy', 'x'), missing('geology.mineralogy', 'y'));
  assert.equal(c.classification, 'missing');
  const thermalInertia = compareMeasurements(site('atacama').measurements['thermal.inertia'], moon.measurements['thermal.inertia']);
  assert.equal(thermalInertia.classification, 'missing');
  assert.equal(thermalInertia.gapSide, 'earth');
  assert.equal(thermalInertia.gapOutcome, 'field_measurement');
});

test('air temperature and surface temperature are never compared', () => {
  const air = site('atacama').measurements['thermal.airRange'];
  const surface = { ...moon.measurements['thermal.surfaceRange'] };
  const c = compareMeasurements(air, surface);
  assert.equal(c.classification, 'incompatible_support');
  assert.match(c.reason, /Cannot compare/);
});

test('thermal inertia is not a temperature', () => {
  const inertia: Measurement = { ...site('atacama').measurements['thermal.surfaceRange'], dimension: 'thermal.inertia', quantity: 'thermal_inertia' };
  assert.equal(compareMeasurements(inertia, moon.measurements['thermal.surfaceRange']).classification, 'incompatible_support');
});

test('incompatible temporal supports are refused', () => {
  const e = { ...site('atacama').measurements['thermal.surfaceRange'], support: { ...site('atacama').measurements['thermal.surfaceRange'].support, temporal: 'diurnal_cycle' as const } };
  const c = compareMeasurements(e, moon.measurements['thermal.surfaceRange']);
  assert.equal(c.classification, 'incompatible_support');
});

test('different DEM baselines are refused; Mars comparisons use the 463 m Earth window', () => {
  const earth = site('atacama');
  const c = compareMeasurements(earth.measurements['terrain.slopeMean'], mars.measurements['terrain.slopeMean']);
  assert.equal(c.classification, 'incompatible_support');
  const aligned = alignBaseline(earth, mars);
  assert.equal(aligned.measurements['terrain.slopeMean'].support.resolutionM, 463);
  assert.notEqual(compareMeasurements(aligned.measurements['terrain.slopeMean'], mars.measurements['terrain.slopeMean']).classification, 'incompatible_support');
});

test('planet-wide conditions are not naturally reproducible anywhere on Earth', () => {
  for (const id of ['atacama', 'devon', 'dryvalleys']) {
    const e = site(id);
    for (const dim of ['gravity.surface', 'atmosphere.pressure', 'atmosphere.composition', 'radiation.doseRate']) {
      assert.equal(compareMeasurements(e.measurements[dim], moon.measurements[dim]).classification, 'not_naturally_reproducible', `${id} ${dim}`);
    }
    // Mars gravity is 2.6x smaller: still not reproducible, never "partial".
    assert.equal(compareMeasurements(e.measurements['gravity.surface'], mars.measurements['gravity.surface']).classification, 'not_naturally_reproducible');
  }
});

test('envelope comparison measures coverage of the TARGET envelope', () => {
  const c = compareMeasurements(site('devon').measurements['thermal.surfaceRange'], moon.measurements['thermal.surfaceRange']);
  assert.equal(c.overlapFraction, 0);
  assert.equal(c.classification, 'mismatch');
  assert.match(c.reason, /covers 0%/);
});

test('relative differences are only reported on ratio scales', () => {
  const temp = compareMeasurements(site('atacama').measurements['thermal.surfaceRange'], moon.measurements['thermal.surfaceRange']);
  assert.equal(temp.relativeDifference, null);
  const g = compareMeasurements(site('atacama').measurements['gravity.surface'], moon.measurements['gravity.surface']);
  assert.ok(g.ratio && Math.abs(g.ratio - 9.82 / 1.62) < 1e-3);
});

test('qualitative planetary references are not compared numerically', () => {
  const qualitative = { ...moon.measurements['illumination.maxDarkness'], value: null, range: null };
  const c = compareMeasurements(site('svalbard').measurements['illumination.maxDarkness'], qualitative);
  assert.equal(c.classification, 'missing');
  assert.match(c.reason, /qualitative/);
});

test('lunar darkness uses the published 1.5-day point value as a ratio, not a loose tolerance', () => {
  const ref = moon.measurements['illumination.maxDarkness'];
  assert.equal(ref.value, 1.5);
  assert.match(ref.source, /about 1.5 days/);
  const tropics = compareMeasurements(site('atacama').measurements['illumination.maxDarkness'], ref);
  assert.equal(tropics.classification, 'partial', '0.5 d vs 1.5 d is a factor of 3, not an analog');
  const polar = compareMeasurements(site('svalbard').measurements['illumination.maxDarkness'], ref);
  assert.equal(polar.classification, 'mismatch');
});

test('polar night geometry', () => {
  assert.equal(maxContinuousDarknessDays(0), 0.5);
  assert.equal(maxContinuousDarknessDays(-45), 0.5);
  const svalbard = maxContinuousDarknessDays(78.2);
  assert.ok(svalbard > 100 && svalbard < 140, `svalbard ${svalbard}`);
});

test('every published planetary constant carries a source; verified fact-sheet values', () => {
  for (const m of [...Object.values(moon.measurements), ...Object.values(mars.measurements)]) {
    if (m.status !== 'MISSING') assert.ok(m.source && m.source !== 'none', `${m.dimension} lacks source`);
  }
  assert.equal(moon.measurements['gravity.surface'].value, 1.62);
  assert.equal(mars.measurements['gravity.surface'].value, 3.73);
  assert.equal(moon.measurements['radiation.doseRate'].value, 13.2);
  assert.match(moon.measurements['radiation.doseRate'].support.description, /silicon/);
});

test('mismatch findings decide whether a gap matters and how to bridge it', () => {
  const findings = detectMismatches('thermal_survival', 'thermal_survival', site('atacama'), moon);
  const pressure = findings.find((f) => f.dimension === 'atmosphere.pressure')!;
  assert.equal(pressure.matters, true);
  assert.equal(pressure.handling, 'controlled_intervention');
  const gravity = detectMismatches('rover_navigation', 'rover_navigation', site('atacama'), moon).find((f) => f.dimension === 'gravity.surface')!;
  assert.equal(gravity.handling, 'numerical_simulation');
});

test('interventions never write into an environmental profile', () => {
  const profile = site('atacama');
  const before = JSON.stringify(profile);
  const finding = detectMismatches('thermal_survival', 'thermal_survival', profile, moon).find((f) => f.dimension === 'thermal.surfaceRange')!;
  const specs = proposeInterventions(finding, moon);
  assert.ok(specs.length > 0);
  for (const s of specs) {
    assert.ok(['PROPOSED CONTROLLED CONDITION', 'SIMULATED', 'CONCEPT ONLY'].includes(s.label));
    assert.equal(s.cost.value, null, 'cost is never invented');
    assert.equal(s.power.value, null, 'power is never invented');
  }
  assert.equal(JSON.stringify(profile), before);
});

test('first-order models are correct and declare their validity', () => {
  const pd = MODELS.vacuumPumpdown({ volumeM3: 10, pumpSpeedLps: 500, startPa: 101325, targetPa: 100 });
  assert.equal(pd.outputs.pumpdownTime.value, Math.round(20 * Math.log(1013.25)));
  assert.equal(pd.label, 'SIMULATED');
  const deep = MODELS.vacuumPumpdown({ volumeM3: 10, pumpSpeedLps: 500, startPa: 101325, targetPa: 1e-3 });
  assert.equal(deep.label, 'CONCEPT ONLY');
  assert.equal(deep.outputs.pumpdownTime.value, null, 'no number outside validity');
  const re = MODELS.radiativeEquilibrium({ irradianceWm2: 1361, absorptivity: 0.9, emissivity: 0.85, incidenceDeg: 0, shroudK: 0 });
  const expected = Math.pow((0.9 * 1361) / (0.85 * 5.670374419e-8), 0.25);
  assert.ok(Math.abs(re.outputs.equilibriumTemperature.value! - expected) < 0.1);
  const g = MODELS.gravityOffload({ massKg: 100, targetG: 1.62 });
  assert.ok(Math.abs(g.outputs.offloadForce.value! - 100 * (9.80665 - 1.62)) < 0.1);
  assert.throws(() => MODELS.gravityOffload({ massKg: 100, targetG: 12 }));
  const cycle = MODELS.thermalCycleProtocol({ lowK: 100, highK: 250, rampKPerMin: 1, dwellH: 2, cycles: 2 });
  assert.equal(cycle.label, 'PROPOSED CONTROLLED CONDITION');
  assert.equal(cycle.steps.length, 8);
  assert.ok(Math.abs(cycle.totalHours - 2 * (2 * 2 + 2 * 2.5)) < 0.01);
});
