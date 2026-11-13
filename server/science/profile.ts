/**
 * Structured environmental profiles (PART 4.1).
 *
 * The schema is complete; the data is not. Every dimension is declared, and a
 * profile only carries a value when the repository holds a real dataset or a
 * verified published reference for it. Everything else is explicitly MISSING.
 *
 * A measurement carries its *quantity* (what was measured) and *support* (where
 * and over what time it applies). Two values are only compared when both match;
 * this is how air temperature is kept apart from surface temperature, thermal
 * inertia from temperature, and a point record from a regional raster.
 */
import type { Site } from '../../src/types.ts';
import { planetaryReference, planetaryThermal, siteMonthly, siteTerrain, type GeneratedRegion } from './data.ts';
import type { EvidenceState } from '../../src/mission/evidence.ts';

export type Epistemic =
  | 'MEASURED'
  | 'DERIVED'
  | 'MODELED'
  | 'PUBLISHED'
  | 'SEARCHED'
  | 'PENDING_REVIEW'
  | 'PROPOSED'
  | 'SIMULATED'
  | 'ESTIMATED'
  | 'MISSING';

export type DimensionGroup =
  | 'terrain'
  | 'thermal'
  | 'atmosphere'
  | 'radiation_illumination'
  | 'gravity'
  | 'geology'
  | 'resources'
  | 'operations';

export type TemporalSupport =
  | 'static'
  | 'instantaneous'
  | 'diurnal_cycle'
  | 'seasonal_window'
  | 'monthly_climatology'
  | 'annual_climatology'
  | 'multi_year_range'
  | 'mission_period'
  | 'not_applicable';

export type SpatialSupport =
  | 'global_constant'
  | 'point'
  | 'pixel_1km'
  | 'dem_window'
  | 'regional_raster'
  | 'mapped_unit'
  | 'mission_region'
  | 'not_applicable';

export interface Support {
  spatial: SpatialSupport;
  temporal: TemporalSupport;
  resolutionM: number | null;
  period: string | null;
  description: string;
}

export interface Measurement {
  dimension: string;
  quantity: string;
  value: number | null;
  range: [number, number] | null;
  unit: string;
  uncertainty: number | null;
  status: Epistemic;
  support: Support;
  source: string;
  sourceUrl: string | null;
  date: string | null;
  note: string;
  /** Specific reason a value is absent (or how a present value was obtained). */
  evidenceState?: EvidenceState;
  nextAction?: string;
  /** Categorical comparison terms (lower-case substrings) for a target class. */
  categories?: { analog: string[]; partial: string[] };
}

export interface DimensionDef {
  key: string;
  group: DimensionGroup;
  label: string;
  quantity: string;
  unit: string;
  /** 'interval' compares numbers; 'ratio' compares scale; 'categorical' compares classes. */
  comparator: 'interval' | 'ratio' | 'categorical';
  description: string;
}

/** The complete dimension schema. Values attach only where real data exists. */
export const DIMENSIONS: DimensionDef[] = [
  { key: 'terrain.slopeMean', group: 'terrain', label: 'Mean slope (same-baseline DEM)', quantity: 'slope_mean', unit: 'deg', comparator: 'interval', description: 'Mean slope over a ~12.8 km window at 400/463 m baseline, matched to LOLA/MOLA sampling.' },
  { key: 'terrain.slopeP95', group: 'terrain', label: 'P95 slope (same-baseline DEM)', quantity: 'slope_p95', unit: 'deg', comparator: 'interval', description: '95th-percentile slope over the same window and baseline.' },
  { key: 'terrain.relief', group: 'terrain', label: 'Relief P95–P5 (same-baseline DEM)', quantity: 'relief_p95_p5', unit: 'm', comparator: 'ratio', description: 'Elevation spread inside the window.' },
  { key: 'terrain.roughness', group: 'terrain', label: 'Residual roughness (same-baseline DEM)', quantity: 'roughness', unit: 'm', comparator: 'ratio', description: 'Residual relief after a local plane fit at the stated baseline.' },
  { key: 'terrain.localSlopeP95', group: 'terrain', label: 'P95 slope at 40 m (site window)', quantity: 'slope_p95_40m', unit: 'deg', comparator: 'interval', description: 'Local traverse-scale slope from Copernicus GLO-30. No planetary counterpart at this baseline is ingested.' },
  { key: 'terrain.craterGeometry', group: 'terrain', label: 'Crater geometry', quantity: 'crater_geometry', unit: '-', comparator: 'categorical', description: 'Crater depth/diameter population. Not ingested.' },
  { key: 'thermal.surfaceDay', group: 'thermal', label: 'Daytime land-surface temperature', quantity: 'surface_temperature_day', unit: 'K', comparator: 'interval', description: 'MODIS MYD11A1 v061 day LST, 1 km pixel, 3-month window.' },
  { key: 'thermal.surfaceNight', group: 'thermal', label: 'Night-time land-surface temperature', quantity: 'surface_temperature_night', unit: 'K', comparator: 'interval', description: 'MODIS MYD11A1 v061 night LST, 1 km pixel, 3-month window.' },
  { key: 'thermal.surfaceRange', group: 'thermal', label: 'Surface temperature envelope', quantity: 'surface_temperature_envelope', unit: 'K', comparator: 'interval', description: 'Range spanned by surface temperature over the stated support.' },
  { key: 'thermal.diurnalSurfaceDelta', group: 'thermal', label: 'Paired day–night surface ΔT', quantity: 'surface_diurnal_delta', unit: 'K', comparator: 'interval', description: 'Mean paired day minus night LST on the same date.' },
  { key: 'thermal.airMean', group: 'thermal', label: 'Mean near-surface air temperature', quantity: 'air_temperature_mean', unit: 'K', comparator: 'interval', description: 'NASA POWER / MERRA-2 2 m air temperature, 2001–2020 climatology.' },
  { key: 'thermal.airRange', group: 'thermal', label: 'Near-surface air temperature envelope', quantity: 'air_temperature_envelope', unit: 'K', comparator: 'interval', description: 'Air temperature envelope over the stated support.' },
  { key: 'thermal.inertia', group: 'thermal', label: 'Thermal inertia', quantity: 'thermal_inertia', unit: 'J m-2 K-1 s-1/2', comparator: 'interval', description: 'SI thermal inertia √(kρc). Not a temperature. Moon (Diviner) and Mars (MEDA) references are ingested; Earth needs field measurement.' },
  { key: 'atmosphere.pressure', group: 'atmosphere', label: 'Surface pressure', quantity: 'surface_pressure', unit: 'Pa', comparator: 'ratio', description: 'Atmospheric pressure at the surface.' },
  { key: 'atmosphere.composition', group: 'atmosphere', label: 'Dominant atmospheric gas', quantity: 'dominant_gas', unit: '-', comparator: 'categorical', description: 'Dominant constituent by volume.' },
  { key: 'atmosphere.wind', group: 'atmosphere', label: 'Near-surface wind speed', quantity: 'wind_speed', unit: 'm/s', comparator: 'interval', description: 'Mean wind speed.' },
  { key: 'atmosphere.aerosol', group: 'atmosphere', label: 'Aerosol optical depth (dust loading proxy)', quantity: 'aerosol_optical_depth', unit: '-', comparator: 'interval', description: 'MERRA-2 AOD at 550 nm; a column dust-loading proxy, not a surface dust flux.' },
  { key: 'atmosphere.liquidWater', group: 'atmosphere', label: 'Liquid precipitation', quantity: 'precipitation', unit: 'mm/yr', comparator: 'interval', description: 'Annual precipitation.' },
  { key: 'radiation.doseRate', group: 'radiation_illumination', label: 'Surface ionising-radiation dose rate', quantity: 'absorbed_dose_rate_si', unit: 'µGy/h', comparator: 'ratio', description: 'Absorbed dose rate at the surface. Earth site measurements are not ingested.' },
  { key: 'radiation.solarConstant', group: 'radiation_illumination', label: 'Top-of-atmosphere solar irradiance', quantity: 'toa_irradiance', unit: 'W/m2', comparator: 'ratio', description: 'Mean solar irradiance at the body distance (instantaneous, TOA).' },
  { key: 'radiation.surfaceInsolation', group: 'radiation_illumination', label: 'Daily surface insolation', quantity: 'surface_insolation_daily', unit: 'kWh/m2/day', comparator: 'interval', description: 'All-sky daily surface shortwave. Not comparable with TOA irradiance.' },
  { key: 'illumination.maxDarkness', group: 'radiation_illumination', label: 'Longest continuous darkness', quantity: 'max_continuous_darkness', unit: 'days', comparator: 'ratio', description: 'Longest astronomical night at the location.' },
  { key: 'illumination.permanentShadow', group: 'radiation_illumination', label: 'Permanently shadowed terrain', quantity: 'permanent_shadow', unit: '-', comparator: 'categorical', description: 'Terrain that never receives direct sunlight.' },
  { key: 'gravity.surface', group: 'gravity', label: 'Surface gravity', quantity: 'surface_gravity', unit: 'm/s2', comparator: 'ratio', description: 'Mean surface gravitational acceleration.' },
  { key: 'geology.lithology', group: 'geology', label: 'Mapped lithology', quantity: 'lithology', unit: '-', comparator: 'categorical', description: 'Mapped geologic unit at a point (Macrostrat). Not an in-situ assay.' },
  { key: 'geology.mineralogy', group: 'geology', label: 'Surface mineralogy', quantity: 'mineralogy', unit: '-', comparator: 'categorical', description: 'Spectral or assay mineralogy. Sources identified for all three bodies; none ingested.' },
  { key: 'geology.regolithGrainSize', group: 'geology', label: 'Median grain size (D50)', quantity: 'grain_size_d50', unit: 'µm', comparator: 'interval', description: 'Median particle size of the loose surface layer. Lunar reference from Apollo/Luna samples; Earth needs sieve analysis.' },
  { key: 'resources.ice', group: 'resources', label: 'Accessible ice', quantity: 'ice_presence', unit: '-', comparator: 'categorical', description: 'Ice presence; tags are not abundance measurements.' },
  { key: 'resources.soilMoisture', group: 'resources', label: 'Surface soil wetness', quantity: 'soil_wetness', unit: '0-1', comparator: 'interval', description: 'MERRA-2 surface soil wetness fraction.' },
  { key: 'operations.access', group: 'operations', label: 'Field access index', quantity: 'access_index', unit: '0-1', comparator: 'interval', description: 'Derived index from airport distance and ground transfer.' },
  { key: 'operations.groundHours', group: 'operations', label: 'Ground transfer from hub', quantity: 'ground_transfer_hours', unit: 'h', comparator: 'interval', description: 'Published/estimated airport ground transfer.' },
];

export const DIMENSION_BY_KEY = new Map(DIMENSIONS.map((d) => [d.key, d]));

export interface EnvironmentalProfile {
  id: string;
  kind: 'earth_site' | 'generated_region' | 'planetary_reference';
  name: string;
  body: 'Earth' | 'Moon' | 'Mars';
  lat: number | null;
  lon: number | null;
  measurements: Record<string, Measurement>;
}

const NONE: Support = { spatial: 'not_applicable', temporal: 'not_applicable', resolutionM: null, period: null, description: 'no data' };

export function missing(dimension: string, note: string, evidenceState: EvidenceState = 'not_investigated', nextAction?: string): Measurement {
  const def = DIMENSION_BY_KEY.get(dimension)!;
  return {
    dimension,
    quantity: def.quantity,
    value: null,
    range: null,
    unit: def.unit,
    uncertainty: null,
    status: 'MISSING',
    support: NONE,
    source: 'none',
    sourceUrl: null,
    date: null,
    note,
    evidenceState,
    nextAction,
  };
}

type Side = 'earth' | 'moon' | 'mars';
/**
 * Why a dimension has no value on a given side, and what would close the gap.
 * Every entry records an investigation (2026-11-14); none is a generic "no data".
 */
export const DIMENSION_GAPS: Record<string, Partial<Record<Side, { state: EvidenceState; note: string; next: string }>>> = {
  'terrain.localSlopeP95': {
    moon: { state: 'source_found_not_integrated', note: 'LOLA south-polar elevation and illumination maps at 60–240 m/px exist (NASA PGDA product 69) but only the 400 m baseline window is ingested.', next: 'Ingest the 60 m PGDA polar map around the target; the nearest Earth comparison would then need a 60 m Earth baseline.' },
    mars: { state: 'source_found_not_integrated', note: 'HiRISE/CTX DEMs of Jezero exist but only the 463 m MOLA baseline is ingested.', next: 'Ingest a CTX DEM of Jezero and compute slope at 40 m.' },
  },
  'terrain.craterGeometry': {
    earth: { state: 'not_investigated', note: 'Crater morphometry has not been extracted from the DEM.', next: 'Derive depth/diameter from the stored DEM windows for impact sites.' },
    moon: { state: 'not_investigated', note: 'Crater morphometry is not ingested.', next: 'Use a published crater catalogue (e.g. Robbins 2019) for the target region.' },
    mars: { state: 'not_investigated', note: 'Crater morphometry is not ingested.', next: 'Use a published crater catalogue (e.g. Robbins & Hynek 2012).' },
  },
  'thermal.surfaceDay': {
    moon: { state: 'source_found_not_integrated', note: 'LRO Diviner polar temperature products exist on the PDS Geosciences Node; only the published 50–250 K polar envelope is ingested.', next: 'Ingest Diviner polar daytime brightness temperature at the target point.' },
    mars: { state: 'source_found_not_integrated', note: 'MEDA ground temperature time series exist; only the envelope is ingested.', next: 'Ingest MEDA TIRS ground temperature (PDS) and compute the daytime mean.' },
  },
  'thermal.surfaceNight': {
    moon: { state: 'source_found_not_integrated', note: 'LRO Diviner polar night-time temperatures exist on the PDS Geosciences Node but are not ingested; only the 50–250 K polar envelope is.', next: 'Ingest Diviner polar night-time temperature at the target point.' },
    mars: { state: 'source_found_not_integrated', note: 'MEDA night-time ground temperatures exist; only the envelope is ingested.', next: 'Ingest MEDA TIRS night-time ground temperature (PDS).' },
  },
  'thermal.diurnalSurfaceDelta': {
    moon: { state: 'source_found_not_integrated', note: 'Diviner diurnal curves exist but are not ingested.', next: 'Ingest Diviner diurnal temperature curves for the target point.' },
    mars: { state: 'source_found_not_integrated', note: 'MEDA diurnal ground temperature exists but the paired amplitude is not computed.', next: 'Compute paired day–night ΔT from MEDA TIRS.' },
  },
  'thermal.airMean': { moon: { state: 'not_applicable', note: 'The Moon has no atmosphere, so there is no air temperature.', next: 'Compare surface temperature instead.' } },
  'thermal.airRange': { moon: { state: 'not_applicable', note: 'The Moon has no atmosphere, so there is no air temperature.', next: 'Compare surface temperature instead.' } },
  'thermal.inertia': {
    earth: { state: 'field_measurement_required', note: 'No open dataset gives SI thermal inertia at Earth field sites. MODIS apparent thermal inertia is a different quantity (K⁻¹) and is not used.', next: 'Needle-probe thermal conductivity (ASTM D5334) plus density and heat capacity of site samples.' },
  },
  'atmosphere.aerosol': { moon: { state: 'not_applicable', note: 'No atmosphere, so no aerosol optical depth. Lunar dust is lofted electrostatically and by impacts.', next: 'Use a dust-mitigation chamber with electrostatic charging.' } },
  'resources.soilMoisture': {
    moon: { state: 'not_applicable', note: 'No liquid water or soil moisture at the lunar surface.', next: 'Not applicable.' },
    mars: { state: 'not_applicable', note: 'No liquid soil moisture at the Martian surface.', next: 'Not applicable.' },
  },
  'radiation.doseRate': {
    earth: { state: 'not_investigated', note: 'No per-site Earth surface dose measurement is ingested. Earth surface dose is shielded by the atmosphere and magnetosphere, but no number is asserted here.', next: 'Measure with a portable dosimeter if dose matters for the test.' },
  },
  'illumination.permanentShadow': {
    earth: { state: 'not_investigated', note: 'No horizon-resolved illumination model is ingested for Earth sites.', next: 'Compute horizon shading from the stored DEM windows.' },
    mars: { state: 'not_investigated', note: 'Not evaluated for Jezero (18°N), where permanent shadow is not expected at site scale.', next: 'Not needed for a mid-latitude target.' },
  },
  'geology.mineralogy': {
    earth: { state: 'source_found_not_integrated', note: 'EMIT L2B mineral identification (60 m, arid regions, since 2022) and ASTER exist but are not ingested; EMIT needs a NASA Earthdata Login. Mapped lithology is not mineralogy.', next: 'Configure an Earthdata Login and ingest EMIT L2B for arid sites, or assay hand samples.' },
    moon: { state: 'source_found_not_integrated', note: 'Moon Mineralogy Mapper (M3) and Kaguya spectral data exist on the PDS; south-polar mineralogy has been mapped (Moriarty et al. 2024) but is not ingested.', next: 'Ingest a published south-polar mineralogy map for the target.' },
    mars: { state: 'source_found_not_integrated', note: 'CRISM and Perseverance mineralogy exist for Jezero but are not ingested.', next: 'Ingest a published Jezero floor mineralogy summary.' },
  },
  'geology.regolithGrainSize': {
    earth: { state: 'field_measurement_required', note: 'No site grain-size measurement is ingested. SoilGrids texture fractions are modelled class fractions, a different quantity from a median grain size.', next: 'Sieve and hydrometer analysis of surface samples (ASTM D6913 / D7928).' },
    mars: { state: 'not_investigated', note: 'Jezero surface grain size is not ingested.', next: 'Investigate Perseverance and MEDA-derived particle size estimates.' },
  },
  'geology.lithology': {
    mars: { state: 'not_investigated', note: 'Jezero floor lithology is not ingested.', next: 'Ingest a published Jezero floor unit description.' },
  },
  'resources.ice': {
    moon: { state: 'not_investigated', note: 'Polar ice abundance estimates are not ingested.', next: 'Investigate LRO LEND/LAMP and Lunar Prospector hydrogen maps.' },
    mars: { state: 'not_investigated', note: 'Not evaluated for Jezero.', next: 'Not needed for this target.' },
  },
  'operations.access': {
    moon: { state: 'not_applicable', note: 'Field access is an Earth-site property.', next: 'Not applicable.' },
    mars: { state: 'not_applicable', note: 'Field access is an Earth-site property.', next: 'Not applicable.' },
  },
  'operations.groundHours': {
    moon: { state: 'not_applicable', note: 'Ground transfer is an Earth-site property.', next: 'Not applicable.' },
    mars: { state: 'not_applicable', note: 'Ground transfer is an Earth-site property.', next: 'Not applicable.' },
  },
};

function gap(dimension: string, side: Side, fallback: string): Measurement {
  const g = DIMENSION_GAPS[dimension]?.[side];
  return g ? missing(dimension, g.note, g.state, g.next) : missing(dimension, fallback);
}

function m(dimension: string, fields: Partial<Measurement> & { status: Epistemic; support: Support; source: string }): Measurement {
  const def = DIMENSION_BY_KEY.get(dimension);
  if (!def) throw new Error(`unknown dimension ${dimension}`);
  return {
    dimension,
    quantity: def.quantity,
    value: null,
    range: null,
    unit: def.unit,
    uncertainty: null,
    sourceUrl: null,
    date: null,
    note: '',
    ...fields,
  };
}

const NSSDC_MOON = 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html';
const NSSDC_MARS = 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html';
const NSSDC_EARTH = 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html';
const CONSTANT: Support = { spatial: 'global_constant', temporal: 'static', resolutionM: null, period: null, description: 'body-wide published constant' };

/** Earth-wide constants that apply to every terrestrial site. Verified against NSSDC fact sheets on 2026-11-13. */
function earthConstants(): Record<string, Measurement> {
  return {
    'gravity.surface': m('gravity.surface', { value: 9.82, status: 'PUBLISHED', support: CONSTANT, source: 'NASA NSSDC Earth Fact Sheet: "Surface gravity (mean) (m/s2) 9.820"', sourceUrl: NSSDC_EARTH, date: '2026-11-13 (accessed)' }),
    'atmosphere.composition': m('atmosphere.composition', { status: 'PUBLISHED', support: CONSTANT, source: 'NASA NSSDC Earth Fact Sheet: "78.08% Nitrogen (N2), 20.95% Oxygen (O2)"', sourceUrl: NSSDC_EARTH, date: '2026-11-13 (accessed)', note: 'N2' }),
    'radiation.solarConstant': m('radiation.solarConstant', { value: 1361.0, status: 'PUBLISHED', support: CONSTANT, source: 'NASA NSSDC Moon Fact Sheet (Earth column): "Solar irradiance (W/m2) 1361.0"', sourceUrl: NSSDC_MOON, date: '2026-11-13 (accessed)' }),
    'radiation.doseRate': gap('radiation.doseRate', 'earth', 'No per-site Earth surface dose measurement is ingested.'),
  };
}

/**
 * Longest astronomical night (days) from latitude using solar declination ±23.44°.
 * DERIVED: geometric, ignores refraction, terrain horizon and twilight definitions.
 */
export function maxContinuousDarknessDays(lat: number): number {
  const obliquity = 23.44;
  const abs = Math.abs(lat);
  if (abs <= 90 - obliquity) return 0.5; // never longer than about half a day
  let days = 0;
  for (let day = 0; day < 365; day += 1) {
    const declination = -obliquity * Math.cos((2 * Math.PI * (day + 10)) / 365);
    const sunAlwaysDown = lat >= 0 ? declination <= -(90 - abs) : declination >= 90 - abs;
    if (sunAlwaysDown) days += 1;
  }
  return days;
}

export function earthSiteProfile(site: Site): EnvironmentalProfile {
  const measurements: Record<string, Measurement> = { ...earthConstants() };
  const ref = planetaryReference.earth[site.id]?.['400m'];
  const terrainWindow: Support = { spatial: 'dem_window', temporal: 'static', resolutionM: 400, period: '2011-2015 (DEM acquisition)', description: '~12.8 km window resampled to 400 m to match LOLA baseline' };
  if (ref) {
    measurements['terrain.slopeMean'] = m('terrain.slopeMean', { value: ref.slopeMean, status: 'DERIVED', support: terrainWindow, source: ref.source });
    measurements['terrain.slopeP95'] = m('terrain.slopeP95', { value: ref.slopeP95, status: 'DERIVED', support: terrainWindow, source: ref.source });
    measurements['terrain.relief'] = m('terrain.relief', { value: ref.reliefP95P5, status: 'DERIVED', support: terrainWindow, source: ref.source });
    measurements['terrain.roughness'] = m('terrain.roughness', { value: ref.roughness, status: 'DERIVED', support: terrainWindow, source: ref.source });
  }
  const local = siteTerrain.sites[site.id];
  if (local?.stats) {
    measurements['terrain.localSlopeP95'] = m('terrain.localSlopeP95', {
      value: local.stats.p95Slope,
      status: 'DERIVED',
      support: { spatial: 'dem_window', temporal: 'static', resolutionM: 40, period: local.date, description: '20.48 × 12.8 km window, 40 m heightmap' },
      source: local.source,
    });
  }
  measurements['terrain.craterGeometry'] = gap('terrain.craterGeometry', 'earth', 'Crater morphometry is not ingested.');

  const thermal = planetaryThermal.earth[site.id];
  const modisSupport = (window: string): Support => ({ spatial: 'pixel_1km', temporal: 'seasonal_window', resolutionM: 1000, period: window, description: 'MODIS centre pixel, clear-sky, ≤12 sampled dates in a 3-month warm-season window' });
  if (thermal) {
    for (const [channel, key] of [['day', 'thermal.surfaceDay'], ['night', 'thermal.surfaceNight']] as const) {
      const c = thermal[channel];
      measurements[key] =
        c.meanK != null
          ? m(key, { value: c.meanK, range: c.minK != null && c.maxK != null ? [c.minK, c.maxK] : null, status: 'MEASURED', support: modisSupport(thermal.window), source: `${planetaryThermal.modis.product} (${c.nAccepted} accepted obs, ${c.status})`, note: 'Warm-season window only; not an annual envelope.' })
          : missing(key, `MODIS ${channel} sample ${c.status} (${c.nAccepted} accepted clear-sky observations, at least 4 needed).`, 'insufficient_sample', 'Widen the MODIS sampling window or add MODIS Terra (MOD11A1).');
    }
    const lo = thermal.night.minK ?? thermal.day.minK;
    const hi = thermal.day.maxK ?? thermal.night.maxK;
    measurements['thermal.surfaceRange'] =
      lo != null && hi != null
        ? m('thermal.surfaceRange', { range: [lo, hi], value: null, status: 'MEASURED', support: modisSupport(thermal.window), source: planetaryThermal.modis.product, note: 'Envelope of sampled warm-season day and night LST. It is not an annual or multi-year extreme.' })
        : missing('thermal.surfaceRange', 'Insufficient MODIS sample for an envelope.', 'insufficient_sample', 'Widen the MODIS sampling window.');
    measurements['thermal.diurnalSurfaceDelta'] =
      thermal.pairedDayNight.meanDeltaK != null
        ? m('thermal.diurnalSurfaceDelta', { value: thermal.pairedDayNight.meanDeltaK, range: [thermal.pairedDayNight.minDeltaK!, thermal.pairedDayNight.maxDeltaK!], status: 'DERIVED', support: modisSupport(thermal.window), source: `${planetaryThermal.modis.product} paired day/night (${thermal.pairedDayNight.nPaired} pairs)` })
        : missing('thermal.diurnalSurfaceDelta', 'No date has both a clear day and a clear night MODIS observation.', 'insufficient_sample', 'Widen the MODIS sampling window.');
  } else {
    for (const key of ['thermal.surfaceDay', 'thermal.surfaceNight', 'thermal.surfaceRange', 'thermal.diurnalSurfaceDelta']) {
      measurements[key] = missing(key, 'The MODIS sampler has not been run for this site.', 'source_found_not_integrated', 'Run scripts/fetch_modis_lst.py for this site.');
    }
  }

  const climate = site.climate;
  const powerSupport: Support = { spatial: 'point', temporal: 'annual_climatology', resolutionM: 50_000, period: '2001-2020', description: 'NASA POWER / MERRA-2 grid cell at the site point, annual climatology' };
  const powerSource = 'NASA POWER / MERRA-2 climatology 2001–2020';
  measurements['thermal.airMean'] = m('thermal.airMean', { value: round(climate.tempMean + 273.15), status: 'MODELED', support: powerSupport, source: powerSource, note: 'Reanalysis 2 m air temperature; not a surface temperature.' });
  const monthly = siteMonthly.sites[site.id];
  const mins = (monthly?.tempMin ?? []).filter((v): v is number => typeof v === 'number');
  const maxs = (monthly?.tempMax ?? []).filter((v): v is number => typeof v === 'number');
  if (mins.length === 12 && maxs.length === 12) {
    measurements['thermal.airRange'] = m('thermal.airRange', {
      range: [round(Math.min(...mins) + 273.15), round(Math.max(...maxs) + 273.15)],
      status: 'MODELED',
      support: { ...powerSupport, temporal: 'monthly_climatology', description: 'Envelope of monthly mean minimum/maximum 2 m air temperature' },
      source: powerSource,
      note: 'Monthly normals suppress daily extremes.',
    });
  } else {
    measurements['thermal.airRange'] = missing('thermal.airRange', 'Monthly normals were not returned for this site.', 'retrieval_failed', 'Re-run scripts/fetch_site_monthly.py.');
  }
  measurements['thermal.inertia'] = gap('thermal.inertia', 'earth', 'Thermal inertia is not ingested for Earth sites.');
  measurements['atmosphere.pressure'] = climate.pressure != null
    ? m('atmosphere.pressure', { value: round(climate.pressure * 1000), status: 'MODELED', support: powerSupport, source: powerSource })
    : missing('atmosphere.pressure', 'NASA POWER surface pressure was not returned for this site.', 'retrieval_failed', 'Re-query NASA POWER for this site.');
  measurements['atmosphere.wind'] = m('atmosphere.wind', { value: climate.wind, status: 'MODELED', support: powerSupport, source: powerSource, note: '10 m wind (reanalysis).' });
  measurements['atmosphere.aerosol'] = m('atmosphere.aerosol', { value: climate.aerosol, status: 'MODELED', support: powerSupport, source: powerSource });
  measurements['atmosphere.liquidWater'] = m('atmosphere.liquidWater', { value: climate.precipYear, status: 'MODELED', support: powerSupport, source: powerSource });
  measurements['radiation.surfaceInsolation'] = m('radiation.surfaceInsolation', { value: climate.solar, status: 'MODELED', support: powerSupport, source: powerSource });
  measurements['illumination.maxDarkness'] = m('illumination.maxDarkness', {
    value: maxContinuousDarknessDays(site.lat),
    status: 'DERIVED',
    support: { spatial: 'point', temporal: 'annual_climatology', resolutionM: null, period: 'astronomical', description: 'Solar geometry at the site latitude' },
    source: 'Solar declination geometry (obliquity 23.44°); ignores refraction and terrain horizon',
  });
  measurements['illumination.permanentShadow'] = gap('illumination.permanentShadow', 'earth', 'No horizon-resolved illumination model is ingested for Earth sites.');
  const macro = site.macrostrat;
  measurements['geology.lithology'] = macro?.lith
    ? m('geology.lithology', { status: 'DERIVED', support: { spatial: 'mapped_unit', temporal: 'static', resolutionM: null, period: macro.age ?? null, description: 'Macrostrat mapped unit at the representative point' }, source: macro.source ?? 'Macrostrat CC-BY 4.0', note: `${macro.lith}${macro.unit ? `, ${macro.unit}` : ''}` })
    : missing('geology.lithology', 'Macrostrat returned no mapped unit at this point.', 'not_covering_location', 'Use a national geological survey map for this country.');
  measurements['geology.mineralogy'] = gap('geology.mineralogy', 'earth', 'Mineralogy is not ingested.');
  measurements['geology.regolithGrainSize'] = gap('geology.regolithGrainSize', 'earth', 'No grain-size measurement is ingested.');
  const iceTag = site.tags.includes('ice') || site.tags.includes('glacier') || site.tags.includes('permafrost');
  measurements['resources.ice'] = iceTag
    ? m('resources.ice', { status: 'ESTIMATED', support: { spatial: 'mission_region', temporal: 'static', resolutionM: null, period: null, description: 'Curated site tag' }, source: 'ODYSSEY curated site tags', note: 'Tag indicates ice is present in the region; not an abundance or accessibility measurement.' })
    : missing('resources.ice', 'No ice is indicated for this site.', 'not_investigated', 'Check glacier inventories (RGI) if ice matters.');
  measurements['resources.soilMoisture'] = m('resources.soilMoisture', { value: climate.soilWetnessTop, status: 'MODELED', support: powerSupport, source: powerSource });
  measurements['operations.access'] = m('operations.access', { value: site.access, status: 'DERIVED', support: { spatial: 'point', temporal: 'static', resolutionM: null, period: null, description: 'Airport distance and transfer index' }, source: 'ODYSSEY access index (OurAirports / published transfers)' });
  measurements['operations.groundHours'] = site.airport?.groundHours != null
    ? m('operations.groundHours', { value: site.airport.groundHours, status: 'ESTIMATED', support: { spatial: 'point', temporal: 'static', resolutionM: null, period: null, description: `From ${site.airport.name}` }, source: 'ODYSSEY airport hub table' })
    : missing('operations.groundHours', 'No ground transfer estimate.', 'not_investigated', 'Estimate the route from the nearest airport.');
  return { id: site.id, kind: 'earth_site', name: site.name, body: 'Earth', lat: site.lat, lon: site.lon, measurements };
}

/** Coarse generated regions: WorldClim 10′ features only. Everything else is MISSING. */
export function generatedRegionProfile(region: GeneratedRegion): EnvironmentalProfile {
  const measurements: Record<string, Measurement> = { ...earthConstants() };
  for (const def of DIMENSIONS) {
    if (measurements[def.key]) continue;
    const g = DIMENSION_GAPS[def.key]?.earth;
    measurements[def.key] = g && g.state !== 'not_investigated'
      ? missing(def.key, g.note, g.state, g.next)
      : missing(def.key, 'Generated regions carry only WorldClim 10′ climate and elevation. The site pipelines (DEM, MODIS, Macrostrat) have not been run for this region.', 'source_found_not_integrated', 'Promote the region to a candidate and run the site enrichment pipelines.');
  }
  const wc: Support = { spatial: 'regional_raster', temporal: 'annual_climatology', resolutionM: 18_500, period: '1970-2000', description: `WorldClim 2.1 10′ cells averaged over ${region.areaKm2.toFixed(0)} km²` };
  const f = region.features;
  if (f.tempMeanC) measurements['thermal.airMean'] = m('thermal.airMean', { value: round(f.tempMeanC.mean + 273.15), range: [round(f.tempMeanC.min + 273.15), round(f.tempMeanC.max + 273.15)], status: 'MODELED', support: wc, source: 'WorldClim 2.1 bio1 (interpolated station climatology)' });
  if (f.tempMinC && f.tempMaxC) measurements['thermal.airRange'] = m('thermal.airRange', { range: [round(f.tempMinC.mean + 273.15), round(f.tempMaxC.mean + 273.15)], status: 'MODELED', support: { ...wc, description: 'Coldest-month minimum to warmest-month maximum (bio6/bio5), region mean' }, source: 'WorldClim 2.1 bio5/bio6' });
  if (f.precipYearMm) measurements['atmosphere.liquidWater'] = m('atmosphere.liquidWater', { value: f.precipYearMm.mean, status: 'MODELED', support: wc, source: 'WorldClim 2.1 bio12' });
  measurements['illumination.maxDarkness'] = m('illumination.maxDarkness', { value: maxContinuousDarknessDays(region.lat), status: 'DERIVED', support: { spatial: 'point', temporal: 'annual_climatology', resolutionM: null, period: 'astronomical', description: 'Solar geometry at the region centre latitude' }, source: 'Solar declination geometry' });
  return { id: region.id, kind: 'generated_region', name: region.name, body: 'Earth', lat: region.lat, lon: region.lon, measurements };
}

export type PlanetaryTargetId = 'moon_south_pole' | 'mars_jezero';

export function planetaryProfile(target: PlanetaryTargetId): EnvironmentalProfile {
  const measurements: Record<string, Measurement> = {};
  const side: Side = target === 'moon_south_pole' ? 'moon' : 'mars';
  for (const def of DIMENSIONS) measurements[def.key] = gap(def.key, side, 'No verified reference has been ingested for this dimension yet.');
  const accessed = '2026-11-13 (accessed)';
  if (target === 'moon_south_pole') {
    const lola = planetaryReference.references.moon;
    const win: Support = { spatial: 'dem_window', temporal: 'static', resolutionM: lola.resolutionM, period: 'LRO LOLA GDR', description: `${lola.windowKm} km window near ${lola.name}` };
    measurements['terrain.slopeMean'] = m('terrain.slopeMean', { value: lola.slopeMean, status: 'DERIVED', support: win, source: lola.source });
    measurements['terrain.slopeP95'] = m('terrain.slopeP95', { value: lola.slopeP95, status: 'DERIVED', support: win, source: lola.source });
    measurements['terrain.relief'] = m('terrain.relief', { value: lola.reliefP95P5, status: 'DERIVED', support: win, source: lola.source });
    measurements['terrain.roughness'] = m('terrain.roughness', { value: lola.roughness, status: 'DERIVED', support: win, source: lola.source });
    const polar = planetaryThermal.moon.classes.polarRange;
    if (polar.rangeK) {
      measurements['thermal.surfaceRange'] = m('thermal.surfaceRange', { range: polar.rangeK, status: 'PUBLISHED', support: { spatial: 'mission_region', temporal: 'multi_year_range', resolutionM: null, period: 'Diviner mission', description: polar.support }, source: polar.source, note: planetaryThermal.moon.note });
    }
    measurements['gravity.surface'] = m('gravity.surface', { value: 1.62, status: 'PUBLISHED', support: CONSTANT, source: 'NASA NSSDC Moon Fact Sheet: "Surface gravity (m/s2) 1.62"', sourceUrl: NSSDC_MOON, date: accessed });
    measurements['atmosphere.pressure'] = m('atmosphere.pressure', { value: 3e-10, status: 'PUBLISHED', support: { ...CONSTANT, temporal: 'instantaneous', description: 'night-time surface exosphere' }, source: 'NASA NSSDC Moon Fact Sheet: "Surface pressure (night): 3 x 10-15 bar" (= 3×10⁻¹⁰ Pa)', sourceUrl: NSSDC_MOON, date: accessed, note: 'Exosphere; effectively vacuum for convective heat transfer.' });
    measurements['atmosphere.composition'] = m('atmosphere.composition', { status: 'PUBLISHED', support: CONSTANT, source: 'NASA NSSDC Moon Fact Sheet: tenuous exosphere, He/Ne/H2/Ar estimates, "poorly known and variable"', sourceUrl: NSSDC_MOON, date: accessed, note: 'exosphere (no bulk atmosphere)' });
    measurements['atmosphere.wind'] = m('atmosphere.wind', { value: 0, status: 'PUBLISHED', support: CONSTANT, source: 'No bulk atmosphere (NSSDC Moon Fact Sheet surface pressure 3×10⁻¹⁵ bar)', sourceUrl: NSSDC_MOON, date: accessed, note: 'No aeolian transport; dust is lofted electrostatically and by impacts/plumes instead.' });
    measurements['atmosphere.liquidWater'] = m('atmosphere.liquidWater', { value: 0, status: 'PUBLISHED', support: CONSTANT, source: 'No liquid water is stable at 3×10⁻¹⁵ bar (NSSDC Moon Fact Sheet pressure)', sourceUrl: NSSDC_MOON, date: accessed });
    measurements['radiation.solarConstant'] = m('radiation.solarConstant', { value: 1361.0, status: 'PUBLISHED', support: CONSTANT, source: 'NASA NSSDC Moon Fact Sheet: "Solar irradiance (W/m2) 1361.0"', sourceUrl: NSSDC_MOON, date: accessed });
    measurements['radiation.doseRate'] = m('radiation.doseRate', { value: 13.2, uncertainty: 1, status: 'PUBLISHED', support: { spatial: 'point', temporal: 'mission_period', resolutionM: null, period: 'Chang\'E-4 LND, 2019', description: 'Total absorbed dose rate in silicon, Von Kármán crater (far side), not the south pole' }, source: 'Zhang et al. 2020, Science Advances 6:eaaz1334 (abstract: "average total absorbed dose rate in silicon of 13.2 ± 1 μGy/hour")', sourceUrl: 'https://doi.org/10.1126/sciadv.aaz1334', date: '2020-09-25' });
    measurements['illumination.maxDarkness'] = m('illumination.maxDarkness', {
      value: 1.5,
      status: 'PUBLISHED',
      support: { spatial: 'point', temporal: 'multi_year_range', resolutionM: 240, period: 'LOLA horizon model over several 18.6-year cycles, 6 h steps', description: 'The best-illuminated point near the Shackleton crater rim; other polar points are darker, and permanently shadowed regions never see the Sun' },
      source: 'Mazarico et al. 2011, Icarus 211:1066 (abstract): "a location near the Shackleton crater rim in the south polar region is sunlit continuously for 240 days, and its longest continuous period in total darkness is about 1.5 days"',
      sourceUrl: 'https://ntrs.nasa.gov/citations/20120010094',
      date: '2011',
      note: 'Point value at the most illuminated rim location, from LOLA topography and solar geometry. Not an annual illumination fraction, and not representative of the whole region.',
    });
    measurements['thermal.inertia'] = m('thermal.inertia', {
      value: 55,
      uncertainty: 2,
      status: 'PUBLISHED',
      support: { spatial: 'regional_raster', temporal: 'multi_year_range', resolutionM: null, period: 'LRO Diviner 2009–2016', description: 'Global average of the diurnally active regolith fines layer (~4–7 cm) at 273 K; south-polar values are not separately reported in the abstract' },
      source: 'Hayne et al. 2017, JGR Planets 122:2371 (arXiv:1711.00977 abstract): "a thermal inertia of 55 ±2 J m−2 K−1 s−1/2 at 273 K"',
      sourceUrl: 'https://doi.org/10.1002/2017JE005387',
      date: '2017',
      note: 'Measured under vacuum. Thermal conductivity of particulate material depends on the gas in the pores, so the lunar value is partly a vacuum property.',
    });
    measurements['geology.lithology'] = m('geology.lithology', {
      status: 'PUBLISHED',
      support: { spatial: 'mission_region', temporal: 'static', resolutionM: null, period: null, description: 'South polar region, on a South Pole–Aitken basin massif' },
      source: 'Spudis et al. 2008, GRL 35:L14201: "The south pole of the Moon is located in the rugged, heavily cratered terrain of the southern highlands"; plains "consisting of impact breccia"',
      sourceUrl: 'https://doi.org/10.1029/2008GL034468',
      date: '2008',
      note: 'highland terrain, impact breccia',
      categories: { analog: ['anorthosit'], partial: ['impact breccia', 'impactite', 'suevite', 'impact melt', 'norite', 'gabbro'] },
    });
    measurements['geology.regolithGrainSize'] = m('geology.regolithGrainSize', {
      value: 72,
      range: [40, 130],
      status: 'PUBLISHED',
      support: { spatial: 'mission_region', temporal: 'static', resolutionM: null, period: 'Apollo 11–17 and Luna 24 samples', description: 'Median particle size D50 of returned soils from seven equatorial and mid-latitude landing sites; Carrier notes the poles may differ' },
      source: 'Carrier 2005 (LPI): "The average or median particle size, D50 … is approximately 0.072 mm"; Carrier 1973 (NTRS 19740027286): "The median particle size for the steady-state soil is 40 to 130 microns"',
      sourceUrl: 'https://www.lpi.usra.edu/lunar/surface/carrier_lunar_soils.pdf',
      date: '2005',
      note: 'No polar sample exists. Treated as the best available reference, not a south-pole measurement.',
    });
    measurements['illumination.permanentShadow'] = m('illumination.permanentShadow', { status: 'PUBLISHED', support: { spatial: 'mission_region', temporal: 'static', resolutionM: null, period: null, description: 'Polar permanently shadowed regions' }, source: planetaryThermal.moon.classes.permanentlyShadowed.support, note: 'present (south-polar PSRs); temperature not separately sampled in this repository' });
  } else {
    const mola = planetaryReference.references.mars;
    const win: Support = { spatial: 'dem_window', temporal: 'static', resolutionM: mola.resolutionM, period: 'MGS MOLA', description: `${mola.windowKm} km window at ${mola.name}` };
    measurements['terrain.slopeMean'] = m('terrain.slopeMean', { value: mola.slopeMean, status: 'DERIVED', support: win, source: mola.source });
    measurements['terrain.slopeP95'] = m('terrain.slopeP95', { value: mola.slopeP95, status: 'DERIVED', support: win, source: mola.source });
    measurements['terrain.relief'] = m('terrain.relief', { value: mola.reliefP95P5, status: 'DERIVED', support: win, source: mola.source });
    measurements['terrain.roughness'] = m('terrain.roughness', { value: mola.roughness, status: 'DERIVED', support: win, source: mola.source });
    const mars = planetaryThermal.mars;
    measurements['thermal.surfaceRange'] = m('thermal.surfaceRange', { range: mars.surface.rangeK, status: 'MEASURED', support: { spatial: 'point', temporal: 'multi_year_range', resolutionM: null, period: 'sols 0–400', description: mars.surface.support }, source: `${mars.surface.source} (doi:${mars.surface.doi})`, sourceUrl: `https://doi.org/${mars.surface.doi}`, note: mars.note });
    measurements['thermal.airRange'] = m('thermal.airRange', { range: mars.air.rangeK, status: 'MEASURED', support: { spatial: 'point', temporal: 'multi_year_range', resolutionM: null, period: 'sols 0–400', description: mars.air.support }, source: `${mars.air.source} (doi:${mars.air.doi})`, sourceUrl: `https://doi.org/${mars.air.doi}`, note: mars.note });
    measurements['gravity.surface'] = m('gravity.surface', { value: 3.73, status: 'PUBLISHED', support: CONSTANT, source: 'NASA NSSDC Mars Fact Sheet: "Surface gravity (mean) (m/s2) 3.73"', sourceUrl: NSSDC_MARS, date: accessed });
    measurements['atmosphere.pressure'] = m('atmosphere.pressure', { value: 636, range: [400, 870], status: 'PUBLISHED', support: { spatial: 'global_constant', temporal: 'seasonal_window', resolutionM: null, period: 'seasonal', description: 'at mean radius; seasonal variation' }, source: 'NASA NSSDC Mars Fact Sheet: "6.36 mb at mean radius (variable from 4.0 to 8.7 mb depending on season)"', sourceUrl: NSSDC_MARS, date: accessed });
    measurements['atmosphere.composition'] = m('atmosphere.composition', { status: 'PUBLISHED', support: CONSTANT, source: 'NASA NSSDC Mars Fact Sheet: "Carbon Dioxide (CO2) - 95.1%"', sourceUrl: NSSDC_MARS, date: accessed, note: 'CO2' });
    measurements['atmosphere.wind'] = m('atmosphere.wind', { range: [2, 7], status: 'PUBLISHED', support: { spatial: 'point', temporal: 'seasonal_window', resolutionM: null, period: 'Viking lander summer', description: 'Viking Lander sites, summer' }, source: 'NASA NSSDC Mars Fact Sheet: "Wind speeds: 2-7 m/s (summer) ... 17-30 m/s (dust storm)"', sourceUrl: NSSDC_MARS, date: accessed });
    measurements['radiation.solarConstant'] = m('radiation.solarConstant', { value: 586.2, status: 'PUBLISHED', support: CONSTANT, source: 'NASA NSSDC Mars Fact Sheet: "Solar irradiance (W/m2) 586.2"', sourceUrl: NSSDC_MARS, date: accessed });
    measurements['radiation.doseRate'] = missing('radiation.doseRate', 'MSL/RAD measured surface dose (Hassler et al. 2014, doi:10.1126/science.1244797); the numeric value has not been verified from accessible full text.', 'retrieval_failed', 'Retrieve the Hassler et al. 2014 full text and verify the dose rate verbatim.');
    measurements['thermal.inertia'] = m('thermal.inertia', {
      range: [180, 605],
      status: 'MEASURED',
      support: { spatial: 'point', temporal: 'multi_year_range', resolutionM: 2, period: 'Mars 2020 sols 0–350', description: 'MEDA retrievals along the Perseverance traverse, ~3–4 m² footprint, from sand dune to bedrock' },
      source: 'Martínez et al. 2023, JGR Planets (abstract): "Thermal inertia values ranged between 180 (sand dune) and 605 (bedrock-dominated material) SI units"',
      sourceUrl: 'https://doi.org/10.1029/2022JE007537',
      date: '2023',
      note: 'Traverse range, not a single crater-floor value.',
    });
    measurements['illumination.maxDarkness'] = m('illumination.maxDarkness', { value: 0.5, status: 'PUBLISHED', support: CONSTANT, source: 'NASA NSSDC Mars Fact Sheet: "Length of day (hrs) 24.6597" (Jezero at 18.4°N has no polar night)', sourceUrl: NSSDC_MARS, date: accessed });
    measurements['atmosphere.liquidWater'] = m('atmosphere.liquidWater', { value: 0, status: 'PUBLISHED', support: CONSTANT, source: 'Mean pressure 6.36 mb (NSSDC) is near the water triple point; no rainfall', sourceUrl: NSSDC_MARS, date: accessed, note: 'No precipitation of liquid water.' });
  }
  return {
    id: target,
    kind: 'planetary_reference',
    name: target === 'moon_south_pole' ? 'Lunar south pole (Shackleton region)' : 'Mars, Jezero crater',
    body: target === 'moon_south_pole' ? 'Moon' : 'Mars',
    lat: target === 'moon_south_pole' ? -89.9 : 18.44,
    lon: target === 'moon_south_pole' ? 0 : 77.45,
    measurements,
  };
}

function round(value: number, digits = 2) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
