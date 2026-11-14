import type { GapFields } from '../agent/api';
export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'muted' | 'sci' | 'field';

export const TOOL_LABEL: Record<string, string> = {
  parse_mission: 'Read the mission brief',
  decompose_experiments: 'Split the mission into experiments',
  extract_requirements: 'Listed requirements',
  discover_global_regions: 'Queried the global discovery screen',
  search_earth_evidence: 'Searched evidence for Earth sites',
  search_planetary_reference: 'Searched planetary references',
  retrieve_source: 'Retrieved a source',
  verify_source: 'Checked a claim against a source',
  compare_measurements: 'Compared a site with the target',
  evaluate_requirement: 'Evaluated a requirement',
  detect_environmental_mismatch: 'Found where Earth falls short',
  rank_candidate_regions: 'Ranked candidate sites',
  rerank_evidence: 'Reranked by mission relevance',
  analyze_temporal_window: 'Checked field windows',
  find_intervention_options: 'Proposed interventions',
  evaluate_intervention: 'Modelled an intervention',
  optimize_campaign: 'Optimised the campaign',
  generate_mission_report: 'Wrote the mission report',
};

export const PHASES: Array<{ key: string; label: string }> = [
  { key: 'understanding', label: 'Reading the brief' },
  { key: 'requirements', label: 'Defining requirements' },
  { key: 'discovery', label: 'Finding candidates' },
  { key: 'evidence', label: 'Gathering evidence' },
  { key: 'analysis', label: 'Comparing with the target' },
  { key: 'interventions', label: 'Designing interventions' },
  { key: 'campaign', label: 'Planning the campaign' },
  { key: 'done', label: 'Report ready' },
];

export const DECISION: Record<string, { label: string; tone: Tone }> = {
  viable: { label: 'Recommended', tone: 'ok' },
  downgraded: { label: 'Usable with gaps', tone: 'warn' },
  rejected: { label: 'Rejected', tone: 'bad' },
};

export const COMPARISON: Record<string, { label: string; tone: Tone }> = {
  analog: { label: 'Matches', tone: 'ok' },
  partial: { label: 'Partial', tone: 'info' },
  mismatch: { label: 'Does not match', tone: 'warn' },
  not_naturally_reproducible: { label: 'Impossible on Earth', tone: 'bad' },
  incompatible_support: { label: 'Not comparable', tone: 'muted' },
  missing: { label: 'No data', tone: 'muted' },
};

export const HANDLING: Record<string, string> = {
  natural_analog: 'Available naturally at this site',
  choose_better_site: 'Look for a better site',
  controlled_intervention: 'Needs a controlled facility',
  numerical_simulation: 'Needs simulation or offloading',
  acknowledge_residual: 'Accept as a known limitation',
  needs_measurement: 'Needs a measurement first',
};

export const EVIDENCE: Record<string, { label: string; tone: Tone }> = {
  supported: { label: 'Verified', tone: 'ok' },
  contradicted: { label: 'Contradicted', tone: 'bad' },
  unresolved: { label: 'Checked, not confirmed', tone: 'warn' },
  retrieved: { label: 'Retrieved', tone: 'info' },
  pending_review: { label: 'Not yet checked', tone: 'muted' },
  retrieval_failed: { label: 'Could not retrieve', tone: 'muted' },
};

export const EPISTEMIC: Record<string, { label: string; tone: Tone }> = {
  MEASURED: { label: 'Measured', tone: 'ok' },
  DERIVED: { label: 'Derived', tone: 'ok' },
  MODELED: { label: 'Modelled', tone: 'info' },
  PUBLISHED: { label: 'Published', tone: 'info' },
  ESTIMATED: { label: 'Estimated', tone: 'warn' },
  SEARCHED: { label: 'Search result', tone: 'muted' },
  PENDING_REVIEW: { label: 'Pending review', tone: 'muted' },
  PROPOSED: { label: 'Proposed', tone: 'warn' },
  SIMULATED: { label: 'Simulated', tone: 'info' },
  MISSING: { label: 'Missing', tone: 'muted' },
};

export const INTERVENTION_LABEL: Record<string, { label: string; tone: Tone }> = {
  'PROPOSED CONTROLLED CONDITION': { label: 'Proposed setpoint', tone: 'warn' },
  SIMULATED: { label: 'Simulated', tone: 'info' },
  'CONCEPT ONLY': { label: 'Concept only', tone: 'muted' },
};

export const RANKING_LABEL: Record<string, string> = {
  experimentalSuitability: 'Experiment fit',
  terrainSimilarity: 'Terrain vs target',
  thermalCompatibility: 'Thermal vs target',
  geologicalRelevance: 'Geology',
  operationalFeasibility: 'Access and operations',
  evidenceCompleteness: 'Evidence coverage',
  interventionFeasibility: 'Gaps that can be bridged',
};

export const REQUIREMENT_KIND: Record<string, string> = {
  required: 'Required',
  preferred: 'Preferred',
  operational: 'Operational',
  facility: 'Facility only',
  impossible: 'Not possible on Earth',
};

export const cap = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

/** Replace em dashes in text that comes from data or the model. */
export function clean(text: string | null | undefined): string {
  return (text ?? '').replace(/\s*\u2014\s*/g, ', ').replace(/\s+,/g, ',');
}

export function fmtValue(value: number | null, range: [number, number] | null, unit: string): string | null {
  if (unit === 'Pa') {
    const v = range ? Math.max(Math.abs(range[0]), Math.abs(range[1])) : Math.abs(value ?? 0);
    if (v >= 1000) return fmtValue(value == null ? null : value / 1000, range ? [range[0] / 1000, range[1] / 1000] : null, 'kPa');
  }
  const u = unit === '-' || unit === '0-1' ? '' : unit === 'deg' ? '°' : unit === 'm/s2' ? ' m/s²' : unit === 'W/m2' ? ' W/m²' : ` ${unit}`;
  const f = (v: number) => (Math.abs(v) !== 0 && (Math.abs(v) < 1e-3 || Math.abs(v) >= 1e5) ? v.toExponential(1) : Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en') : String(Math.round(v * 100) / 100));
  if (range) return `${f(range[0])} to ${f(range[1])}${u}`;
  if (value != null) return `${f(value)}${u}`;
  return null;
}

export const DIMENSION_SHORT: Record<string, string> = {
  'terrain.slopeMean': 'Mean slope',
  'terrain.slopeP95': 'Steep slopes (95th pct.)',
  'terrain.relief': 'Relief',
  'terrain.roughness': 'Roughness',
  'terrain.localSlopeP95': 'Local slopes at 40 m',
  'terrain.craterGeometry': 'Crater shape',
  'thermal.surfaceDay': 'Daytime ground temperature',
  'thermal.surfaceNight': 'Night ground temperature',
  'thermal.surfaceRange': 'Ground temperature range',
  'thermal.diurnalSurfaceDelta': 'Day to night swing',
  'thermal.airMean': 'Mean air temperature',
  'thermal.airRange': 'Air temperature range',
  'thermal.inertia': 'Thermal inertia',
  'atmosphere.pressure': 'Air pressure',
  'atmosphere.composition': 'Atmosphere',
  'atmosphere.wind': 'Wind',
  'atmosphere.aerosol': 'Dust in the air',
  'atmosphere.liquidWater': 'Rain and snow',
  'radiation.doseRate': 'Radiation dose',
  'radiation.solarConstant': 'Sunlight above the atmosphere',
  'radiation.surfaceInsolation': 'Sunlight at the ground',
  'illumination.maxDarkness': 'Longest darkness',
  'illumination.permanentShadow': 'Permanent shadow',
  'gravity.surface': 'Gravity',
  'geology.lithology': 'Rock type',
  'geology.mineralogy': 'Mineralogy',
  'geology.regolithGrainSize': 'Grain size',
  'resources.ice': 'Ice',
  'resources.soilMoisture': 'Soil moisture',
  'operations.access': 'Access',
  'operations.groundHours': 'Drive from airport',
};

export function dimensionLabel(key: string, fallback?: string) {
  return DIMENSION_SHORT[key] ?? fallback ?? key;
}


/** One visual language for evidence: Verified (green), Modeled (blue), Unvalidated (orange), Field measurement required (violet). */
export const STATE_TONE: Record<string, Tone> = {
  verified_measurement: 'ok',
  verified_derived: 'ok',
  validated_proxy: 'ok',
  modelled: 'sci',
  unvalidated_estimate: 'warn',
  searching: 'muted',
  not_investigated: 'muted',
  source_found_not_integrated: 'muted',
  not_covering_location: 'muted',
  insufficient_spatial_resolution: 'field',
  insufficient_temporal_coverage: 'muted',
  insufficient_sample: 'muted',
  retrieval_failed: 'muted',
  not_remotely_observable: 'field',
  field_measurement_required: 'field',
  not_applicable: 'muted',
  not_physically_reproducible: 'bad',
};

/** Badge for a comparison cell: says WHICH side lacks data instead of a generic "No data". */
export function comparisonBadge(c: { classification: string } & GapFields): { label: string; tone: Tone } {
  if (c.classification === 'missing' || c.classification === 'incompatible_support') {
    if (c.gapOutcome === 'not_applicable') return { label: 'Not applicable', tone: 'muted' };
    if (c.classification === 'incompatible_support') return { label: 'Not comparable', tone: 'muted' };
    if (c.gapSide === 'target') return { label: 'Target value missing', tone: 'muted' };
    if (c.gapOutcome === 'field_measurement') return { label: 'Needs field data', tone: 'field' };
    if (c.gapSide === 'both') return { label: 'Missing both sides', tone: 'muted' };
    return { label: 'Earth value missing', tone: 'muted' };
  }
  return COMPARISON[c.classification] ?? { label: c.classification, tone: 'muted' };
}

/** Colour for a 0–100 score where higher is better: coral → amber → gold → green. */
const SCORE_STOPS: Array<[number, [number, number, number]]> = [
  [0, [242, 134, 122]],
  [40, [242, 155, 92]],
  [60, [245, 196, 81]],
  [80, [126, 214, 165]],
  [100, [84, 207, 168]],
];
export function scoreColor(v: number): string {
  const x = Math.max(0, Math.min(100, v));
  for (let i = 1; i < SCORE_STOPS.length; i++) {
    const [b, cb] = SCORE_STOPS[i];
    const [a, ca] = SCORE_STOPS[i - 1];
    if (x <= b) {
      const t = (x - a) / (b - a);
      const c = ca.map((n, k) => Math.round(n + (cb[k] - n) * t));
      return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    }
  }
  return 'rgb(84, 207, 168)';
}

export const RANKING_GROUPS: Array<{ title: string; keys: string[] }> = [
  { title: 'Fit to the target', keys: ['experimentalSuitability', 'terrainSimilarity', 'thermalCompatibility', 'geologicalRelevance'] },
  { title: 'Practicality and evidence', keys: ['operationalFeasibility', 'evidenceCompleteness', 'interventionFeasibility'] },
];
