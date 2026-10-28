import manifest from './public-quark-catalog.json' with { type: 'json' };

export const publicCatalogKey = manifest.key;
export function publicCatalogSite(pushApi) {
  return { key: manifest.key, name: manifest.name, api: pushApi };
}
function findItem(id) {
  const item = manifest.items.find(item => item.id === id);
  if (!item) throw new Error('公开目录中没有此影片，请重新选择');
  return item;
}
export function publicShare(id) {
  return 'https://pan.quark.cn/s/' + findItem(id).share;
}
export function publicCatalogResult(method, params = {}) {
  if (method === 'init') return {};
  if (!['home', 'category', 'search'].includes(method)) throw new Error('公开目录不支持此操作');
  const query = String(params.wd || '').trim().toLowerCase();
  let items = manifest.items.filter(item =>
    (method !== 'search' || item.name.toLowerCase().includes(query)) &&
    (method !== 'category' || !params.id || item.category === params.id));
  if (Number(params.page || 1) !== 1) items = [];
  return {
    class: manifest.categories,
    page: 1, pagecount: 1, total: items.length,
    list: items.map(item => ({ vod_id: item.id, vod_name: item.name, vod_remarks: '公开分享 · 手动维护目录' })),
  };
}
export function publicCatalogDetail(id, data) {
  const item = findItem(id);
  const vod = data?.list?.[0];
  const groups = String(vod?.vod_play_url || '').split('$$$');
  const flags = String(vod?.vod_play_from || '').split('$$$');
  for (let i = 0; i < groups.length; i++) for (const raw of groups[i].split('#')) {
    const separator = raw.indexOf('$');
    if (separator < 0) continue;
    const fields = raw.slice(separator + 1).split('*');
    if (fields[0] === item.share && fields[2] === item.fid) return {
      list: [{ ...vod, vod_id: item.id, vod_name: item.name, vod_play_from: flags[i], vod_play_url: raw }],
    };
  }
  throw new Error('公开分享已失效、受限或文件被移除，请切换资源');
}
