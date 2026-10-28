import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { profile, prepareBundle, PATCH_VERSION } from './compatibility.mjs';
const root = process.env.CATVOD_DATA_DIR || '/data';
export const dataRoot = root;
export async function readState() {
  try {
    return JSON.parse(await readFile(path.join(root, 'state.json'), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}
export async function saveState(state) {
  await mkdir(root, { recursive: true });
  const temp = path.join(root, `state.${randomUUID()}.tmp`);
  await writeFile(temp, JSON.stringify(state), { mode: 0o600 });
  await rename(temp, path.join(root, 'state.json'));
}
async function download(url, max) {
  // Initial release accepts only this exact public origin, including every redirect.
  const origin = new URL(profile.entry).origin;
  for (let hop = 0; hop < 4; hop++) {
    if (new URL(url).origin !== origin) throw new Error('源包下载重定向超出允许域名');
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      await res.body?.cancel();
      url = new URL(res.headers.get('location'), url).href;
      continue;
    }
    if (!res.ok) throw new Error(`源包下载失败 (${res.status})`);
    let size = 0;
    const chunks = [];
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > max) throw new Error('源包超过大小限制');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  throw new Error('源包重定向过多');
}
export async function checkUpdate() {
  const md5 = (await download(profile.entry, 128)).toString().trim();
  if (!/^[a-f\d]{32}$/i.test(md5)) throw new Error('MD5 入口格式无效');
  return { md5, changed: md5 !== profile.md5, compatible: md5 === profile.md5 };
}
export async function install(entry) {
  if (entry !== profile.entry) throw new Error('首版仅支持已审核的测试源入口');
  const update = await checkUpdate();
  if (!update.compatible) throw new Error('上游版本已改变，需完成兼容验证后升级；当前版本保持不变');
  const bytes = await download(entry.replace(/\.md5$/, ''), 8_000_000);
  if (createHash('md5').update(bytes).digest('hex') !== update.md5) throw new Error('源包校验失败');
  const previous = await readState();
  const directory = previous?.directory || `LibreTV-Quark-${randomUUID().slice(0, 8)}`;
  const code = prepareBundle(bytes, directory);
  await mkdir(path.join(root, 'versions'), { recursive: true });
  const filename = `${profile.sha256}-p${PATCH_VERSION}.cjs`;
  await writeFile(path.join(root, 'versions', filename), code, { mode: 0o600 });
  const state = {
    ...previous,
    entry,
    sha256: profile.sha256,
    md5: update.md5,
    patchVersion: PATCH_VERSION,
    filename,
    directory,
    enabled: previous?.enabled || [],
    installedAt: Date.now(),
  };
  if (previous) {
    await writeFile(path.join(root, 'previous-state.json'), JSON.stringify(previous), {
      mode: 0o600,
    });
    for (const name of ['db', 'ledger'])
      try {
        await copyFile(
          path.join(root, name + '.json'),
          path.join(root, 'previous-' + name + '.json')
        );
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
  }
  await saveState(state);
  return state;
}
export async function rollback() {
  const state = JSON.parse(await readFile(path.join(root, 'previous-state.json'), 'utf8'));
  // Remote files cannot be rolled back. Keep the complete ownership ledger and live login.
  try {
    const previous = JSON.parse(await readFile(path.join(root, 'previous-db.json'), 'utf8'));
    const current = JSON.parse(await readFile(path.join(root, 'db.json'), 'utf8'));
    if (current.quark) previous.quark = current.quark;
    const temp = path.join(root, 'db.' + randomUUID() + '.tmp');
    await writeFile(temp, JSON.stringify(previous), { mode: 0o600 });
    await rename(temp, path.join(root, 'db.json'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  await saveState(state);
  return state;
}
