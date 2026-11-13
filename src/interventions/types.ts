import type { MetricKey, RequirementKind, RequirementStatus } from '../mission';
import type { TemporalWindow } from '../temporal';

export type GapKind =
  | 'natural'
  | 'natural-partial'
  | 'temporal'
  | 'range'
  | 'facility'
  | 'impossible'
  | 'missing';

export type InterventionClosure =
  | 'full'
  | 'partial'
  | 'simulation-only'
  | 'measurement-only';

export type InterventionComplexity = 'low' | 'medium' | 'high' | 'very-high';

export interface Intervention {
  id: string;
  name: string;
  shortName: string;
  summary: string;
  addresses: MetricKey[];
  gapKinds: GapKind[];
  reproduces: string;
  cannotReproduce: string;
  equipment: string[];
  infrastructure: string[];
  constraints: string[];
  complexity: InterventionComplexity;
  complexityRank: number;
  deployment: 'field' | 'facility' | 'either' | 'unknown';
  closure: InterventionClosure;
  evidence: {
    source: string;
    date: string;
    confidence: 'low' | 'medium' | 'high';
    note: string;
  };
  assumptions: string[];
}

export interface RequirementGap {
  requirementId: string;
  experimentId: string;
  siteId: string;
  metric: MetricKey;
  label: string;
  statement: string;
  kind: RequirementKind;
  weight: number;
  naturalStatus: RequirementStatus;
  naturalDisplay: string;
  windowStatus: RequirementStatus | 'not-scored';
  gap: GapKind;
  gapLabel: string;
  note: string;
  interventionIds: string[];
  selectedInterventionId: string | null;
  controlled: 'none' | 'full' | 'partial' | 'simulation-only' | 'measurement-only';
  residual: boolean;
}

export interface ExperimentGapAnalysis {
  experimentId: string;
  siteId: string;
  experimentName: string;
  window: TemporalWindow | null;
  gaps: RequirementGap[];
  naturalSatisfied: number;
  naturalGaps: number;
  controlledAddressed: number;
  measuredOnly: number;
  residualUnresolved: number;
  totalRequirements: number;
  confidence: number;
  limitations: string[];
  source: string;
}
