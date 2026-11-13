export interface DiscoveryClimate {
  tempMean: number;
  tempMax: number;
  tempMin: number;
  tempAmp: number;
  seasonalAmp: number;
  precipYear: number;
  humidity: number;
  wind: number;
  solar: number;
  aerosol: number;
  soilWetnessTop: number;
  soilWetnessRoot: number;
  pressure: number;
}

export interface DiscoveryTerrain {
  elevation: number;
  relief: number;
  slopeMean: number;
  slopeP95: number;
  slopeMax: number;
  roughness: number;
  validFraction: number;
}

export interface DiscoveryGeology {
  lith: string;
  age: string;
  unit: string;
  tags: string[];
  source: string;
}

export interface DiscoveryAirport {
  name: string;
  iata: string;
  country: string;
  lat: number;
  lon: number;
  km: number;
}

export interface DiscoveryMonthly {
  temp: (number | null)[];
  precip: (number | null)[];
  humidity: (number | null)[];
  wind: (number | null)[];
  aerosol: (number | null)[];
  solar: (number | null)[];
}

export interface DiscoveryEvidence {
  source: string;
  resolution: string;
  class: string;
  uncertainty: string;
}

export interface DiscoveryCandidate {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  type: string;
  tags: string[];
  summary: string;
  climate: DiscoveryClimate;
  monthly: DiscoveryMonthly;
  terrain: DiscoveryTerrain | null;
  geology: DiscoveryGeology | null;
  airport: DiscoveryAirport | null;
  access: number | null;
  noveltyKm: number;
  nearestControl?: { id: string; name: string; km: number };
  sar?: SarEvidence;
  missing: string[];
  evidence: Record<string, DiscoveryEvidence>;
}

export interface DiscoveryData {
  generatedAt: string;
  source: string;
  note: string;
  count: number;
  candidates: DiscoveryCandidate[];
}

export type ReferenceKey = 'lunar_south_pole' | 'mars_jezero';

export type DimensionKey =
  | 'thermal'
  | 'terrain'
  | 'aridity'
  | 'dust'
  | 'geology'
  | 'illumination'
  | 'ice'
  | 'pressure'
  | 'access';

export interface DimensionResult {
  key: DimensionKey;
  label: string;
  score: number | null;
  weight: number;
  value: string;
  target: string;
  source: string;
  note: string;
}

export interface TimeWindow {
  months: number[];
  label: string;
  score: number;
  note: string;
}

export interface CandidateScore {
  total: number;
  weakLink: number;
  distance: number;
  sensitivity: { low: number; high: number };
  coverage: number;
  dimensions: DimensionResult[];
  missing: string[];
  novelty: number;
  noveltyGrade: 'N0' | 'N1' | 'N2';
  robustness: 'fragile' | 'mixed' | 'robust';
  window: TimeWindow | null;
}

export interface SarTexture {
  mean: number;
  std: number;
  p10: number;
  p90: number;
  entropy: number;
  edgeDensity: number;
  contrast: number;
  homogeneity: number;
}

export interface SarEvidence {
  platform: string;
  productId: string;
  acquired: string;
  beamMode: string;
  polarization: string;
  incidenceAngle: number | null;
  footprint: number[][];
  thumbnail: string;
  texture: SarTexture;
  browseTexture: SarTexture;
  frameProduct: string;
  support: string;
  class: string;
  uncertainty: string;
  source: string;
}

export interface ReferenceProfile {
  key: ReferenceKey;
  name: string;
  short: string;
  description: string;
  weights: Record<DimensionKey, number>;
  targetSummary: string[];
}
