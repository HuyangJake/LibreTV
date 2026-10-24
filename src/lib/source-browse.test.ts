import { afterEach, expect, it, vi } from 'vitest';
import { browseCategories, browseVideos, cmsCategories, cmsBrowsePage } from './source-browse';
import { fetchUpstream } from './fetch-utils';
import { encodeSpiderExt, decodeSpiderExt } from './spider';

vi.mock('node:dns/promises', () => ({ default: { lookup: vi.fn(async () => [{ address: '1.1.1.1' }]) } }));
vi.mock('./fetch-utils', async (original) => ({ ...await original<typeof import('./fetch-utils')>(), fetchUpstream: vi.fn() }));
const source = (key: string) => ({ key, name: '测试源', url: `https://api.example.com/${key}?token=example&wd=stale&ids=old&t=99` });
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); delete process.env.SPIDER_URL; });

it('reads CMS categories, drops duplicates, and retains latest updates without taxonomy', () => {
  expect(cmsCategories({ class: [{ type_id: 1, type_name: '电影' }, { type_id: 1, type_name: '重复' }, { type_id: 'bad&id', type_name: '无效' }] })).toEqual([{ id: '', name: '最新更新' }, { id: '1', name: '电影' }]);
  expect(cmsCategories({ list: [] })).toEqual([{ id: '', name: '最新更新' }]);
});
it('preserves tokens and requests a category page without search or detail parameters', async () => {
  vi.mocked(fetchUpstream).mockResolvedValue(Response.json({ list: [{ vod_id: 42, vod_name: '影片' }], pagecount: '5', total: '100' }));
  const result = await browseVideos(source('params'), '2', 3, false);
  const url = new URL(vi.mocked(fetchUpstream).mock.calls[0][0]);
  expect(Object.fromEntries(url.searchParams)).toEqual({ token: 'example', ac: 'videolist', pg: '3', t: '2' });
  expect(result).toMatchObject({ page: 3, pageCount: 5, total: 100, hasMore: true, list: [{ vodId: '42' }] });
});
it('ends on the known last page, and on empty pages when pagination metadata is absent', () => {
  const s = source('last');
  expect(cmsBrowsePage({ list: [{ vod_id: 1, vod_name: '影片' }], pagecount: 2 }, s, 2).hasMore).toBe(false);
  expect(cmsBrowsePage({ list: [{ vod_id: 1, vod_name: '影片' }] }, s, 1).hasMore).toBe(true);
  expect(cmsBrowsePage({ list: [] }, s, 2).hasMore).toBe(false);
  expect(() => cmsBrowsePage({ class: [] }, s, 1)).toThrow('未返回影片列表');
});
it('filters results per request without poisoning cached pages or disabling the next page', async () => {
  vi.mocked(fetchUpstream).mockResolvedValue(Response.json({ list: [{ vod_id: 1, vod_name: '影片', type_name: '伦理片' }], pagecount: 3 }));
  const s = source('filter-cache');
  expect(await browseVideos(s, '', 1, true)).toMatchObject({ list: [], hasMore: true });
  expect((await browseVideos(s, '', 1, false)).list).toHaveLength(1);
  expect(fetchUpstream).toHaveBeenCalledTimes(1);
});
it('filters categories without caching a device-specific filtered taxonomy', async () => {
  vi.mocked(fetchUpstream).mockResolvedValue(Response.json({ class: [{ type_id: 1, type_name: '伦理片' }] }));
  const s = source('category-cache');
  expect(await browseCategories(s, true)).toHaveLength(1);
  expect(await browseCategories(s, false)).toHaveLength(2);
});
it('rejects private destinations before any upstream call', async () => {
  await expect(browseVideos({ ...source('private'), url: 'http://127.0.0.1/api' }, '', 1, false)).rejects.toThrow('允许范围');
  expect(fetchUpstream).not.toHaveBeenCalled();
});
it('passes XPTV category ext and page through getCards, preserving detail IDs', async () => {
  process.env.SPIDER_URL = 'http://spider:8787';
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({ result: { tabs: [{ name: '分类', ext: { typeurl: 'https://public.example/category', sort: 'date' } }] } }))
    .mockResolvedValueOnce(Response.json({ result: { list: [{ vod_name: '影片', ext: { url: 'https://public.example/video' } }] } }))
    .mockResolvedValueOnce(Response.json({ result: { list: [] } }));
  vi.stubGlobal('fetch', fetch);
  const s = { key: 'spider', name: '脚本源', url: 'https://public.example/extension.js' };
  const categories = await browseCategories(s, false);
  const result = await browseVideos(s, categories[0].id, 2, false);
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({ method: 'getCards', ext: { typeurl: 'https://public.example/category', sort: 'date', page: 2 } });
  expect(decodeSpiderExt(result.list[0].vodId)).toEqual({ url: 'https://public.example/video' });
  expect(result.hasMore).toBe(true);
  expect((await browseVideos(s, categories[0].id, 3, false)).hasMore).toBe(false);
  expect(categories[0].id).toBe(encodeSpiderExt({ typeurl: 'https://public.example/category', sort: 'date' }));
});
