import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { browserTLSFetch } from './browser-fetch.mjs';

try {
  if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.ALL_PROXY ||
      process.env.http_proxy || process.env.https_proxy || process.env.all_proxy) {
    if (!process.env.NO_PROXY && !process.env.no_proxy) {
      process.env.NO_PROXY = '127.0.0.1,localhost,spider,libretv';
    }
    const { EnvHttpProxyAgent, setGlobalDispatcher } = await import('undici');
    setGlobalDispatcher(new EnvHttpProxyAgent());
  }
} catch {}

export async function assertPublic(raw, lookup = dns.lookup) {
  const u = new URL(raw);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error('Spider 只允许公网 HTTP(S)');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addresses = ipaddr.isValid(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some(({address}) => {
    const p = ipaddr.process(address);
    if (p.range() === 'unicast') return false;
    if (p.range() === 'teredo') return false;
    if (p.kind() === 'ipv4' && (p.octets[0] === 198 && (p.octets[1] === 18 || p.octets[1] === 19))) return false;
    return true;
  })) throw new Error('Spider 禁止访问内网和保留地址');
  return u;
}
export function getBrowserTLSHosts() {
  const env = (process.env.SPIDER_BROWSER_HOSTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return Array.from(new Set([
    'jable.tv', 'missav.ai', 'surrit.com',
    'xvideos.com', 'xvideos.es', 'xvideos.in', 'xvideos.red', 'xvideos-cdn.com',
    'pornhub.com', 'phncdn.com',
    ...env,
  ]));
}

export function isBrowserTLSOrigin(origin) {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    const hosts = getBrowserTLSHosts();
    return hosts.some((h) => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}
export function createPublicFetch({ lookup = dns.lookup, nativeFetch = globalThis.fetch, browserFetch = browserTLSFetch } = {}) {
return async function publicFetch(raw, init = {}) {
  let url = raw;
  for (let n = 0; n < 6; n++) {
    init.signal?.throwIfAborted();
    const target = await assertPublic(url, lookup);
    // XPTV's legacy User-Agent alone cannot reproduce a browser TLS handshake.
    // Cloudflare-protected public origins require the additional transport.
    const transport = isBrowserTLSOrigin(target.origin) ? browserFetch : nativeFetch;
    const timeout = AbortSignal.timeout(12000);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    const response = await transport(url, { ...init, redirect: 'manual', signal });
    if ([301,302,303,307,308].includes(response.status) && response.headers.get('location')) {
      const next = new URL(response.headers.get('location'), url).href;
      if (new URL(next).origin !== new URL(url).origin) {
        const h = new Headers(init.headers); h.delete('cookie'); h.delete('authorization'); init = { ...init, headers: h };
      }
      await response.body?.cancel(); url = next; continue;
    }
    const reader = response.body?.getReader(); let size = 0; const chunks = [];
    if (reader) for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 10_000_000) { await reader.cancel(); throw new Error('Spider 响应超过 10MB'); }
      chunks.push(Buffer.from(value));
    }
    return { response, data: Buffer.concat(chunks).toString('utf8') };
  }
  throw new Error('Spider 重定向过多');
};
}
export const publicFetch = createPublicFetch();
