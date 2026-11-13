/** Typed, serialisable mission state. Every transition happens inside a tool. */
import type { ProfileKey } from '../../src/types.ts';
import type { MissionSpec } from '../../src/mission/index.ts';
import type { CandidateEvaluation } from '../science/candidates.ts';
import type { InterventionSpec, ModelOutput } from '../science/interventions.ts';
import type { MismatchFinding } from '../science/mismatch.ts';
import type { PlanetaryTargetId } from '../science/profile.ts';
import type { VerificationResult } from '../evidence/verify.ts';

export type Phase = 'understanding' | 'requirements' | 'discovery' | 'evidence' | 'analysis' | 'interventions' | 'campaign' | 'report' | 'done';

export interface ArchetypeSelection {
  archetypeId: string;
  briefFragment: string;
  rationale: string;
  source: 'brief' | 'inferred';
}

export interface ParsedMission {
  target: PlanetaryTargetId | null;
  body: 'Moon' | 'Mars' | 'Unresolved';
  profile: ProfileKey;
  durationDays: number | null;
  crew: number | null;
  selections: ArchetypeSelection[];
  keywordSelections: string[];
  unmatchedIntents: string[];
  parser: 'llm' | 'deterministic';
  notes: string[];
}

export type EvidenceStatus = 'pending_review' | 'retrieved' | 'retrieval_failed' | 'supported' | 'contradicted' | 'unresolved';

export interface EvidenceItem {
  id: string;
  url: string;
  title: string;
  snippet: string;
  scope: 'earth_site' | 'planetary_target' | 'facility';
  siteId: string | null;
  experimentIds: string[];
  query: string;
  retrievedAt: string;
  provider: string;
  status: EvidenceStatus;
  source?: { title: string | null; publishedDate: string | null; doi: string | null; sha256: string; bytes: number; contentType: string };
  /** Most recent verification (kept for compatibility). */
  verification?: VerificationResult;
  /** Every verification run against this source, one per quantity. */
  verifications?: Array<VerificationResult & { quantity: string }>;
  retrievalError?: string;
  relevance?: number;
}

export interface Contradiction {
  id: string;
  quantity: string;
  description: string;
  urls: string[];
  detectedAt: string;
}

export interface RerankRecord {
  id: string;
  target: 'candidates' | 'evidence';
  experimentId: string;
  component: string;
  model: string | null;
  inputIds: string[];
  outputOrder: string[];
  baselineOrder: string[];
  kendallTauVsBaseline: number | null;
  scores: Record<string, number | null>;
  weights: Record<string, { weight: number; rationale: string; basis: string; sources: Array<{ title: string; url: string }> }>;
  constraintsApplied: string[];
  literature: Array<{ title: string; url: string }>;
  explanation: string;
  status: string;
  error: string | null;
  timestamp: string;
}

export interface InterventionEvaluation {
  interventionId: string;
  outputs: ModelOutput[];
  protocol: unknown;
  residual: string[];
  label: string;
  evaluatedAt: string;
  /** Engineering inputs that were not supplied and used labelled defaults. */
  defaults: string[];
}

export interface Decision {
  ts: string;
  kind: 'selected' | 'rejected' | 'downgraded' | 'unresolved' | 'assumption' | 'revisit';
  subject: string;
  reason: string;
  refs: string[];
}

export interface CampaignSummary {
  config: Record<string, unknown>;
  plans: Array<{
    id: string;
    label: string;
    objective: string;
    stops: Array<{ siteId: string; siteName: string; country: string; lat: number; lon: number; window: string; experiments: Array<{ id: string; name: string; staticFit: number; temporalFeasibility: string; interventions: string[]; residual: string[] }>; travelFromPrevious: { km: number; hours: number } | null }>;
    metrics: Record<string, number>;
    unresolved: string[];
    limitations: string[];
  }>;
  infeasible: Array<{ experimentId: string; experimentName: string; reasons: string[] }>;
  constraintIssues: string[];
  excludedPairs: number;
}

export interface Budgets {
  toolCalls: number;
  llmTurns: number;
  searchCalls: number;
  sourceFetches: number;
  promptTokens: number;
  completionTokens: number;
}

export interface AgentState {
  version: 'odyssey-agent-state/1';
  runId: string;
  brief: string;
  phase: Phase;
  parsed: ParsedMission | null;
  mission: MissionSpec | null;
  temporalConfig: { durationDays: number; startMonth: number | null; allowMarginal: boolean };
  candidates: Record<string, CandidateEvaluation[]>;
  earthWideGaps: Record<string, ReturnType<typeof import('../science/candidates.ts').earthWideGaps>>;
  globalRegions: Array<{ id: string; name: string; lat: number; lon: number; category: string; classification: string; profileScore: number; coverage: number; missing: string[] }>;
  evidence: EvidenceItem[];
  searchReports: Array<{ scope: string; query: string; status: string; siteId: string | null; missionId: string | null; kept: number; rejected: number; error?: string }>;
  validationFindings: Array<{ siteId: string; missionId: string; eligibility: string; status: string; findings: number; categories: Record<string, number>; missing: string[] }>;
  contradictions: Contradiction[];
  mismatches: Record<string, MismatchFinding[]>;
  interventions: InterventionSpec[];
  interventionEvaluations: InterventionEvaluation[];
  reranks: RerankRecord[];
  campaign: CampaignSummary | null;
  decisions: Decision[];
  budgets: Budgets;
  report: unknown | null;
  toolHistory: Array<{ tool: string; argsKey: string; ok: boolean; ms: number }>;
  /** Evidence-gap investigations keyed by "metric:<key>" or "dimension:<key>". Older snapshots lack it. */
  evidenceInvestigations?: Record<string, import('./investigate.ts').EvidenceInvestigation>;
}

export function initialState(runId: string, brief: string): AgentState {
  return {
    version: 'odyssey-agent-state/1',
    runId,
    brief,
    phase: 'understanding',
    parsed: null,
    mission: null,
    temporalConfig: { durationDays: 7, startMonth: null, allowMarginal: true },
    candidates: {},
    earthWideGaps: {},
    globalRegions: [],
    evidence: [],
    searchReports: [],
    validationFindings: [],
    contradictions: [],
    mismatches: {},
    interventions: [],
    interventionEvaluations: [],
    reranks: [],
    campaign: null,
    decisions: [],
    budgets: { toolCalls: 0, llmTurns: 0, searchCalls: 0, sourceFetches: 0, promptTokens: 0, completionTokens: 0 },
    report: null,
    toolHistory: [],
  };
}

export function decide(state: AgentState, kind: Decision['kind'], subject: string, reason: string, refs: string[] = []) {
  state.decisions.push({ ts: new Date().toISOString(), kind, subject, reason, refs });
}
