import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convert, differentQuantity, judge, passages, verifyClaims } from '../evidence/verify.ts';
import { hostAllowed, htmlToText } from '../evidence/retrieve.ts';
import { bm25, kendallTau } from '../rerank/bm25.ts';
import { FakeLLM } from './helpers.ts';

const SOURCE = `Introduction. The Diviner instrument mapped the lunar south polar region in detail.
Results. Polar surface temperatures range from 50 K to 250 K over a year at the sampled sites.
In permanently shadowed regions the subsurface temperature is estimated at 38 K.
The temperature difference between day and night reaches 200 K at the equator.
References
Smith, J., et al. A paper, https://doi.org/10.0000/abc, 2010. Doe, A., et al., 2011.`;

test('unit conversion is deterministic and refuses incompatible dimensions', () => {
  assert.equal(convert(0, '°C', 'K'), 273.15);
  assert.equal(convert(6.36, 'mbar', 'Pa'), 636);
  assert.equal(convert(1, 'kPa', 'Pa'), 1000);
  assert.equal(convert(1, 'K', 'Pa'), null);
});

test('judge: envelopes must agree at both bounds; overlap alone is not support', () => {
  assert.equal(judge({ value: null, range: [50, 250], unit: 'K' }, { quantity: 't', query: '', range: [50, 250], unit: 'K' }).relation, 'supports');
  assert.equal(judge({ value: null, range: [26, 389], unit: 'K' }, { quantity: 't', query: '', range: [50, 250], unit: 'K' }).relation, 'contradicts');
  assert.equal(judge({ value: 120, range: null, unit: 'K' }, { quantity: 't', query: '', range: [50, 250], unit: 'K' }).relation, 'consistent', 'a point inside an envelope does not establish it');
  assert.equal(judge({ value: 1.62, range: null, unit: 'm/s2' }, { quantity: 'g', query: '', value: 1.62, unit: 'm/s2' }).relation, 'supports');
  assert.equal(judge({ value: 10, range: null, unit: 'K' }, { quantity: 't', query: '', range: [50, 250], unit: 'K' }).relation, 'contradicts');
  assert.equal(judge({ value: 6.36, range: null, unit: 'mbar' }, { quantity: 'p', query: '', value: 636, unit: 'Pa' }).relation, 'supports');
  assert.equal(judge({ value: 5, range: null, unit: 'K' }, { quantity: 't', query: '' }).relation, 'unresolved');
});

test('quantity qualifiers separate different physical quantities', () => {
  assert.equal(differentQuantity('The temperature difference between day and night reaches 200 K', 'surface temperature range'), 'difference');
  assert.equal(differentQuantity('the subsurface temperature is estimated at 38 K', 'surface temperature'), 'subsurface');
  assert.equal(differentQuantity('Polar surface temperatures range from 50 K to 250 K', 'surface temperature range'), null);
});

test('bibliography passages are dropped before the model sees them', async () => {
  assert.ok(passages(SOURCE).some((p) => p.includes('doi.org')), 'raw splitter keeps them');
  const llm = new FakeLLM(() => ({ content: '{"claims":[]}' }));
  await verifyClaims('https://example.nasa.gov/x', SOURCE, { quantity: 'surface temperature', query: 'paper Smith Doe temperature', unit: 'K' }, llm, 't');
  const sent = llm.calls[0].messages.map((m) => ('content' in m ? m.content : '')).join(' ');
  assert.ok(!sent.includes('doi.org'));
  assert.ok(sent.includes('50 K to 250 K'));
});

test('verifier keeps only verbatim, number-consistent, same-quantity claims', async () => {
  const llm = new FakeLLM(() => ({
    content: JSON.stringify({
      claims: [
        { passage: 0, quote: 'Polar surface temperatures range from 50 K to 250 K over a year', quantity: 'surface temperature', value: null, min: 50, max: 250, unit: 'K' },
        { passage: 0, quote: 'Polar surface temperatures range from 40 K to 260 K', quantity: 'surface temperature', value: null, min: 40, max: 260, unit: 'K' },
        { passage: 1, quote: 'the subsurface temperature is estimated at 38 K', quantity: 'surface temperature', value: 38, min: null, max: null, unit: 'K' },
        { passage: 2, quote: 'The temperature difference between day and night reaches 200 K', quantity: 'surface temperature', value: 200, min: null, max: null, unit: 'K' },
        { passage: 0, quote: 'Polar surface temperatures range from 50 K to 250 K over a year', quantity: 'surface temperature', value: 99, min: null, max: null, unit: 'K' },
      ],
    }),
  }));
  const result = await verifyClaims('https://example.nasa.gov/x', SOURCE, { quantity: 'polar surface temperature range', query: 'polar surface temperature', range: [50, 250], unit: 'K' }, llm, 'test');
  assert.equal(result.status, 'supported');
  assert.equal(result.claims.length, 1);
  const reasons = result.rejected.map((r) => r.reason).join(' | ');
  assert.match(reasons, /not found verbatim/);
  assert.match(reasons, /subsurface/);
  assert.match(reasons, /difference/);
  assert.match(reasons, /99 does not appear/);
});

test('without an LLM, numeric matches stay unresolved candidates', async () => {
  const result = await verifyClaims('https://example.nasa.gov/x', SOURCE, { quantity: 'polar surface temperature range', query: 'polar surface temperature', range: [50, 250], unit: 'K' }, null, 'test');
  assert.equal(result.status, 'unresolved');
  assert.ok(result.claims.every((c) => c.relation === 'unresolved'));
});

test('retrieval allow-list rejects lookalikes, credentials, ports and plain HTTP', () => {
  assert.ok(hostAllowed('https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html'));
  assert.ok(!hostAllowed('https://nasa.gov.evil.com/x'));
  assert.ok(!hostAllowed('https://evilnasa.gov/x'));
  assert.ok(!hostAllowed('http://nasa.gov/x'));
  assert.ok(!hostAllowed('https://user:pw@nasa.gov/x'));
  assert.ok(!hostAllowed('https://nasa.gov:8443/x'));
});

test('html extraction strips scripts and decodes entities', () => {
  const text = htmlToText('<html><script>alert(1)</script><p>T = 50&nbsp;K &plusmn; 2</p><style>p{}</style></html>');
  assert.equal(text, 'T = 50 K ± 2');
});

test('BM25 baseline and Kendall tau', () => {
  const hits = bm25('lunar dust mitigation', ['mars wind', 'lunar dust adhesion and mitigation', 'polar ice'], (d) => d);
  assert.equal(hits[0].item, 'lunar dust adhesion and mitigation');
  assert.equal(kendallTau(['a', 'b', 'c'], ['a', 'b', 'c']), 1);
  assert.equal(kendallTau(['a', 'b', 'c'], ['c', 'b', 'a']), -1);
});
