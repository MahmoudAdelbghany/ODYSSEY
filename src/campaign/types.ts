import type { Site } from '../types';
import type { ExperimentSpec, MissionMatrix } from '../mission';
import type { TemporalFeasibility, TemporalMatrix, TemporalWindow } from '../temporal';
import type { ExperimentGapAnalysis, RequirementGap } from '../interventions';

export type CampaignPriority = 'science' | 'logistics' | 'interventions';

export interface CampaignConfig {
  durationDays: number;
  startMonth: number | null;
  maxSites: number;
  maxTravelHours: number;
  interventionPolicy: 'field-only' | 'include-facility';
  allowMarginal: boolean;
  minimumExperimentFit: number;
  optionsPerExperiment: number;
}

export interface CampaignWindow {
  startMonth: number;
  endMonth: number;
  months: number[];
  lengthMonths: number;
  label: string;
  startDate: string;
  endDate: string;
  planningYear: number;
  climatology: true;
}

export interface CampaignAssignment {
  experimentId: string;
  experimentName: string;
  experimentShortName: string;
  siteId: string;
  siteName: string;
  country: string;
  staticFit: number;
  temporalFeasibility: TemporalFeasibility;
  temporalScore: number;
  planningScore: number;
  evidenceCoverage: number;
  temporalWindow: TemporalWindow;
  interventions: string[];
  interventionComplexity: number;
  measuredOnly: number;
  residualGaps: RequirementGap[];
  residualLabels: string[];
  gapAnalysis: ExperimentGapAnalysis;
  confidence: number;
}

export interface CampaignStop {
  siteId: string;
  siteName: string;
  country: string;
  lat: number;
  lon: number;
  window: CampaignWindow;
  experiments: CampaignAssignment[];
  interventions: string[];
  equipment: string[];
  dependencies: string[];
  unresolved: string[];
  confidence: number;
  suitability: number;
  access: string;
  sequence: number;
  monthOffset: number;
}

export interface CampaignLeg {
  fromSiteId: string;
  toSiteId: string;
  fromName: string;
  toName: string;
  km: number;
  hours: number;
  mode: string;
  source: string;
}

export interface CampaignMetrics {
  minFit: number;
  meanFit: number;
  meanTemporal: number;
  sites: number;
  stops: number;
  travelKm: number;
  travelHours: number;
  interventionComplexity: number;
  interventions: number;
  residualCount: number;
  confidence: number;
}

export interface CampaignPlan {
  id: string;
  priority: CampaignPriority;
  label: string;
  objective: string;
  stops: CampaignStop[];
  legs: CampaignLeg[];
  metrics: CampaignMetrics;
  timeline: {
    startMonth: number;
    endMonth: number;
    totalMonths: number;
    label: string;
    startDate: string;
    endDate: string;
    planningYear: number;
    climatology: true;
  };
  assumptions: string[];
  limitations: string[];
  unresolved: string[];
  source: string;
}

export interface CampaignExperimentIssue {
  experimentId: string;
  experimentName: string;
  reasons: string[];
}

export interface CampaignResult {
  config: CampaignConfig;
  plans: CampaignPlan[];
  selectedPlanId: string | null;
  infeasible: CampaignExperimentIssue[];
  constraintIssues: string[];
  objective: string;
  assumptions: string[];
  optionCounts: Record<string, number>;
  source: string;
}

export interface CampaignInputs {
  sites: Site[];
  missionMatrix: MissionMatrix;
  temporalMatrix: TemporalMatrix;
  experiments: ExperimentSpec[];
}
