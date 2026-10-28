import { describe, it, expect, vi, afterEach } from 'vitest';
import { registerMedia, catvodMedia, inspectCatvodMedia } from './catvod-media';
vi.mock('./ssrf', () => ({
  checkUpstreamAllowed: vi.fn(async (raw: string) => ({ ok: !raw.includes('private') })),
}));
vi.mock('./catvod-client', () => ({ catvodRequest: vi.fn(async () => ({ ok: true })) }));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function request(url: string, headers?: HeadersInit) {
  return new Request('http://localhost' + url, { headers });
}
describe('CatVod media sessions', () => {
  it('binds the local proxy to its resolved site', () => {
    expect(() =>
      registerMedia('http://127.0.0.1:9988/website/config', {}, 'nodejs_muou')
    ).toThrow();
    expect(() =>
      registerMedia('http://127.0.0.1:9988/spider/other/3/proxy', {}, 'nodejs_muou')
    ).toThrow();
    expect(
      registerMedia('http://127.0.0.1:9988/spider/muou/3/proxy?do=quark', {}, 'nodejs_muou')
    ).toMatch(/^\/api\/catvod\/media\?id=/);
  });
  it('allows the trusted public catalog to use only the audited push proxy', () => {
    expect(registerMedia('http://127.0.0.1:9988/spider/push/4/proxy/quark/src', {}, 'nodejs_public_quark'))
      .toMatch(/^\/api\/catvod\/media\?id=/);
    for (const target of [
      'http://127.0.0.1:9988/website/quark/cookie',
      'http://127.0.0.1:9988/spider/other/3/proxy',
      'http://127.0.0.1:8790/status',
    ]) expect(() => registerMedia(target, {}, 'nodejs_public_quark')).toThrow();
  });
  it('forwards Range and 206 metadata with no total-body timeout', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response('video', {
          status: 206,
          headers: {
            'Content-Type': 'video/mp4',
            'Content-Range': 'bytes 0-4/10',
            'Accept-Ranges': 'bytes',
            'Content-Length': '5',
          },
        })
    );
    vi.stubGlobal('fetch', fetcher);
    const url = registerMedia('https://video.example/file.mp4', { Cookie: 'secret' });
    const res = await catvodMedia(request(url, { range: 'bytes=0-4' }), url.split('=')[1]);
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 0-4/10');
    expect(await res.text()).toBe('video');
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      headers: { cookie: 'secret', range: 'bytes=0-4' },
      redirect: 'manual',
    });
  });
  it('keeps credentials and upstream URLs out of HLS child URLs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:5,\na.ts\n', {
            headers: { 'Content-Type': 'application/vnd.apple.mpegurl' },
          })
      )
    );
    const url = registerMedia('https://video.example/index.m3u8', { Cookie: 'secret' });
    const res = await catvodMedia(request(url), url.split('=')[1]);
    const text = await res.text();
    expect(text).toContain('/api/catvod/media?id=');
    expect(text).not.toContain('video.example');
    expect(text).not.toContain('secret');
    expect(text).not.toContain('pending');
  });
  it('strips secrets across redirects and rejects private destinations', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: 'https://cdn.example/v.mp4' } })
      )
      .mockResolvedValueOnce(new Response('ok', { headers: { 'content-type': 'video/mp4' } }));
    vi.stubGlobal('fetch', fetcher);
    const url = registerMedia('https://video.example/v.mp4', {
      Cookie: 'secret',
      Authorization: 'bearer',
    });
    const res = await catvodMedia(request(url), url.split('=')[1]);
    await res.text();
    expect(fetcher.mock.calls[1][1].headers.cookie).toBeUndefined();
    expect(fetcher.mock.calls[1][1].headers.authorization).toBeUndefined();
    const privateUrl = registerMedia('https://private.example/v.mp4');
    await expect(catvodMedia(request(privateUrl), privateUrl.split('=')[1])).rejects.toThrow();
  });
});

it('keeps Quark cookies only when its local proxy redirects to a trusted Quark CDN', async()=>{
 vi.stubEnv('CATVOD_MEDIA_URL','http://runtime:9988');
 const fetcher=vi.fn().mockResolvedValueOnce(new Response(null,{status:302,headers:{location:'https://video-play-c-sz.drive.quark.cn/video/index.m3u8'}})).mockResolvedValueOnce(new Response('#EXTM3U\n#EXTINF:4,\npart.ts\n',{headers:{'Content-Type':'application/vnd.apple.mpegurl'}}));
 vi.stubGlobal('fetch',fetcher);
 const url=registerMedia('http://127.0.0.1:9988/spider/shuangxing/3/proxy/quark/trans/super/share/.bin',{Cookie:'quark-fixture'},'nodejs_shuangxing');
 const response=await catvodMedia(request(url),url.split('=')[1]);await response.text();
 expect(fetcher.mock.calls[1][1].headers.cookie).toBe('quark-fixture');
});

it('detects MP4 versus HLS from the actual response rather than the opaque path', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response('x', { status: 206, headers: { 'Content-Type': 'video/mp4' } }))
    .mockResolvedValueOnce(new Response('#EXTM3U\n', { headers: { 'Content-Type': 'application/x-mpegURL' } }));
  vi.stubGlobal('fetch', fetcher);
  const mp4 = registerMedia('https://video.example/opaque.bin');
  const hls = registerMedia('https://video.example/another.bin');
  expect(await inspectCatvodMedia(request(mp4), mp4)).toBe('video');
  expect(await inspectCatvodMedia(request(hls), hls)).toBe('hls');
  expect(fetcher.mock.calls[0][1].headers.range).toBe('bytes=0-0');
});

it('never sends a Quark proxy credential to lookalike domains or nonstandard ports', async () => {
  vi.stubEnv('CATVOD_MEDIA_URL', 'http://runtime:9988');
  for (const destination of ['https://drive.quark.cn.evil.example/v', 'https://video.drive.quark.cn:8443/v', 'http://video.drive.quark.cn/v']) {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: destination } }))
      .mockResolvedValueOnce(new Response('video', { headers: { 'Content-Type': 'video/mp4' } }));
    vi.stubGlobal('fetch', fetcher);
    const url = registerMedia('http://127.0.0.1:9988/spider/push/4/proxy/quark/trans/super/share/.bin', { Cookie: 'fixture', Authorization: 'secret' }, 'nodejs_push');
    const response = await catvodMedia(request(url), url.split('=')[1]);
    await response.body?.cancel();
    expect(fetcher.mock.calls[1][1].headers.cookie).toBeUndefined();
    expect(fetcher.mock.calls[1][1].headers.authorization).toBeUndefined();
  }
});
