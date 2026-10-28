import { randomUUID } from 'node:crypto';
import { catvodRequest } from './catvod-client';
import { catvodSite } from './catvod-source';
import { getCatvodCache as getCache, setCatvodCache as setCache } from './catvod-cache';
import type {
  BrowseCategory,
  BrowseResponse,
  SearchResultItem,
  SourceConfig,
  VideoDetail,
  VideoLine,
} from './types';
type Vod = {
  vod_id?: string;
  vod_name?: string;
  vod_pic?: string;
  vod_remarks?: string;
  vod_content?: string;
  vod_play_from?: string;
  vod_play_url?: string;
};
interface Result {
  list?: Vod[];
  class?: { type_id: string; type_name: string }[];
  pagecount?: number;
  total?: number;
}
export function encodeCatvodId(id: string) {
  return Buffer.from(id).toString('base64url');
}
export function decodeCatvodId(id: string) {
  if (!/^[\w-]{1,16000}$/.test(id)) throw new Error('影片 ID 无效');
  return Buffer.from(id, 'base64url').toString();
}
export async function operate<T>(
  source: Pick<SourceConfig, 'url'>,
  method: string,
  params: unknown
): Promise<T> {
  return catvodRequest('/operate', 'POST', {
    entry: source.url.split('#')[0],
    site: catvodSite(source),
    method,
    params,
  });
}
export function catvodCards(source: SourceConfig, data: Result): SearchResultItem[] {
  if (!Array.isArray(data.list)) throw new Error('源站没有返回影片列表');
  return data.list
    .filter((v) => v.vod_id && v.vod_name)
    .slice(0, 200)
    .map((v) => ({
      sourceKey: source.key,
      sourceName: source.name,
      sourceUrl: source.url,
      vodId: encodeCatvodId(String(v.vod_id)),
      name: String(v.vod_name),
      pic: v.vod_pic,
      remarks: v.vod_remarks,
      isAdult: source.isAdult,
    }));
}
export async function searchCatvod(source: SourceConfig, wd: string) {
  return catvodCards(source, await operate<Result>(source, 'search', { wd, page: 1 }));
}
export async function catvodCategories(source: SourceConfig): Promise<BrowseCategory[]> {
  const d = await operate<Result>(source, 'home', {});
  if (!Array.isArray(d.class)) throw new Error('此站点暂不支持分类浏览，请使用搜索');
  return d.class
    .slice(0, 300)
    .map((c) => ({ id: encodeCatvodId(String(c.type_id)), name: String(c.type_name) }));
}
export async function browseCatvod(
  source: SourceConfig,
  category: string,
  page: number
): Promise<BrowseResponse> {
  const d = await operate<Result>(source, 'category', {
    id: decodeCatvodId(category),
    page,
    filter: true,
    filters: {},
  });
  const list = catvodCards(source, d);
  const count = Number(d.pagecount);
  return {
    list,
    page,
    pageCount: Number.isSafeInteger(count) && count > 0 ? count : undefined,
    hasMore: Number.isSafeInteger(count) && count > 0 ? page < count : list.length > 0,
  };
}
export interface CatvodTrack {
  sourceUrl: string;
  flag: string;
  id: string;
}
export function saveTrack(track: CatvodTrack) {
  const id = randomUUID();
  setCache('catvod-track:' + id, track, 6 * 3600000);
  return `/api/catvod/play?id=${id}`;
}
export function getTrack(id: string) {
  const t = getCache<CatvodTrack>('catvod-track:' + id);
  if (!t) throw new Error('播放信息已过期，请重新打开影片');
  return t;
}
export function catvodDetail(source: SourceConfig, data: Result): VideoDetail {
  const vod = data.list?.[0];
  if (!vod) throw new Error('未找到影片详情');
  const flags = String(vod.vod_play_from || '').split('$$$'),
    groups = String(vod.vod_play_url || '').split('$$$');
  const lines: VideoLine[] = groups
    .map((g, i) => ({
      name: flags[i] || `线路 ${i + 1}`,
      episodes: g
        .split('#')
        .filter(Boolean)
        .flatMap((raw, j) => {
          const split = raw.indexOf('$');
          const name = split >= 0 ? raw.slice(0, split) : `第 ${j + 1} 集`;
          const id = split >= 0 ? raw.slice(split + 1) : raw;
          return id
            ? [{ name, url: saveTrack({ sourceUrl: source.url, flag: flags[i] || '', id }) }]
            : [];
        }),
    }))
    .filter((l) => l.episodes.length);
  if (!lines.length) throw new Error('此影片没有可播放线路');
  return {
    episodes: lines[0].episodes.map((e) => e.url),
    lines,
    videoInfo: {
      title: vod.vod_name,
      cover: vod.vod_pic,
      desc: vod.vod_content?.replace(/<[^>]*>/g, ''),
      remarks: vod.vod_remarks,
      sourceKey: source.key,
      sourceName: source.name,
      sourceUrl: source.url,
    },
  };
}
export async function detailCatvod(source: SourceConfig, id: string) {
  const key = 'catvod-detail:' + source.url + ':' + id;
  const cached = getCache<VideoDetail>(key);
  if (cached) return cached;
  const detail = catvodDetail(source, await operate<Result>(source, 'detail', { id: decodeCatvodId(id) }));
  setCache(key, detail, 5 * 60000);
  return detail;
}
