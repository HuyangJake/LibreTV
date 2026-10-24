import { randomUUID } from 'node:crypto';
import { fetchUpstreamWithMeta, getCache, setCache } from './fetch-utils';
import { rewriteM3u8 } from './m3u8';
export function saveSpiderHeaders(headers: Record<string, string>): string {
  const token = randomUUID();
  const safe: Record<string, string> = {};
  for (const [k,v] of Object.entries(headers)) {
    if (['user-agent','referer','origin','cookie','authorization'].includes(k.toLowerCase()) && typeof v === 'string' && v.length < 8192) safe[k] = v;
  }
  setCache(`spider-headers:${token}`, safe, 6 * 60 * 60 * 1000);
  return token;
}
export function getBrowserTLSHosts(): string[] {
  const env = (process.env.SPIDER_BROWSER_HOSTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return Array.from(new Set(['jable.tv', 'missav.ai', 'surrit.com', ...env]));
}

export function isBrowserTLSHost(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    const hosts = getBrowserTLSHosts();
    return hosts.some((h) => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

export async function spiderMedia(req: Request, url: string, token: string): Promise<Response> {
  const headers = getCache<Record<string,string>>(`spider-headers:${token}`);
  if (!headers) return new Response('播放会话已过期，请重新打开影片', { status: 410 });
  const range = req.headers.get('range');
  const reqHeaders: Record<string, string> = { ...headers, ...(range ? { Range: range } : {}) };

  const endpoint = process.env.SPIDER_URL;
  if (isBrowserTLSHost(url) && endpoint) {
    const proxyRes = await fetch(`${endpoint.replace(/\/$/, '')}/proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, headers: reqHeaders }),
      signal: AbortSignal.timeout(25000),
    });
    if (!proxyRes.ok && proxyRes.status !== 206) {
      let msg = '';
      try { msg = (await proxyRes.json()).error || ''; } catch {}
      throw new Error(msg || `媒体上游 HTTP ${proxyRes.status}`);
    }
    const type = proxyRes.headers.get('content-type') || '';
    if (type.includes('mpegurl') || /\.m3u8(?:[?#]|$)/i.test(url)) {
      const text = await proxyRes.text();
      return new Response(rewriteM3u8(text, url, 0, `/api/spider/media?token=${token}&url=`), {
        status: proxyRes.status, headers: { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' },
      });
    }
    const output = new Headers({ 'Cache-Control': 'private, no-store' });
    for (const k of ['content-type','content-range','accept-ranges']) { const v = proxyRes.headers.get(k); if (v) output.set(k,v); }
    return new Response(proxyRes.body, { status: proxyRes.status, headers: output });
  }

  const { res, finalUrl } = await fetchUpstreamWithMeta(url, { headers: reqHeaders, timeoutMs: 20000 });
  const type = res.headers.get('content-type') || '';
  if (type.includes('mpegurl') || /\.m3u8(?:[?#]|$)/i.test(finalUrl)) {
    const text = await res.text();
    return new Response(rewriteM3u8(text, finalUrl, 0, `/api/spider/media?token=${token}&url=`), {
      status: res.status, headers: { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' },
    });
  }
  const output = new Headers({ 'Cache-Control': 'private, no-store' });
  for (const k of ['content-type','content-range','accept-ranges']) { const v = res.headers.get(k); if (v) output.set(k,v); }
  return new Response(res.body, { status: res.status, headers: output });
}
