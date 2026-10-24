import type { SourceConfig, SearchResultItem, VideoDetail, BrowseCategory, BrowseResponse } from './types';
import { checkUpstreamAllowed } from './ssrf';
export { isSpiderSource } from './spider-source';

export async function runSpider<T>(script: string, method: string, ext: unknown): Promise<T> {
  const endpoint = process.env.SPIDER_URL;
  if (!endpoint) throw new Error('尚未配置 Spider 服务，请使用 NAS Compose 部署');
  const verdict = await checkUpstreamAllowed(script);
  if (!verdict.ok) throw new Error(verdict.reason);
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/run`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script, method, ext }), signal: AbortSignal.timeout(22000),
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || 'Spider 服务失败');
  return data.result as T;
}
export function encodeSpiderExt(ext: unknown): string {
  const encoded = Buffer.from(JSON.stringify(ext ?? {})).toString('base64url');
  if (encoded.length > 16000) throw new Error('Spider 参数过长');
  return encoded;
}
export function decodeSpiderExt(id: string): unknown {
  if (!/^[\w-]+$/.test(id) || id.length > 16000) throw new Error('Spider 参数无效');
  return JSON.parse(Buffer.from(id, 'base64url').toString('utf8'));
}
interface Card { vod_id?: string; vod_name?: string; vod_pic?: string; vod_remarks?: string; ext?: unknown }
function spiderCards(source: SourceConfig, result: { list: Card[] }): SearchResultItem[] {
  if (!Array.isArray(result.list)) throw new Error('Spider 未返回有效的影片列表');
  return result.list.slice(0, 200).filter((card) => card.vod_name).map((card) => ({
    sourceKey: source.key, sourceName: source.name, sourceUrl: source.url, isAdult: source.isAdult,
    vodId: encodeSpiderExt(card.ext ?? { url: card.vod_id }), name: String(card.vod_name),
    pic: card.vod_pic, remarks: card.vod_remarks,
  }));
}
export async function searchSpider(source: SourceConfig, text: string): Promise<SearchResultItem[]> {
  return spiderCards(source, await runSpider<{ list: Card[] }>(source.url, 'search', { text, page: 1 }));
}

export async function spiderCategories(source: SourceConfig): Promise<BrowseCategory[]> {
  const config = await runSpider<{ tabs?: { name?: string; ext?: unknown }[] }>(source.url, 'getConfig', {});
  if (!Array.isArray(config.tabs) || !config.tabs.length) throw new Error('这个源未提供分类浏览功能，请使用首页搜索');
  const seen = new Set<string>();
  const categories: BrowseCategory[] = [];
  for (const tab of config.tabs.slice(0, 300)) {
    if (typeof tab?.name !== 'string' || !tab.name.trim()) continue;
    let ext = tab.ext ?? {};
    if (typeof ext === 'string') {
      try { ext = JSON.parse(ext); } catch { continue; }
    }
    if (!ext || typeof ext !== 'object' || Array.isArray(ext)) continue;
    const id = encodeSpiderExt(ext);
    if (seen.has(id)) continue;
    seen.add(id);
    categories.push({ id, name: tab.name.trim().slice(0, 100) });
  }
  if (!categories.length) throw new Error('这个源未提供有效的影片分类，请使用首页搜索');
  return categories;
}

export async function browseSpider(source: SourceConfig, category: string, page: number): Promise<BrowseResponse> {
  const ext = decodeSpiderExt(category);
  if (!ext || typeof ext !== 'object' || Array.isArray(ext)) throw new Error('影片分类无效，请重新选择');
  const result = await runSpider<{ list: Card[]; hasMore?: boolean; pagecount?: number }>(source.url, 'getCards', { ...ext, page });
  const list = spiderCards(source, result);
  const count = Number(result.pagecount);
  const pageCount = Number.isSafeInteger(count) && count > 0 ? count : undefined;
  return { list, page, pageCount, hasMore: page < 10000 && (pageCount !== undefined ? page < pageCount : typeof result.hasMore === 'boolean' ? result.hasMore : result.list.length > 0) };
}
export async function detailSpider(source: SourceConfig, id: string): Promise<VideoDetail> {
  const result = await runSpider<{ list: { tracks: { ext: unknown }[] }[] }>(source.url, 'getTracks', decodeSpiderExt(id));
  if (!Array.isArray(result.list)) throw new Error('Spider 详情结果缺少 list');
  const tracks = result.list.flatMap((group) => group.tracks || []).slice(0, 1000);
  if (!tracks.length) throw new Error('Spider 未返回可播放剧集');
  return {
    episodes: tracks.map((track) => `/api/spider/play?script=${encodeURIComponent(source.url)}&ext=${encodeSpiderExt(track.ext)}`),
    videoInfo: { sourceKey: source.key, sourceName: source.name, sourceUrl: source.url },
  };
}
