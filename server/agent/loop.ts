/**
 * Agent orchestration (PART 3.3).
 *
 * The LLM chooses tools; the runtime enforces budgets, timeouts, loop detection
 * and preconditions. If the LLM is unavailable or stops before the report, a
 * deterministic planner completes the remaining steps and the run is labelled
 * accordingly, the label is never hidden.
 */
import { components, config, redact, searchAvailable } from '../config.ts';
import { EVIDENCE_REGISTRY } from '../../src/mission/evidence.ts';
import { pendingGapKeys } from './investigate.ts';
import type { ChatMessage, LLMProvider } from '../llm/provider.ts';
import type { Store } from '../store.ts';
import { dropCache, ToolPrecondition } from './engine.ts';
import { initialState, type AgentState } from './state.ts';
import { TOOL_BY_NAME, TOOL_SPECS, ToolInputError, type ToolContext, type ToolResult } from './tools.ts';

export const SYSTEM_PROMPT = `You are ODYSSEY, a scientific mission-planning agent. You plan terrestrial analog campaigns that prepare for lunar and Martian exploration.

Your central task is not only to find where Earth resembles the target, but to find where Earth FAILS to resemble it, decide whether that failure matters for each experiment, and design a defensible way to bridge it (another site, a controlled intervention, a simulation), or state that it cannot be bridged.

Work only through tools. Tools do all arithmetic, unit handling, scoring and filtering; never compute or invent numbers yourself.

Rules you must never break:
- Search results are PENDING REVIEW. A claim is only verified by verify_source on a retrieved full source.
- Never invent citations, values, sites or facilities. Missing data stays missing.
- Never describe an Earth site as equivalent to the Moon or Mars.
- Intervention outputs are setpoints or first-order model results, never measurements.
- Learned reranking orders candidates only after hard constraints; it never overrides a rejection.
- An evidence gap is not an environmental mismatch. Keep three outcomes apart: a dataset exists but is not integrated (integration needed); the quantity cannot be measured remotely at the needed scale (field measurement required); Earth cannot reproduce the condition anywhere (physical mismatch). A failed search is not proof that data does not exist.

Typical workflow (adapt it; revisit steps when evidence is missing or contradictory):
1 parse_mission → decompose_experiments → extract_requirements (for the experiments that drive site choice)
2 discover_global_regions; search_planetary_reference for the target conditions that matter; retrieve_source + verify_source for 1–3 high-value planetary claims (e.g. surface temperature range, pressure, gravity)
3 rank_candidate_regions for EVERY experiment; detect_environmental_mismatch where it matters; analyze_temporal_window if windows are tight
4 search_earth_evidence for the 1–2 most promising sites; retrieve/verify a source when it can resolve a claim
5 rerank_evidence (target "candidates") for the experiments where several sites remain viable
6 investigate_evidence_gap for required conditions with no usable evidence and for unresolved Earth-wide gaps (e.g. metric:bearingStrength, dimension:thermal.inertia); say what exists, what is missing and the next measurement
7 find_intervention_options for Earth-wide gaps (gravity, vacuum, thermal extremes, radiation…); evaluate_intervention for the most important ones
8 optimize_campaign, then generate_mission_report. Write for a mission planner, in plain language: summary of at most 3 short sentences; at most 6 key_findings of one sentence each; what cannot be established; the measurements that would most improve the plan. Do not use em dashes, abbreviations like "deg" (write °), or internal identifiers when a plain name exists.

Budgets: ${config.budgets.maxToolCalls} tool calls, ${config.budgets.maxSearchCalls} search calls, ${config.budgets.maxSourceFetches} source fetches. Be economical: do not repeat identical calls. Keep your own messages short; put substance in the final report.`;

type Emit = (type: string, payload: unknown) => void;

/** Tool calls held back so a run can always finish its required steps and report. */
const COMPLETION_RESERVE = 12;
const RESERVED = new Set(['rank_candidate_regions', 'optimize_campaign', 'generate_mission_report']);

function compact(result: ToolResult): string {
  const text = JSON.stringify({ summary: result.summary, data: result.data });
  return text.length > 9000 ? `${text.slice(0, 9000)}…[truncated]` : text;
}

function argsKey(name: string, args: Record<string, unknown>) {
  return `${name}:${JSON.stringify(args, Object.keys(args).sort())}`;
}

export async function executeTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<{ ok: boolean; result: ToolResult | null; error: string | null; ms: number }> {
  const tool = TOOL_BY_NAME.get(name);
  const started = Date.now();
  const { state } = ctx;
  if (!tool) return { ok: false, result: null, error: `Unknown tool "${name}".`, ms: 0 };
  const key = argsKey(name, args);
  if (state.budgets.toolCalls >= config.budgets.maxToolCalls + (RESERVED.has(name) ? COMPLETION_RESERVE : 0)) {
    state.toolHistory.push({ tool: name, argsKey: key, ok: false, ms: 0 });
    ctx.emit('tool_result', { tool: name, ok: false, ms: 0, error: 'budget: tool-call budget exhausted' });
    return { ok: false, result: null, error: 'Tool-call budget exhausted. Call generate_mission_report now.', ms: 0 };
  }
  const repeats = state.toolHistory.filter((h) => h.argsKey === key && h.ok).length;
  if (repeats >= 1 && !['generate_mission_report'].includes(name)) {
    return { ok: false, result: null, error: `Duplicate call: ${name} was already executed with identical arguments. Use the earlier result or different arguments.`, ms: 0 };
  }
  state.budgets.toolCalls += 1;
  ctx.emit('tool_call', { tool: name, args, call: state.budgets.toolCalls });
  try {
    const timeout = AbortSignal.timeout(config.budgets.toolTimeoutMs);
    const signal = AbortSignal.any([ctx.signal, timeout]);
    const result = await Promise.race([
      tool.run(args, { ...ctx, signal }),
      new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(new Error(ctx.signal.aborted ? 'cancelled' : `tool timed out after ${config.budgets.toolTimeoutMs} ms`)), { once: true })),
    ]);
    const ms = Date.now() - started;
    state.toolHistory.push({ tool: name, argsKey: key, ok: true, ms });
    ctx.emit('tool_result', { tool: name, ok: true, ms, summary: result.summary, evidenceRefs: result.evidenceRefs ?? [], data: result.data });
    return { ok: true, result, error: null, ms };
  } catch (error) {
    const ms = Date.now() - started;
    const kind = error instanceof ToolPrecondition ? 'precondition' : error instanceof ToolInputError ? 'invalid_input' : 'error';
    const message = redact(`${kind}: ${(error as Error).message}`);
    state.toolHistory.push({ tool: name, argsKey: key, ok: false, ms });
    ctx.emit('tool_result', { tool: name, ok: false, ms, error: message });
    return { ok: false, result: null, error: message, ms };
  }
}

/** Deterministic next step: used without an LLM, or to finish after the LLM stops. */
export function nextDeterministicStep(state: AgentState): { tool: string; args: Record<string, unknown> } | null {
  const done = (name: string, match?: (key: string) => boolean) => state.toolHistory.some((h) => h.ok && h.tool === name && (!match || match(h.argsKey)));
  const attempted = (name: string, match?: (key: string) => boolean) => state.toolHistory.some((h) => h.tool === name && (!match || match(h.argsKey)));
  if (!state.parsed) return { tool: 'parse_mission', args: {} };
  if (!state.mission) return { tool: 'decompose_experiments', args: {} };
  if (!state.parsed.target) return { tool: 'generate_mission_report', args: {} };
  const experiments = state.mission.experiments.map((e) => e.id);
  // Budget spent: only the steps required for a report remain.
  if (state.budgets.toolCalls >= config.budgets.maxToolCalls) {
    for (const id of experiments) if (!state.candidates[id]) return { tool: 'rank_candidate_regions', args: { experiment_id: id } };
    if (!state.campaign) return { tool: 'optimize_campaign', args: {} };
    return { tool: 'generate_mission_report', args: {} };
  }
  for (const id of experiments) if (!attempted('extract_requirements', (k) => k.includes(`"${id}"`))) return { tool: 'extract_requirements', args: { experiment_id: id } };
  if (!attempted('discover_global_regions')) return { tool: 'discover_global_regions', args: {} };
  const attempts = (name: string, match: (key: string) => boolean) => state.toolHistory.filter((h) => h.tool === name && match(h.argsKey)).length;
  // Required step: retry after a failure (bounded), never skip it because an earlier attempt failed.
  for (const id of experiments) if (!state.candidates[id] && attempts('rank_candidate_regions', (k) => k.includes(`"${id}"`)) < 3) return { tool: 'rank_candidate_regions', args: { experiment_id: id } };
  const hasSearch = searchAvailable();
  const thermal = experiments.find((id) => /thermal/.test(id)) ?? experiments[0];
  if (hasSearch && !attempted('search_planetary_reference')) {
    return { tool: 'search_planetary_reference', args: { experiment_id: thermal, query: state.parsed.body === 'Moon' ? 'south pole surface temperature Diviner' : 'Jezero surface temperature MEDA' } };
  }
  const planetary = state.evidence.filter((e) => e.scope === 'planetary_target');
  const toVerify = planetary.find((e) => e.status === 'pending_review' && /nasa\.gov|esa\.int|usgs\.gov/.test(e.url) && !attempted('verify_source', (k) => k.includes(e.url)));
  if (toVerify && state.budgets.sourceFetches < Math.min(3, config.budgets.maxSourceFetches) && state.evidence.filter((e) => e.verification).length < 2) {
    return { tool: 'verify_source', args: { url: toVerify.url, quantity: 'surface temperature', dimension: 'thermal.surfaceRange' } };
  }
  const topSite = (id: string) => state.candidates[id]?.find((c) => c.decision !== 'rejected')?.siteId;
  for (const id of experiments) {
    const site = topSite(id);
    if (site && !attempted('detect_environmental_mismatch', (k) => k.includes(`"${id}"`))) return { tool: 'detect_environmental_mismatch', args: { experiment_id: id } };
  }
  if (hasSearch && !attempted('search_earth_evidence') && state.budgets.searchCalls + 2 <= config.budgets.maxSearchCalls) {
    const site = topSite(experiments[0]);
    if (site) return { tool: 'search_earth_evidence', args: { site_ids: [site], experiment_ids: [experiments[0]] } };
  }
  for (const id of experiments) {
    const viable = state.candidates[id]?.filter((c) => c.decision !== 'rejected').length ?? 0;
    if (components.reranker && viable >= 3 && !attempted('rerank_evidence', (k) => k.includes(`"${id}"`)) && state.reranks.filter((r) => r.target === 'candidates').length < 2) {
      return { tool: 'rerank_evidence', args: { target: 'candidates', experiment_id: id, top_k: 6 } };
    }
  }
  // Investigate evidence gaps instead of stopping at "no data" (bounded, deterministic order).
  const gapKeys = pendingGapKeys(state);
  const investigated = state.evidenceInvestigations ?? {};
  const nextGap = [...new Set(gapKeys)].slice(0, 8).find((key) => !investigated[key] && !attempted('investigate_evidence_gap', (k) => k.includes(`"${key}"`)));
  if (nextGap) {
    const spec = nextGap.startsWith('metric:') ? EVIDENCE_REGISTRY[nextGap.slice(7)] : null;
    const search = hasSearch && spec?.stateWithoutValue === 'source_found_not_integrated' && state.budgets.searchCalls + 2 <= config.budgets.maxSearchCalls;
    return { tool: 'investigate_evidence_gap', args: { key: nextGap, search } };
  }
  for (const id of experiments) {
    if (!attempted('find_intervention_options', (k) => k.includes(`"${id}"`)) && (state.earthWideGaps[id] ?? []).some((g) => g.kind === 'not_reproducible_by_site_choice')) {
      return { tool: 'find_intervention_options', args: { experiment_id: id } };
    }
  }
  const evaluated = new Set(state.interventionEvaluations.map((e) => e.interventionId));
  const modelled = state.interventions.filter((s) => s.model && !evaluated.has(s.id) && !attempted('evaluate_intervention', (k) => k.includes(s.id)));
  const seenModels = new Set(state.interventions.filter((s) => evaluated.has(s.id)).map((s) => s.model));
  const nextModel = modelled.find((s) => !seenModels.has(s.model));
  if (nextModel) return { tool: 'evaluate_intervention', args: { intervention_id: nextModel.id } };
  if (!state.campaign && attempts('optimize_campaign', () => true) < 3) return { tool: 'optimize_campaign', args: {} };
  if (!state.report && !done('generate_mission_report')) return { tool: 'generate_mission_report', args: {} };
  return null;
}

export interface RunHandle {
  runId: string;
  controller: AbortController;
  promise: Promise<void>;
}

export class AgentRunner {
  private active = new Map<string, RunHandle>();
  private listeners = new Map<string, Set<(event: unknown) => void>>();

  constructor(private readonly store: Store, private readonly llmFactory: () => LLMProvider | null) {}

  activeCount() {
    return this.active.size;
  }

  isActive(runId: string) {
    return this.active.has(runId);
  }

  subscribe(runId: string, listener: (event: unknown) => void) {
    const set = this.listeners.get(runId) ?? new Set();
    set.add(listener);
    this.listeners.set(runId, set);
    return () => set.delete(listener);
  }

  private emitter(runId: string): Emit {
    return (type, payload) => {
      const row = this.store.appendEvent(runId, type, payload);
      for (const listener of this.listeners.get(runId) ?? []) listener(row);
    };
  }

  start(brief: string, options: { planner?: 'auto' | 'deterministic' } = {}) {
    if (this.active.size >= config.budgets.maxConcurrentRuns) throw new Error('busy');
    const llm = options.planner === 'deterministic' ? null : this.llmFactory();
    const planner = llm?.available() ? 'llm' : 'deterministic';
    const run = this.store.createRun(brief, planner, llm?.available() ? llm.model : null, options);
    const state = initialState(run.id, brief);
    this.launch(run.id, state, [], llm?.available() ? llm : null);
    return run;
  }

  resume(runId: string) {
    if (this.active.has(runId)) throw new Error('already running');
    if (this.active.size >= config.budgets.maxConcurrentRuns) throw new Error('busy');
    const snapshot = this.store.loadSnapshot(runId);
    if (!snapshot) throw new Error('no snapshot to resume');
    const llm = this.llmFactory();
    const run = this.store.getRun(runId)!;
    const useLlm = run.planner !== 'deterministic' && llm?.available() ? llm : null;
    this.launch(runId, snapshot.state as AgentState, snapshot.messages as ChatMessage[], useLlm);
    return this.store.getRun(runId)!;
  }

  cancel(runId: string) {
    const handle = this.active.get(runId);
    if (!handle) return false;
    handle.controller.abort();
    return true;
  }

  private launch(runId: string, state: AgentState, messages: ChatMessage[], llm: LLMProvider | null) {
    const controller = new AbortController();
    const emit = this.emitter(runId);
    const timer = setTimeout(() => controller.abort(), config.budgets.runTimeoutMs);
    const promise = this.loop(runId, state, messages, llm, controller.signal, emit)
      .catch((error) => {
        const cancelled = controller.signal.aborted;
        this.store.setStatus(runId, cancelled ? 'cancelled' : 'failed', redact((error as Error).message));
        emit('status', { status: cancelled ? 'cancelled' : 'failed', error: redact((error as Error).message) });
      })
      .finally(() => {
        clearTimeout(timer);
        this.active.delete(runId);
        dropCache(runId);
        this.store.saveSnapshot(runId, state, messages);
        for (const listener of this.listeners.get(runId) ?? []) listener({ type: 'end' });
      });
    this.active.set(runId, { runId, controller, promise });
  }

  private async loop(runId: string, state: AgentState, messages: ChatMessage[], llm: LLMProvider | null, signal: AbortSignal, emit: Emit) {
    this.store.setStatus(runId, 'running');
    emit('status', { status: 'running', planner: llm ? `llm:${llm.model}` : 'deterministic', budgets: config.budgets });
    const ctx: ToolContext = { state, store: this.store, llm, signal, sessionId: `odyssey-${runId}`, emit };
    const checkpoint = () => this.store.saveSnapshot(runId, state, messages);

    if (llm) {
      if (!messages.length) {
        messages.push({ role: 'system', content: SYSTEM_PROMPT });
        messages.push({ role: 'user', content: `Mission brief:\n"""${state.brief}"""\n\nPlan it end to end. Start with parse_mission.` });
      } else {
        messages.push({ role: 'user', content: 'The run was resumed after an interruption. Continue from the current state; do not repeat completed steps.' });
      }
      let nudges = 0;
      let failures = 0;
      while (!state.report && !signal.aborted) {
        if (state.budgets.llmTurns >= config.budgets.maxLlmTurns || state.budgets.toolCalls >= config.budgets.maxToolCalls - COMPLETION_RESERVE) {
          emit('status', { note: 'LLM budget reached; deterministic planner completes the run.' });
          break;
        }
        state.budgets.llmTurns += 1;
        let reply;
        try {
          reply = await llm.chat({ messages, tools: TOOL_SPECS, sessionId: ctx.sessionId, signal, temperature: 0.2 });
          failures = 0;
        } catch (error) {
          if (signal.aborted) throw error;
          failures += 1;
          emit('error', { stage: 'llm', message: redact((error as Error).message), retryable: failures < 3 });
          if (failures >= 3) {
            emit('status', { note: 'LLM unavailable; deterministic planner completes the run.' });
            break;
          }
          continue;
        }
        state.budgets.promptTokens += reply.usage.promptTokens;
        state.budgets.completionTokens += reply.usage.completionTokens;
        emit('llm_turn', { turn: state.budgets.llmTurns, content: reply.content?.slice(0, 2000) ?? null, toolCalls: reply.toolCalls.map((c) => c.name), usage: reply.usage, latencyMs: reply.latencyMs, model: reply.model, finishReason: reply.finishReason });
        messages.push({ role: 'assistant', content: reply.content ?? '', tool_calls: reply.toolCalls });
        if (!reply.toolCalls.length) {
          if (nudges >= 2) {
            emit('status', { note: 'Agent stopped calling tools; deterministic planner completes the remaining required steps.' });
            break;
          }
          nudges += 1;
          messages.push({ role: 'user', content: 'Continue with tool calls. The run ends only when generate_mission_report succeeds.' });
          continue;
        }
        for (const call of reply.toolCalls.slice(0, 6)) {
          if (signal.aborted) break;
          let args: Record<string, unknown> = {};
          let parseError: string | null = null;
          try {
            args = call.arguments ? JSON.parse(call.arguments) : {};
            if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('arguments must be an object');
          } catch (error) {
            parseError = `invalid_input: arguments are not valid JSON (${(error as Error).message})`;
          }
          const outcome = parseError ? { ok: false, result: null, error: parseError, ms: 0 } : await executeTool(call.name, args, ctx);
          messages.push({ role: 'tool', tool_call_id: call.id, name: call.name, content: outcome.ok ? compact(outcome.result!) : JSON.stringify({ error: outcome.error }) });
          checkpoint();
        }
        // Skip tool calls beyond the per-turn limit explicitly so the transcript stays valid.
        for (const call of reply.toolCalls.slice(6)) messages.push({ role: 'tool', tool_call_id: call.id, name: call.name, content: JSON.stringify({ error: 'Too many parallel calls in one turn; re-issue this call.' }) });
      }
      if (signal.aborted) throw new Error('cancelled');
      if (!state.report) {
        this.store.setPlanner(runId, `llm:${llm.model}+deterministic-completion`);
      }
    }

    let guard = 0;
    while (!state.report && !signal.aborted && guard < 60) {
      guard += 1;
      const step = nextDeterministicStep(state);
      if (!step) break;
      emit('plan', { planner: 'deterministic', step });
      const outcome = await executeTool(step.tool, step.args, ctx);
      if (!outcome.ok && step.tool === 'generate_mission_report') {
        throw new Error(`Report could not be generated: ${outcome.error}`);
      }
      checkpoint();
    }
    if (signal.aborted) throw new Error('cancelled');
    if (!state.report) throw new Error('The run ended without a report (budget exhausted or no feasible next step).');
    this.store.saveReport(runId, state.report);
    this.store.setStatus(runId, 'completed');
    emit('status', { status: 'completed', budgets: state.budgets });
  }
}
