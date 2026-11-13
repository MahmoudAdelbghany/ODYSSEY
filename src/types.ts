export type ProfileKey = 'lunar_base' | 'mars_landing' | 'expedition';

export interface Dimensions {
  thermal: number;
  aridity: number;
  terrain: number;
  geology: number;
  dust: number;
  access: number;
}

export interface Score {
  total: number;
  dimensions: Dimensions;
  confidence: number;
  missing: string[];
  rationale?: string;
}

export interface Climate {
  tempMean: number;
  tempMax: number;
  tempMin: number;
  tempAmp: number;
  seasonalAmp: number;
  precipDay: number;
  precipYear: number;
  humidity: number;
  wind: number;
  solar: number;
  aerosol?: number;
  soilWetnessTop?: number;
  soilWetnessRoot?: number;
  pressure?: number;
  elevation: number;
  relief: number;
  complete: boolean;
}

export interface MLPrediction {
  predicted: number;
  uncertainty: number;
  actual: number;
}

export interface Airport {
  name: string;
  iata: string;
  lat: number;
  lon: number;
  groundHours: number;
  hub: string;
  country?: string;
}

export interface Macrostrat {
  lith: string;
  age: string;
  unit: string;
  tags: string[];
  source: string;
}

export interface Site {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  type: string;
  tags: string[];
  access: number;
  dust: number;
  water: number;
  summary: string;
  benchmark?: boolean;
  image: string;
  airport?: Airport;
  macrostrat?: Macrostrat;
  climate: Climate;
  monthly: { temp: (number | null)[]; precip: (number | null)[] };
  scores: Record<ProfileKey, Score>;
  windows: Record<ProfileKey, string[]>;
  ml?: Record<ProfileKey, MLPrediction>;
}

export interface SiteImageryInfo {
  file: string;
  width: number;
  height: number;
  sitePx: [number, number];
  mpp: number;
  date: string;
  cloud: number;
  scene: string;
  bounds: [number, number, number, number];
  bands: string;
  credit: string;
}

export interface SiteImageryData {
  source: string;
  license: string;
  resolution: string;
  processing: string;
  sites: Record<string, SiteImageryInfo>;
}

export interface TerrainStats {
  meanSlope: number;
  p95Slope: number;
  maxSlope: number;
  flatFraction: number;
  roughness: number;
  elevRange: number;
  elevMean?: number;
  elevP95P5?: number;
  voidPct?: number;
  baselineM?: number;
}

export interface SiteTerrainInfo {
  file: string;
  width: number;
  height: number;
  mpp: number;
  widthMeters: number;
  heightMeters: number;
  crs: string;
  boundsUtm: [number, number, number, number];
  min: number;
  max: number;
  mean: number;
  voidPct: number;
  date: string;
  source: string;
  credit: string;
  stats?: TerrainStats;
}

export interface SiteTerrainData {
  source: string;
  license: string;
  resolution: string;
  sites: Record<string, SiteTerrainInfo>;
}

export interface CampaignSite {
  id: string;
  name: string;
  country: string;
  score: number;
  window: string[];
  image: string;
  type: string;
}

export interface Assignment {
  experiment: string;
  site: string;
  siteId: string;
  country: string;
  window: string[];
  score: number;
  ruleScore?: number;
  fit: number;
  dimensions?: Dimensions;
}

export interface TravelLeg {
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  fromAirport: string;
  toAirport: string;
  fromHub: string;
  toHub: string;
  km: number;
  hours: number;
  cost: number;
  mode: string;
}

export interface TimelineItem {
  day: number;
  label: string;
  type: 'travel' | 'field' | 'analysis' | 'buffer';
  site: string;
  experiment?: string;
  days?: number;
  hours?: number;
}

export interface Campaign {
  key: ProfileKey;
  name: string;
  sites: CampaignSite[];
  assignments: Assignment[];
  legs: TravelLeg[];
  timeline: TimelineItem[];
  totalDays: number;
  travelHours: number;
  travelCost: number;
  travelDays: number;
  match: number;
  score: number;
  scenario?: string;
  scenarioLabel?: string;
  scenarioNote?: string;
  interventions: string[];
  summary: string;
}

export interface ProfileMeta {
  key: ProfileKey;
  name: string;
  short: string;
  experiments: string[];
  missing: string[];
}

export interface Validation {
  top1Stability: number;
  top3Stability: number;
  runs: number;
}

export interface MLProfile {
  algorithm: string;
  trainSize: number;
  sites: number;
  cv: string;
  mae: number;
  r2: number;
  spearman: number;
  pairwise: number;
  candidates?: { name: string; r2: number; mae: number; spearman: number }[];
  features: string[];
  importances: number[];
  predictions: { id: string; name: string; actual: number; predicted: number; uncertainty: number }[];
}

export interface MLData {
  generatedAt: string;
  target: string;
  method: string;
  caveat: string;
  features: string[];
  profiles: Record<ProfileKey, MLProfile>;
}

export interface OdysseyData {
  generatedAt: string;
  source: string;
  profiles: Record<ProfileKey, ProfileMeta>;
  sites: Site[];
  campaigns: Record<ProfileKey, Campaign>;
  campaignVariants?: Record<ProfileKey, Record<string, Campaign>>;
  validation: Record<ProfileKey, Validation>;
  ml: MLData;
}

export const PROFILE_ORDER: ProfileKey[] = ['lunar_base', 'mars_landing', 'expedition'];

export const DIMENSION_LABELS: Record<keyof Dimensions, string> = {
  thermal: 'Thermal envelope',
  aridity: 'Dry / volatile regime',
  terrain: 'Terrain & relief',
  geology: 'Surface materials',
  dust: 'Dust & aeolian',
  access: 'Field access',
};

export const PROFILE_WEIGHTS: Record<ProfileKey, Dimensions> = {
  lunar_base: { thermal: 24, aridity: 10, terrain: 18, geology: 22, dust: 10, access: 16 },
  mars_landing: { thermal: 15, aridity: 18, terrain: 18, geology: 22, dust: 17, access: 10 },
  expedition: { thermal: 16, aridity: 8, terrain: 22, geology: 24, dust: 12, access: 18 },
};

export function mlScore(site: Site, profile: ProfileKey): number {
  return site.ml?.[profile]?.predicted ?? site.scores[profile].total;
}

export function mlUncertainty(site: Site, profile: ProfileKey): number {
  return site.ml?.[profile]?.uncertainty ?? 0;
}

export interface SiteMonthlyInfo {
  retrieved: string;
  complete: boolean;
  missing: string[];
  temp: (number | null)[];
  tempMax: (number | null)[];
  tempMin: (number | null)[];
  precip: (number | null)[];
  humidity: (number | null)[];
  wind: (number | null)[];
  solar: (number | null)[];
  aerosol: (number | null)[];
  soilWetnessTop: (number | null)[];
  soilWetnessRoot: (number | null)[];
  pressure: (number | null)[];
}

export interface SiteMonthlyData {
  source: string;
  dataset: string;
  period: string;
  temporalResolution: string;
  spatialResolution: string;
  units: Record<string, string>;
  limitations: string;
  sites: Record<string, SiteMonthlyInfo>;
}
