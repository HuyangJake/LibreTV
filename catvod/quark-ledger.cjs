const { readFile, writeFile, rename } = require('node:fs/promises');
const { createHash, randomUUID } = require('node:crypto');
const path = require('node:path');
const accountFingerprint = require('./account.cjs');
const findOwnedFiles = require('./quark-files.cjs');
const refreshExpiredShareToken = require('./quark-token.cjs');
const root = process.env.NODE_PATH || '/data';
let queue = Promise.resolve();
async function read(name, fallback) {
  try {
    return JSON.parse(await readFile(path.join(root, name), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}
async function save(data) {
  const temp = path.join(root, 'ledger.' + randomUUID() + '.tmp');
  await writeFile(temp, JSON.stringify(data), { mode: 0o600 });
  await rename(temp, path.join(root, 'ledger.json'));
}
function update(fn) {
  const job = queue.then(async () => {
    const data = await read('ledger.json', { directories: [], files: [], pending: [] });
    await fn(data);
    await save(data);
  });
  queue = job.catch(() => {});
  return job;
}
module.exports = async function guardedQuark(route, body, next, request) {
  const state = await read('state.json', null);
  if (!state) throw new Error('Missing runtime state');
  const db = await read('db.json', {});
  const cookie = db.quark?.[createHash('md5').update('libretv').digest('hex')];
  if (!cookie) throw new Error('请管理员配置夸克账号');
  const account = accountFingerprint(cookie);
  // Every Quark delete issued by the third-party bundle is prohibited. Only the
  // administrator cleanup in our trusted parent process can delete recorded fids.
  if (route.startsWith('file/delete')) throw new Error('自动删除已禁用，请管理员手动清理');
  if (route.startsWith('chat/')) throw new Error('源包聊天操作已禁用');
  if (route.startsWith('task?')) {
    const task = new URL('https://quark.invalid/' + route).searchParams.get('task_id');
    if (task?.startsWith('libretv-reuse-')) {
      const key = task.slice('libretv-reuse-'.length);
      const ledger = await read('ledger.json', { files: [] });
      const files = ledger.files.filter((f) => f.account === account && f.transferKey === key);
      if (!files.length) throw new Error('转存记录已失效，请重新打开影片');
      return { code: 0, message: 'ok', data: { save_as: { save_as_top_fids: files.map((f) => f.fid) } } };
    }
  }
  let intent;
  if (route.startsWith('share/sharepage/save')) {
    const ledger = await read('ledger.json', { directories: [], files: [], pending: [] });
    if (!ledger.directories.some((d) => d.account === account && d.fid === body?.to_pdir_fid))
      throw new Error('只允许转存到本实例创建的专用目录');
    const transferKey = createHash('sha256').update(JSON.stringify([
      account, body.to_pdir_fid, body.pwd_id, body.fid_list,
    ])).digest('hex');
    const existing = ledger.files.filter((f) => f.account === account && f.transferKey === transferKey);
    if (existing.length && request) {
      // Recheck remote ownership before reuse; a moved or manually deleted file is never trusted.
      const found = await findOwnedFiles(body.to_pdir_fid, existing.map((f) => f.fid), request);
      if (existing.every((f) => found.has(f.fid)))
        return { code: 0, message: 'ok', data: { task_id: 'libretv-reuse-' + transferKey } };
      await update((l) => {
        for (const file of l.files)
          if (file.account === account && file.transferKey === transferKey) delete file.transferKey;
      });
    }
    const pending = ledger.pending.find((p) => p.account === account && p.transferKey === transferKey);
    if (pending?.task) return { code: 0, message: 'ok', data: { task_id: pending.task } };
    if (pending) throw new Error('上次转存结果待核对，请管理员检查专用目录，避免重复转存');
    intent = {
      id: randomUUID(),
      account,
      parent: body.to_pdir_fid,
      source: body.fid_list,
      transferKey,
      created: Date.now(),
    };
    await update((l) => l.pending.push(intent));
  }
  if (
    route.startsWith('file?') &&
    body?.file_name &&
    (body.file_name !== state.directory || body.pdir_fid !== '0')
  )
    throw new Error('只允许创建专用播放目录');
  const result = await refreshExpiredShareToken(route, body, next, request);
  // These explicit business rejections mean no transfer task was accepted.
  // Network failures and unknown responses retain their intent for reconciliation.
  if (intent && [41012, 41016, 41020, 41031].includes(result?.code) && !result?.data?.task_id) {
    await update(l => { l.pending = l.pending.filter(p => p.id !== intent.id); });
    throw new Error('夸克分享凭证已过期或分享不可用，请重新打开影片或切换资源');
  }
  await update((l) => {
    if (route.startsWith('file?') && body?.file_name === state.directory && result?.data?.fid) {
      if (!l.directories.some((d) => d.account === account && d.fid === result.data.fid))
        l.directories.push({
          account,
          fid: result.data.fid,
          name: state.directory,
          created: Date.now(),
        });
    }
    if (intent) {
      const p = l.pending.find((p) => p.id === intent.id);
      if (p) p.task = result?.data?.task_id;
    }
    if (route.startsWith('task?')) {
      const task = new URL('https://quark.invalid/' + route).searchParams.get('task_id');
      const pending = l.pending.find((p) => p.account === account && p.task === task);
      const fids = result?.data?.save_as?.save_as_top_fids;
      if (pending && Array.isArray(fids)) {
        for (const fid of fids)
          if (
            typeof fid === 'string' &&
            !l.files.some((f) => f.account === account && f.fid === fid)
          )
            l.files.push({ account, parent: pending.parent, fid, transferKey: pending.transferKey, created: Date.now() });
        l.pending = l.pending.filter((p) => p.id !== pending.id);
      }
    }
  });
  return result;
};
