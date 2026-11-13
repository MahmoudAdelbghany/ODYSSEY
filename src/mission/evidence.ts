/**
 * Requirement-to-evidence registry.
 *
 * Every metric a requirement can use is declared here with the physical
 * quantity it means, the support a measurement needs, the datasets that were
 * investigated for it (integrated, not integrated, or rejected and why), and
 * what to do when the evidence is not there.
 *
 * Three outcomes are kept apart and never merged:
 *   integration_needed   a dataset exists but ODYSSEY has not connected it
 *   field_measurement    the quantity cannot be measured remotely at the needed scale
 *   physical_mismatch    Earth cannot reproduce the condition at any site
 * An evidence gap is never a failed match, and the absence of data never passes
 * a requirement.
 */
import surfaceCoverRaw from '../data/siteSurfaceCover.json';
import type { Site } from '../types';
import type { MetricKey, RequirementSpec } from './types';

export type EvidenceState =
  | 'verified_measurement'
  | 'verified_derived'
  | 'modelled'
  | 'validated_proxy'
  | 'unvalidated_estimate'
  | 'searching'
  | 'not_investigated'
  | 'source_found_not_integrated'
  | 'not_covering_location'
  | 'insufficient_spatial_resolution'
  | 'insufficient_temporal_coverage'
  | 'insufficient_sample'
  | 'retrieval_failed'
  | 'not_remotely_observable'
  | 'field_measurement_required'
  | 'not_applicable'
  | 'not_physically_reproducible';

export type GapOutcome =
  | 'evaluated'
  | 'integration_needed'
  | 'field_measurement'
  | 'physical_mismatch'
  | 'investigation_needed'
  | 'not_applicable';

export const STATE_INFO: Record<EvidenceState, { label: string; outcome: GapOutcome; usable: boolean }> = {
  verified_measurement: { label: 'Verified measurement', outcome: 'evaluated', usable: true },
  verified_derived: { label: 'Verified derived value', outcome: 'evaluated', usable: true },
  modelled: { label: 'Modelled (reanalysis)', outcome: 'evaluated', usable: true },
  validated_proxy: { label: 'Validated proxy', outcome: 'evaluated', usable: true },
  unvalidated_estimate: { label: 'Unvalidated estimate', outcome: 'evaluated', usable: true },
  searching: { label: 'Searching for source', outcome: 'investigation_needed', usable: false },
  not_investigated: { label: 'Not yet investigated', outcome: 'investigation_needed', usable: false },
  source_found_not_integrated: { label: 'Source found, not integrated', outcome: 'integration_needed', usable: false },
  not_covering_location: { label: 'Dataset does not cover this location', outcome: 'integration_needed', usable: false },
  insufficient_spatial_resolution: { label: 'Insufficient spatial resolution', outcome: 'field_measurement', usable: false },
  insufficient_temporal_coverage: { label: 'Insufficient temporal coverage', outcome: 'integration_needed', usable: false },
  insufficient_sample: { label: 'Insufficient sample size', outcome: 'integration_needed', usable: false },
  retrieval_failed: { label: 'Source retrieval failed', outcome: 'integration_needed', usable: false },
  not_remotely_observable: { label: 'Not remotely observable', outcome: 'field_measurement', usable: false },
  field_measurement_required: { label: 'Field measurement required', outcome: 'field_measurement', usable: false },
  not_applicable: { label: 'Not applicable', outcome: 'not_applicable', usable: false },
  not_physically_reproducible: { label: 'Not physically reproducible on Earth', outcome: 'physical_mismatch', usable: false },
};

export const OUTCOME_LABEL: Record<GapOutcome, string> = {
  evaluated: 'Evaluated',
  integration_needed: 'Integration needed',
  field_measurement: 'Field measurement required',
  physical_mismatch: 'Physical mismatch',
  investigation_needed: 'Investigation needed',
  not_applicable: 'Not applicable',
};

export type ThresholdBasis =
  | 'user_stated'
  | 'archetype_assumption'
  | 'scientific_source'
  | 'engineering_constraint'
  | 'agent_proposed';

export const THRESHOLD_BASIS_LABEL: Record<ThresholdBasis, string> = {
  user_stated: 'Stated in your brief',
  archetype_assumption: 'Proposed assumption (experiment recipe)',
  scientific_source: 'From a cited scientific source',
  engineering_constraint: 'Derived from an engineering constraint',
  agent_proposed: 'Proposed in the evidence audit, needs review',
};

export interface DatasetRef {
  id: string;
  name: string;
  provider: string;
  license: string;
  resolution: string;
  temporal: string;
  coverage: string;
  units: string;
  access: string;
  /** What the dataset actually measures, in its own terms. */
  measures: string;
  status: 'integrated' | 'not_integrated' | 'rejected';
  reason: string;
  url?: string;
}

export interface MetricEvidenceSpec {
  metric: MetricKey;
  quantity: string;
  unit: string;
  spatialSupport: string;
  temporalSupport: string;
  requiredResolution: string;
  method: string;
  validation: string;
  limitation: string;
  /** State when ODYSSEY holds a value for the site. */
  stateWithValue: EvidenceState;
  /** State when it does not. */
  stateWithoutValue: EvidenceState;
  whatExists: string;
  whatMissing: string;
  nextAction: string;
  datasets: DatasetRef[];
  investigated?: string;
}

const POWER: DatasetRef = {
  id: 'NASA POWER climatology (MERRA-2 based)',
  name: 'NASA POWER',
  provider: 'NASA Langley Research Center',
  license: 'Public, no restrictions',
  resolution: '0.5° × 0.625° grid',
  temporal: 'Climatology 2001–2020',
  coverage: 'Global',
  units: 'Per variable (°C, mm/day, m/s, kWh m⁻² day⁻¹, kPa)',
  access: 'power.larc.nasa.gov API, no key',
  measures: 'Reanalysis and satellite-derived surface meteorology at the grid cell',
  status: 'integrated',
  reason: 'Integrated for all 39 curated sites (src/data/odyssey.json, siteMonthly.json).',
  url: 'https://power.larc.nasa.gov/',
};

const GLO30: DatasetRef = {
  id: 'COP-DEM_GLO-30-DGED',
  name: 'Copernicus DEM GLO-30',
  provider: 'ESA / DLR / Airbus (Copernicus)',
  license: 'Free and open with attribution (GLO-30)',
  resolution: '1 arc-second (~30 m); ODYSSEY heightmaps at 40 m',
  temporal: 'TanDEM-X acquisitions 2011–2015',
  coverage: 'Global land',
  units: 'm (EGM2008)',
  access: 'AWS Open Data / Planetary Computer',
  measures: 'Surface elevation of the top reflective surface (a DSM: includes vegetation and buildings)',
  status: 'integrated',
  reason:
    'Integrated for all 39 curated sites. Stated accuracy: absolute vertical < 4 m (90% LE); relative vertical < 2 m for slopes ≤ 20%, < 4 m above 20% (Copernicus DEM collection description, read 2026-11-14).',
  url: 'https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM',
};

const WORLDCOVER: DatasetRef = {
  id: 'ESA WorldCover 10 m 2021 v200',
  name: 'ESA WorldCover 2021',
  provider: 'ESA WorldCover consortium',
  license: 'CC-BY 4.0',
  resolution: '10 m',
  temporal: '2021 annual map',
  coverage: 'Global land north of 60°S',
  units: 'Land-cover class (categorical)',
  access: 'Planetary Computer STAC collection esa-worldcover (scripts/fetch_surface_cover.py)',
  measures: 'Class 60 "Bare / sparse vegetation": ground with < 10% vegetation cover all year. Includes rock, sand, gravel and bare soil.',
  status: 'integrated',
  reason:
    'Integrated for 39 curated sites (DEM window), 107 discovery candidates and 80 generated regions (10 × 10 km window). Overall map accuracy 76.7% (v200 validation report); not re-validated at ODYSSEY sites.',
  url: 'https://esa-worldcover.org/',
};

const MACROSTRAT: DatasetRef = {
  id: 'Macrostrat map units',
  name: 'Macrostrat',
  provider: 'University of Wisconsin–Madison',
  license: 'CC-BY 4.0',
  resolution: 'Varies by source map (1:24k to 1:5M)',
  temporal: 'Static compilation',
  coverage: 'Global, uneven detail',
  units: 'Mapped unit name, lithology, age',
  access: 'macrostrat.org API',
  measures: 'Interpreted geological unit at a point. Not mineralogy, not exposure, not strength.',
  status: 'integrated',
  reason: 'Integrated as a point lookup for curated sites.',
  url: 'https://macrostrat.org/',
};

const CURATED: DatasetRef = {
  id: 'ODYSSEY curated site table',
  name: 'Expert-assigned site values',
  provider: 'ODYSSEY project (scripts/fetch_sites.py, scripts/enrich.py)',
  license: 'Project data',
  resolution: 'One value per site',
  temporal: 'Static',
  coverage: '39 curated sites only',
  units: '0–1 index',
  access: 'Repository',
  measures: 'A value typed in by hand when the site list was built. No documented method or dataset.',
  status: 'integrated',
  reason: 'Kept so existing missions still run, but shown as an unvalidated estimate everywhere it is used.',
};

const NONE_STATE = {
  stateWithValue: 'verified_derived' as EvidenceState,
};

function terrain(metric: MetricKey, quantity: string, limitation: string): MetricEvidenceSpec {
  return {
    metric,
    quantity,
    unit: metric === 'flatFraction' ? 'fraction' : metric.startsWith('slope') ? '°' : 'm',
    spatialSupport: '20.48 × 12.8 km window around the site',
    temporalSupport: 'Static (2011–2015 acquisition)',
    requiredResolution: '≤ 40 m grid',
    method:
      metric === 'roughness'
        ? 'RMS of elevation minus its 3×3 local mean on the 40 m heightmap, so each residual describes a 120 m footprint (scripts/derive_terrain_stats.py).'
        : 'Gradient of the 40 m heightmap (numpy.gradient), summarised over the window (scripts/derive_terrain_stats.py).',
    validation: 'Deterministic; reproduced from the stored heightmaps. Not compared with field survey.',
    limitation,
    ...NONE_STATE,
    stateWithoutValue: 'retrieval_failed',
    whatExists: 'Copernicus DEM GLO-30 heightmap of the site window.',
    whatMissing: 'Nothing at this scale. Metre-scale rocks and surface texture are below the DEM resolution.',
    nextAction: 'For rover-scale hazards, fly a UAV photogrammetry or lidar survey at ≤ 0.1 m.',
    datasets: [GLO30],
  };
}

function power(metric: MetricKey, quantity: string, unit: string): MetricEvidenceSpec {
  return {
    metric,
    quantity,
    unit,
    spatialSupport: 'NASA POWER grid cell (~50 km) containing the site',
    temporalSupport: '2001–2020 climatology',
    requiredResolution: 'Site-scale climatology',
    method: 'Read from the NASA POWER climatology at the site coordinates.',
    validation: 'Reanalysis constrained by observations; not a station record.',
    limitation: 'A grid-cell climatology smooths local extremes and topography; it is not a field measurement.',
    stateWithValue: 'modelled',
    stateWithoutValue: 'retrieval_failed',
    whatExists: 'NASA POWER climatology for the site.',
    whatMissing: 'A local station or field record.',
    nextAction: 'Deploy a weather station during the campaign if the margin to the threshold is small.',
    datasets: [POWER],
  };
}

function mapped(metric: MetricKey, quantity: string): MetricEvidenceSpec {
  return {
    metric,
    quantity,
    unit: 'present / absent',
    spatialSupport: 'Mapped unit at the representative point, plus curated site tags',
    temporalSupport: 'Static',
    requiredResolution: 'Outcrop scale for sampling decisions',
    method: 'Macrostrat lithology text match, or a curated site tag.',
    validation: 'Macrostrat matches are mapped interpretations; tag-only matches are unvalidated.',
    limitation: 'Presence in a mapped unit is not abundance, exposure or mineralogy.',
    stateWithValue: 'verified_derived',
    stateWithoutValue: 'retrieval_failed',
    whatExists: 'Macrostrat unit and curated site tags.',
    whatMissing: 'Outcrop-scale mapping and sample-based identification.',
    nextAction: 'Confirm with field mapping and hand samples before relying on presence.',
    datasets: [MACROSTRAT, CURATED],
  };
}

function curatedIndex(metric: MetricKey, quantity: string, next: string, extra: DatasetRef[] = []): MetricEvidenceSpec {
  return {
    metric,
    quantity,
    unit: '0–1 index',
    spatialSupport: 'One value per site',
    temporalSupport: 'Static',
    requiredResolution: 'Site',
    method: 'Value assigned by hand when the curated site table was created.',
    validation: 'None. No dataset or formula is recorded for these values.',
    limitation: 'Subjective and not reproducible. It can rank sites only loosely and must not decide a site on its own.',
    stateWithValue: 'unvalidated_estimate',
    stateWithoutValue: 'not_investigated',
    whatExists: 'A hand-assigned index for curated sites.',
    whatMissing: 'A measured or documented quantity.',
    nextAction: next,
    datasets: [CURATED, ...extra],
    investigated: '2026-11-14',
  };
}

function missingMetric(
  metric: MetricKey,
  quantity: string,
  unit: string,
  state: EvidenceState,
  whatExists: string,
  whatMissing: string,
  nextAction: string,
  datasets: DatasetRef[] = [],
  investigated?: string,
): MetricEvidenceSpec {
  return {
    metric,
    quantity,
    unit,
    spatialSupport: 'Site',
    temporalSupport: 'Static',
    requiredResolution: 'Site',
    method: 'Not computed.',
    validation: 'Not applicable.',
    limitation: 'No value is held for this quantity.',
    stateWithValue: 'verified_measurement',
    stateWithoutValue: state,
    whatExists,
    whatMissing,
    nextAction,
    datasets,
    investigated,
  };
}

const SPECS: MetricEvidenceSpec[] = [
  terrain('slopeMean', 'Mean surface slope', 'Slope from a 40 m grid underestimates slopes on short, steep faces.'),
  terrain('slopeP95', '95th-percentile surface slope', 'Slope from a 40 m grid underestimates slopes on short, steep faces.'),
  terrain('slopeMax', 'Maximum cell slope', 'A single 40 m cell; sensitive to DEM artefacts.'),
  terrain(
    'roughness',
    'RMS residual relief at a 120 m footprint',
    'The Copernicus DEM relative vertical accuracy is < 2 m (90% LE) on slopes ≤ 20%, so values near or below 2 m are at the noise level of the DEM. The DEM is a surface model: vegetation adds apparent roughness. It cannot resolve rocks or ridges smaller than about 40 m.',
  ),
  terrain('flatFraction', 'Fraction of terrain with slope below 5°', 'Depends on the 40 m grid spacing.'),
  terrain('elevRange', 'Elevation range in the window', 'Single extreme cells dominate.'),
  {
    ...terrain('elevation', 'Site elevation', 'Absolute vertical accuracy < 4 m (90% LE).'),
    stateWithValue: 'verified_measurement',
    method: 'Elevation at the site from POWER metadata / DEM.',
  },
  { ...power('relief', 'Regional relief', 'm'), stateWithValue: 'verified_derived' },
  power('tempMean', 'Mean 2 m air temperature', '°C'),
  power('tempMax', 'Mean daily maximum 2 m air temperature of the warmest month', '°C'),
  power('tempMin', 'Mean daily minimum 2 m air temperature of the coldest month', '°C'),
  power('tempAmp', 'Mean diurnal range of 2 m air temperature', '°C'),
  power('precipYear', 'Annual precipitation', 'mm/yr'),
  power('humidity', 'Relative humidity at 2 m', '%'),
  power('wind', 'Mean 10 m wind speed', 'm/s'),
  power('solar', 'All-sky surface shortwave irradiance', 'kWh m⁻² day⁻¹'),
  power('aerosol', 'Aerosol optical depth at 550 nm (column, all aerosol types)', 'unitless'),
  power('soilWetnessTop', 'Surface soil wetness fraction', '0–1'),
  power('pressure', 'Surface air pressure', 'kPa'),
  {
    ...power('airDensity', 'Air density from pressure and temperature (ideal gas)', 'kg/m³'),
    stateWithValue: 'verified_derived',
    method: 'ρ = p / (R T) with POWER surface pressure and mean temperature.',
  },
  ...(['basalt', 'evaporite', 'clay', 'sulfate', 'ice', 'glacier', 'cave', 'impact', 'volcanic', 'regolith', 'sand', 'iron', 'limestone', 'hydratedMinerals'] as MetricKey[]).map((m) =>
    mapped(m, `Mapped presence of ${m === 'hydratedMinerals' ? 'clay, sulfate or evaporite units' : m}`),
  ),
  { ...mapped('geoTagCount', 'Number of mapped material types'), stateWithValue: 'unvalidated_estimate' },
  { ...mapped('geologyMapped', 'A mapped geological unit exists at the site'), method: 'Macrostrat returned a unit at the site point.' },
  curatedIndex(
    'access',
    'Field access (how easily crew and equipment reach the site)',
    'Use the airport transfer time (h) where it decides a site, or document a route survey.',
  ),
  curatedIndex(
    'dust',
    'Natural dust exposure',
    'Replace with a measured or modelled quantity: MERRA-2 dust deposition (needs Earthdata Login) or passive deposition samplers during the campaign.',
  ),
  curatedIndex('water', 'Water availability', 'Replace with a hydrology dataset (e.g. JRC Global Surface Water) or field survey.'),
  {
    ...curatedIndex('airportHours', 'Ground transfer time from the nearest commercial airport', 'Check the route with a mapping service before planning travel.'),
    unit: 'h',
    method: 'Hub table compiled when the site list was built (airport from OurAirports; transfer time estimated).',
  },
  {
    metric: 'rockExposure',
    quantity: 'Fraction of the site surface that is exposed fresh rock',
    unit: '%',
    spatialSupport: 'A 2 × 2 km sampling area; the bound is the barest such area in the 20.48 × 12.8 km site window',
    temporalSupport: 'Static',
    requiredResolution: '≤ 10 m, ideally sub-metre to separate rock from sand and soil',
    method:
      'ESA WorldCover 2021 class 60 (bare / sparse vegetation) fraction of every 2 × 2 km block in the site window (500 m stride); the highest block value is kept. Exposed rock is a subset of that class, so this is an upper bound on rock exposure in any 2 × 2 km sampling area.',
    validation: 'WorldCover overall accuracy 76.7%; not re-validated at ODYSSEY sites. The bound logic is exact given the map.',
    limitation:
      'The bound can only disprove the requirement. Bare ground can be sand, gravel or soil, so a high bare fraction does not establish rock exposure. A mapped geological unit is not evidence of exposure.',
    stateWithValue: 'validated_proxy',
    stateWithoutValue: 'field_measurement_required',
    whatExists: 'WorldCover 10 m land cover (bare-ground upper bound), Sentinel-2 imagery and Macrostrat mapped units.',
    whatMissing: 'A map that separates exposed rock from sand, gravel and soil.',
    nextAction:
      'Classify a UAV orthomosaic (≤ 5 cm) or run point-count transects during a site visit. Spectral rock/soil separation from Sentinel-2 or ASTER would need ground truth to be validated.',
    datasets: [
      WORLDCOVER,
      {
        id: 'sentinel-2-l2a',
        name: 'Sentinel-2 L2A surface reflectance',
        provider: 'ESA Copernicus',
        license: 'Copernicus open licence',
        resolution: '10–20 m',
        temporal: '5-day revisit since 2017',
        coverage: 'Global land',
        units: 'Surface reflectance',
        access: 'Planetary Computer STAC',
        measures: 'Reflectance; vegetation and water indices are reliable, rock versus sand versus soil is not without local training data.',
        status: 'rejected',
        reason: 'No validated rock-exposure classifier exists for these sites. An unvalidated classification would be an estimate presented as a measurement.',
      },
      {
        id: 'EMIT L2B mineral identification',
        name: 'EMIT',
        provider: 'NASA JPL / LP DAAC',
        license: 'Public',
        resolution: '60 m',
        temporal: 'Since 2022',
        coverage: 'Arid regions between about 52°N and 52°S, ISS orbit',
        units: 'Mineral group identification and band depth',
        access: 'LP DAAC, NASA Earthdata Login required',
        measures: 'Surface mineralogy of exposed, sparsely vegetated ground; not exposure fraction.',
        status: 'not_integrated',
        reason: 'Requires Earthdata Login; measures mineralogy, not rock exposure. Relevant for the mineralogy gap instead.',
      },
      { ...MACROSTRAT, status: 'rejected', reason: 'A mapped unit says what rock underlies the site, not how much of the surface exposes it.' },
    ],
    investigated: '2026-11-14',
  },
  missingMetric(
    'bearingStrength',
    'Surface bearing strength (load the ground supports before failure or excessive sinkage)',
    'kPa',
    'field_measurement_required',
    'Terrain shape (Copernicus DEM), mapped geology (Macrostrat) and land cover (WorldCover).',
    'Direct soil strength or penetration-resistance measurements at the site.',
    'Run dynamic cone penetrometer tests (ASTM D6951, 8 kg hammer) on a grid across the traverse area, or plate load tests for deployment pads. Record moisture, as strength depends on it.',
    [
      {
        id: 'SoilGrids 2.0',
        name: 'ISRIC SoilGrids',
        provider: 'ISRIC World Soil Information',
        license: 'CC-BY 4.0',
        resolution: '250 m',
        temporal: 'Static model',
        coverage: 'Global',
        units: 'Texture fractions, bulk density, coarse fragments',
        access: 'ISRIC WCS / REST',
        measures: 'Machine-learning predictions of soil composition, not mechanical strength.',
        status: 'rejected',
        reason: 'Soil type and texture are not a measurement of bearing capacity; using them would infer strength from composition.',
      },
      {
        id: 'gNATSGO',
        name: 'USDA gNATSGO',
        provider: 'USDA NRCS',
        license: 'Public',
        resolution: '10–30 m map units',
        temporal: 'Static',
        coverage: 'United States only',
        units: 'Soil survey attributes and interpretations',
        access: 'Planetary Computer',
        measures: 'Survey-based soil properties and engineering interpretations by map unit, not site measurements.',
        status: 'rejected',
        reason: 'US-only interpretive classes; not a point strength measurement and not available for most sites.',
      },
      { ...MACROSTRAT, status: 'rejected', reason: 'Lithology labels are not mechanical strength.' },
    ],
    '2026-11-14',
  ),
  {
    ...missingMetric(
      'thermalInertia',
      'SI thermal inertia I = √(kρc) of the near-surface material',
      'J m⁻² K⁻¹ s⁻¹ᐟ²',
      'field_measurement_required',
      'MODIS day and night land-surface temperature for curated sites (paired day–night ΔT).',
      'Thermal conductivity, density and heat capacity of the surface layer, or a thermal model fit to calibrated temperatures.',
      'Measure thermal conductivity with a needle probe (ASTM D5334) plus bulk density and heat capacity on site samples, then compute I = √(kρc).',
      [
        {
          id: 'Apparent thermal inertia from MODIS',
          name: 'MODIS ATI (albedo and ΔT)',
          provider: 'NASA LP DAAC (MOD11 / MCD43)',
          license: 'Public',
          resolution: '1 km',
          temporal: 'Daily',
          coverage: 'Global',
          units: 'K⁻¹ (ATI = (1 − albedo) / ΔT)',
          access: 'Planetary Computer / LP DAAC',
          measures: 'Apparent thermal inertia, a relative index. Not SI thermal inertia.',
          status: 'rejected',
          reason: 'Different quantity and unit; converting it to SI would require a thermal model and soil properties. Thermal inertia is never inferred from temperature alone in ODYSSEY.',
        },
      ],
      '2026-11-14',
    ),
    spatialSupport: 'Footprint of the test area',
    temporalSupport: 'Diurnal cycle',
  },
  missingMetric(
    'dustFlux',
    'Dust deposition flux onto a horizontal surface',
    'g m⁻² day⁻¹',
    'source_found_not_integrated',
    'NASA POWER aerosol optical depth (column, all aerosols) and the hand-assigned dust index.',
    'A measured or modelled dust deposition flux at the site.',
    'Configure a NASA Earthdata Login to integrate MERRA-2 dust deposition (modelled, ~50 km), or deploy passive deposition samplers during the campaign. Aerosol optical depth is not a substitute.',
    [
      {
        id: 'M2TMNXADG (MERRA-2 tavgM_2d_adg_Nx) DUDP001–005',
        name: 'MERRA-2 dust dry deposition',
        provider: 'NASA GMAO / GES DISC',
        license: 'Public',
        resolution: '0.5° × 0.625°',
        temporal: 'Monthly, 1980–present',
        coverage: 'Global',
        units: 'kg m⁻² s⁻¹ per size bin',
        access: 'GES DISC; anonymous download redirects to Earthdata Login (checked 2026-11-14)',
        measures: 'Modelled dust dry deposition by size bin. A reanalysis model output, not a measurement.',
        status: 'not_integrated',
        reason: 'Needs a NASA Earthdata Login, which ODYSSEY does not have configured. Once integrated it would be a modelled regional value, labelled as such.',
        url: 'https://www.earthdata.nasa.gov/data/catalog/ges-disc-m2tmnxadg-5.12.4',
      },
      {
        ...POWER,
        id: 'NASA POWER aerosol optical depth',
        status: 'rejected',
        measures: 'Column aerosol optical depth at 550 nm, all aerosol types.',
        reason: 'Optical depth is a column extinction, not a surface flux. Dust mass flux is never inferred from it.',
      },
    ],
    '2026-11-14',
  ),
  missingMetric('regolithDepth', 'Depth of loose surface material', 'm', 'field_measurement_required', 'DEM and mapped geology.', 'Depth soundings.', 'Ground-penetrating radar or probe soundings on site.'),
  missingMetric('radiationFlux', 'Ionising radiation dose rate', 'mSv/yr', 'not_investigated', 'Nothing site-specific.', 'Site dose measurements.', 'Use a portable dosimeter; Earth surface dose is far below lunar or Martian values anyway.'),
  missingMetric('organicCarbon', 'Soil organic carbon', '%', 'not_investigated', 'Nothing integrated.', 'Site soil organic carbon.', 'Investigate SoilGrids SOC (modelled, 250 m) or sample on site.'),
  missingMetric('iceThickness', 'Ice thickness', 'm', 'not_investigated', 'Curated ice tags.', 'Thickness survey.', 'Investigate published ice-thickness compilations or radar survey on site.'),
  missingMetric('subsurfaceStrata', 'Subsurface layering', '', 'field_measurement_required', 'Mapped geology.', 'Subsurface profile.', 'Ground-penetrating radar or seismic refraction on site.'),
  missingMetric('isolationIndex', 'Isolation and confinement', '', 'not_investigated', 'Nothing integrated.', 'A defined isolation measure.', 'Define the quantity (e.g. travel time to the nearest hospital) before searching for data.'),
  missingMetric('gradeTonnage', 'Resource grade and tonnage', '', 'not_investigated', 'Nothing integrated.', 'Resource assessment.', 'Investigate national geological survey resource records.'),
  missingMetric('soilToxicity', 'Soil toxicity', '', 'not_investigated', 'Nothing integrated.', 'Soil chemistry.', 'Sample and assay on site.'),
  missingMetric('rfAttenuation', 'Radio-frequency attenuation profile', 'dB', 'field_measurement_required', 'Nothing integrated.', 'RF propagation measurements.', 'Measure link budgets on site.'),
  missingMetric('gravity', 'Sustained reduced gravity', 'g', 'not_physically_reproducible', 'Earth gravity is 9.82 m/s² everywhere (NSSDC).', 'Not obtainable at any Earth site.', 'Use gravity offload rigs, parabolic flights or simulation.'),
  missingMetric(
    'lunarNight',
    'Continuous lunar night',
    'd',
    'not_physically_reproducible',
    'Earth night lasts about half a day outside polar regions; polar night is long but has an atmosphere and twilight.',
    'Not obtainable at any Earth site.',
    'Thermal-vacuum cold soak in a chamber. Note that at the lunar south pole the longest darkness depends on terrain: about 1.5 days at the best-lit Shackleton rim point (Mazarico et al. 2011), permanent in shadowed craters.',
  ),
  missingMetric('vacuum', 'Vacuum boundary condition', 'Pa', 'not_physically_reproducible', 'Earth surface pressure is tens of kPa at every site.', 'Not obtainable at any Earth site.', 'Thermal-vacuum chamber test.'),
];

export const EVIDENCE_REGISTRY: Record<string, MetricEvidenceSpec> = Object.fromEntries(SPECS.map((s) => [s.metric, s]));

export function evidenceSpec(metric: MetricKey): MetricEvidenceSpec {
  return EVIDENCE_REGISTRY[metric] ?? missingMetric(metric, metric, '', 'not_investigated', 'Nothing integrated.', 'Unknown.', 'Run a source investigation.');
}

interface CoverEntry {
  status: string;
  window?: string;
  bestBlockBareSparse?: number | null;
  items?: string[];
  fractions?: Record<string, number>;
}

const surfaceCover = surfaceCoverRaw as unknown as {
  product: string;
  curated: Record<string, CoverEntry>;
  candidates: Record<string, CoverEntry>;
  generated: Record<string, CoverEntry>;
};

export interface Bound {
  kind: 'upper';
  value: number;
  unit: string;
  source: string;
  window: string;
}

export function surfaceCoverFor(siteId: string): CoverEntry | undefined {
  return surfaceCover.curated[siteId] ?? surfaceCover.candidates[siteId] ?? surfaceCover.generated[siteId];
}

/** Upper bound on rock exposure from WorldCover bare/sparse fraction, if the dataset covers the site. */
export function rockExposureBound(siteId: string): Bound | 'no_coverage' | null {
  const entry = surfaceCoverFor(siteId);
  if (!entry) return null;
  if (entry.status !== 'ok' || !entry.fractions) return 'no_coverage';
  const block = entry.bestBlockBareSparse;
  const fraction = block ?? entry.fractions.bareSparse;
  return {
    kind: 'upper',
    value: Math.round(fraction * 1000) / 10,
    unit: '%',
    source: surfaceCover.product,
    window: block != null ? `best 2 × 2 km block in the ${entry.window ?? 'site window'}` : entry.window ?? 'site window',
  };
}

export interface RequirementEvidence {
  state: EvidenceState;
  outcome: GapOutcome;
  label: string;
  why: string;
  exists: string;
  missing: string;
  next: string;
  source: string;
  method: string;
  limitation: string;
  support: string;
  bound?: Bound;
}

function tagOnly(site: Site, metric: MetricKey) {
  const lith = `${site.macrostrat?.lith ?? ''} ${site.macrostrat?.unit ?? ''}`.toLowerCase();
  const word: Partial<Record<MetricKey, RegExp>> = {
    basalt: /basalt|mafic/,
    evaporite: /evaporite/,
    clay: /clay/,
    sulfate: /sulfate|gypsum/,
    volcanic: /volcan/,
    limestone: /limestone|carbonate/,
    iron: /iron|hematite|oxide/,
    regolith: /regolith/,
    glacier: /glaci/,
  };
  const re = word[metric];
  return re ? !re.test(lith) : true;
}

function build(spec: MetricEvidenceSpec, state: EvidenceState, why: string, extra: Partial<RequirementEvidence> = {}): RequirementEvidence {
  return {
    state,
    outcome: STATE_INFO[state].outcome,
    label: STATE_INFO[state].label,
    why,
    exists: spec.whatExists,
    missing: spec.whatMissing,
    next: spec.nextAction,
    source: spec.datasets.filter((d) => d.status === 'integrated').map((d) => d.name).join(', ') || 'None integrated',
    method: spec.method,
    limitation: spec.limitation,
    support: `${spec.spatialSupport}; ${spec.temporalSupport}`,
    ...extra,
  };
}

/** Explain the evidence behind one requirement at one site. Deterministic. */
export function requirementEvidence(requirement: RequirementSpec, site: Site, value: number | null): RequirementEvidence {
  const spec = evidenceSpec(requirement.metric);
  if (requirement.kind === 'facility' || requirement.kind === 'impossible') {
    return build(spec, 'not_physically_reproducible', `No Earth site provides this condition. ${spec.whatExists}`);
  }
  if (requirement.metric === 'rockExposure') {
    const bound = rockExposureBound(site.id);
    if (bound === 'no_coverage') {
      return build(spec, 'not_covering_location', 'ESA WorldCover does not cover this location (it stops at 60°S), so not even an upper bound is available.', {
        next: `${spec.nextAction} For Antarctic sites, investigate the Landsat-based rock outcrop map of Antarctica (BAS) as a bound.`,
      });
    }
    if (bound) {
      const disproved = bound.value < requirement.limit;
      return build(
        spec,
        disproved ? 'validated_proxy' : 'field_measurement_required',
        disproved
          ? `Even the barest 2 × 2 km area in the site window is at most ${bound.value}% bare ground, so rock exposure cannot reach ${requirement.limit}%. The requirement is not met.`
          : bound.value < requirement.ideal
            ? `The barest 2 × 2 km area is at most ${bound.value}% bare ground, below the ${requirement.ideal}% target, so this site can meet it only partly. How much of that is rock is unknown.`
            : `The barest 2 × 2 km area is up to ${bound.value}% bare ground, which allows but does not establish ${requirement.ideal}% rock exposure. Bare ground can be sand, gravel or soil.`,
        { bound, source: `${bound.source} (${bound.window})` },
      );
    }
    return build(spec, 'not_investigated', 'This location has not been sampled with WorldCover yet.');
  }
  if (value === null || !Number.isFinite(value)) {
    return build(spec, spec.stateWithoutValue, requirement.missingReason ?? spec.whatMissing);
  }
  let state = spec.stateWithValue;
  if (spec.datasets.includes(MACROSTRAT) && state === 'verified_derived' && requirement.metric !== 'geologyMapped' && value >= 1 && tagOnly(site, requirement.metric)) {
    state = 'unvalidated_estimate';
    return build(spec, state, 'Present only as a curated site tag; the mapped Macrostrat unit does not mention it.', { source: 'ODYSSEY curated site tags' });
  }
  const why =
    state === 'unvalidated_estimate'
      ? 'This value was typed in by hand when the site list was built. It has no recorded dataset or method.'
      : state === 'modelled'
        ? 'Reanalysis climatology at the site grid cell.'
        : state === 'verified_measurement'
          ? 'Direct measurement from the cited dataset.'
          : 'Computed deterministically from the cited dataset.';
  return build(spec, state, why);
}

/** Threshold provenance for a requirement. */
export function thresholdBasis(requirement: RequirementSpec): { basis: ThresholdBasis; label: string; note: string } {
  const basis: ThresholdBasis = requirement.thresholdBasis ?? (requirement.source === 'brief' ? 'user_stated' : 'archetype_assumption');
  const note =
    requirement.thresholdNote ??
    (basis === 'user_stated'
      ? 'Taken from the numbers in your brief.'
      : basis === 'archetype_assumption'
        ? 'A default from the experiment recipe. It is not a NASA requirement and no source is cited for it. Edit it if your mission defines a different limit.'
        : '');
  return { basis, label: THRESHOLD_BASIS_LABEL[basis], note };
}

/** Requirement-level evidence when no site is chosen: what the registry says about the quantity. */
export function requirementLevelState(r: RequirementSpec): EvidenceState {
  if (r.kind === 'facility' || r.kind === 'impossible') return 'not_physically_reproducible';
  const spec = EVIDENCE_REGISTRY[r.metric];
  if (!spec) return 'not_investigated';
  if (r.metric === 'rockExposure') return 'field_measurement_required';
  return spec.method === 'Not computed.' ? spec.stateWithoutValue : spec.stateWithValue;
}
