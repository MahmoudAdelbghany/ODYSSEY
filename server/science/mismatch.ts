/**
 * "Find where Earth does not match" (PART 4.2–4.3).
 *
 * compareMeasurements() refuses to compare values whose quantity or support do
 * not match, never treats a missing value as a match, and only reports a
 * relative difference where it is mathematically meaningful (ratio scales).
 *
 * detectMismatches() decides, per experiment, which planetary conditions Earth
 * fails to reproduce, whether that failure matters for the experiment, and
 * whether it can be handled by choosing another site, by a controlled
 * intervention, by simulation, or not at all.
 */
import { planetaryReference } from './data.ts';
import type { EnvironmentalProfile, Measurement, TemporalSupport } from './profile.ts';
import { DIMENSION_BY_KEY } from './profile.ts';
import { STATE_INFO, type EvidenceState, type GapOutcome } from '../../src/mission/evidence.ts';

export type CompatibilityClass =
  | 'analog'
  | 'partial'
  | 'mismatch'
  | 'not_naturally_reproducible'
  | 'incompatible_support'
  | 'missing';

export interface Comparison {
  dimension: string;
  label: string;
  earth: Pick<Measurement, 'value' | 'range' | 'unit' | 'status' | 'source' | 'support' | 'note' | 'uncertainty' | 'sourceUrl' | 'evidenceState'>;
  planet: Pick<Measurement, 'value' | 'range' | 'unit' | 'status' | 'source' | 'support' | 'note' | 'sourceUrl' | 'uncertainty' | 'evidenceState'>;
  absoluteDifference: number | null;
  relativeDifference: number | null;
  ratio: number | null;
  overlapFraction: number | null;
  classification: CompatibilityClass;
  supportNote: string;
  evidenceStatus: string;
  reason: string;
  earthState: EvidenceState;
  targetState: EvidenceState;
  /** Which kind of problem this is; evidence gaps are never physical mismatches. */
  gapOutcome: GapOutcome;
  gapSide: 'earth' | 'target' | 'both' | null;
  nextAction: string | null;
}

/** Earth-wide physical conditions that no terrestrial site can change. */
const PLANET_WIDE: Record<string, string> = {
  'gravity.surface': 'Gravity is set by planetary mass; every Earth site has ~9.8 m/s².',
  'atmosphere.pressure': 'Even the highest Earth surface sites retain tens of kPa of atmosphere.',
  'atmosphere.composition': 'Earth’s atmosphere is N2/O2 everywhere at the surface.',
  'radiation.doseRate': 'Earth’s atmosphere and magnetosphere shield every surface site.',
};

const TEMPORAL_COMPATIBLE: Array<[TemporalSupport, TemporalSupport, string]> = [
  ['static', 'static', 'both static'],
  ['seasonal_window', 'multi_year_range', 'Earth sample is a 3-month window; planetary value is a multi-period envelope, so only an envelope test is valid'],
  ['annual_climatology', 'multi_year_range', 'Earth value is a climatology; planetary value is an envelope, so only an envelope test is valid'],
  ['monthly_climatology', 'multi_year_range', 'Earth monthly normals suppress extremes; planetary value is an envelope, so only an envelope test is valid'],
  ['annual_climatology', 'seasonal_window', 'annual Earth climatology against a seasonal planetary range, so only an order-of-magnitude comparison is valid'],
  ['annual_climatology', 'static', 'Earth climatology against a planetary constant, so only an order-of-magnitude comparison is valid'],
  ['static', 'instantaneous', 'Earth constant against an instantaneous planetary value'],
  ['annual_climatology', 'instantaneous', 'Earth climatology against an instantaneous planetary value, so only an order-of-magnitude comparison is valid'],
  ['annual_climatology', 'mission_period', 'Earth climatology against a mission-period measurement'],
];

function temporalCompatibility(a: TemporalSupport, b: TemporalSupport): string | null {
  for (const [x, y, note] of TEMPORAL_COMPATIBLE) {
    if ((a === x && b === y) || (a === y && b === x)) return note;
  }
  if (a === b) return `both ${a.replace(/_/g, ' ')}`;
  return null;
}

const ABS_TOLERANCE: Record<string, number> = {
  'terrain.slopeMean': 3,
  'terrain.slopeP95': 5,
  'atmosphere.wind': 3,
};

function interval(meas: Measurement): [number, number] | null {
  if (meas.range) return meas.range;
  if (meas.value != null) {
    const u = meas.uncertainty ?? 0;
    return [meas.value - u, meas.value + u];
  }
  return null;
}

export function measurementState(x: Measurement): EvidenceState {
  switch (x.status) {
    case 'MEASURED':
      return 'verified_measurement';
    case 'PUBLISHED':
      return 'verified_measurement';
    case 'DERIVED':
      return 'verified_derived';
    case 'MODELED':
      return 'modelled';
    case 'ESTIMATED':
      return 'unvalidated_estimate';
    case 'MISSING':
      return x.evidenceState ?? 'not_investigated';
    default:
      return 'unvalidated_estimate';
  }
}

function withGap(c: Omit<Comparison, 'earthState' | 'targetState' | 'gapOutcome' | 'gapSide' | 'nextAction'>, earth: Measurement, planet: Measurement): Comparison {
  const earthState = measurementState(earth);
  const targetState = measurementState(planet);
  let gapOutcome: GapOutcome = 'evaluated';
  let gapSide: Comparison['gapSide'] = null;
  let nextAction: string | null = null;
  if (c.classification === 'not_naturally_reproducible') {
    gapOutcome = 'physical_mismatch';
  } else if (c.classification === 'missing' || c.classification === 'incompatible_support') {
    const earthGap = !STATE_INFO[earthState].usable || earth.status === 'MISSING';
    const targetGap = !STATE_INFO[targetState].usable || planet.status === 'MISSING' || (planet.value == null && planet.range == null);
    gapSide = earthGap && targetGap ? 'both' : earthGap ? 'earth' : targetGap ? 'target' : null;
    const primary = gapSide === 'target' ? planet : earth;
    const primaryState = gapSide === 'target' ? targetState : earthState;
    const stateOutcome = STATE_INFO[primaryState].outcome;
    gapOutcome = c.classification === 'incompatible_support' ? 'integration_needed' : stateOutcome === 'evaluated' ? 'integration_needed' : stateOutcome;
    nextAction = primary.nextAction ?? (gapSide === 'both' ? planet.nextAction ?? null : null);
  }
  return { ...c, earthState, targetState, gapOutcome, gapSide, nextAction };
}

const slim = (x: Measurement) => ({ value: x.value, range: x.range, unit: x.unit, status: x.status, source: x.source, support: x.support, note: x.note, uncertainty: x.uncertainty, sourceUrl: x.sourceUrl, evidenceState: x.evidenceState });

export function compareMeasurements(earth: Measurement, planet: Measurement): Comparison {
  return withGap(compareRaw(earth, planet), earth, planet);
}

function compareRaw(earth: Measurement, planet: Measurement): Omit<Comparison, 'earthState' | 'targetState' | 'gapOutcome' | 'gapSide' | 'nextAction'> {
  const def = DIMENSION_BY_KEY.get(earth.dimension);
  const label = def?.label ?? earth.dimension;
  const base = {
    dimension: earth.dimension,
    label,
    earth: slim(earth),
    planet: slim(planet),
    absoluteDifference: null,
    relativeDifference: null,
    ratio: null,
    overlapFraction: null,
    evidenceStatus: `Earth ${earth.status} · planet ${planet.status}`,
  };
  if (earth.dimension !== planet.dimension || earth.quantity !== planet.quantity) {
    return { ...base, classification: 'incompatible_support', supportNote: 'different quantities', reason: `Cannot compare ${earth.quantity} with ${planet.quantity}.` };
  }
  if (earth.status === 'MISSING' || planet.status === 'MISSING') {
    const side = earth.status === 'MISSING' && planet.status === 'MISSING' ? 'both sides' : earth.status === 'MISSING' ? 'the Earth side' : 'the planetary side';
    const physical = PLANET_WIDE[earth.dimension];
    if (physical && earth.status === 'MISSING' && planet.status !== 'MISSING') {
      return { ...base, classification: 'not_naturally_reproducible', supportNote: 'Earth value not quantified', reason: `${physical} No Earth measurement is asserted; the difference is categorical, not quantified.` };
    }
    const notes = [earth.status === 'MISSING' ? `Earth: ${earth.note}` : '', planet.status === 'MISSING' ? `Target: ${planet.note}` : ''].filter(Boolean).join(' ');
    return { ...base, classification: 'missing', supportNote: 'no comparison', reason: `No usable value on ${side}. ${notes}` };
  }
  if (earth.unit !== planet.unit) {
    return { ...base, classification: 'incompatible_support', supportNote: 'unit mismatch', reason: `Units differ (${earth.unit} vs ${planet.unit}); no conversion is registered.` };
  }

  if (def?.comparator === 'categorical') {
    const a = (earth.note || '').toLowerCase();
    const b = (planet.note || '').toLowerCase();
    const physical = PLANET_WIDE[earth.dimension];
    if (planet.categories) {
      const hit = (terms: string[]) => terms.find((t) => a.includes(t));
      const analogTerm = hit(planet.categories.analog);
      const partialTerm = hit(planet.categories.partial);
      return {
        ...base,
        classification: analogTerm ? 'analog' : partialTerm ? 'partial' : 'mismatch',
        supportNote: 'categorical class terms',
        reason: analogTerm
          ? `Earth ${earth.note} matches the target class (${planet.note}).`
          : partialTerm
            ? `Earth ${earth.note} shares "${partialTerm}" with the target (${planet.note}) but not its composition.`
            : `Earth: ${earth.note || 'unspecified'}; target: ${planet.note}. Different rock class.`,
      };
    }
    const same = a && b && (a === b || a.includes(b) || b.includes(a));
    return {
      ...base,
      classification: same ? 'analog' : physical ? 'not_naturally_reproducible' : 'mismatch',
      supportNote: 'categorical classes',
      reason: same ? `Same class (${earth.note}).` : `Earth: ${earth.note || 'unspecified'}; ${planet.note || 'target'} on the target.${physical ? ` ${physical}` : ''}`,
    };
  }

  // Terrain uses the same baseline on both sides; others need a temporal-support check.
  const temporalNote = temporalCompatibility(earth.support.temporal, planet.support.temporal);
  if (!temporalNote) {
    return { ...base, classification: 'incompatible_support', supportNote: `${earth.support.temporal} vs ${planet.support.temporal}`, reason: `Temporal supports are not comparable (${earth.support.temporal.replace(/_/g, ' ')} vs ${planet.support.temporal.replace(/_/g, ' ')}).` };
  }
  if (earth.support.spatial === 'dem_window' && planet.support.spatial === 'dem_window' && earth.support.resolutionM !== planet.support.resolutionM) {
    return { ...base, classification: 'incompatible_support', supportNote: 'different DEM baselines', reason: `DEM baselines differ (${earth.support.resolutionM} m vs ${planet.support.resolutionM} m); slope is scale-dependent.` };
  }

  const eInterval = interval(earth);
  const pInterval = interval(planet);
  if (!eInterval || !pInterval) {
    const which = !eInterval ? 'Earth' : 'planetary';
    return { ...base, classification: 'missing', supportNote: 'qualitative reference', reason: `The ${which} reference is qualitative only (${(!eInterval ? earth.note : planet.note) || 'no number'}); no numeric comparison is possible.` };
  }
  const e = eInterval;
  const p = pInterval;
  const eMid = earth.value ?? (e[0] + e[1]) / 2;
  const pMid = planet.value ?? (p[0] + p[1]) / 2;
  const absoluteDifference = round(eMid - pMid);
  let classification: CompatibilityClass;
  let reason: string;
  let ratio: number | null = null;
  let relativeDifference: number | null = null;
  let overlapFraction: number | null = null;

  if (def?.comparator === 'ratio' && pMid > 0 && eMid >= 0) {
    ratio = eMid / pMid;
    relativeDifference = round((eMid - pMid) / pMid, 4);
    const log = Math.abs(Math.log10(Math.max(ratio, 1e-30)));
    classification = log <= Math.log10(2) ? 'analog' : log <= Math.log10(5) ? 'partial' : 'mismatch';
    reason = `Earth/target ratio ${formatRatio(ratio)}.`;
  } else {
    const lo = Math.max(e[0], p[0]);
    const hi = Math.min(e[1], p[1]);
    const pWidth = p[1] - p[0];
    if (pWidth > 0) {
      overlapFraction = round(Math.max(0, hi - lo) / pWidth, 3);
      const inside = e[0] >= p[0] && e[1] <= p[1];
      const gap = hi >= lo ? 0 : lo - hi;
      const bothRanges = Boolean(earth.range && planet.range);
      if (bothRanges) {
        // Envelope test: how much of the TARGET envelope does the Earth envelope cover?
        classification = overlapFraction >= 0.6 ? 'analog' : overlapFraction >= 0.2 ? 'partial' : 'mismatch';
      } else {
        const tol = ABS_TOLERANCE[earth.dimension] ?? 0.1 * pWidth;
        classification = inside ? 'analog' : hi > lo ? 'partial' : gap <= tol ? 'partial' : 'mismatch';
      }
      reason = bothRanges
        ? `Earth envelope ${fmt(e)} ${earth.unit} covers ${Math.round(overlapFraction * 100)}% of the target envelope ${fmt(p)} ${planet.unit}${gap > 0 ? ` (separated by ${round(gap)} ${planet.unit})` : ''}.`
        : inside
        ? `Earth ${fmt(e)} ${earth.unit} lies inside the target envelope ${fmt(p)} ${planet.unit}.`
        : hi > lo
          ? `Earth ${fmt(e)} overlaps ${Math.round(overlapFraction * 100)}% of the target envelope ${fmt(p)} ${planet.unit}.`
          : `Earth ${fmt(e)} lies outside the target envelope ${fmt(p)} ${planet.unit} by ${round(gap)} ${planet.unit}.`;
      if (earth.dimension === 'thermal.surfaceRange' || earth.dimension === 'thermal.airRange') {
        const coldest = round(p[0] - e[0]);
        if (coldest < 0) reason += ` The target is ${Math.abs(coldest)} K colder than the coldest sampled Earth value.`;
      }
    } else {
      const tol = ABS_TOLERANCE[earth.dimension] ?? Math.max(1, Math.abs(pMid) * 0.15);
      const diff = Math.abs(eMid - pMid);
      classification = diff <= tol ? 'analog' : diff <= 3 * tol ? 'partial' : 'mismatch';
      reason = `Δ = ${round(eMid - pMid)} ${earth.unit} (tolerance ${round(tol)}).`;
    }
  }
  if (classification !== 'analog' && PLANET_WIDE[earth.dimension]) {
    classification = 'not_naturally_reproducible';
    reason += ` ${PLANET_WIDE[earth.dimension]}`;
  }
  return { ...base, absoluteDifference, relativeDifference, ratio: ratio == null ? null : round(ratio, 6), overlapFraction, classification, supportNote: temporalNote, reason };
}

export type Importance = 'critical' | 'important' | 'context';

interface Relevance {
  dimension: string;
  importance: Importance;
  why: string;
}

/** Which planetary conditions matter for which experiment archetype. Expert-assigned. */
export const EXPERIMENT_RELEVANCE: Record<string, Relevance[]> = {
  rover_navigation: [
    { dimension: 'terrain.slopeP95', importance: 'critical', why: 'Traverse slopes bound wheel slip and tip-over margins.' },
    { dimension: 'terrain.roughness', importance: 'important', why: 'Obstacle density drives path planning.' },
    { dimension: 'terrain.relief', importance: 'context', why: 'Relief governs line of sight and route length.' },
    { dimension: 'gravity.surface', importance: 'critical', why: 'Wheel–soil traction scales with normal load; 1/6 g changes slip and sinkage.' },
    { dimension: 'illumination.maxDarkness', importance: 'important', why: 'Low-sun polar lighting and long shadows challenge visual navigation.' },
  ],
  geological_sampling: [
    { dimension: 'geology.lithology', importance: 'critical', why: 'Sampling procedure depends on the rock type being sampled.' },
    { dimension: 'geology.mineralogy', importance: 'critical', why: 'Instrument validation needs representative mineralogy.' },
    { dimension: 'terrain.slopeMean', importance: 'context', why: 'EVA/robotic access to outcrops.' },
    { dimension: 'gravity.surface', importance: 'important', why: 'Tool reaction forces and sample handling change under reduced gravity.' },
  ],
  equipment_deployment: [
    { dimension: 'terrain.slopeMean', importance: 'critical', why: 'Level, stable footing for deployed hardware.' },
    { dimension: 'gravity.surface', importance: 'important', why: 'Anchoring, lifting and mechanism loads depend on gravity.' },
    { dimension: 'atmosphere.pressure', importance: 'important', why: 'Mechanisms, lubricants and thermal control behave differently in vacuum.' },
    { dimension: 'atmosphere.wind', importance: 'context', why: 'Wind loads exist on Earth but not on the Moon.' },
  ],
  thermal_survival: [
    { dimension: 'thermal.surfaceRange', importance: 'critical', why: 'Hardware must survive the surface temperature envelope.' },
    { dimension: 'thermal.surfaceNight', importance: 'important', why: 'Cold-soak during night drives heater sizing.' },
    { dimension: 'atmosphere.pressure', importance: 'critical', why: 'Without an atmosphere there is no convective heat loss; Earth air short-circuits the thermal balance.' },
    { dimension: 'illumination.maxDarkness', importance: 'critical', why: 'Night duration sets energy storage for survival.' },
    { dimension: 'thermal.inertia', importance: 'important', why: 'Surface thermal response controls conductive coupling.' },
  ],
  dust_aeolian: [
    { dimension: 'atmosphere.aerosol', importance: 'important', why: 'Column dust loading indicates natural dust exposure.' },
    { dimension: 'atmosphere.wind', importance: 'critical', why: 'Earth dust is wind-driven; lunar dust is not (no atmosphere).' },
    { dimension: 'atmosphere.pressure', importance: 'critical', why: 'Electrostatic dust behaviour and adhesion differ in vacuum.' },
    { dimension: 'geology.regolithGrainSize', importance: 'critical', why: 'Abrasion and adhesion scale with grain size and angularity.' },
  ],
  regolith_construction: [
    { dimension: 'geology.regolithGrainSize', importance: 'critical', why: 'Compaction and sintering depend on grain size.' },
    { dimension: 'gravity.surface', importance: 'important', why: 'Overburden and excavation forces scale with gravity.' },
    { dimension: 'atmosphere.pressure', importance: 'important', why: 'Sintering and outgassing differ in vacuum.' },
  ],
  subsurface_shielding: [
    { dimension: 'radiation.doseRate', importance: 'critical', why: 'Shielding performance must be evaluated against the target radiation field.' },
    { dimension: 'geology.lithology', importance: 'context', why: 'Host material affects shielding.' },
  ],
  continuous_power: [
    { dimension: 'illumination.maxDarkness', importance: 'critical', why: 'Storage sizing depends on darkness duration.' },
    { dimension: 'radiation.solarConstant', importance: 'important', why: 'Array output depends on irradiance.' },
    { dimension: 'atmosphere.aerosol', importance: 'context', why: 'Earth aerosols attenuate sunlight; the Moon has none.' },
  ],
  eva_suit: [
    { dimension: 'atmosphere.pressure', importance: 'critical', why: 'Suit pressure differential and thermal control depend on ambient pressure.' },
    { dimension: 'gravity.surface', importance: 'critical', why: 'Gait and metabolic cost depend on gravity.' },
    { dimension: 'thermal.surfaceRange', importance: 'important', why: 'Suit thermal environment.' },
  ],
  isru: [
    { dimension: 'resources.ice', importance: 'critical', why: 'Ice extraction needs ice.' },
    { dimension: 'atmosphere.pressure', importance: 'critical', why: 'Volatile sublimation and capture differ in vacuum.' },
    { dimension: 'thermal.surfaceRange', importance: 'important', why: 'Process thermal environment.' },
  ],
  glaciology: [
    { dimension: 'resources.ice', importance: 'critical', why: 'Ice must be present.' },
    { dimension: 'thermal.surfaceRange', importance: 'important', why: 'Ice stability depends on temperature.' },
  ],
  astrobiology: [
    { dimension: 'atmosphere.liquidWater', importance: 'critical', why: 'Biosignature preservation depends on aridity.' },
    { dimension: 'radiation.doseRate', importance: 'important', why: 'Organic degradation depends on radiation.' },
  ],
};

const DEFAULT_RELEVANCE: Relevance[] = [
  { dimension: 'terrain.slopeMean', importance: 'important', why: 'Terrain access.' },
  { dimension: 'thermal.surfaceRange', importance: 'important', why: 'Thermal environment.' },
  { dimension: 'gravity.surface', importance: 'context', why: 'Gravity differs everywhere on Earth.' },
  { dimension: 'atmosphere.pressure', importance: 'context', why: 'Atmospheric pressure differs everywhere on Earth.' },
];

export type Handling =
  | 'natural_analog'
  | 'choose_better_site'
  | 'controlled_intervention'
  | 'numerical_simulation'
  | 'acknowledge_residual'
  | 'needs_measurement';

export interface MismatchFinding {
  experimentId: string;
  siteId: string;
  dimension: string;
  label: string;
  importance: Importance;
  why: string;
  comparison: Comparison;
  matters: boolean;
  handling: Handling;
  handlingReason: string;
}

/** Resolve the Earth measurement at the planetary target's DEM baseline (400 m Moon, 463 m Mars). */
export function alignBaseline(earth: EnvironmentalProfile, target: EnvironmentalProfile): EnvironmentalProfile {
  if (target.body !== 'Mars' || earth.kind !== 'earth_site') return earth;
  const ref = planetaryReference.earth[earth.id]?.['463m'];
  if (!ref) return earth;
  const clone: EnvironmentalProfile = { ...earth, measurements: { ...earth.measurements } };
  const values: Record<string, number> = { 'terrain.slopeMean': ref.slopeMean, 'terrain.slopeP95': ref.slopeP95, 'terrain.relief': ref.reliefP95P5, 'terrain.roughness': ref.roughness };
  for (const [key, value] of Object.entries(values)) {
    const base = clone.measurements[key];
    if (base) clone.measurements[key] = { ...base, value, support: { ...base.support, resolutionM: 463, description: '~12.8 km window resampled to 463 m to match MOLA baseline' } };
  }
  return clone;
}

export function relevanceFor(archetypeId: string): Relevance[] {
  return EXPERIMENT_RELEVANCE[archetypeId] ?? DEFAULT_RELEVANCE;
}

export function detectMismatches(experimentId: string, archetypeId: string, earth: EnvironmentalProfile, target: EnvironmentalProfile): MismatchFinding[] {
  const aligned = alignBaseline(earth, target);
  return relevanceFor(archetypeId).map((rel) => {
    const e = aligned.measurements[rel.dimension];
    const p = target.measurements[rel.dimension];
    const comparison = compareMeasurements(e, p);
    const matters = rel.importance !== 'context' && comparison.classification !== 'analog';
    let handling: Handling;
    let handlingReason: string;
    switch (comparison.classification) {
      case 'analog':
        handling = 'natural_analog';
        handlingReason = 'The site reproduces this condition naturally within the stated support.';
        break;
      case 'partial':
        handling = rel.importance === 'critical' ? 'choose_better_site' : 'acknowledge_residual';
        handlingReason = rel.importance === 'critical' ? 'Partial match on a critical condition: a better site or a controlled test should be considered.' : 'Partial match on a non-critical condition: record the residual.';
        break;
      case 'mismatch':
        handling = rel.importance === 'context' ? 'acknowledge_residual' : 'choose_better_site';
        handlingReason = 'Earth can vary this condition by location; another site may close the gap. If none does, a controlled intervention is required.';
        break;
      case 'not_naturally_reproducible':
        handling = rel.importance === 'context' ? 'acknowledge_residual' : rel.dimension === 'gravity.surface' ? 'numerical_simulation' : 'controlled_intervention';
        handlingReason = 'No Earth site reproduces this condition. It must be bridged with a controlled facility, offloading/simulation, or accepted as a residual.';
        break;
      case 'incompatible_support':
        handling = 'needs_measurement';
        handlingReason = 'Available evidence measures a different quantity or support; a compatible measurement is required before comparison.';
        break;
      default:
        handling = 'needs_measurement';
        handlingReason = 'The condition cannot be evaluated: evidence is missing. It remains unresolved.';
    }
    return { experimentId, siteId: earth.id, dimension: rel.dimension, label: DIMENSION_BY_KEY.get(rel.dimension)?.label ?? rel.dimension, importance: rel.importance, why: rel.why, comparison, matters, handling, handlingReason };
  });
}

function round(value: number, digits = 2) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function fmt([a, b]: [number, number]) {
  return a === b ? `${round(a, 1)}` : `${round(a, 1)}–${round(b, 1)}`;
}

function formatRatio(r: number) {
  if (r === 0) return '0';
  if (r >= 1e4 || r < 1e-3) return r.toExponential(1);
  return round(r, 3).toString();
}
