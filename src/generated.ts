import enrichmentRaw from './data/generatedEnrichment.json';
import type {
  Airport,
  Climate,
  Dimensions,
  Macrostrat,
  ProfileKey,
  Score,
  Site,
  SiteImageryInfo,
  SiteTerrainInfo,
} from './types';

type FeatureStat = { mean: number | null; min: number | null; max: number | null; n: number };
type ProfileStat = {
  max: number;
  mean: number;
  coverageMean: number;
  cells: number;
  dimensions: Record<string, number | null>;
};
type DetailedProfile = {
  score: number;
  coverage: number;
  dimensions: Record<string, number | null>;
};
export type EnrichmentSite = {
  id: string;
  name: string;
  category: string;
  classification: string;
  selectionReason: string;
  lat: number;
  lon: number;
  representativeCell: string;
  cells: string[];
  cellCount: number;
  areaKm2: number;
  nearestExisting: { id: string; kind: string; distanceKm: number };
  coarse: {
    features: Record<string, FeatureStat>;
    profiles: Record<string, ProfileStat>;
    bestProfile: string;
    bestScore: number;
    dataCompleteness: number;
    footprint: unknown;
    evidence: Record<string, string>;
  };
  imagery: (SiteImageryInfo & { collection?: string; source?: string; license?: string; nativeResolutionM?: number; coverage?: string; processing?: string }) | null;
  terrain: (SiteTerrainInfo & { windowSource?: string; nativeResolutionM?: number; heightmapResolutionM?: number; license?: string }) | null;
  power: {
    period: string;
    source: string;
    spatialResolution: string;
    temporalResolution: string;
    retrieved: string;
    complete: boolean;
    missing: string[];
    monthly: Record<string, (number | null)[]>;
    annual: Record<string, number | null>;
    license: string;
    limitations: string;
  } | null;
  macrostrat: Macrostrat | null;
  nearestAirport: (Airport & { distanceKm: number; method: string; source: string }) | null;
  detailedProfiles: Record<string, DetailedProfile>;
  detailedDimensions: Record<string, number | null> | null;
  comparison: {
    coarse: { tempMeanC: number; precipYearMm: number; reliefM: number; slopeDeg: number; bestScore: number; bestProfile: string };
    detailed: { tempMeanC: number; precipYearMm: number; reliefM: number; slopeDeg: number; bestScore: number; bestProfile: string };
    deltas: { tempC: number; precipMm: number; reliefRatio: number | null; slopeRatio: number | null; bestScore: number };
    profileSensitivity?: Record<string, { base: number; maxDelta: number; min: number; max: number }>;
    note?: string;
  } | null;
  missing: string[];
  licensing: {
    imagery: string;
    terrain: string;
    power: string;
    macrostrat: string;
  };
};

const enrichment = enrichmentRaw as unknown as {
  version: string;
  generatedAt: string;
  sites: Record<string, EnrichmentSite>;
};

function num(value: number | null | undefined, fallback = 0) {
  return value === null || value === undefined || !Number.isFinite(value) ? fallback : value;
}

function scoreFor(site: EnrichmentSite, key: ProfileKey): Score {
  const profileKey = key === 'expedition' ? 'lunar_expedition' : key;
  const profile = site.detailedProfiles[profileKey];
  const dimensions = site.detailedDimensions;
  if (!profile || !dimensions) {
    return {
      total: 0,
      dimensions: { thermal: 0, aridity: 0, terrain: 0, geology: 0, dust: 0, access: 0 },
      confidence: 0,
      missing: ['profile gate not met or enrichment unavailable'],
    };
  }
  const thermalKey = key === 'mars_landing' ? 'thermal_mars' : 'thermal_lunar';
  const enrichedDimensions: Dimensions = {
    thermal: num(dimensions[thermalKey]),
    aridity: num(dimensions.aridity),
    terrain: num(dimensions.terrain),
    geology: 0,
    dust: 0,
    access: num(dimensions.access),
  };
  return {
    total: profile.score,
    dimensions: enrichedDimensions,
    confidence: profile.coverage,
    missing: ['mapped geology not in screening score', 'dust not in screening score', 'field validation'],
    rationale: `Rule-based detailed screen from NASA POWER and Copernicus DEM; coarse score ${site.coarse.bestScore.toFixed(1)}.`,
  };
}

function climateFor(site: EnrichmentSite): Climate {
  const annual = site.power?.annual ?? {};
  const monthly = site.power?.monthly ?? {};
  const temp = (monthly.T2M ?? []).filter((value): value is number => value !== null);
  const tempMax = (monthly.T2M_MAX ?? []).filter((value): value is number => value !== null);
  const tempMin = (monthly.T2M_MIN ?? []).filter((value): value is number => value !== null);
  return {
    tempMean: num(annual.tempMeanC),
    tempMax: num(annual.tempMonthlyMaxC, Math.max(...(tempMax.length ? tempMax : [0]))),
    tempMin: num(annual.tempMonthlyMinC, Math.min(...(tempMin.length ? tempMin : [0]))),
    tempAmp: temp.length ? Math.max(...temp) - Math.min(...temp) : 0,
    seasonalAmp: temp.length ? Math.max(...temp) - Math.min(...temp) : 0,
    precipDay: num(annual.precipDayMm),
    precipYear: num(annual.precipYearMm),
    humidity: num(annual.humidityPct),
    wind: num(annual.windMs),
    solar: num(annual.solarKwhM2Day),
    aerosol: annual.aerosolAod550 ?? undefined,
    soilWetnessTop: annual.soilWetnessTop ?? undefined,
    soilWetnessRoot: annual.soilWetnessRoot ?? undefined,
    pressure: annual.pressureKpa ?? undefined,
    elevation: num(site.terrain?.mean),
    relief: num(site.terrain?.stats?.elevRange),
    complete: Boolean(site.power?.complete),
  };
}

export function getPromotedSite(id: string): Site | null {
  const site = enrichment.sites[id];
  if (!site || !site.terrain || !site.imagery || !site.power) return null;
  const monthly = site.power.monthly;
  const accessKm = site.coarse.features.accessKm?.mean ?? null;
  const access = accessKm === null ? 0.5 : Math.max(0, Math.min(1, 1 - Math.log10(1 + accessKm) / 3.2));
  const airport: Airport | undefined = site.nearestAirport
    ? {
        name: site.nearestAirport.name,
        iata: site.nearestAirport.iata,
        lat: site.nearestAirport.lat,
        lon: site.nearestAirport.lon,
        groundHours: 0,
        hub: site.nearestAirport.country ?? 'GENERATED',
      }
    : undefined;
  const macrostrat: Macrostrat | undefined = site.macrostrat ?? undefined;
  return {
    id: site.id,
    name: site.name,
    country: 'GENERATED REGION',
    lat: site.lat,
    lon: site.lon,
    type: `${site.category.replace(/_/g, ' ')} / enriched H3 region`,
    tags: [site.category, ...(macrostrat?.tags ?? [])],
    access,
    dust: 0.5,
    water: 0.5,
    summary:
      `Algorithmically generated ${site.category.replace(/_/g, ' ')} region, ` +
      `${site.cellCount} H3 cells / ${Math.round(site.areaKm2).toLocaleString()} km2. ` +
      `Selection: ${site.selectionReason}. Coarse screen ${site.coarse.bestScore.toFixed(1)}; ` +
      `detailed screen ${site.comparison?.detailed.bestScore.toFixed(1) ?? 'not available'}.`,
    image: site.imagery.file,
    airport,
    macrostrat,
    climate: climateFor(site),
    monthly: {
      temp: monthly.T2M ?? [],
      precip: monthly.PRECTOTCORR ?? [],
    },
    scores: {
      lunar_base: scoreFor(site, 'lunar_base'),
      mars_landing: scoreFor(site, 'mars_landing'),
      expedition: scoreFor(site, 'expedition'),
    },
    windows: {
      lunar_base: [],
      mars_landing: [],
      expedition: [],
    },
  };
}

export function getPromotedImagery(id: string): SiteImageryInfo | undefined {
  const site = enrichment.sites[id];
  if (!site?.imagery) return undefined;
  return {
    file: site.imagery.file,
    width: site.imagery.width,
    height: site.imagery.height,
    sitePx: site.imagery.sitePx,
    mpp: site.imagery.mpp,
    date: site.imagery.date,
    cloud: site.imagery.cloud,
    scene: site.imagery.scene,
    bounds: site.imagery.bounds,
    bands: site.imagery.bands,
    credit: site.imagery.credit,
  };
}

export function getPromotedTerrain(id: string): SiteTerrainInfo | undefined {
  const site = enrichment.sites[id];
  return site?.terrain ?? undefined;
}

export type PromotedMeta = {
  origin: 'generated';
  category: string;
  classification: string;
  cellCount: number;
  areaKm2: number;
  representativeCell: string;
  coarseScore: number;
  detailedScore: number | null;
  coarseProfile: string;
  detailedProfile: string | null;
  accessKm: number | null;
  selectionReason: string;
  missingDimensions: string[];
  imageryAvailable: boolean;
  thermalAvailable: boolean;
  planetaryAvailable: boolean;
};

export function getPromotedMeta(id: string): PromotedMeta | null {
  const site = enrichment.sites[id];
  if (!site) return null;
  return {
    origin: 'generated',
    category: site.category,
    classification: site.classification,
    cellCount: site.cellCount,
    areaKm2: site.areaKm2,
    representativeCell: site.representativeCell,
    coarseScore: site.coarse.bestScore,
    detailedScore: site.comparison?.detailed.bestScore ?? null,
    coarseProfile: site.coarse.bestProfile,
    detailedProfile: site.comparison?.detailed.bestProfile ?? null,
    accessKm: site.coarse.features.accessKm?.mean ?? null,
    selectionReason: site.selectionReason,
    missingDimensions: ['geology', 'dust'],
    imageryAvailable: Boolean(site.imagery),
    thermalAvailable: Boolean(site.terrain && site.power),
    planetaryAvailable: Boolean(site.terrain),
  };
}

export function isPromotedRegion(id: string | null | undefined): boolean {
  return Boolean(id && enrichment.sites[id]);
}

export function enrichmentVersion(): string {
  return enrichment.version;
}

export function enrichedRegionIds(): string[] {
  return Object.keys(enrichment.sites);
}

export function enrichmentSite(id: string): EnrichmentSite | null {
  return enrichment.sites[id] ?? null;
}
