import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { POST } from './route';
import { browseCategories, browseVideos } from '@/lib/source-browse';
import { SESSION_COOKIE, signSession } from '@/lib/auth';

vi.mock('@/lib/source-browse', () => ({ browseCategories: vi.fn(), browseVideos: vi.fn() }));
const source = { key: 'example', name: '测试源', url: 'https://api.example.com/' };
beforeAll(() => { process.env.PASSWORD = 'test-password'; });
afterEach(() => vi.clearAllMocks());
function request(body: unknown, authenticated = true) {
  const { token } = signSession();
  return new Request('https://local.test/api/browse', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { cookie: `${SESSION_COOKIE}=${token}` } : {}) },
    body: JSON.stringify(body),
  });
}
it('requires login before listing categories', async () => {
  expect((await POST(request({ action: 'categories', source }, false))).status).toBe(401);
  expect(browseCategories).not.toHaveBeenCalled();
});
it('returns categories and delegates the requested page and content filter', async () => {
  vi.mocked(browseCategories).mockResolvedValue([{ id: '', name: '最新更新' }]);
  const categories = await POST(request({ action: 'categories', source }));
  expect(await categories.json()).toEqual({ categories: [{ id: '', name: '最新更新' }] });
  vi.mocked(browseVideos).mockResolvedValue({ list: [], page: 4, hasMore: false });
  const page = await POST(request({ action: 'videos', source, category: '2', page: 4, filterAdult: false }));
  expect(await page.json()).toEqual({ list: [], page: 4, hasMore: false });
  expect(browseVideos).toHaveBeenCalledWith(source, '2', 4, false);
});
it('validates page bounds and source configuration before any browsing', async () => {
  for (const page of [0, -1, 1.5, 10001, '2']) expect((await POST(request({ action: 'videos', source, page }))).status).toBe(400);
  expect((await POST(request({ action: 'categories', source: { ...source, url: 'file:///tmp/data' } }))).status).toBe(400);
  expect(browseVideos).not.toHaveBeenCalled();
});
it('respects source filtering and reports unsupported browsing explicitly', async () => {
  expect((await POST(request({ action: 'categories', source: { ...source, isAdult: true } }))).status).toBe(403);
  expect(browseCategories).not.toHaveBeenCalled();
  vi.mocked(browseCategories).mockRejectedValue(new Error('这个源未提供分类浏览功能，请使用首页搜索'));
  const response = await POST(request({ action: 'categories', source }));
  expect(response.status).toBe(502);
  expect((await response.json()).error).toContain('首页搜索');
});
