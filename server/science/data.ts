/**
 * Read-only access to the repository's versioned datasets. These are the same
 * JSON files the frontend ships; the server never mutates them.
 */
import odysseyRaw from '../../src/data/odyssey.json';
import terrainRaw from '../../src/data/siteTerrain.json';
import monthlyRaw from '../../src/data/siteMonthly.json';
import planetaryRefRaw from '../../src/data/planetaryReference.json';
import planetaryThermalRaw from '../../src/data/planetaryThermal.json';
import globalDiscoveryRaw from '../../src/data/globalDiscovery.json';
import enrichmentRaw from '../../src/data/generatedEnrichment.json';
import discoveryRaw from '../../src/data/discovery.json';
import type { OdysseyData, Site, SiteMonthlyData, SiteTerrainData, ProfileKey } from '../../src/types.ts';

export const odyssey = odysseyRaw as unknown as OdysseyData;
export const siteTerrain = terrainRaw as unknown as SiteTerrainData;
export const siteMonthly = monthlyRaw as unknown as SiteMonthlyData;

export interface TerrainWindowStats {
  name: string;
  lat: number;
  lon: number;
  source: string;
  resolutionM: number;
  windowKm: number;
  elevationMean: number;
  reliefP95P5: number;
  slopeMean: number;
  slopeP95: number;
  roughness: number;
  class: string;
  note: string;
}

export const planetaryReference = planetaryRefRaw as unknown as {
  generatedAt: string;
  method: string;
  references: { moon: TerrainWindowStats; mars: TerrainWindowStats };
  earth: Record<string, { '400m': TerrainWindowStats; '463m': TerrainWindowStats }>;
};

export interface ThermalChannel {
  nAccepted: number;
  status: string;
  meanK: number | null;
  minK: number | null;
  maxK: number | null;
}

export interface SiteThermal {
  window: string;
  hemisphere: string;
  day: ThermalChannel;
  night: ThermalChannel;
  pairedDayNight: { nPaired: number; meanDeltaK: number | null; minDeltaK: number | null; maxDeltaK: number | null };
}

export const planetaryThermal = planetaryThermalRaw as unknown as {
  generatedAt: string;
  modis: { product: string; collection: string; qc: string; support: string; access: string };
  earth: Record<string, SiteThermal>;
  mars: {
    site: string;
    air: { rangeK: [number, number]; support: string; source: string; doi: string };
    surface: { rangeK: [number, number]; support: string; source: string; doi: string };
    diurnalAmplitudeK: unknown;
    note: string;
  };
  moon: {
    site: string;
    classes: {
      polarRange: { rangeK: [number, number] | null; support: string; source: string; class?: string };
      permanentlyShadowed: { rangeK: null; support: string; class: string };
      illuminatedSlope: { rangeK: null; support: string; class: string };
    };
    note: string;
  };
  thermalInertia: Record<string, unknown>;
};

export interface GeneratedRegion {
  id: string;
  name: string;
  lat: number;
  lon: number;
  classification: 'new' | 'nearby' | 'existing';
  noveltyKm: number;
  areaKm2: number;
  category: string;
  features: Record<string, { mean: number; min: number; max: number; n: number }>;
  profiles: Record<string, { max: number; mean: number; coverageMean: number; dimensions: Record<string, number> }>;
  bestProfile: string;
  bestScore: number;
  dataCompleteness: number;
  evidence: Record<string, string>;
  missing: string[];
}

export const globalDiscovery = globalDiscoveryRaw as unknown as {
  version: string;
  generatedAt: string;
  methodology: unknown;
  counts: Record<string, number>;
  regions: GeneratedRegion[];
};

export const generatedEnrichment = enrichmentRaw as unknown as {
  version: string;
  sites: Record<string, Record<string, unknown>> | Array<Record<string, unknown>>;
};

export const SITES: Site[] = odyssey.sites;
export const SITE_BY_ID = new Map(SITES.map((site) => [site.id, site]));

export function profileFor(key: ProfileKey) {
  return odyssey.profiles[key];
}

export interface DiscoveryCandidate {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  type: string;
  geology?: { lith?: string; unit?: string; age?: string; source?: string } | null;
}

export const discovery = discoveryRaw as unknown as { candidates: DiscoveryCandidate[] };
