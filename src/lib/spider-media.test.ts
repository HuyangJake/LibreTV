import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { isBrowserTLSHost, saveSpiderHeaders, spiderMedia } from './spider-media';

vi.mock('./fetch-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./fetch-utils')>();
  return {
    ...actual,
    fetchUpstreamWithMeta: vi.fn(async (url: string) => ({
      res: new Response('#EXTM3U\nsegment1.ts', { headers: { 'Content-Type': 'application/vnd.apple.mpegurl' } }),
      finalUrl: url,
    })),
  };
});

beforeEach(() => {
  delete process.env.SPIDER_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('recognizes domains requiring browser TLS transport', () => {
  expect(isBrowserTLSHost('https://jable.tv/videos/1')).toBe(true);
  expect(isBrowserTLSHost('https://missav.ai/dm265')).toBe(true);
  expect(isBrowserTLSHost('https://surrit.com/uuid/playlist.m3u8')).toBe(true);
  expect(isBrowserTLSHost('https://cdn.surrit.com/uuid/video.m3u8')).toBe(true);
  expect(isBrowserTLSHost('https://jable.tv.evil.com/')).toBe(false);
  expect(isBrowserTLSHost('https://normal-cms.com/video.m3u8')).toBe(false);
});

it('saves spider headers and expires gracefully', async () => {
  const token = saveSpiderHeaders({
    'User-Agent': 'Mozilla/5.0 Test',
    'Referer': 'https://missav.ai/',
    'X-Custom-Bad': 'should-be-stripped',
  });
  expect(typeof token).toBe('string');
  const expired = await spiderMedia(new Request('http://localhost/api/spider/play'), 'https://example.com/a.m3u8', 'invalid-token');
  expect(expired.status).toBe(410);
});

it('proxies Cloudflare-protected media via SPIDER_URL and rewrites playlists', async () => {
  process.env.SPIDER_URL = 'http://spider:8787';
  const token = saveSpiderHeaders({ 'Referer': 'https://missav.ai/' });

  const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
    expect(url).toBe('http://spider:8787/proxy');
    const body = JSON.parse(String(init?.body));
    expect(body.url).toBe('https://surrit.com/uuid/playlist.m3u8');
    expect(body.headers.Referer).toBe('https://missav.ai/');
    return new Response('#EXTM3U\n360p/video.m3u8', {
      headers: { 'Content-Type': 'application/vnd.apple.mpegurl' },
    });
  });
  vi.stubGlobal('fetch', mockFetch);

  const res = await spiderMedia(new Request('http://localhost/api/spider/play'), 'https://surrit.com/uuid/playlist.m3u8', token);
  expect(res.status).toBe(200);
  expect(res.headers.get('Content-Type')).toBe('application/vnd.apple.mpegurl');
  const text = await res.text();
  expect(text).toContain('/api/spider/media?token=' + token + '&url=https%3A%2F%2Fsurrit.com%2Fuuid%2F360p%2Fvideo.m3u8');
  expect(mockFetch).toHaveBeenCalledTimes(1);
});
