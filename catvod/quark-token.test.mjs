import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const refresh = createRequire(import.meta.url)('./quark-token.cjs');

test('expired directory tokens refresh once and preserve pagination and folder', async () => {
  const calls = [];
  const result = await refresh('share/sharepage/detail?pwd_id=share&stoken=old&pdir_fid=season&_page=2', {},
    async () => ({ code: 41016 }), async (route, body, method) => {
      calls.push({ route, body, method });
      return calls.length === 1 ? { code: 0, data: { stoken: 'fresh+/=' } } : { code: 0, data: { list: ['video'] } };
    });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].method, 'post');
  assert.deepEqual(calls[0].body, { pwd_id: 'share', passcode: '' });
  const query = new URL('https://test.invalid/' + calls[1].route).searchParams;
  assert.equal(query.get('stoken'), 'fresh+/=');
  assert.equal(query.get('pdir_fid'), 'season');
  assert.equal(query.get('_page'), '2');
  assert.equal(calls[1].method, 'get');
  assert.deepEqual(result.data.list, ['video']);
});
test('expired transfer tokens retry the same owned target and file list only once', async () => {
  const body = { pwd_id: 'share', stoken: 'old', to_pdir_fid: 'owned', fid_list: ['video'], fid_token_list: ['file-token'] };
  const calls = [];
  const result = await refresh('share/sharepage/save?pr=ucpro&fr=pc', body, async () => ({ code: 41016 }),
    async (route, params, method) => {
      calls.push({ route, params, method });
      return calls.length === 1 ? { code: 0, data: { stoken: 'fresh' } } : { code: 41016 };
    });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].params, { ...body, stoken: 'fresh' });
  assert.equal(calls[1].method, 'post');
  assert.equal(body.stoken, 'old');
  assert.equal(result.code, 41016);
});
test('banned shares and unrelated operations never refresh or retry', async () => {
  const request = async () => { throw Error('must not retry'); };
  assert.equal((await refresh('share/sharepage/detail?pwd_id=share', {}, async () => ({ code: 41031 }), request)).code, 41031);
  assert.equal((await refresh('file/delete', {}, async () => ({ code: 41016 }), request)).code, 41016);
  assert.equal((await refresh('share/sharepage/save', {}, async () => ({ code: 41016 }), request)).code, 41016);
});
