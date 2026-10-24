import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScriptLoader } from './script-cache.mjs';

const response = (data) => ({ response: { ok: true }, data });
test('concurrent category and listing requests reuse a single script download', async () => {
  let calls = 0;
  const load = createScriptLoader({ fetchScript: async () => { calls++; return response('function getCards() {}'); } });
  const values = await Promise.all([load('https://example.com/a.js'), load('https://example.com/a.js')]);
  assert.equal(calls, 1); assert.equal(values[0], values[1]);
  await load('https://example.com/a.js'); assert.equal(calls, 1);
});
test('transient connection failures retry once and failed downloads are not cached', async () => {
  let calls = 0;
  const load = createScriptLoader({ fetchScript: async () => {
    if (++calls < 3) throw new Error('fetch failed');
    return response('function search() {}');
  } });
  await assert.rejects(load('https://example.com/a.js'), /fetch failed/);
  await load('https://example.com/a.js'); assert.equal(calls, 3);
});
test('expired and evicted scripts are fetched again, and oversized scripts are rejected', async () => {
  let clock = 0; let calls = 0;
  const load = createScriptLoader({ now: () => clock, ttl: 100, maxEntries: 1, fetchScript: async () => { calls++; return response('code'); } });
  await load('a'); clock = 101; await load('a'); assert.equal(calls, 2);
  await load('b'); await load('a'); assert.equal(calls, 4);
  const tooLarge = createScriptLoader({ fetchScript: async () => response('a'.repeat(1000001)) });
  await assert.rejects(tooLarge('a'), /1MB/);
});
