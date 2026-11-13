import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../store.ts';
import { AgentRunner, executeTool, nextDeterministicStep } from '../agent/loop.ts';
import { initialState, type AgentState } from '../agent/state.ts';
import { TOOL_BY_NAME, TOOL_SPECS, type ToolContext } from '../agent/tools.ts';
import { config } from '../config.ts';
import { FakeLLM, SAMPLE_BRIEF, call, waitFor } from './helpers.ts';

function ctx(state: AgentState, store = new Store(':memory:')): ToolContext {
  store.createRun(state.brief, 'test', null, {});
  return { state, store, llm: null, signal: new AbortController().signal, sessionId: 'test', emit: () => undefined };
}

async function run(state: AgentState, c: ToolContext, name: string, args: Record<string, unknown> = {}) {
  const out = await executeTool(name, args, c);
  if (!out.ok) throw new Error(out.error ?? 'failed');
  return out.result!;
}

test('the registry exposes the 18 required tools with JSON schemas', () => {
  const required = ['parse_mission', 'decompose_experiments', 'extract_requirements', 'discover_global_regions', 'search_earth_evidence', 'search_planetary_reference', 'retrieve_source', 'verify_source', 'compare_measurements', 'evaluate_requirement', 'detect_environmental_mismatch', 'rank_candidate_regions', 'rerank_evidence', 'analyze_temporal_window', 'find_intervention_options', 'evaluate_intervention', 'optimize_campaign', 'generate_mission_report'];
  for (const name of required) assert.ok(TOOL_BY_NAME.has(name), name);
  for (const spec of TOOL_SPECS) assert.equal((spec.parameters as { type: string }).type, 'object');
});

test('mission parsing and decomposition (deterministic parser)', async () => {
  const state = initialState('t1', SAMPLE_BRIEF);
  const c = ctx(state);
  const parsed = await run(state, c, 'parse_mission');
  assert.match(parsed.summary, /Target Moon/);
  assert.equal(state.parsed?.durationDays, 7);
  await run(state, c, 'decompose_experiments');
  assert.deepEqual(state.mission!.experiments.map((e) => e.id), ['geological_sampling', 'rover_navigation', 'equipment_deployment', 'thermal_survival', 'dust_aeolian']);
});

test('preconditions, invalid input, unknown tools and duplicate calls are refused', async () => {
  const state = initialState('t2', SAMPLE_BRIEF);
  const c = ctx(state);
  const early = await executeTool('rank_candidate_regions', { experiment_id: 'x' }, c);
  assert.equal(early.ok, false);
  assert.match(early.error!, /precondition/);
  assert.match((await executeTool('no_such_tool', {}, c)).error!, /Unknown tool/);
  await run(state, c, 'parse_mission');
  await run(state, c, 'decompose_experiments');
  assert.match((await executeTool('extract_requirements', { experiment_id: 'not_real' }, c)).error!, /invalid_input/);
  await run(state, c, 'extract_requirements', { experiment_id: 'rover_navigation' });
  const dup = await executeTool('extract_requirements', { experiment_id: 'rover_navigation' }, c);
  assert.match(dup.error!, /Duplicate call/);
});

test('hard constraints reject candidates; rejected pairs never enter the campaign', async () => {
  const state = initialState('t3', SAMPLE_BRIEF);
  const c = ctx(state);
  await run(state, c, 'parse_mission');
  await run(state, c, 'decompose_experiments');
  for (const e of state.mission!.experiments) await run(state, c, 'rank_candidate_regions', { experiment_id: e.id });
  const rover = state.candidates.rover_navigation;
  const rejected = rover.filter((x) => x.decision === 'rejected');
  assert.ok(rejected.length > 0);
  assert.ok(rejected.every((x) => x.reasons.length > 0));
  // A rejection can come from evidence insufficiency even with a high screening score.
  await run(state, c, 'optimize_campaign', {});
  for (const plan of state.campaign!.plans) {
    for (const stop of plan.stops) {
      for (const exp of stop.experiments) {
        const cand = state.candidates[exp.id].find((x) => x.siteId === stop.siteId)!;
        assert.notEqual(cand.decision, 'rejected', `${exp.id} scheduled at rejected ${stop.siteId}`);
      }
    }
  }
  assert.ok(state.campaign!.excludedPairs > 0);
});

test('temporal reconfiguration only invalidates rankings when the configuration changes', async () => {
  const state = initialState('t4', SAMPLE_BRIEF);
  const c = ctx(state);
  await run(state, c, 'parse_mission');
  await run(state, c, 'decompose_experiments');
  await run(state, c, 'rank_candidate_regions', { experiment_id: 'thermal_survival' });
  await run(state, c, 'analyze_temporal_window', { experiment_id: 'thermal_survival', duration_days: 7 });
  assert.ok(state.candidates.thermal_survival, 'unchanged config keeps rankings');
  await run(state, c, 'analyze_temporal_window', { experiment_id: 'thermal_survival', duration_days: 30 });
  assert.equal(state.candidates.thermal_survival, undefined, 'changed config invalidates rankings');
});

test('interventions are proposed for Earth-wide gaps and evaluated with labelled models', async () => {
  const state = initialState('t5', SAMPLE_BRIEF);
  const c = ctx(state);
  await run(state, c, 'parse_mission');
  await run(state, c, 'decompose_experiments');
  await run(state, c, 'rank_candidate_regions', { experiment_id: 'thermal_survival' });
  const gaps = state.earthWideGaps.thermal_survival.map((g) => g.dimension);
  assert.ok(gaps.includes('atmosphere.pressure'));
  assert.ok(gaps.includes('thermal.surfaceRange'), 'no Earth site covers the lunar surface envelope');
  await run(state, c, 'find_intervention_options', { experiment_id: 'thermal_survival' });
  const tvac = state.interventions.find((s) => s.model === 'radiative_equilibrium_plate')!;
  const result = await run(state, c, 'evaluate_intervention', { intervention_id: tvac.id });
  const evaluation = state.interventionEvaluations[0] as { label: string; defaults: string[] };
  assert.equal(evaluation.label, 'SIMULATED');
  assert.ok(evaluation.defaults.some((d) => /NOT reproduced/.test(d)), 'shroud-limited cold end is flagged as residual');
  assert.match(result.summary, /SIMULATED/);
});

test('report requires the whole pipeline and flags unknown identifiers in the narrative', async () => {
  const state = initialState('t6', SAMPLE_BRIEF);
  const c = ctx(state);
  await run(state, c, 'parse_mission');
  await run(state, c, 'decompose_experiments');
  const early = await executeTool('generate_mission_report', {}, c);
  assert.match(early.error!, /preconditions not met/);
  for (const e of state.mission!.experiments) await run(state, c, 'rank_candidate_regions', { experiment_id: e.id });
  await run(state, c, 'optimize_campaign', {});
  await run(state, c, 'generate_mission_report', { summary: 'Use atacama and fake_site_zz for rover_navigation.' });
  const report = state.report as { narrative: { check: string }; graph: { nodes: unknown[] }; markdown: string };
  assert.match(report.narrative.check, /fake_site_zz/);
  assert.ok(report.graph.nodes.length > 20);
  assert.match(report.markdown, /Where Earth does not match/);
  assert.match(report.markdown, /Scientific integrity/);
});

test('deterministic planner completes a full run offline (no LLM, no search)', async () => {
  const store = new Store(':memory:');
  const runner = new AgentRunner(store, () => null);
  const saved = config.serper.apiKey;
  (config.serper as { apiKey: string }).apiKey = '';
  try {
    const row = runner.start(SAMPLE_BRIEF, { planner: 'deterministic' });
    await waitFor(() => !runner.isActive(row.id));
    const done = store.getRun(row.id)!;
    assert.equal(done.status, 'completed', done.error ?? '');
    assert.equal(done.planner, 'deterministic');
    const events = store.events(row.id);
    assert.ok(events.filter((e) => e.type === 'tool_result').length >= 15);
    assert.ok(store.getReport(row.id));
  } finally {
    (config.serper as { apiKey: string }).apiKey = saved;
  }
});

test('LLM tool selection, budget accounting, and deterministic completion when the model stops', async () => {
  const store = new Store(':memory:');
  const saved = config.serper.apiKey;
  (config.serper as { apiKey: string }).apiKey = '';
  const llm = new FakeLLM((_req, i) => {
    if (i === 0) return { toolCalls: [call('parse_mission')] };
    if (i === 1) return { toolCalls: [call('decompose_experiments')] };
    if (i === 2) return { toolCalls: [call('rank_candidate_regions', { experiment_id: 'thermal_survival' }), call('compare_measurements', { site_id: 'atacama', dimensions: ['gravity.surface'] })] };
    return { content: 'I am done.' };
  }, 'agent');
  const runner = new AgentRunner(store, () => llm);
  try {
    const row = runner.start(SAMPLE_BRIEF);
    await waitFor(() => !runner.isActive(row.id));
    const done = store.getRun(row.id)!;
    assert.equal(done.status, 'completed', done.error ?? '');
    assert.match(done.planner, /deterministic-completion/);
    const tools = store.events(row.id).filter((e) => e.type === 'tool_call').map((e) => (e.payload as { tool: string }).tool);
    assert.deepEqual(tools.slice(0, 4), ['parse_mission', 'decompose_experiments', 'rank_candidate_regions', 'compare_measurements']);
    // Tool results were fed back to the model as tool messages.
    assert.ok(llm.calls.filter((c) => c.tools?.length)[3].messages.some((m) => m.role === 'tool' && m.name === 'compare_measurements'));
  } finally {
    (config.serper as { apiKey: string }).apiKey = saved;
  }
});

test('malformed tool arguments are reported back to the model, not executed', async () => {
  const store = new Store(':memory:');
  const llm = new FakeLLM((_req, i) => (i === 0 ? { toolCalls: [{ id: 'x1', name: 'parse_mission', arguments: '{not json' }] } : { content: 'stop' }), 'agent');
  const runner = new AgentRunner(store, () => llm);
  const saved = config.serper.apiKey;
  (config.serper as { apiKey: string }).apiKey = '';
  try {
    const row = runner.start(SAMPLE_BRIEF);
    await waitFor(() => !runner.isActive(row.id));
    const toolMsg = llm.calls.filter((c) => c.tools?.length)[1].messages.find((m) => m.role === 'tool');
    assert.ok(toolMsg && 'content' in toolMsg && /invalid_input/.test(toolMsg.content));
  } finally {
    (config.serper as { apiKey: string }).apiKey = saved;
  }
});

test('cancellation stops the run and persists state; resume continues from the snapshot', async () => {
  const store = new Store(':memory:');
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => (release = r));
  const llm = new FakeLLM((_req, i) => (i === 0 ? { toolCalls: [call('parse_mission')] } : { toolCalls: [call('decompose_experiments')] }), 'agent');
  const slow = { ...llm, name: 'slow', model: 'slow', available: () => true, chat: async (req: Parameters<FakeLLM['chat']>[0]) => {
    if (req.tools?.length && llm.turns === 1) await Promise.race([gate, new Promise((_, rej) => req.signal?.addEventListener('abort', () => rej(new Error('aborted'))))]);
    return llm.chat(req);
  } };
  const runner = new AgentRunner(store, () => slow);
  const row = runner.start(SAMPLE_BRIEF);
  await waitFor(() => store.events(row.id).some((e) => e.type === 'tool_result'));
  assert.ok(runner.cancel(row.id));
  await waitFor(() => !runner.isActive(row.id));
  release();
  assert.equal(store.getRun(row.id)!.status, 'cancelled');
  const snap = store.loadSnapshot(row.id)!.state as AgentState;
  assert.ok(snap.parsed, 'parse result survived cancellation');

  const saved = config.serper.apiKey;
  (config.serper as { apiKey: string }).apiKey = '';
  try {
    const offline = new AgentRunner(store, () => null);
    offline.resume(row.id);
    await waitFor(() => !offline.isActive(row.id));
    const after = store.getRun(row.id)!;
    assert.equal(after.status, 'completed', after.error ?? '');
    const resumedState = store.loadSnapshot(row.id)!.state as AgentState;
    assert.equal(resumedState.toolHistory.filter((h) => h.tool === 'parse_mission' && h.ok).length, 1, 'completed steps are not repeated');
  } finally {
    (config.serper as { apiKey: string }).apiKey = saved;
  }
});

test('budget exhaustion is recorded and the planner falls back to required steps only', () => {
  const state = initialState('t9', SAMPLE_BRIEF);
  state.parsed = { target: 'moon_south_pole', body: 'Moon', profile: 'expedition', durationDays: 7, crew: null, selections: [], keywordSelections: [], unmatchedIntents: [], parser: 'deterministic', notes: [] };
  state.mission = { experiments: [{ id: 'rover_navigation' }] } as AgentState['mission'];
  state.budgets.toolCalls = config.budgets.maxToolCalls;
  assert.deepEqual(nextDeterministicStep(state), { tool: 'rank_candidate_regions', args: { experiment_id: 'rover_navigation' } });
});

test('a source verified for several quantities keeps every result; status aggregates', async () => {
  const { Store: S } = await import('../store.ts');
  const store = new S(':memory:');
  const url = 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html';
  store.putSource({ url, sha256: 'x', retrievedAt: new Date().toISOString(), status: 200, contentType: 'text/html', title: 'Moon Fact Sheet', publishedDate: null, doi: null, bytes: 10, text: 'Surface gravity (m/s2) is 1.62 at the mean radius of the Moon. The temperature difference between day and night reaches 300 K on the lunar surface.' });
  const state = initialState('t10', SAMPLE_BRIEF);
  const llm = new FakeLLM((req) => {
    const user = req.messages.map((m) => ('content' in m ? m.content : '')).join(' ');
    return { content: JSON.stringify({ claims: /gravity/.test(user.split('Passages:')[0]) ? [{ passage: 0, quote: 'Surface gravity (m/s2) is 1.62', value: 1.62, min: null, max: null, unit: 'm/s2' }] : [] }) };
  });
  const c: ToolContext = { state, store, llm, signal: new AbortController().signal, sessionId: 't', emit: () => undefined };
  store.createRun(SAMPLE_BRIEF, 't', null, {});
  await run(state, c, 'parse_mission');
  await run(state, c, 'verify_source', { url, quantity: 'surface gravity', value: 1.62, unit: 'm/s2' });
  await run(state, c, 'verify_source', { url, quantity: 'surface temperature range', range_min: 50, range_max: 250, unit: 'K' });
  const item = state.evidence.find((e) => e.url === url)!;
  assert.equal(item.verifications!.length, 2);
  assert.equal(item.status, 'supported', 'a later unresolved check must not erase an earlier supported one');
});
