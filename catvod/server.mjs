import http from 'node:http';
import { ownedFiles, removeOwnedFiles } from './cleanup.mjs';
import { fork } from 'node:child_process';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import path from 'node:path';
import { chmod } from 'node:fs/promises';
import refreshQuarkTrack from './quark-track.cjs';
import { publicCatalogKey, publicCatalogSite, publicCatalogResult, publicCatalogDetail, publicShare } from './public-catalog.mjs';
import { readState, saveState, install, rollback, checkUpdate, dataRoot } from './bundle-store.mjs';
process.umask(0o077);

const token = process.env.CATVOD_TOKEN;
if (!token || token.length < 24)
  throw new Error('CATVOD_TOKEN must contain at least 24 characters');
const base = 'http://127.0.0.1:9988';
let child,
  running = false,
  busy = false,
  qr;
let playingUntil = 0;
let resolveQueue = Promise.resolve();
const inFlight = new Map();
async function sourceRequest(route, method = 'GET', body, timeout = 20000) {
  const res = await fetch(base + route, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
    redirect: 'error',
  });
  if (!res.ok) {
    const failure = await res.json().catch(() => ({}));
    if (/请管理员配置夸克/.test(failure.message || ''))
      throw new Error('夸克账号尚未授权，请联系管理员配置');
    throw new Error(`源包请求失败 (${res.status})`);
  }
  const type = res.headers.get('content-type') || '';
  if (type.includes('image/') || route.endsWith('/qrcode'))
    return { image: Buffer.from(await res.arrayBuffer()).toString('base64') };
  let data = await res.json();
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      throw new Error('源包返回格式无效');
    }
  }
  if (data?.statusCode >= 400 || data?.error) throw new Error('源站暂时不可用');
  return data;
}
async function stop() {
  running = false;
  if (!child) return;
  const old = child;
  child = null;
  await new Promise((resolve) => {
    old.once('exit', resolve);
    old.kill('SIGTERM');
    setTimeout(() => {
      old.kill('SIGKILL');
      resolve();
    }, 3000).unref();
  });
}
async function start() {
  const state = await readState();
  if (!state) return;
  await stop();
  for (const name of ['db.json', 'previous-db.json']) {
    try { await chmod(path.join(dataRoot, name), 0o600); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  child = fork(
    new URL('./bootstrap.cjs', import.meta.url),
    [path.join(dataRoot, 'versions', state.filename)],
    {
      execArgv: ['--max-old-space-size=384'],
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'production',
        NODE_PATH: dataRoot,
        DEV_HTTP_PORT: '9988',
      },
      stdio: 'ignore',
    }
  );
  const thisChild = child;
  child.once('exit', () => {
    if (child === thisChild) running = false;
  });
  for (let i = 0; i < 60; i++) {
    if (thisChild.exitCode !== null) throw new Error('源包启动失败，请检查兼容版本');
    try {
      await sourceRequest('/check', 'GET', undefined, 1000);
      running = true;
      return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('源包启动超时');
}
async function catalog() {
  if (!running) return [];
  const config = await sourceRequest('/full-config');
  const sites = (config.video?.sites || []).filter(
    (s) =>
      typeof s.key === 'string' &&
      /^\/spider\/[\w-]+\/\d+$/.test(s.api) &&
      !/(baseset|douban)/i.test(s.key)
  );
  const push = sites.find(s => s.key === 'nodejs_push');
  if (push) sites.push(publicCatalogSite(push.api));
  return sites;
}
async function status() {
  const state = await readState();
  const sites = await catalog();
  return {
    configured: !!state,
    running,
    version: state?.sha256,
    patchVersion: state?.patchVersion,
    entry: state?.entry,
    directory: state?.directory,
    sites: sites.map((s) => ({
      key: s.key,
      name: s.name,
      enabled: state?.enabled?.includes(s.key) || false,
    })),
    sources: sites
      .filter((s) => state?.enabled?.includes(s.key))
      .map((s) => ({
        key: `catvod_${s.key}`,
        name: s.name,
        url: `${state.entry}#${encodeURIComponent(s.key)}`,
        kind: 'catvod',
      })),
  };
}
async function cookie() {
  const d = await sourceRequest('/website/quark/cookie');
  return typeof d.data === 'string' ? d.data : '';
}
async function quarkRequest(route, method = 'GET', body) {
  const secret = await cookie();
  if (!secret) throw new Error('请管理员配置夸克账号');
  const res = await fetch('https://drive-pc.quark.cn/1/clouddrive/' + route, {
    method,
    headers: {
      Cookie: secret,
      Referer: 'https://pan.quark.cn/',
      'User-Agent': 'Mozilla/5.0',
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json();
  if (!res.ok || data.code !== 0) throw new Error('夸克授权已失效或请求受限，请联系管理员重新授权');
  return data;
}
async function quarkStatus() {
  if (!running) return { configured: false, valid: false };
  if (!(await cookie())) return { configured: false, valid: false };
  try {
    await quarkRequest('file/sort?pr=ucpro&fr=pc&pdir_fid=0&_page=1&_size=1');
    return { configured: true, valid: true };
  } catch {
    return { configured: true, valid: false, message: '夸克授权已失效或请求受限，请联系管理员' };
  }
}
async function operation(body) {
  if (busy) throw new Error('源包正在维护，请稍后重试');
  const { site, method, params = {} } = body;
  if (!['init', 'home', 'category', 'search', 'detail', 'play'].includes(method))
    throw new Error('不支持的源操作');
  const state = await readState();
  if (body.entry !== state?.entry) throw new Error('源包入口与当前安装版本不符');
  if (!state?.enabled?.includes(site) && !(site === 'nodejs_push' && ['detail','play'].includes(method))) throw new Error('此站点未启用');
  const found = (await catalog()).find((s) => s.key === site);
  if (!found) throw new Error('站点不存在');
  const call = async () => {
    const publicSite = site === publicCatalogKey;
    if (publicSite && ['init','home','category','search'].includes(method))
      return publicCatalogResult(method, params);
    const cloudSite = /^nodejs_(erxiao|wogg|zhizhen|wuming|duoduo|muou|sayang|huban|bdjuhe|shuangxing|leijing|panta|wodequark)$/.test(site);
    if ((method === 'play' && /夸|Quark/i.test(params.flag || '')) || (method === 'detail' && (cloudSite || publicSite))) {
      const q = await quarkStatus();
      if (!q.valid) throw new Error('夸克账号未授权或已失效，请联系管理员');
    }
    await sourceRequest(found.api + '/init', 'POST', {});
    if (publicSite && method === 'detail')
      return publicCatalogDetail(params.id, await sourceRequest(found.api + '/detail', 'POST', {id: publicShare(params.id)}));
    if (method === 'play') playingUntil = Date.now() + 120000;
    let currentParams = params;
    if (method === 'play' && /夸|Quark/i.test(params.flag || '')) {
      const push = (await catalog()).find(s => s.key === 'nodejs_push');
      if (!push) throw new Error('夸克分享解析器不可用');
      await sourceRequest(push.api + '/init', 'POST', {});
      currentParams = await refreshQuarkTrack(params, id =>
        sourceRequest(push.api + '/detail', 'POST', { id }));
    }
    return sourceRequest(
      found.api + '/' + method,
      'POST',
      currentParams,
      method === 'play' ? 60000 : 20000
    );
  };
  if (method !== 'play') return call();
  // Upstream uses process-global transfer caches. Serialize resolution; media streams stay concurrent.
  const key = JSON.stringify([site, params]);
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = resolveQueue.then(call);
  resolveQueue = promise.catch(() => {});
  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(key);
  }
}
async function dispatch(route, method, body) {
  if (route === '/lease' && method === 'POST') {
    playingUntil = Date.now() + 120000;
    return { ok: true };
  }
  if (route === '/quark/files' && method === 'GET')
    return {
      files: (await ownedFiles(await cookie())).map(({ fid, created }) => ({ fid, created })),
    };
  if (route === '/quark/cleanup' && method === 'POST') {
    if (busy || playingUntil > Date.now())
      throw new Error('仍有播放会话，请停止播放两分钟后再清理');
    busy = true;
    try {
      await resolveQueue;
      const result=await removeOwnedFiles(await cookie(), body.ids, quarkRequest);
      await start();return result;
    } finally {
      busy = false;
    }
  }
  if (route === '/status' && method === 'GET') return status();
  if (route === '/operate' && method === 'POST') return operation(body);
  if (route === '/quark/status' && method === 'GET') return quarkStatus();
  if (route === '/quark/cookie' && method === 'PUT') {
    if (
      typeof body.cookie !== 'string' ||
      body.cookie.length < 10 ||
      body.cookie.length > 16000 ||
      /[\r\n]/.test(body.cookie)
    )
      throw new Error('Cookie 格式无效');
    await sourceRequest('/website/quark/cookie', 'PUT', { cookie: body.cookie });
    qr = null;
    await start();
    return quarkStatus();
  }
  if (route === '/quark/qr/cancel' && method === 'POST') {
    if (qr?.id === body.id) qr = null;
    return { ok: true };
  }
  if (route === '/quark/qr' && method === 'POST') {
    if (qr && qr.expires > Date.now()) throw new Error('已有扫码会话，请先完成或等待其过期');
    const image = await sourceRequest('/website/quark/qrcode');
    qr = { id: randomUUID(), expires: Date.now() + 120000 };
    return { ...image, id: qr.id, expires: qr.expires };
  }
  if (route === '/quark/qr/poll' && method === 'POST') {
    if (!qr || qr.id !== body.id || qr.expires < Date.now())
      throw new Error('二维码已过期，请重新生成');
    const data = await sourceRequest('/website/quark/cookie', 'POST', {});
    if (data.code === 0 && typeof data.data === 'string' && data.data.length > 10) {
      await sourceRequest('/website/quark/cookie', 'PUT', { cookie: data.data });
      qr = null;
      await start();
      return { done: true, ...(await quarkStatus()) };
    }
    return { done: false };
  }
  if (route === '/sites' && method === 'PUT') {
    const sites = await catalog();
    if (!Array.isArray(body.enabled) || !body.enabled.every((k) => sites.some((s) => s.key === k)))
      throw new Error('站点列表无效');
    const state = await readState();
    await saveState({ ...state, enabled: [...new Set(body.enabled)] });
    return status();
  }
  if (route === '/update' && method === 'GET') return checkUpdate();
  if ((route === '/install' || route === '/rollback') && method === 'POST') {
    if (busy || playingUntil > Date.now()) throw new Error('请停止播放两分钟后再维护源包');
    busy = true;
    try {
      await resolveQueue;
      await stop();
      if (route === '/install') await install(body.entry);
      else await rollback();
      await start();
      return status();
    } catch (e) {
      await start().catch(() => {});
      throw e;
    } finally {
      busy = false;
    }
  }
  throw new Error('不支持的操作');
}
http
  .createServer(async (req, res) => {
    const supplied = Buffer.from(req.headers['x-catvod-token'] || '');
    const expected = Buffer.from(token);
    const reply = (code, data) => {
      res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    };
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
      return reply(403, { error: 'Forbidden' });
    try {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 64000) throw new Error('请求过大');
      }
      const result = await dispatch(req.url, req.method, raw ? JSON.parse(raw) : {});
      reply(200, result);
    } catch (e) {
      reply(502, { error: e instanceof Error ? e.message : 'CatVod 请求失败' });
    }
  })
  .listen(8790, '0.0.0.0');
await start().catch(() => {});
process.on('SIGTERM', async () => {
  await stop();
  process.exit(0);
});
