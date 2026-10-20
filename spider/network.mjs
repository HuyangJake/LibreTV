import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
export async function assertPublic(raw) {
  const u = new URL(raw);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error('Spider 只允许公网 HTTP(S)');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addresses = ipaddr.isValid(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addresses.length || addresses.some(({address}) => ipaddr.process(address).range() !== 'unicast')) throw new Error('Spider 禁止访问内网和保留地址');
  return u;
}
export async function publicFetch(raw, init = {}) {
  let url = raw;
  for (let n = 0; n < 6; n++) {
    await assertPublic(url);
    const response = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(12000) });
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
      if (size > 4_000_000) { await reader.cancel(); throw new Error('Spider 响应超过 4MB'); }
      chunks.push(Buffer.from(value));
    }
    return { response, data: Buffer.concat(chunks).toString('utf8') };
  }
  throw new Error('Spider 重定向过多');
}
