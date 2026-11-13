/**
 * Evidence-gap investigation.
 *
 * For one requirement metric or one comparison dimension, explain what ODYSSEY
 * holds, which sources were investigated and why each was or was not used,
 * whether another location carries the missing evidence, and what to do next.
 *
 * Search results are recorded as unverified leads. Nothing here writes a value
 * into a profile or changes a requirement status: a lead becomes evidence only
 * through retrieve_source and verify_source, and a failed search is never
 * reported as proof that no dataset exists.
 */
import { discovery } from '../science/data.ts';
import { DIMENSION_BY_KEY, DIMENSION_GAPS, planetaryProfile } from '../science/profile.ts';
import { EVIDENCE_REGISTRY, STATE_INFO, type DatasetRef, type EvidenceState, type GapOutcome } from '../../src/mission/evidence.ts';
import type { MetricKey } from '../../src/mission/index.ts';
import type { AgentState } from './state.ts';

export interface InvestigationSearch {
  query: string;
  status: 'ok' | 'failed' | 'skipped_budget';
  results: Array<{ title: string; url: string }>;
  error?: string;
}

export interface EvidenceInvestigation {
  key: string;
  label: string;
  quantity: string;
  side: 'earth' | 'target' | 'both';
  state: EvidenceState;
  outcome: GapOutcome;
  integrated: Array<Pick<DatasetRef, 'name' | 'measures' | 'reason'>>;
  notIntegrated: Array<Pick<DatasetRef, 'name' | 'access' | 'reason'>>;
  rejected: Array<Pick<DatasetRef, 'name' | 'reason'>>;
  alternatives: Array<{ id: string; name: string; country: string; lat: number; lon: number; why: string }>;
  searches: InvestigationSearch[];
  conclusion: string;
  nextAction: string;
  at: string;
}

const slim = {
  integrated: (d: DatasetRef) => ({ name: d.name, measures: d.measures, reason: d.reason }),
  notIntegrated: (d: DatasetRef) => ({ name: d.name, access: d.access, reason: d.reason }),
  rejected: (d: DatasetRef) => ({ name: d.name, reason: d.reason }),
};

/** Discovery candidates whose mapped geology matches the target lithology class. */
function lithologyAlternatives(target: 'moon_south_pole' | 'mars_jezero') {
  const ref = planetaryProfile(target).measurements['geology.lithology'];
  if (!ref.categories) return [];
  const terms = [...ref.categories.analog, ...ref.categories.partial];
  return discovery.candidates
    .map((c) => {
      const lith = `${c.geology?.lith ?? ''} ${c.geology?.unit ?? ''}`.toLowerCase();
      const term = terms.find((t) => lith.includes(t));
      return term ? { id: c.id, name: c.name, country: c.country, lat: c.lat, lon: c.lon, why: `Macrostrat: "${c.geology?.lith}" (matches "${term}"). Discovery candidate, not yet evaluated as a mission site.` } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .slice(0, 6);
}

export function investigateDeterministic(key: string, target: 'moon_south_pole' | 'mars_jezero'): EvidenceInvestigation {
  const at = new Date().toISOString();
  if (key.startsWith('metric:')) {
    const metric = key.slice(7) as MetricKey;
    const spec = EVIDENCE_REGISTRY[metric];
    if (!spec) throw new Error(`Unknown metric "${metric}"`);
    const integrated = spec.datasets.filter((d) => d.status === 'integrated');
    const notIntegrated = spec.datasets.filter((d) => d.status === 'not_integrated');
    const rejected = spec.datasets.filter((d) => d.status === 'rejected');
    const state = spec.stateWithoutValue;
    const parts = [
      integrated.length ? `Integrated: ${integrated.map((d) => d.name).join(', ')}.` : 'No dataset for this quantity is integrated.',
      notIntegrated.length ? `Found but not integrated: ${notIntegrated.map((d) => `${d.name} (${d.reason})`).join(' ')}` : '',
      rejected.length ? `Not suitable: ${rejected.map((d) => `${d.name}: ${d.reason}`).join(' ')}` : '',
      `Missing: ${spec.whatMissing}`,
    ];
    return {
      key,
      label: spec.quantity,
      quantity: `${spec.quantity} (${spec.unit || 'unitless'})`,
      side: 'earth',
      state,
      outcome: STATE_INFO[state].outcome,
      integrated: integrated.map(slim.integrated),
      notIntegrated: notIntegrated.map(slim.notIntegrated),
      rejected: rejected.map(slim.rejected),
      alternatives: [],
      searches: [],
      conclusion: parts.filter(Boolean).join(' '),
      nextAction: spec.nextAction,
      at,
    };
  }
  if (key.startsWith('dimension:')) {
    const dimension = key.slice(10);
    const def = DIMENSION_BY_KEY.get(dimension);
    if (!def) throw new Error(`Unknown dimension "${dimension}"`);
    const side = target === 'moon_south_pole' ? 'moon' : 'mars';
    const planet = planetaryProfile(target).measurements[dimension];
    const earthGap = DIMENSION_GAPS[dimension]?.earth;
    const targetGap = planet.status === 'MISSING' ? DIMENSION_GAPS[dimension]?.[side] ?? { state: planet.evidenceState ?? 'not_investigated', note: planet.note, next: planet.nextAction ?? '' } : null;
    const gapSide: EvidenceInvestigation['side'] = earthGap && targetGap ? 'both' : targetGap ? 'target' : 'earth';
    const primary = gapSide === 'target' ? targetGap! : earthGap ?? targetGap;
    const state: EvidenceState = primary?.state ?? 'not_investigated';
    const alternatives = dimension === 'geology.lithology' ? lithologyAlternatives(target) : [];
    const conclusion = [
      earthGap ? `Earth side: ${earthGap.note}` : 'Earth side: values exist for curated sites.',
      targetGap ? `Target side: ${targetGap.note}` : `Target side: ${planet.source}`,
      alternatives.length ? `Locations outside the curated set whose mapped geology matches the target class: ${alternatives.map((a) => a.name).join(', ')}.` : '',
    ];
    return {
      key,
      label: def.label,
      quantity: `${def.quantity} (${def.unit})`,
      side: gapSide,
      state,
      outcome: STATE_INFO[state].outcome,
      integrated: [],
      notIntegrated: [],
      rejected: [],
      alternatives,
      searches: [],
      conclusion: conclusion.filter(Boolean).join(' '),
      nextAction: [earthGap?.next, targetGap?.next].filter(Boolean).join(' '),
      at,
    };
  }
  throw new Error('key must start with "metric:" or "dimension:"');
}

/** Turn a recorded search into a sentence that never overstates what it found. */
export function describeSearch(s: InvestigationSearch): string {
  if (s.status === 'skipped_budget') return `Search skipped: budget exhausted. This says nothing about whether a dataset exists.`;
  if (s.status === 'failed') return `Search failed (${s.error ?? 'error'}). A failed search is not evidence that no dataset exists.`;
  if (!s.results.length) return `Search "${s.query}" returned no allow-listed results. That is a search outcome, not proof the data does not exist.`;
  return `Search returned ${s.results.length} allow-listed lead(s). They are unverified and are not counted as evidence until retrieved and verified.`;
}

/** Gaps the run should explain: required conditions with no usable value, and unresolved Earth-wide gaps. */
export function pendingGapKeys(state: AgentState): string[] {
  const keys: string[] = [];
  for (const e of state.mission?.experiments ?? []) {
    for (const r of e.requirements) {
      if (r.kind !== 'required') continue;
      const spec = EVIDENCE_REGISTRY[r.metric];
      if (r.metric === 'rockExposure' || (spec && !STATE_INFO[spec.stateWithoutValue].usable && spec.method === 'Not computed.')) keys.push(`metric:${r.metric}`);
    }
  }
  for (const gaps of Object.values(state.earthWideGaps)) for (const g of gaps) if (g.kind === 'unresolved_evidence') keys.push(`dimension:${g.dimension}`);
  return [...new Set(keys)];
}

/** Record a deterministic investigation for every pending gap that has none yet. No network. */
export function completeInvestigations(state: AgentState, target: 'moon_south_pole' | 'mars_jezero'): string[] {
  const added: string[] = [];
  const done = state.evidenceInvestigations ?? {};
  for (const key of pendingGapKeys(state)) {
    if (done[key]) continue;
    try {
      done[key] = investigateDeterministic(key, target);
      added.push(key);
    } catch {
      // unknown key: nothing to record
    }
  }
  state.evidenceInvestigations = done;
  return added;
}
