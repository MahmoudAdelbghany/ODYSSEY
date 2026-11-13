/**
 * Intervention planner (PART 5).
 *
 * Distinguishes four things and never blurs them:
 *   natural analog condition, comes from the site (see mismatch.ts)
 *   PROPOSED CONTROLLED CONDITION, a setpoint/protocol for a controlled test
 *   SIMULATED, the output of an explicit, documented physical model
 *   CONCEPT ONLY, no model or verified facility capability backs it
 *
 * Synthetic values are setpoints or model outputs. They are never written into
 * an environmental profile and never presented as observations.
 */
import { INTERVENTION_BY_ID } from '../../src/interventions/catalog.ts';
import type { MismatchFinding } from './mismatch.ts';
import type { EnvironmentalProfile } from './profile.ts';

export type SyntheticLabel = 'PROPOSED CONTROLLED CONDITION' | 'SIMULATED' | 'CONCEPT ONLY';

export interface ControlVariable {
  name: string;
  unit: string;
  target: [number, number] | null;
  basis: string;
}

export interface InterventionSpec {
  id: string;
  baseInterventionId: string | null;
  name: string;
  targetGap: string;
  targetGapLabel: string;
  experimentId: string;
  siteId: string | null;
  equipment: string[];
  controlVariables: ControlVariable[];
  instrumentation: string[];
  facilityRequirements: string[];
  power: { value: number | null; unit: 'kW'; note: string };
  safety: string[];
  feasibility: 'standard capability class' | 'specialised facility' | 'concept';
  cost: { value: null; note: string };
  setupTime: { value: null; note: string };
  calibration: string[];
  reproduces: string;
  cannotReproduce: string;
  limitations: string[];
  references: Array<{ title: string; url: string | null; status: string }>;
  verificationStatus: string;
  label: SyntheticLabel;
  model: string | null;
}

interface Template {
  base: string | null;
  name: string;
  label: SyntheticLabel;
  feasibility: InterventionSpec['feasibility'];
  model: string | null;
  instrumentation: string[];
  safety: string[];
  calibration: string[];
  limitations: string[];
  controls: (target: EnvironmentalProfile) => ControlVariable[];
}

const NOT_ESTIMATED = 'Not estimated: no verified facility pricing, power or schedule data is available to ODYSSEY.';

const range = (m: EnvironmentalProfile['measurements'][string] | undefined): [number, number] | null =>
  m?.range ?? (m?.value != null ? [m.value, m.value] : null);

const TEMPLATES: Record<string, Template[]> = {
  'atmosphere.pressure': [
    {
      base: 'thermal_vacuum_chamber',
      name: 'Thermal-vacuum test of the article',
      label: 'PROPOSED CONTROLLED CONDITION',
      feasibility: 'specialised facility',
      model: 'vacuum_pumpdown_ideal',
      instrumentation: ['Calibrated vacuum gauges covering the target decade', 'Residual gas analyser', 'Thermocouples on article and shroud'],
      safety: ['Implosion and pressure-vessel safety', 'Cryogen handling if LN2 shrouds are used', 'Outgassing of test materials'],
      calibration: ['Gauge calibration traceable across the full pressure range', 'Thermocouple calibration at cold setpoints'],
      limitations: ['Chamber walls bound the volume; no regolith-scale terrain', 'Base pressure is facility-specific and must come from facility documentation', 'Ideal pump-down model ignores outgassing and leaks'],
      controls: (t) => [
        { name: 'chamber pressure', unit: 'Pa', target: range(t.measurements['atmosphere.pressure']), basis: t.measurements['atmosphere.pressure']?.source ?? 'target reference' },
      ],
    },
  ],
  'atmosphere.composition': [
    {
      base: 'environmental_chamber',
      name: 'Low-pressure CO2 atmosphere chamber',
      label: 'PROPOSED CONTROLLED CONDITION',
      feasibility: 'specialised facility',
      model: null,
      instrumentation: ['Gas composition analyser', 'Pressure transducer', 'Humidity sensor'],
      safety: ['Asphyxiation hazard from CO2 inventory', 'Pressure-vessel safety'],
      calibration: ['Gas analyser span calibration with certified CO2'],
      limitations: ['Trace species and dust loading are not reproduced', 'No open-site terrain'],
      controls: (t) => [
        { name: 'chamber gas', unit: '-', target: null, basis: t.measurements['atmosphere.composition']?.source ?? 'target reference' },
        { name: 'chamber pressure', unit: 'Pa', target: range(t.measurements['atmosphere.pressure']), basis: t.measurements['atmosphere.pressure']?.source ?? 'target reference' },
      ],
    },
  ],
  'thermal.surfaceRange': [
    {
      base: 'thermal_vacuum_chamber',
      name: 'Programmed thermal cycling in vacuum',
      label: 'PROPOSED CONTROLLED CONDITION',
      feasibility: 'specialised facility',
      model: 'radiative_equilibrium_plate',
      instrumentation: ['Thermocouples / RTDs on article', 'Shroud temperature sensors', 'Heater power logging'],
      safety: ['Cryogen handling', 'Thermal shock of test article'],
      calibration: ['Sensor calibration at the cold and hot setpoints'],
      limitations: ['A cycle profile is a setpoint schedule, not a predicted article response', 'The lunar night can be compressed in time; compression changes soak behaviour'],
      controls: (t) => [
        { name: 'surface/shroud temperature envelope', unit: 'K', target: range(t.measurements['thermal.surfaceRange']), basis: t.measurements['thermal.surfaceRange']?.source ?? 'target reference' },
      ],
    },
  ],
  'thermal.surfaceNight': [],
  'illumination.maxDarkness': [
    {
      base: 'thermal_vacuum_chamber',
      name: 'Full-duration night soak',
      label: 'PROPOSED CONTROLLED CONDITION',
      feasibility: 'specialised facility',
      model: null,
      instrumentation: ['Battery state-of-charge logging', 'Heater power logging', 'Article temperatures'],
      safety: ['Long-duration unattended operation'],
      calibration: ['Power meter calibration'],
      limitations: ['Chamber occupancy for multi-week soaks is costly; duration may be compressed', 'Polar lighting geometry is not reproduced'],
      controls: (t) => [
        { name: 'dark soak duration', unit: 'days', target: t.measurements['illumination.maxDarkness']?.value != null ? [t.measurements['illumination.maxDarkness'].value!, t.measurements['illumination.maxDarkness'].value!] : null, basis: t.measurements['illumination.maxDarkness']?.note || 'target reference' },
      ],
    },
  ],
  'gravity.surface': [
    {
      base: 'reduced_gravity_facility',
      name: 'Gravity offload (suspension or counterweight) for mobility tests',
      label: 'SIMULATED',
      feasibility: 'standard capability class',
      model: 'gravity_offload_statics',
      instrumentation: ['Load cell on offload line', 'Wheel torque and slip sensors', 'Motion capture'],
      safety: ['Suspended-load failure', 'Pinch points on gantry'],
      calibration: ['Load-cell calibration across the offload range'],
      limitations: ['Offloading reduces weight on the vehicle but not on the soil; regolith still experiences Earth gravity, so slip/sinkage remain biased', 'Pendulum and lateral dynamics of the suspension are residual'],
      controls: (t) => [{ name: 'effective gravity', unit: 'm/s2', target: range(t.measurements['gravity.surface']), basis: t.measurements['gravity.surface']?.source ?? 'target reference' }],
    },
    {
      base: 'reduced_gravity_facility',
      name: 'Parabolic-flight short-duration test',
      label: 'CONCEPT ONLY',
      feasibility: 'specialised facility',
      model: null,
      instrumentation: ['Accelerometers', 'High-speed video'],
      safety: ['Flight safety review'],
      calibration: ['Accelerometer calibration'],
      limitations: ['Seconds-long reduced-gravity windows; facility performance not verified by ODYSSEY'],
      controls: (t) => [{ name: 'effective gravity', unit: 'm/s2', target: range(t.measurements['gravity.surface']), basis: t.measurements['gravity.surface']?.source ?? 'target reference' }],
    },
  ],
  'radiation.doseRate': [
    {
      base: 'irradiation_facility',
      name: 'Accelerator irradiation of components',
      label: 'CONCEPT ONLY',
      feasibility: 'specialised facility',
      model: null,
      instrumentation: ['Dosimeters', 'Beam monitors'],
      safety: ['Radiation protection programme'],
      calibration: ['Dosimetry calibration'],
      limitations: ['A beam reproduces a selected particle/energy, not the full GCR/SPE spectrum', 'ODYSSEY holds no transport model; no dose response is computed'],
      controls: (t) => [{ name: 'absorbed dose rate (Si)', unit: 'µGy/h', target: range(t.measurements['radiation.doseRate']), basis: t.measurements['radiation.doseRate']?.source ?? 'target reference' }],
    },
  ],
  'atmosphere.wind': [
    {
      base: 'dust_chamber',
      name: 'Dust exposure without aeolian transport',
      label: 'PROPOSED CONTROLLED CONDITION',
      feasibility: 'specialised facility',
      model: null,
      instrumentation: ['Deposition coupons', 'Particle counter', 'Electrostatic field meter'],
      safety: ['Respirable dust exposure', 'Explosive dust concentration limits'],
      calibration: ['Mass balance calibration for deposition coupons'],
      limitations: ['Requires a characterised simulant; electrostatic lofting in vacuum is not reproduced in air'],
      controls: () => [
        { name: 'deposition mass loading', unit: 'g/m2', target: null, basis: 'Must be set from mission requirements; no target value is ingested' },
        { name: 'airflow', unit: 'm/s', target: [0, 0], basis: 'Lunar target has no atmosphere (NSSDC)' },
      ],
    },
  ],
  'geology.regolithGrainSize': [
    {
      base: 'regolith_test_bed',
      name: 'Characterised simulant bed',
      label: 'PROPOSED CONTROLLED CONDITION',
      feasibility: 'standard capability class',
      model: null,
      instrumentation: ['Sieve / laser diffraction grain-size analysis', 'Bulk density', 'Penetrometer'],
      safety: ['Respirable silica dust'],
      calibration: ['Grain-size analyser calibration'],
      limitations: ['Simulant chemistry and grain shape approximate, not reproduce, regolith'],
      controls: () => [{ name: 'grain-size distribution', unit: 'µm', target: null, basis: 'No target distribution is ingested; must come from a published regolith characterisation' }],
    },
  ],
  'geology.mineralogy': [
    {
      base: 'sample_analysis_lab',
      name: 'Laboratory mineralogy of field samples',
      label: 'PROPOSED CONTROLLED CONDITION',
      feasibility: 'standard capability class',
      model: null,
      instrumentation: ['XRD', 'VNIR/SWIR spectrometer'],
      safety: ['Sample handling'],
      calibration: ['Reference standards'],
      limitations: ['Measurement-only: closes an evidence gap; does not change the site environment'],
      controls: () => [],
    },
  ],
};
TEMPLATES['thermal.surfaceNight'] = TEMPLATES['thermal.surfaceRange'];

export function proposeInterventions(finding: MismatchFinding, target: EnvironmentalProfile): InterventionSpec[] {
  const templates = TEMPLATES[finding.dimension] ?? [];
  return templates.map((tpl, index) => {
    const base = tpl.base ? INTERVENTION_BY_ID.get(tpl.base) : undefined;
    const references: InterventionSpec['references'] = base
      ? [{ title: base.evidence.source, url: null, status: `${base.evidence.confidence} confidence. ${base.evidence.note}` }]
      : [];
    const targetRef = target.measurements[finding.dimension];
    if (targetRef?.sourceUrl) references.push({ title: targetRef.source, url: targetRef.sourceUrl, status: `target value ${targetRef.status}` });
    return {
      id: `${finding.experimentId}:${finding.dimension}:${index}`,
      baseInterventionId: tpl.base,
      name: tpl.name,
      targetGap: finding.dimension,
      targetGapLabel: finding.label,
      experimentId: finding.experimentId,
      siteId: finding.siteId,
      equipment: base?.equipment ?? [],
      controlVariables: tpl.controls(target),
      instrumentation: tpl.instrumentation,
      facilityRequirements: base?.infrastructure ?? [],
      power: { value: null, unit: 'kW', note: NOT_ESTIMATED },
      safety: tpl.safety,
      feasibility: tpl.feasibility,
      cost: { value: null, note: NOT_ESTIMATED },
      setupTime: { value: null, note: NOT_ESTIMATED },
      calibration: tpl.calibration,
      reproduces: base?.reproduces ?? '',
      cannotReproduce: base?.cannotReproduce ?? '',
      limitations: tpl.limitations,
      references,
      verificationStatus: 'Capability class described in literature; availability and performance of a specific facility are UNVERIFIED.',
      label: tpl.label,
      model: tpl.model,
    } satisfies InterventionSpec;
  });
}

/* ------------------------------------------------------------------------ */
/* Synthetic condition generation with explicit, documented physical models  */
/* ------------------------------------------------------------------------ */

const SIGMA = 5.670374419e-8; // Stefan–Boltzmann constant, W m-2 K-4 (CODATA exact-derived)
const G_EARTH = 9.80665; // standard gravity, m s-2 (defined constant)

export interface ModelOutput {
  model: string;
  label: SyntheticLabel;
  equation: string;
  inputs: Record<string, { value: number; unit: string }>;
  outputs: Record<string, { value: number | null; unit: string }>;
  assumptions: string[];
  validity: string;
  warnings: string[];
}

export function vacuumPumpdown(p: { volumeM3: number; pumpSpeedLps: number; startPa: number; targetPa: number }): ModelOutput {
  const warnings: string[] = [];
  if (!(p.volumeM3 > 0 && p.pumpSpeedLps > 0 && p.startPa > p.targetPa && p.targetPa > 0)) throw new Error('volume, pump speed > 0 and start > target > 0 are required');
  const seconds = (p.volumeM3 * 1000 / p.pumpSpeedLps) * Math.log(p.startPa / p.targetPa);
  let label: SyntheticLabel = 'SIMULATED';
  if (p.targetPa < 1e-1) {
    warnings.push('Below ~0.1 Pa real pump-down is dominated by outgassing and pump-type changes; the ideal model is outside its validity range and the time is not reported.');
    label = 'CONCEPT ONLY';
  }
  return {
    model: 'vacuum_pumpdown_ideal',
    label,
    equation: 't = (V / S) · ln(p0 / p)',
    inputs: { V: { value: p.volumeM3, unit: 'm3' }, S: { value: p.pumpSpeedLps, unit: 'L/s' }, p0: { value: p.startPa, unit: 'Pa' }, p: { value: p.targetPa, unit: 'Pa' } },
    outputs: { pumpdownTime: { value: label === 'SIMULATED' ? Math.round(seconds) : null, unit: 's' } },
    assumptions: ['Constant effective pumping speed', 'No leaks, no outgassing, no conductance limits', 'Isothermal gas'],
    validity: 'Rough/medium vacuum (viscous flow) only.',
    warnings,
  };
}

export function radiativeEquilibrium(p: { irradianceWm2: number; absorptivity: number; emissivity: number; incidenceDeg: number; shroudK: number }): ModelOutput {
  if (!(p.irradianceWm2 >= 0 && p.absorptivity > 0 && p.absorptivity <= 1 && p.emissivity > 0 && p.emissivity <= 1 && p.shroudK >= 0)) throw new Error('invalid optical or thermal inputs');
  const absorbed = p.absorptivity * p.irradianceWm2 * Math.max(0, Math.cos((p.incidenceDeg * Math.PI) / 180));
  const t = Math.pow(absorbed / (p.emissivity * SIGMA) + Math.pow(p.shroudK, 4), 0.25);
  return {
    model: 'radiative_equilibrium_plate',
    label: 'SIMULATED',
    equation: 'T = ( α·G·cosθ / (ε·σ) + T_shroud⁴ )^¼',
    inputs: { G: { value: p.irradianceWm2, unit: 'W/m2' }, alpha: { value: p.absorptivity, unit: '-' }, epsilon: { value: p.emissivity, unit: '-' }, theta: { value: p.incidenceDeg, unit: 'deg' }, T_shroud: { value: p.shroudK, unit: 'K' } },
    outputs: { equilibriumTemperature: { value: Math.round(t * 10) / 10, unit: 'K' } },
    assumptions: ['Thin isothermal plate, one face illuminated and radiating to a black shroud', 'No conduction to mounts and no gas conduction (vacuum)', 'Steady state'],
    validity: 'First-order sizing estimate for a coupon in vacuum; not a prediction for a real article.',
    warnings: [],
  };
}

export function gravityOffload(p: { massKg: number; targetG: number }): ModelOutput {
  if (!(p.massKg > 0 && p.targetG > 0 && p.targetG < G_EARTH)) throw new Error('mass > 0 and 0 < target gravity < Earth gravity are required');
  const force = p.massKg * (G_EARTH - p.targetG);
  return {
    model: 'gravity_offload_statics',
    label: 'SIMULATED',
    equation: 'F_offload = m · (g₀ − g_target)',
    inputs: { m: { value: p.massKg, unit: 'kg' }, g_target: { value: p.targetG, unit: 'm/s2' }, g0: { value: G_EARTH, unit: 'm/s2' } },
    outputs: {
      offloadForce: { value: Math.round(force * 10) / 10, unit: 'N' },
      offloadFraction: { value: Math.round((1 - p.targetG / G_EARTH) * 1000) / 1000, unit: '-' },
      residualWeight: { value: Math.round(p.massKg * p.targetG * 10) / 10, unit: 'N' },
    },
    assumptions: ['Static vertical force balance', 'Inertial mass unchanged (correctly, mass is the same on any body)'],
    validity: 'Exact for static weight; dynamics, soil loading and lateral suspension effects are NOT reproduced.',
    warnings: ['The soil under the wheels still carries Earth-gravity overburden; traction results remain biased.'],
  };
}

export interface ThermalCycleStep {
  t_h: number;
  setpointK: number;
  phase: 'ramp' | 'dwell';
}

/** A setpoint schedule (PROPOSED CONTROLLED CONDITION). It is not a predicted article response. */
export function thermalCycleProtocol(p: { lowK: number; highK: number; rampKPerMin: number; dwellH: number; cycles: number }) {
  if (!(p.highK > p.lowK && p.lowK > 0 && p.rampKPerMin > 0 && p.dwellH >= 0 && p.cycles >= 1 && p.cycles <= 20)) throw new Error('invalid cycle parameters');
  const rampH = (p.highK - p.lowK) / p.rampKPerMin / 60;
  const steps: ThermalCycleStep[] = [];
  let t = 0;
  for (let c = 0; c < p.cycles; c += 1) {
    steps.push({ t_h: round(t), setpointK: p.highK, phase: 'dwell' });
    t += p.dwellH;
    steps.push({ t_h: round(t), setpointK: p.highK, phase: 'ramp' });
    t += rampH;
    steps.push({ t_h: round(t), setpointK: p.lowK, phase: 'dwell' });
    t += p.dwellH;
    steps.push({ t_h: round(t), setpointK: p.lowK, phase: 'ramp' });
    t += rampH;
  }
  return {
    label: 'PROPOSED CONTROLLED CONDITION' as SyntheticLabel,
    steps,
    totalHours: round(t),
    note: 'Setpoint schedule for chamber control. Article temperatures must be measured; none are predicted here.',
  };
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

export const MODELS = { vacuumPumpdown, radiativeEquilibrium, gravityOffload, thermalCycleProtocol };
