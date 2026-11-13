import type { SiteMonthlyInfo } from '../types';
import type {
  ExperimentSpec,
  MetricKey,
  RequirementKind,
  RequirementStatus,
} from '../mission';

export type TemporalFeasibility = 'good' | 'marginal' | 'none' | 'insufficient';
export type TemporalMonthStatus = 'good' | 'marginal' | 'unsuitable' | 'insufficient';

export interface TemporalConfig {
  /** Mission duration in days. Permanent missions use 365. */
  durationDays: number;
  /** Optional fixed start month (0 = January). Null lets the engine search all starts. */
  startMonth: number | null;
  /** If false, months with a required requirement outside its ideal band are excluded. */
  allowMarginal: boolean;
}

export interface MonthlyRequirementPoint {
  month: number;
  value: number | null;
  display: string;
  score: number | null;
  status: RequirementStatus;
  timeDependent: boolean;
  annualized: boolean;
}

export interface RequirementTemporalSeries {
  requirementId: string;
  metric: MetricKey;
  label: string;
  kind: RequirementKind;
  unit: string;
  statement: string;
  timeDependent: boolean;
  annualizedMonthly: boolean;
  monthly: MonthlyRequirementPoint[];
  availableMonths: number;
  note: string;
}

export interface MonthlyExperimentPoint {
  month: number;
  score: number | null;
  coverage: number;
  dataCoverage: number;
  status: TemporalMonthStatus;
  violations: string[];
  missing: string[];
}

export interface TemporalWindow {
  startMonth: number;
  endMonth: number;
  months: number[];
  wrap: boolean;
  lengthMonths: number;
  missionMonths: number;
  meanScore: number;
  minScore: number;
  stability: number;
  coverage: number;
  dataCoverage: number;
  feasibility: 'good' | 'marginal';
  violations: string[];
  missing: string[];
  label: string;
  source: string;
}

export interface ExperimentTemporalResult {
  experimentId: string;
  siteId: string;
  monthly: MonthlyExperimentPoint[];
  requirements: RequirementTemporalSeries[];
  windows: TemporalWindow[];
  bestWindow: TemporalWindow | null;
  selectedWindow: TemporalWindow | null;
  feasibility: TemporalFeasibility;
  dataCoverage: number;
  limitations: string[];
  source: string;
}

export interface TemporalMatrix {
  config: TemporalConfig;
  bySite: Record<string, Record<string, ExperimentTemporalResult>>;
  byExperiment: Record<string, ExperimentTemporalResult[]>;
  monthLabels: string[];
  source: string;
}

export interface TemporalLookup {
  [siteId: string]: SiteMonthlyInfo | undefined;
}

export interface TemporalExperimentOption {
  experiment: ExperimentSpec;
  result: ExperimentTemporalResult;
}
