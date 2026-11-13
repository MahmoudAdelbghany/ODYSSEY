import type { ProfileKey, SiteTerrainInfo } from '../types';
import type { RequirementEvidence, ThresholdBasis } from './evidence';

/**
 * The mission decomposition contract.
 *
 * A mission is decomposed into independent experiments. Each experiment owns a
 * set of formal requirements. Requirements are evaluated against the same 39
 * candidate sites, so a site can be strong for one experiment and weak for
 * another. Nothing here is an LLM output: every threshold and provenance record
 * is deterministic and inspectable.
 */

export type TargetBody = 'Moon' | 'Mars' | 'Earth analog' | 'Unresolved';

export type RequirementKind =
  | 'required'
  | 'preferred'
  | 'operational'
  | 'facility'
  | 'impossible';

export type RequirementStatus =
  | 'pass'
  | 'partial'
  | 'fail'
  | 'missing'
  | 'not-applicable';

export type EvidenceNature =
  | 'measured'
  | 'derived'
  | 'predicted'
  | 'reanalysis'
  | 'mapped'
  | 'missing';

export type EvidenceSpatiality = 'spatial' | 'point' | 'mapped' | 'none';

export type ExperimentSource = 'brief' | 'profile' | 'inferred';

export type MetricKey =
  | 'slopeMean'
  | 'slopeP95'
  | 'slopeMax'
  | 'roughness'
  | 'flatFraction'
  | 'elevRange'
  | 'tempMean'
  | 'tempMax'
  | 'tempMin'
  | 'tempAmp'
  | 'thermalInertia'
  | 'precipYear'
  | 'humidity'
  | 'wind'
  | 'solar'
  | 'aerosol'
  | 'soilWetnessTop'
  | 'pressure'
  | 'airDensity'
  | 'elevation'
  | 'relief'
  | 'access'
  | 'dust'
  | 'water'
  | 'airportHours'
  | 'basalt'
  | 'evaporite'
  | 'clay'
  | 'sulfate'
  | 'ice'
  | 'glacier'
  | 'cave'
  | 'impact'
  | 'volcanic'
  | 'regolith'
  | 'sand'
  | 'iron'
  | 'limestone'
  | 'hydratedMinerals'
  | 'geoTagCount'
  | 'geologyMapped'
  | 'regolithDepth'
  | 'bearingStrength'
  | 'radiationFlux'
  | 'organicCarbon'
  | 'dustFlux'
  | 'iceThickness'
  | 'subsurfaceStrata'
  | 'rockExposure'
  | 'isolationIndex'
  | 'gravity'
  | 'lunarNight'
  | 'vacuum'
  | 'gradeTonnage'
  | 'soilToxicity'
  | 'rfAttenuation';

export const TIME_DEPENDENT_METRICS = new Set<MetricKey>([
  'tempMean',
  'tempMax',
  'tempMin',
  'tempAmp',
  'precipYear',
  'humidity',
  'wind',
  'solar',
  'aerosol',
  'soilWetnessTop',
  'pressure',
  'airDensity',
]);

export interface EvidenceProvenance {
  source: string;
  dataset: string;
  date: string;
  nature: EvidenceNature;
  spatiality: EvidenceSpatiality;
  resolution: string;
  note: string;
}

export interface RequirementSpec {
  id: string;
  experimentId: string;
  label: string;
  shortLabel: string;
  statement: string;
  metric: MetricKey;
  direction: 'lower' | 'higher' | 'band' | 'boolean';
  ideal: number;
  limit: number;
  idealMax?: number;
  limitMax?: number;
  unit: string;
  kind: RequirementKind;
  weight: number;
  why: string;
  evidence: EvidenceProvenance;
  source: 'brief' | 'template';
  inferred: boolean;
  temporal: boolean;
  assumption?: string;
  missingReason?: string;
  thresholdBasis?: ThresholdBasis;
  thresholdNote?: string;
}

export interface RequirementEvaluation {
  requirementId: string;
  experimentId: string;
  siteId: string;
  value: number | null;
  display: string;
  score: number | null;
  status: RequirementStatus;
  note: string;
  evidence?: RequirementEvidence;
}

export interface RequirementSummary {
  experimentId: string;
  requirementId: string;
  pass: number;
  partial: number;
  fail: number;
  missing: number;
  notApplicable: number;
  evaluated: number;
  total: number;
}

export interface ExperimentSpec {
  id: string;
  index: number;
  name: string;
  shortName: string;
  objective: string;
  analog: string;
  equipment: string[];
  measurements: string[];
  constraints: string[];
  assumptions: string[];
  confidence: number;
  priority: number;
  source: ExperimentSource;
  sourceTerms: string[];
  requirements: RequirementSpec[];
  facilityNotes: string[];
}

export interface ExplicitConstraint {
  metric: MetricKey;
  operator: 'max' | 'min';
  value: number;
  unit: string;
  text: string;
}

export interface MissionSpec {
  brief: string;
  profile: ProfileKey;
  profileLabel: string;
  target: TargetBody;
  targetNote: string;
  durationDays: number | null;
  durationLabel: string;
  crew: number | null;
  experiments: ExperimentSpec[];
  assumptions: string[];
  unresolved: string[];
  constraints: ExplicitConstraint[];
  confidence: number;
}

export interface ExperimentSiteResult {
  experimentId: string;
  siteId: string;
  rawScore: number | null;
  score: number | null;
  coverage: number;
  requiredCoverage: number;
  missing: string[];
  failed: string[];
  partial: string[];
  facility: string[];
  impossible: string[];
  status: 'strong' | 'moderate' | 'weak' | 'insufficient';
  evaluations: RequirementEvaluation[];
}

export interface SiteMissionResult {
  siteId: string;
  score: number | null;
  coverage: number;
  experiments: Record<string, ExperimentSiteResult>;
  supported: string[];
  bestExperimentId: string | null;
}

export interface MissionMatrix {
  bySite: Record<string, SiteMissionResult>;
  byExperiment: Record<string, ExperimentSiteResult[]>;
  requirementSummaries: Record<string, RequirementSummary>;
  rankedSiteIds: string[];
}

export interface SiteTerrainLookup {
  [siteId: string]: SiteTerrainInfo | undefined;
}
