import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const refresh = createRequire(import.meta.url)('./quark-track.cjs');
test('old tracks refresh both tokens by file ID across directory lines with duplicate names', async () => {
  const params = { flag: '夸克-share', id: 'share*expired*fileB*expired-file-token' };
  const result = await refresh(params, async url => {
    assert.equal(url, 'https://pan.quark.cn/s/share');
    return { list: [{ vod_play_url: '01$share*fresh*fileA*token-A$$$01$share*fresh*fileB*token-B' }] };
  });
  assert.equal(result.id, 'share*fresh*fileB*token-B');
  assert.equal(result.flag, params.flag);
  assert.equal(params.id, 'share*expired*fileB*expired-file-token');
});
test('missing, banned and malformed tracks never proceed with stale credentials', async () => {
  await assert.rejects(() => refresh({ id: 'share*old*missing*old' }, async () => ({ list: [] })), /失效/);
  let read = false;
  await assert.rejects(() => refresh({ id: '../foreign*old*file*old' }, async () => { read = true; }), /无效/);
  assert.equal(read, false);
});
