import type { MissionSpec } from '../mission';
/**
 * Browser client for the ODYSSEY backend. It carries no credentials: every
 * secret lives server-side. Calls go to /api (proxied by Vite in development,
 * served by the same process in production).
 */

export type Epistemic = 'MEASURED' | 'DERIVED' | 'MODELED' | 'PUBLISHED' | 'SEARCHED' | 'PENDING_REVIEW' | 'PROPOSED' | 'SIMULATED' | 'ESTIMATED' | 'MISSING';

export interface RunRow {
  id: string;
  brief: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  planner: string;
  model: string | null;
  error: string | null;
  active?: boolean;
}

export interface AgentEvent {
  runId: string;
  seq: number;
  ts: string;
  type: string;
  payload: any;
}

export interface MeasurementView {
  value: number | null;
  range: [number, number] | null;
  unit: string;
  status: Epistemic;
  source: string;
  note: string;
  sourceUrl?: string | null;
  evidenceState?: string;
  nextAction?: string;
}

export interface GapFields {
  earthState?: string;
  targetState?: string;
  gapOutcome?: string;
  gapSide?: 'earth' | 'target' | 'both' | null;
  nextAction?: string | null;
}

export interface InvestigationView {
  key: string;
  label: string;
  quantity: string;
  side: 'earth' | 'target' | 'both';
  state: string;
  outcome: string;
  integrated: Array<{ name: string; measures: string; reason: string }>;
  notIntegrated: Array<{ name: string; access: string; reason: string }>;
  rejected: Array<{ name: string; reason: string }>;
  alternatives: Array<{ id: string; name: string; country: string; lat: number; lon: number; why: string }>;
  searches: Array<{ query: string; status: string; results: Array<{ title: string; url: string }>; error?: string }>;
  conclusion: string;
  nextAction: string;
  at: string;
}

export interface MismatchView {
  experimentId: string;
  siteId: string;
  dimension: string;
  label: string;
  importance: 'critical' | 'important' | 'context';
  why: string;
  matters: boolean;
  handling: string;
  handlingReason: string;
  comparison: {
    classification: string;
    reason: string;
    supportNote: string;
    absoluteDifference: number | null;
    ratio: number | null;
    overlapFraction: number | null;
    earth: MeasurementView;
    planet: MeasurementView;
  } & GapFields;
}

export interface ComparisonView extends GapFields {
  dimension: string;
  label: string;
  classification: string;
  reason: string;
  supportNote: string;
  earth: MeasurementView;
  planet: MeasurementView;
}

export interface CandidateView {
  siteId: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  decision: 'viable' | 'downgraded' | 'rejected';
  reasons: string[];
  rankings: Record<string, number | null>;
  aggregate: number | null;
  experimentScore: number | null;
  coverage: number;
  temporal: { feasibility: string; window: string | null };
  mismatches: MismatchView[];
}

export interface EvidenceView {
  id: string;
  url: string;
  title: string;
  snippet: string;
  scope: string;
  siteId: string | null;
  experimentIds: string[];
  status: string;
  provider: string;
  relevance?: number;
  retrievalError?: string;
  source?: { title: string | null; publishedDate: string | null; doi: string | null; bytes: number; contentType: string };
  verifications?: Array<{ quantity: string; status: string; summary: string; claims: Array<{ quote: string; relation: string }> }>;
  verification?: { status: string; summary: string; method: string; claims: Array<{ quote: string; value: number | null; range: [number, number] | null; unit: string | null; relation: string; note: string }>; rejected: Array<{ quote: string; reason: string }> };
}

export interface InterventionView {
  id: string;
  name: string;
  targetGap: string;
  targetGapLabel: string;
  experimentId: string;
  siteId: string | null;
  label: string;
  feasibility: string;
  model: string | null;
  controlVariables: Array<{ name: string; unit: string; target: [number, number] | null; basis: string }>;
  instrumentation: string[];
  safety: string[];
  calibration: string[];
  limitations: string[];
  reproduces: string;
  cannotReproduce: string;
  verificationStatus: string;
  cost: { value: null; note: string };
  references: Array<{ title: string; url: string | null; status: string }>;
}

export interface AgentStateView {
  phase: string;
  brief: string;
  parsed: null | { target: string | null; body: string; profile: string; durationDays: number | null; parser: string; selections: Array<{ archetypeId: string; briefFragment: string; rationale: string; source: string }>; notes: string[]; unmatchedIntents: string[] };
  mission: MissionSpec | null;
  runId?: string;
  candidates: Record<string, CandidateView[]>;
  earthWideGaps: Record<string, Array<{ dimension: string; label: string; importance: string; bestAvailable: string; kind: string; why: string; outcome?: string; gapSide?: 'earth' | 'target' | 'both' | null; nextAction?: string | null }>>;
  evidenceInvestigations?: Record<string, InvestigationView>;
  globalRegions: Array<{ id: string; name: string; lat: number; lon: number; category: string; classification: string; profileScore: number }>;
  evidence: EvidenceView[];
  contradictions: Array<{ id: string; quantity: string; description: string; urls: string[] }>;
  interventions: InterventionView[];
  interventionEvaluations: Array<{ interventionId: string; label: string; outputs: ModelOutput[]; residual: string[]; defaults?: string[] }>;
  reranks: Array<{ id: string; target: string; experimentId: string; component: string; model: string | null; outputOrder: string[]; baselineOrder: string[]; kendallTauVsBaseline: number | null; scores: Record<string, number | null>; weights: Record<string, { weight: number; rationale: string; basis: string; sources: Array<{ title: string; url: string }> }>; literature: Array<{ title: string; url: string }>; explanation: string; status: string; error: string | null }>;
  campaign: null | {
    plans: Array<{ id: string; label: string; objective: string; stops: Array<{ siteId: string; siteName: string; country: string; window: string; experiments: Array<{ id: string; name: string; staticFit: number; interventions: string[]; residual: string[] }>; travelFromPrevious: { km: number; hours: number } | null }>; metrics: Record<string, number>; unresolved: string[] }>;
    infeasible: Array<{ experimentId: string; experimentName: string; reasons: string[] }>;
  };
  decisions: Array<{ ts: string; kind: string; subject: string; reason: string }>;
  budgets: { toolCalls: number; llmTurns: number; searchCalls: number; sourceFetches: number; promptTokens: number; completionTokens: number };
  report: null | { narrative: { summary: string; keyFindings: string[]; cannotEstablish: string[]; nextMeasurements: string[]; authoredBy: string; check: string }; unresolved: string[]; integrity: string[] };
}

export interface ModelOutput {
  model: string;
  label: string;
  equation: string;
  inputs: Record<string, { value: number; unit: string }>;
  outputs: Record<string, { value: number | null; unit: string }>;
  assumptions: string[];
  validity: string;
  warnings: string[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) throw new ApiError(body?.error?.message ?? `HTTP ${response.status}`, response.status, body?.error?.code ?? 'http_error');
  return body as T;
}

export const api = {
  health: () => request<{ ok: boolean; capabilities: { llm: { model: string } | null; search: unknown | null }; activeRuns: number; budgets: Record<string, number> }>('/api/health'),
  startRun: (brief: string, planner: 'auto' | 'deterministic' = 'auto') => request<{ run: RunRow }>('/api/runs', { method: 'POST', body: JSON.stringify({ brief, planner }) }),
  runs: () => request<{ runs: RunRow[] }>('/api/runs'),
  run: (id: string) => request<{ run: RunRow; state: AgentStateView | null }>(`/api/runs/${id}`),
  cancel: (id: string) => request<{ cancelled: boolean }>(`/api/runs/${id}/cancel`, { method: 'POST' }),
  resume: (id: string) => request<{ run: RunRow }>(`/api/runs/${id}/resume`, { method: 'POST' }),
  feedback: (id: string, category: string, details: string, target?: string) => request<{ id: string }>(`/api/runs/${id}/feedback`, { method: 'POST', body: JSON.stringify({ category, details, target }) }),
  simulate: (model: string, inputs: Record<string, number>) => request<ModelOutput & { steps?: Array<{ t_h: number; setpointK: number; phase: string }>; totalHours?: number; note?: string }>('/api/interventions/simulate', { method: 'POST', body: JSON.stringify({ model, inputs }) }),
  reportUrl: (id: string, format: 'md' | 'json') => `/api/runs/${id}/report.${format}`,
  investigate: (id: string, key: string, search = false) => request<{ investigation: InvestigationView }>(`/api/runs/${id}/investigate`, { method: 'POST', body: JSON.stringify({ key, search }) }),
  comparison: (siteId: string, target: string) => request<{ site: string; target: string; comparisons: ComparisonView[] }>(`/api/sites/${siteId}/comparison?target=${target}`),
};

/** Subscribe to a run's event stream; replays history first. Returns an unsubscribe function. */
export function streamRun(id: string, onEvent: (event: AgentEvent) => void, onEnd: () => void) {
  const source = new EventSource(`/api/runs/${id}/stream`);
  const handler = (message: MessageEvent) => {
    try {
      const row = JSON.parse(message.data);
      if (row.type === 'end') {
        source.close();
        onEnd();
        return;
      }
      onEvent(row);
    } catch {
      /* ignore malformed frames */
    }
  };
  for (const type of ['status', 'tool_call', 'tool_result', 'llm_turn', 'plan', 'error', 'end']) source.addEventListener(type, handler as EventListener);
  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED) onEnd();
  };
  return () => source.close();
}
