import type { Site, SiteTerrainInfo } from '../types';
import type {
  EvidenceProvenance,
  MetricKey,
} from './types';

const POWER: EvidenceProvenance = {
  source: 'NASA POWER / MERRA-2',
  dataset: 'POWER climatology 2001–2020',
  date: '2001–2020',
  nature: 'reanalysis',
  spatiality: 'point',
  resolution: '0.5° × 0.625° grid, sampled at site',
  note:
    'Observationally constrained reanalysis climatology at the site point. ' +
    'It is not a field measurement and not a continuous spatial field.',
};

const DEM: EvidenceProvenance = {
  source: 'Copernicus DEM GLO-30',
  dataset: 'Copernicus DSM COG 10, 30 m',
  date: '2011–2015',
  nature: 'derived',
  spatiality: 'spatial',
  resolution: '30 m source · 40 m heightmap · 20.48 × 12.8 km window',
  note:
    'Slope and roughness are derived from the DEM heightmap, not surveyed. ' +
    'They describe the 40 m terrain sample, not metre-scale surface hazards.',
};

const DEM_HEIGHT: EvidenceProvenance = {
  ...DEM,
  nature: 'measured',
  note:
    'Elevation is a remote-sensing measurement, gridded at 30 m and resampled ' +
    'to the 40 m site heightmap. Vertical accuracy is not a site survey.',
};

const MAPPED: EvidenceProvenance = {
  source: 'Macrostrat + Odyssey site tags',
  dataset: 'Macrostrat CC-BY 4.0 mapped units, compiled site tags',
  date: 'Mapped compilation, accessed 2026',
  nature: 'mapped',
  spatiality: 'mapped',
  resolution: 'Point lookup in a mapped unit; site-scale tag list',
  note:
    'Mapped geology is an interpretation at the site, not a continuous ' +
    'mineralogical surface and not an in-situ assay.',
};

const INDEX: EvidenceProvenance = {
  source: 'Hand-assigned site value',
  dataset: 'ODYSSEY curated site table (scripts/fetch_sites.py)',
  date: '2026',
  nature: 'predicted',
  spatiality: 'point',
  resolution: 'One value per candidate site',
  note:
    'Typed in by hand when the site table was built, on a 0–1 scale. No dataset or ' +
    'method is recorded: an unvalidated estimate, not a derived measurement.',
};

const MISSING: EvidenceProvenance = {
  source: 'Not available in ODYSSEY (see the evidence registry for why)',
  dataset: 'Not available',
  date: 'not available',
  nature: 'missing',
  spatiality: 'none',
  resolution: 'not available',
  note:
    'This quantity is required by the experiment but has no usable value. The evidence ' +
    'registry (src/mission/evidence.ts) records whether it needs integration or a field ' +
    'measurement. It is never imputed.',
};

const PHYSICAL: EvidenceProvenance = {
  source: 'Physical / facility constraint',
  dataset: 'Not an Earth-site observable',
  date: 'not available',
  nature: 'missing',
  spatiality: 'none',
  resolution: 'not available',
  note:
    'This is not a site variable in the evidence base. It is a mission-level ' +
    'physical or facility requirement and is excluded from site scoring.',
};

const AIR_DENSITY: EvidenceProvenance = {
  ...POWER,
  nature: 'derived',
  note:
    'Derived from reanalysis surface pressure and mean temperature using the ' +
    'ideal gas law. Earth sea-level density is not a Mars or lunar analog.',
};

const TAG_METRICS: MetricKey[] = [
  'basalt',
  'evaporite',
  'clay',
  'sulfate',
  'ice',
  'glacier',
  'cave',
  'impact',
  'volcanic',
  'regolith',
  'sand',
  'iron',
  'limestone',
];

function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function hasWord(text: string, word: string) {
  return new RegExp(`\\b${word}`, 'i').test(text);
}

function tag(site: Site, ...names: string[]) {
  const tags = site.tags.map((t) => t.toLowerCase());
  return names.some((name) => tags.includes(name)) ? 1 : 0;
}

function lith(site: Site, pattern: RegExp) {
  const macro = site.macrostrat;
  if (!macro) return 0;
  return pattern.test(`${macro.lith} ${macro.unit} ${macro.age}`) ? 1 : 0;
}

export function metricEvidence(metric: MetricKey): EvidenceProvenance {
  if (
    metric === 'slopeMean' ||
    metric === 'slopeP95' ||
    metric === 'slopeMax' ||
    metric === 'roughness' ||
    metric === 'flatFraction' ||
    metric === 'elevRange'
  ) {
    return DEM;
  }
  if (metric === 'elevation') return DEM_HEIGHT;
  if (
    metric === 'basalt' ||
    metric === 'evaporite' ||
    metric === 'clay' ||
    metric === 'sulfate' ||
    metric === 'ice' ||
    metric === 'glacier' ||
    metric === 'cave' ||
    metric === 'impact' ||
    metric === 'volcanic' ||
    metric === 'regolith' ||
    metric === 'sand' ||
    metric === 'iron' ||
    metric === 'limestone' ||
    metric === 'hydratedMinerals' ||
    metric === 'geoTagCount' ||
    metric === 'geologyMapped'
  ) {
    return MAPPED;
  }
  if (metric === 'access' || metric === 'dust' || metric === 'water' || metric === 'airportHours') {
    return INDEX;
  }
  if (metric === 'gravity') {
    return {
      ...PHYSICAL,
      dataset: 'Sustained reduced gravity',
      note:
        'Earth cannot provide sustained lunar or Martian gravity. Parabolic flight ' +
        'and centrifuges are short-duration facilities, not a site condition.',
    };
  }
  if (metric === 'lunarNight') {
    return {
      ...PHYSICAL,
      dataset: '14-day lunar night',
      note:
        'No Earth site reproduces the 14-day lunar night; an Earth diurnal cycle ' +
        'is a bounded thermal analog only.',
    };
  }
  if (metric === 'vacuum') {
    return {
      ...PHYSICAL,
      dataset: 'Vacuum boundary condition',
      note:
        'A thermal-vacuum or pressure chamber is required; the field site cannot ' +
        'provide the vacuum boundary condition.',
    };
  }
  if (metric === 'airDensity') return AIR_DENSITY;
  if (
    metric === 'thermalInertia' ||
    metric === 'regolithDepth' ||
    metric === 'bearingStrength' ||
    metric === 'radiationFlux' ||
    metric === 'organicCarbon' ||
    metric === 'dustFlux' ||
    metric === 'iceThickness' ||
    metric === 'subsurfaceStrata' ||
    metric === 'rockExposure' ||
    metric === 'isolationIndex' ||
    metric === 'gradeTonnage' ||
    metric === 'soilToxicity' ||
    metric === 'rfAttenuation'
  ) {
    return MISSING;
  }
  return POWER;
}

export function metricLabel(metric: MetricKey): string {
  const labels: Record<MetricKey, string> = {
    slopeMean: 'Mean slope',
    slopeP95: 'P95 slope',
    slopeMax: 'Maximum slope',
    roughness: 'Terrain roughness',
    flatFraction: 'Flat ground',
    elevRange: 'Local relief',
    tempMean: 'Mean temperature',
    tempMax: 'Maximum temperature',
    tempMin: 'Minimum temperature',
    tempAmp: 'Diurnal amplitude',
    thermalInertia: 'Apparent thermal inertia',
    precipYear: 'Annual precipitation',
    humidity: 'Relative humidity',
    wind: 'Mean wind speed',
    solar: 'Solar resource',
    aerosol: 'Aerosol optical depth',
    soilWetnessTop: 'Surface soil wetness',
    pressure: 'Surface pressure',
    airDensity: 'Air density',
    elevation: 'Site elevation',
    relief: 'Regional relief',
    access: 'Field access index',
    dust: 'Dust index',
    water: 'Water index',
    airportHours: 'Airport transfer',
    basalt: 'Basalt / mafic material',
    evaporite: 'Evaporite',
    clay: 'Clay minerals',
    sulfate: 'Sulfate minerals',
    ice: 'Ice',
    glacier: 'Glacier / cryosphere',
    cave: 'Cave / lava tube',
    impact: 'Impact feature',
    volcanic: 'Volcanic terrain',
    regolith: 'Regolith / soil cover',
    sand: 'Sand / dune field',
    iron: 'Iron oxide',
    limestone: 'Limestone / carbonate',
    hydratedMinerals: 'Hydrated minerals',
    geoTagCount: 'Mapped material diversity',
    geologyMapped: 'Mapped geology',
    regolithDepth: 'Regolith depth',
    bearingStrength: 'Surface bearing strength',
    radiationFlux: 'Ionising radiation flux',
    organicCarbon: 'Organic carbon',
    dustFlux: 'Dust mass flux',
    iceThickness: 'Ice thickness',
    subsurfaceStrata: 'Subsurface stratigraphy',
    rockExposure: 'Rock exposure',
    isolationIndex: 'Isolation / confinement',
    gravity: 'Reduced gravity',
    lunarNight: 'Lunar night',
    vacuum: 'Vacuum',
    gradeTonnage: 'Resource grade and tonnage',
    soilToxicity: 'Soil toxicity',
    rfAttenuation: 'RF attenuation profile',
  };
  return labels[metric];
}

export function metricUnit(metric: MetricKey): string {
  const units: Partial<Record<MetricKey, string>> = {
    slopeMean: '°',
    slopeP95: '°',
    slopeMax: '°',
    roughness: 'm',
    flatFraction: '',
    elevRange: 'm',
    tempMean: '°C',
    tempMax: '°C',
    tempMin: '°C',
    tempAmp: '°C',
    thermalInertia: 'J m⁻² K⁻¹ s⁻¹ᐟ²',
    precipYear: 'mm/yr',
    humidity: '%',
    wind: 'm/s',
    solar: 'kWh/m²/day',
    aerosol: '',
    soilWetnessTop: '',
    pressure: 'kPa',
    airDensity: 'kg/m³',
    elevation: 'm',
    relief: 'm',
    access: '',
    dust: '',
    water: '',
    airportHours: 'h',
    geoTagCount: '',
    regolithDepth: 'm',
    bearingStrength: 'kPa',
    radiationFlux: 'mSv/yr',
    organicCarbon: '%',
    dustFlux: 'g/m²/day',
    iceThickness: 'm',
    rockExposure: '%',
    isolationIndex: '',
    gravity: 'g',
    lunarNight: 'd',
    vacuum: 'Pa',
    gradeTonnage: '',
    soilToxicity: '',
    rfAttenuation: 'dB',
  };
  return units[metric] ?? '';
}

export function getMetric(
  site: Site,
  terrain: SiteTerrainInfo | undefined,
  metric: MetricKey,
): number | null {
  const climate = site.climate;
  const stats = terrain?.stats;

  switch (metric) {
    case 'slopeMean':
      return finite(stats?.meanSlope);
    case 'slopeP95':
      return finite(stats?.p95Slope);
    case 'slopeMax':
      return finite(stats?.maxSlope);
    case 'roughness':
      return finite(stats?.roughness);
    case 'flatFraction':
      return finite(stats?.flatFraction);
    case 'elevRange':
      return finite(stats?.elevRange);
    case 'tempMean':
      return finite(climate.tempMean);
    case 'tempMax':
      return finite(climate.tempMax);
    case 'tempMin':
      return finite(climate.tempMin);
    case 'tempAmp':
      return finite(climate.tempAmp);
    case 'thermalInertia':
      return null;
    case 'precipYear':
      return finite(climate.precipYear);
    case 'humidity':
      return finite(climate.humidity);
    case 'wind':
      return finite(climate.wind);
    case 'solar':
      return finite(climate.solar);
    case 'aerosol':
      return finite(climate.aerosol);
    case 'soilWetnessTop':
      return finite(climate.soilWetnessTop);
    case 'pressure':
      return finite(climate.pressure);
    case 'airDensity': {
      const pressure = finite(climate.pressure);
      const temp = finite(climate.tempMean);
      if (pressure === null || temp === null) return null;
      return (pressure * 1000) / (287.05 * (temp + 273.15));
    }
    case 'elevation':
      return finite(climate.elevation);
    case 'relief':
      return finite(climate.relief);
    case 'access':
      return finite(site.access);
    case 'dust':
      return finite(site.dust);
    case 'water':
      return finite(site.water);
    case 'airportHours':
      return finite(site.airport?.groundHours);
    case 'basalt':
      return tag(site, 'basalt') || lith(site, /basalt|mafic|basic igneous|nephelenite|phonolite/);
    case 'evaporite':
      return tag(site, 'evaporite') || lith(site, /evaporite/);
    case 'clay':
      return tag(site, 'clay') || lith(site, /clay/);
    case 'sulfate':
      return tag(site, 'sulfate') || lith(site, /sulfate|gypsum/);
    case 'ice':
      return tag(site, 'ice') || lith(site, /\bice\b/);
    case 'glacier':
      return tag(site, 'glacier') || lith(site, /glaci/);
    case 'cave':
      return tag(site, 'cave', 'lava tube') || (hasWord(site.type, 'cave') ? 1 : 0);
    case 'impact':
      return tag(site, 'impact') || (hasWord(site.type, 'impact') ? 1 : 0);
    case 'volcanic':
      return (
        tag(site, 'volcanic') ||
        (hasWord(site.type, 'volcan') ? 1 : 0) ||
        lith(site, /volcan/)
      );
    case 'regolith':
      return tag(site, 'regolith') || lith(site, /regolith/);
    case 'sand':
      return tag(site, 'sand') || (hasWord(site.type, 'dune') ? 1 : 0);
    case 'iron':
      return tag(site, 'iron') || lith(site, /iron|hematite|oxide/);
    case 'limestone':
      return tag(site, 'limestone') || lith(site, /limestone|carbonate/);
    case 'hydratedMinerals': {
      const values = [
        tag(site, 'clay') || lith(site, /clay/),
        tag(site, 'sulfate') || lith(site, /sulfate|gypsum/),
        tag(site, 'evaporite') || lith(site, /evaporite/),
      ];
      return Math.max(...values);
    }
    case 'geoTagCount': {
      return TAG_METRICS.reduce(
        (total, key) => total + (getMetric(site, terrain, key) === 1 ? 1 : 0),
        0,
      );
    }
    case 'geologyMapped':
      return site.macrostrat ? 1 : 0;
    case 'regolithDepth':
    case 'bearingStrength':
    case 'radiationFlux':
    case 'organicCarbon':
    case 'dustFlux':
    case 'iceThickness':
    case 'subsurfaceStrata':
    case 'rockExposure':
    case 'isolationIndex':
    case 'gravity':
    case 'lunarNight':
    case 'vacuum':
    case 'gradeTonnage':
    case 'soilToxicity':
    case 'rfAttenuation':
      return null;
    default:
      return null;
  }
}

export function formatMetric(
  metric: MetricKey,
  value: number | null,
  direction: 'lower' | 'higher' | 'band' | 'boolean',
): string {
  if (value === null || !Number.isFinite(value)) return 'NO DATA';
  if (direction === 'boolean') return value >= 1 ? 'PRESENT' : 'ABSENT';
  if (metric === 'flatFraction') return `${(value * 100).toFixed(0)}%`;
  if (metric === 'humidity') return `${value.toFixed(0)}%`;
  if (metric === 'access' || metric === 'dust' || metric === 'water' || metric === 'aerosol') {
    return value.toFixed(2);
  }
  if (metric === 'slopeMean' || metric === 'slopeP95' || metric === 'slopeMax') {
    return `${value.toFixed(1)}°`;
  }
  if (metric === 'tempMean' || metric === 'tempMax' || metric === 'tempMin' || metric === 'tempAmp') {
    return `${value.toFixed(1)}°C`;
  }
  if (metric === 'precipYear') return `${value.toFixed(0)} mm/yr`;
  if (metric === 'wind') return `${value.toFixed(1)} m/s`;
  if (metric === 'solar') return `${value.toFixed(1)} kWh/m²/d`;
  if (metric === 'pressure') return `${value.toFixed(1)} kPa`;
  if (metric === 'airDensity') return `${value.toFixed(2)} kg/m³`;
  if (metric === 'airportHours') return `${value.toFixed(1)} h`;
  if (metric === 'geoTagCount') return `${value.toFixed(0)} materials`;
  if (metric === 'roughness') {
    return `${value < 1 ? value.toFixed(2) : value.toFixed(1)} m`;
  }
  if (metric === 'elevRange' || metric === 'elevation' || metric === 'relief') {
    return `${value.toFixed(0)} m`;
  }
  if (metric === 'soilWetnessTop') return value.toFixed(2);
  const unit = metricUnit(metric);
  return `${value.toFixed(unit ? 1 : 0)}${unit ? ` ${unit}` : ''}`;
}
