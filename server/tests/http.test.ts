import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

// Configure before the server modules load: an API token and no external search.
process.env.ODYSSEY_API_TOKEN = 'test-token-0123456789';
process.env.SERPER_API_KEY = '';

const { config } = await import('../config.ts');
const { Store } = await import('../store.ts');
const { AgentRunner } = await import('../agent/loop.ts');
const { createApp } = await import('../index.ts');
const { SAMPLE_BRIEF, waitFor } = await import('./helpers.ts');

let server: Server;
let base = '';
let runner: InstanceType<typeof AgentRunner>;
const auth = { authorization: `Bearer ${process.env.ODYSSEY_API_TOKEN}`, 'content-type': 'application/json' };

before(async () => {
  (config.serper as { apiKey: string }).apiKey = '';
  const store = new Store(':memory:');
  runner = new AgentRunner(store, () => null);
  server = createApp(store, runner);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

test('health reports capabilities without leaking secrets', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(!/oc_sk_|test-token/.test(text));
  if (config.llm.apiKey) assert.ok(!text.includes(config.llm.apiKey));
});

test('mutating endpoints require the bearer token when configured', async () => {
  const res = await fetch(`${base}/api/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brief: SAMPLE_BRIEF }) });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, 'unauthorized');
});

test('input validation returns structured errors', async () => {
  const short = await fetch(`${base}/api/runs`, { method: 'POST', headers: auth, body: JSON.stringify({ brief: 'moon' }) });
  assert.equal(short.status, 422);
  const bad = await fetch(`${base}/api/runs`, { method: 'POST', headers: auth, body: '{nope' });
  assert.equal(bad.status, 400);
  const sim = await fetch(`${base}/api/interventions/simulate`, { method: 'POST', headers: auth, body: JSON.stringify({ model: 'gravity_offload_statics', inputs: { massKg: 100, targetG: 50 } }) });
  assert.equal(sim.status, 422);
  const unknown = await fetch(`${base}/api/runs/not-a-uuid`);
  assert.equal(unknown.status, 400);
});

test('a full run over HTTP: start, events, report export, feedback', async () => {
  const res = await fetch(`${base}/api/runs`, { method: 'POST', headers: auth, body: JSON.stringify({ brief: SAMPLE_BRIEF, planner: 'deterministic' }) });
  assert.equal(res.status, 202);
  const { run } = await res.json();
  await waitFor(() => !runner.isActive(run.id));
  const detail = await (await fetch(`${base}/api/runs/${run.id}`)).json();
  assert.equal(detail.run.status, 'completed');
  assert.ok(detail.state.campaign.plans.length >= 1);
  const events = await (await fetch(`${base}/api/runs/${run.id}/events`)).json();
  assert.ok(events.events.some((e: { type: string }) => e.type === 'tool_result'));
  const md = await fetch(`${base}/api/runs/${run.id}/report.md`);
  assert.equal(md.status, 200);
  const markdown = await md.text();
  assert.match(markdown, /# ODYSSEY mission plan/);
  assert.match(markdown, /What ODYSSEY could not establish/);
  const json = await (await fetch(`${base}/api/runs/${run.id}/report.json`)).json();
  assert.ok(json.graph.nodes.some((n: { type: string }) => n.type === 'mismatch'));
  assert.ok(json.graph.nodes.some((n: { type: string }) => n.type === 'recommendation'));
  const fb = await fetch(`${base}/api/runs/${run.id}/feedback`, { method: 'POST', headers: auth, body: JSON.stringify({ category: 'scientific_correction', details: 'Check Devon MODIS window.' }) });
  assert.equal(fb.status, 201);
  assert.equal((await fb.json()).reviewStatus, 'pending_review');
  const stream = await fetch(`${base}/api/runs/${run.id}/stream`);
  const body = await stream.text();
  assert.match(body, /event: tool_result/);
  assert.match(body, /event: end/);
});

test('site comparison endpoint never compares across quantities', async () => {
  const res = await (await fetch(`${base}/api/sites/atacama/comparison?target=moon_south_pole`)).json();
  const gravity = res.comparisons.find((c: { dimension: string }) => c.dimension === 'gravity.surface');
  assert.equal(gravity.classification, 'not_naturally_reproducible');
  const inertia = res.comparisons.find((c: { dimension: string }) => c.dimension === 'thermal.inertia');
  assert.equal(inertia.classification, 'missing');
});
