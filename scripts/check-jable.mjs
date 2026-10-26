// Live check: LIBRETV_PASSWORD=... node scripts/check-jable.mjs
// Downloads only a small video sample; never prints titles, cookies or signed URLs.
const base = new URL(process.env.LIBRETV_URL || 'http://localhost:18080');
const password = process.env.LIBRETV_PASSWORD;
if (!password) throw new Error('Set LIBRETV_PASSWORD');
let cookie = '';
async function request(path, body) {
  const url = new URL(path, base);
  if (url.origin !== base.origin) throw new Error('Refusing to send app credentials outside LibreTV');
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(35000),
  });
  if (!response.ok) {
    let reason = '';
    try { reason = (await response.json()).error || ''; } catch {}
    throw new Error(`HTTP ${response.status}${reason ? ': ' + reason : ''}`);
  }
  return response;
}
const login = await request('/api/auth', { password });
cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
if (!(await login.json()).success || !cookie) throw new Error('Login failed');
const shared = await (await request('/api/shared-sources')).json();
const source = shared.data.customAPIs.find((item) => item.key === 'custom_xptv_jable');
if (!source) throw new Error('Jable source is missing');
const search = await (await request('/api/search', { wd: process.env.JABLE_QUERY || 'SSIS', sources: [source], filterAdult: false })).json();
if (search.failures.length) throw new Error('Search: ' + search.failures.map((failure) => failure.error).join('; '));
if (!search.list.length) throw new Error('Search returned no videos');
console.log('PASS search:', search.list.length, 'results');
const detail = await (await request('/api/detail?' + new URLSearchParams({ id: search.list[0].vodId, source: JSON.stringify(source) }))).json();
if (!detail.episodes?.length) throw new Error('No playable episodes');
console.log('PASS detail:', detail.episodes.length, 'episodes');
let path = detail.episodes[0];
for (let depth = 0; depth < 5; depth++) {
  const response = await request(path);
  const type = response.headers.get('content-type') || '';
  if (type.includes('mpegurl')) {
    const text = await response.text();
    if (!text.startsWith('#EXTM3U')) throw new Error('Upstream returned a non-HLS page');
    console.log('PASS HLS playlist:', text.length, 'bytes');
    const key = text.match(/#EXT-X-KEY:[^\n]*URI="([^"]+)"/);
    if (key) {
      const keyData = await (await request(key[1])).arrayBuffer();
      if (keyData.byteLength !== 16) throw new Error('Invalid AES-128 key');
      console.log('PASS AES-128 key:', keyData.byteLength, 'bytes');
    }
    path = text.split('\n').find((line) => line.trim() && !line.startsWith('#'))?.trim();
    if (!path) throw new Error('HLS contains no media');
    continue;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (size < 65536) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value)); size += value.length;
    }
  } finally { await reader.cancel(); }
  if (size < 1024 || type.includes('text/html') || type.includes('application/json')) throw new Error('No valid video segment data');
  console.log('PASS video segment:', size, 'bytes;', type);
  console.log('PASS Jable search → detail → HLS → video segment');
  process.exit(0);
}
throw new Error('Too many nested playlists');
