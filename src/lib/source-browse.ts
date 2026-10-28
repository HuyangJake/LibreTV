import { isCatvodSource } from './catvod-source';
import { catvodCategories, browseCatvod } from './catvod';
import { cmsRequestHeaders, isAdultContent, parseSearchList } from './cms-parser';
import { fetchUpstream, getCache, setCache } from './fetch-utils';
import { isSpiderSource, spiderCategories, browseSpider } from './spider';
import { checkUpstreamAllowed } from './ssrf';
import type { BrowseCategory, BrowseResponse, SourceConfig } from './types';

type CmsPage = { class?: unknown; list?: unknown; pagecount?: unknown; total?: unknown };

/** 缺少分类的标准采集接口仍可浏览最新更新。 */
export function cmsCategories(data: CmsPage): BrowseCategory[] {
  const categories: BrowseCategory[] = [{ id: '', name: '最新更新' }];
  const seen = new Set(['']);
  if (!Array.isArray(data.class)) return categories;
  for (const entry of data.class.slice(0, 300)) {
    if (!entry || typeof entry !== 'object') continue;
    const id = String(entry.type_id ?? '');
    const name = typeof entry.type_name === 'string' ? entry.type_name.trim() : '';
    if (!/^[\w-]{1,80}$/.test(id) || !name || seen.has(id)) continue;
    categories.push({ id, name: name.slice(0, 100) });
    seen.add(id);
  }
  return categories;
}

export function cmsBrowsePage(data: CmsPage, source: SourceConfig, page: number): BrowseResponse {
  // HTML/错误对象不能被误报为“该源没有影片”。
  if (!Array.isArray(data.list) && data.list !== null)
    throw new Error('这个源未返回影片列表，可能仅支持搜索');
  const list = parseSearchList(data, source)
    .filter((item) => item.vodId && item.name)
    .slice(0, 200);
  const count = Number(data.pagecount);
  const total = Number(data.total);
  const pageCount =
    data.pagecount != null && Number.isSafeInteger(count) && count >= 0 ? count : undefined;
  return {
    list,
    page,
    pageCount,
    total: data.total != null && Number.isSafeInteger(total) && total >= 0 ? total : undefined,
    hasMore: page < 10000 && (pageCount !== undefined ? page < pageCount : list.length > 0),
  };
}

async function cmsRequest(
  source: SourceConfig,
  category: string | undefined,
  page: number
): Promise<CmsPage> {
  const verdict = await checkUpstreamAllowed(source.url);
  if (!verdict.ok) throw new Error(verdict.reason);
  const url = new URL(source.url);
  // 保留 API 地址已有的查询参数（例如访问令牌）。
  for (const key of ['wd', 'ids', 't', 'pg']) url.searchParams.delete(key);
  url.searchParams.set('ac', category === undefined ? 'list' : 'videolist');
  if (category !== undefined) {
    url.searchParams.set('pg', String(page));
    if (category) url.searchParams.set('t', category);
  }
  const response = await fetchUpstream(url.href, {
    headers: cmsRequestHeaders(),
    timeoutMs: 12000,
  });
  if (!response.ok) throw new Error(`源请求失败（HTTP ${response.status}）`);
  const data = await response.json();
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('这个源未返回有效的片库数据');
  if (!Array.isArray(data.class) && !Array.isArray(data.list) && data.list !== null)
    throw new Error('这个源未提供有效的片库数据，可能仅支持搜索');
  return data;
}

export async function browseCategories(
  source: SourceConfig,
  filterAdult: boolean
): Promise<BrowseCategory[]> {
  const key = `browse-categories:${source.url}`;
  let categories = getCache<BrowseCategory[]>(key);
  if (!categories) {
    categories = isCatvodSource(source)
      ? await catvodCategories(source)
      : isSpiderSource(source)
        ? await spiderCategories(source)
        : cmsCategories(await cmsRequest(source, undefined, 1));
    setCache(key, categories, 5 * 60 * 1000);
  }
  return categories.filter((category) => !filterAdult || !isAdultContent(category.name));
}

export async function browseVideos(
  source: SourceConfig,
  category: string,
  page: number,
  filterAdult: boolean
): Promise<BrowseResponse> {
  if (
    !isCatvodSource(source) &&
    !isSpiderSource(source) &&
    category &&
    !/^[\w-]{1,80}$/.test(category)
  )
    throw new Error('影片分类无效，请重新选择');
  const key = `browse-videos:${JSON.stringify([source, category, page])}`;
  let result = getCache<BrowseResponse>(key);
  if (!result) {
    result = isCatvodSource(source)
      ? await browseCatvod(source, category, page)
      : isSpiderSource(source)
        ? await browseSpider(source, category, page)
        : cmsBrowsePage(await cmsRequest(source, category, page), source, page);
    setCache(key, result, 60000);
  }
  // 不根据过滤后的数量计算下一页，避免中间页全部被过滤时断掉翻页。
  return {
    ...result,
    list: result.list.filter((item) => !filterAdult || !isAdultContent(item.typeName)),
  };
}
