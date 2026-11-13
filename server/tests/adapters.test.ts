/**
 * Integration tests for the external-component adapters. They run the real,
 * pinned repositories through the Python bridge with no network: Earth-Location-
 * Nasa with a zero search budget, the Reranker in deterministic-baseline mode.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBridge } from '../evidence/python.ts';
import { components } from '../config.ts';

// These exercise the optional external components; they are skipped when those are not installed.
const bothSkip = components.validator && components.reranker ? false : 'optional external components not installed';
const validatorSkip = components.validator ? false : 'Earth-Location-Nasa not installed';
const rerankerSkip = components.reranker ? false : 'Reranker not installed';

test('bridge loads both pinned repositories', { skip: bothSkip }, async () => {
  const out = await runBridge<{ ok: boolean }>({ cmd: 'ping' });
  assert.equal(out.ok, true);
});

test('Earth-Location-Nasa adapter: offline validation keeps unknowns unknown', { skip: validatorSkip }, async () => {
  const run = await runBridge<Record<string, any>>({
    cmd: 'validate',
    query: 'lunar analog field test',
    target: { id: 'moon_south_pole', body: 'moon', conditions: ['south pole'] },
    missions: [{ id: 'rover_navigation', objectives: ['navigation'], constraints: [{ id: 'slope', feature: 'terrain.slopeP95', limit: 12, unit: 'deg', direction: 'max', source: 'test recipe', hard: true }] }],
    candidates: [{ original_similarity: null, units: { 'terrain.slopeP95': 'deg' }, metadata: { 'terrain.slopeP95': { resolution_m: 40, period: '2011-2015' } }, site: { id: 'atacama', name: 'Atacama', lat: -23.5, lon: -68.2, tags: [], climate: {}, terrain: { slopeP95: 0.16 }, evidence: {}, missing: [] } }],
    allowed_domains: ['nasa.gov'],
    max_search_calls: 0,
  });
  assert.equal(run.search_calls, 0);
  assert.equal(run.results[0].eligibility, 'unresolved', 'missing uncertainty keeps the constraint unresolved');
  const numeric = run.results[0].findings.find((f: any) => f.category === 'numeric_constraint');
  assert.equal(numeric.calculation.outcome, 'unknown');
  assert.ok(run.search_reports.every((r: any) => r.status === 'budget_exhausted'));
});

test('Reranker adapter: baseline ranks by weighted distance with missing-evidence bounds', { skip: rerankerSkip }, async () => {
  const result = await runBridge<Record<string, any>>({
    cmd: 'rerank',
    mode: 'baseline',
    baseline_weights: { slope: 1, dust: 0.5 },
    request: {
      mission: 'rover test',
      target: { world: 'moon', id: 'moon_south_pole', name: 'Lunar south pole' },
      score_scale: { min: 0, max: 100, higher_is_better: true },
      features: [{ id: 'slope', description: 'slope' }, { id: 'dust', description: 'dust' }],
      candidates: [
        { id: 'a', name: 'A', similarities: { slope: 90, dust: 50 } },
        { id: 'b', name: 'B', similarities: { slope: 100, dust: null } },
        { id: 'c', name: 'C', similarities: { slope: 40, dust: 100 } },
      ],
    },
  });
  assert.equal(result.weight_source, 'odyssey_requirement_weights');
  const byId = Object.fromEntries(result.ranking.map((r: any) => [r.id, r]));
  assert.equal(byId.b.status, 'provisional', 'a missing score yields a provisional bound, never a zero');
  assert.ok(byId.b.distance_upper_bound > byId.b.distance_lower_bound);
  assert.equal(result.ranking[0].id, 'a');
});
