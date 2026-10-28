import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const root = await mkdtemp(path.join(os.tmpdir(), 'catvod-ledger-'));
process.env.NODE_PATH = root;
const guard = createRequire(import.meta.url)('./quark-ledger.cjs');
await writeFile(path.join(root, 'state.json'), JSON.stringify({ directory: 'LibreTV-Quark-test' }));
await writeFile(
  path.join(root, 'db.json'),
  JSON.stringify({
    quark: { [createHash('md5').update('libretv').digest('hex')]: 'test-account-cookie' },
  })
);

test('blocks every bundle delete and chat request before network access', async () => {
  let called = false;
  const next = async () => {
    called = true;
    return {};
  };
  await assert.rejects(
    () => guard('file/delete?pr=ucpro', { filelist: ['user-file'] }, next),
    /自动删除/
  );
  await assert.rejects(() => guard('chat/conv/msg/batch_send', {}, next), /聊天操作/);
  assert.equal(called, false);
});
test('records directory and task ownership; rejects unrelated transfer targets', async () => {
  await assert.rejects(
    () => guard('share/sharepage/save', { to_pdir_fid: 'personal' }, async () => ({})),
    /专用目录/
  );
  await guard('file?pr=ucpro', { file_name: 'LibreTV-Quark-test', pdir_fid: '0' }, async () => ({
    data: { fid: 'owned-directory' },
  }));
  await guard(
    'share/sharepage/save',
    { to_pdir_fid: 'owned-directory', fid_list: ['original-file'] },
    async () => ({ data: { task_id: 'task-1' } })
  );
  await guard('task?pr=ucpro&task_id=task-1', {}, async () => ({
    data: { save_as: { save_as_top_fids: ['saved-file'] } },
  }));
  const data = JSON.parse(await readFile(path.join(root, 'ledger.json'), 'utf8'));
  assert.equal(data.pending.length, 0);
  assert.equal(data.files.length, 1);
  assert.equal(data.files[0].parent, 'owned-directory');
  assert.equal(data.files[0].fid, 'saved-file');
});
test('leaves interrupted transfer tasks recorded for recovery', async () => {
  await guard(
    'share/sharepage/save',
    { to_pdir_fid: 'owned-directory', fid_list: ['source-2'] },
    async () => ({ data: { task_id: 'task-2' } })
  );
  const data = JSON.parse(await readFile(path.join(root, 'ledger.json'), 'utf8'));
  assert.equal(data.pending[0].task, 'task-2');
});
test('an expired transfer retries within the ownership guard and records the successful task', async () => {
  const body = { pwd_id: 'expiring-share', stoken: 'expired', to_pdir_fid: 'owned-directory', fid_list: ['new-video'] };
  const calls = [];
  const request = async (route, params) => {
    calls.push({ route, params });
    return route.startsWith('share/sharepage/token')
      ? { code: 0, data: { stoken: 'fresh' } }
      : { code: 0, data: { task_id: 'refreshed-task' } };
  };
  await assert.rejects(() => guard('share/sharepage/save', { ...body, to_pdir_fid: 'personal' }, async () => ({ code: 41016 }), request), /专用目录/);
  assert.equal(calls.length, 0);
  await guard('share/sharepage/save', body, async () => ({ code: 41016 }), request);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].params, { ...body, stoken: 'fresh' });
  await guard('task?task_id=refreshed-task', {}, async () => ({ data: { save_as: { save_as_top_fids: ['fresh-saved'] } } }));
  const data = JSON.parse(await readFile(path.join(root, 'ledger.json'), 'utf8'));
  assert.equal(data.files.find(f => f.fid === 'fresh-saved').parent, 'owned-directory');
  assert.ok(!data.pending.some(p => p.task === 'refreshed-task'));
});
test('definitively rejected transfers release their intent while unknown failures remain pending', async () => {
  const body = { pwd_id: 'rejected-share', stoken: 'old', to_pdir_fid: 'owned-directory', fid_list: ['rejected-file'] };
  for (const code of [41012,41016,41020,41031]) {
    await assert.rejects(() => guard('share/sharepage/save', body, async () => ({code})), /凭证已过期/);
    const data = JSON.parse(await readFile(path.join(root, 'ledger.json'), 'utf8'));
    assert.ok(!data.pending.some(p => p.source?.includes('rejected-file')));
  }
  await guard('share/sharepage/save', {...body, fid_list:['uncertain-file']}, async () => ({code:500}));
  const data = JSON.parse(await readFile(path.join(root, 'ledger.json'), 'utf8'));
  assert.ok(data.pending.some(p => p.source?.includes('uncertain-file')));
});
test.after(async () => {
  await rm(root, { recursive: true, force: true });
});

test('reuses a completed transfer after process cache loss after revalidating the saved file',async()=>{
 const first=await guard('share/sharepage/save',{to_pdir_fid:'owned-directory',fid_list:['persistent-original'],pwd_id:'public-share'},async()=>({data:{task_id:'persistent-task'}}));
 await guard('task?task_id='+first.data.task_id,{},async()=>({data:{save_as:{save_as_top_fids:['persistent-saved']}}}));
 let transfers=0;const lookup=async()=>({code:0,data:{list:[{fid:'persistent-saved',pdir_fid:'owned-directory'}]}});
 const again=await guard('share/sharepage/save',{to_pdir_fid:'owned-directory',fid_list:['persistent-original'],pwd_id:'public-share'},async()=>{transfers++;return {data:{task_id:'duplicate-task'}}},lookup);
 assert.equal(transfers,0);
 const result=await guard('task?task_id='+again.data.task_id,{},async()=>{throw Error('synthetic task must stay local')});
 assert.deepEqual(result.data.save_as.save_as_top_fids,['persistent-saved']);
});
