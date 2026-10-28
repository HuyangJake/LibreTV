import { catvodRequest } from './catvod-client';
import { randomUUID } from 'node:crypto';
import { getCatvodCache as getCache, setCatvodCache as setCache } from './catvod-cache';
import { checkUpstreamAllowed } from './ssrf';
import { rewriteCatvodPlaylist } from './catvod-playlist';
interface MediaSession {
  target: string;
  headers: Record<string, string>;
  local: boolean;
  quarkCookie: boolean;
}
const TTL = 6 * 3600000;
function isQuarkCdn(url: URL): boolean {
  return url.protocol === 'https:' && !url.port && !url.username && !url.password &&
    (url.hostname.endsWith('.drive.quark.cn') || url.hostname === 'drive-pc.quark.cn');
}
export function registerMedia(
  target: string,
  headers: Record<string, string> = {},
  site?: string,
  inheritedQuarkCookie = false
): string {
  const url = new URL(target);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('源包返回了不支持的播放地址');
  const local = ['127.0.0.1', 'localhost'].includes(url.hostname);
  // The trusted metadata-only public catalog uses the audited push parser.
  const proxySite = site === 'nodejs_public_quark' ? 'nodejs_push' : site;
  if (
    local &&
    (url.port !== '9988' ||
      !proxySite ||
      !url.pathname.startsWith(`/spider/${proxySite.replace(/^nodejs_/, '')}/`) ||
      !url.pathname.includes('/proxy'))
  )
    throw new Error('源包返回了不允许的本地播放地址');
  const safe: Record<string, string> = {};
  for (const [key, v] of Object.entries(headers)) {
    if (
      ['user-agent', 'referer', 'origin', 'cookie', 'authorization'].includes(key.toLowerCase()) &&
      typeof v === 'string' &&
      v.length < 16000 &&
      !/[\r\n]/.test(v)
    )
      safe[key.toLowerCase()] = v;
  }
  const id = randomUUID();
  setCache(
    'catvod-media:' + id,
    { target: url.href, headers: safe, local, quarkCookie: (local && url.pathname.includes('/proxy/quark/')) || (inheritedQuarkCookie && isQuarkCdn(url)) } satisfies MediaSession,
    TTL
  );
  return `/api/catvod/media?id=${id}`;
}
export async function catvodMedia(req: Request, id: string): Promise<Response> {
  const entry = getCache<MediaSession>('catvod-media:' + id);
  if (!entry) return new Response('播放会话已过期，请重新打开影片', { status: 410 });
  const renew = () => {
    void catvodRequest('/lease', 'POST', {}).catch(() => {});
  };
  renew();
  let current = entry.target;
  const headers = { ...entry.headers };
  let res: Response | undefined;
  let local = entry.local;
  let quarkCookie = entry.quarkCookie;
  const range = req.headers.get('range');
  if (range) headers.range = range;
  for (let hop = 0; hop < 6; hop++) {
    let target = current;
    if (local) {
      const base = process.env.CATVOD_MEDIA_URL;
      if (!base) throw new Error('尚未配置猫影视媒体地址');
      const u = new URL(current);
      target = base.replace(/\/$/, '') + u.pathname + u.search;
    } else {
      const verdict = await checkUpstreamAllowed(current);
      if (!verdict.ok) throw new Error(verdict.reason);
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    req.signal.addEventListener('abort', abort, { once: true });
    if (req.signal.aborted) controller.abort();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      res = await fetch(target, { headers, signal: controller.signal, redirect: 'manual' });
    } finally {
      clearTimeout(timer);
    }
    // No total-body timeout: long videos must survive beyond the connection deadline.
    if (![301, 302, 303, 307, 308].includes(res.status)) break;
    const location = res.headers.get('location');
    await res.body?.cancel();
    if (!location) throw new Error('播放地址重定向无效');
    const next = new URL(location, current);
    if (next.origin !== new URL(current).origin) {
      if (!(quarkCookie && isQuarkCdn(next))) { delete headers.cookie; quarkCookie = false; }
      delete headers.authorization;
    }
    current = next.href;
    local = false;
    res = undefined;
  }
  if (!res) throw new Error('播放地址重定向过多');
  if (!res.ok && res.status !== 416) {
    await res.body?.cancel();
    return new Response('视频请求失败，请重新打开影片或手动更换线路', { status: res.status });
  }
  const type = res.headers.get('content-type') || '';
  if (/mpegurl/i.test(type) || /\.m3u8(?:[?#]|$)/i.test(current)) {
    const text = await res.text();
    if (text.length > 4_000_000) throw new Error('播放列表过大');
    const rewritten = rewriteCatvodPlaylist(text, current, child => {
      const origin = new URL(child).origin;
      const childHeaders = { ...headers };
      if (origin !== new URL(current).origin) {
        if (!(quarkCookie && isQuarkCdn(new URL(child)))) delete childHeaders.cookie;
        delete childHeaders.authorization;
      }
      return registerMedia(child, childHeaders, entry.local ? new URL(entry.target).pathname.split('/')[2] : undefined, quarkCookie);
    });
    return new Response(rewritten, {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'private, no-store',
      },
    });
  }
  const out = new Headers({ 'Cache-Control': 'private, no-store' });
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const v = res.headers.get(name);
    if (v) out.set(name, v);
  }
  if (!res.body) return new Response(null, { status: res.status, headers: out });
  const reader = res.body.getReader();
  const heartbeat = setInterval(renew, 60000);
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          clearInterval(heartbeat);
          controller.close();
        } else controller.enqueue(value);
      } catch (e) {
        clearInterval(heartbeat);
        controller.error(e);
      }
    },
    async cancel(reason) {
      clearInterval(heartbeat);
      await reader.cancel(reason);
    },
  });
  return new Response(body, { status: res.status, headers: out });
}

/** Quark transcode routes may return MP4 despite a quality label or opaque .bin path. */
export async function inspectCatvodMedia(req: Request, url: string): Promise<'hls'|'video'> {
  const id = new URL(url, 'http://localhost').searchParams.get('id') || '';
  const response = await catvodMedia(new Request('http://localhost'+url, {headers:{Range:'bytes=0-0'},signal:req.signal}), id);
  const type = response.headers.get('content-type') || '';
  await response.body?.cancel();
  if(!response.ok)throw new Error('此画质暂不可用，请选择其他画质');
  return /mpegurl/i.test(type) ? 'hls' : 'video';
}
