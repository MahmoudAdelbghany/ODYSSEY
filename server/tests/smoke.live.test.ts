/**
 * Live provider smoke tests. Opt-in (ODYSSEY_SMOKE=1, `npm run test:smoke`) because
 * they spend real API budget. Skipped automatically without credentials.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../config.ts';
import { defaultProvider } from '../llm/provider.ts';
import { runBridge } from '../evidence/python.ts';
import { retrieveSource } from '../evidence/retrieve.ts';
import { verifyClaims } from '../evidence/verify.ts';
import { Store } from '../store.ts';

const live = process.env.ODYSSEY_SMOKE === '1';

test('OpenCode provider answers with a tool call', { skip: !live || !config.llm.apiKey }, async () => {
  const llm = defaultProvider();
  const result = await llm.chat({
    sessionId: 'odyssey-smoke',
    messages: [{ role: 'user', content: 'Call the ping tool with value 3.' }],
    tools: [{ name: 'ping', description: 'Ping with a value', parameters: { type: 'object', properties: { value: { type: 'number' } }, required: ['value'] } }],
  });
  assert.equal(result.toolCalls[0]?.name, 'ping');
  assert.equal(JSON.parse(result.toolCalls[0].arguments).value, 3);
});

test('Serper search through Earth-Location-Nasa filters', { skip: !live || !config.serper.apiKey }, async () => {
  const out = await runBridge<Record<string, any>>({ cmd: 'search', scope: 'planetary_target', body: 'moon', objectives: ['thermal'], query: 'Diviner polar surface temperature', allowed_domains: ['nasa.gov', 'usgs.gov'], limit: 6 });
  assert.ok(out.evidence.length + out.rejected > 0);
  for (const e of out.evidence) {
    assert.match(e.source_url, /^https:\/\/([a-z0-9-]+\.)*(nasa\.gov|usgs\.gov)\//);
    assert.equal(e.verification_status, 'pending_review');
  }
});

test('full-source verification of a NASA fact sheet value', { skip: !live || !config.llm.apiKey }, async () => {
  const store = new Store(':memory:');
  const url = 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html';
  const source = await retrieveSource(url, store);
  const result = await verifyClaims(url, source.text, { quantity: 'surface gravity of the Moon', query: 'surface gravity m/s2', value: 1.62, unit: 'm/s2' }, defaultProvider(), 'odyssey-smoke');
  assert.equal(result.status, 'supported', JSON.stringify(result.rejected));
});
