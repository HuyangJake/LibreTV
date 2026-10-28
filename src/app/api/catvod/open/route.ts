import { guardRequest } from '@/lib/api-guard';
import { catvodRequest, type CatvodStatus } from '@/lib/catvod-client';
import { detailCatvod, encodeCatvodId } from '@/lib/catvod';
import { buildWatchUrl } from '@/lib/utils';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  const denied = guardRequest(req);
  if (denied) return denied;
  try {
    const body = await req.json();
    if (typeof body.url !== 'string' || body.url.length > 2048)
      throw new Error('请输入夸克视频分享链接');
    const url = new URL(body.url.trim());
    if (url.origin !== 'https://pan.quark.cn' || url.username || url.password ||
      !/^\/s\/[a-zA-Z0-9]+\/?$/.test(url.pathname))
      throw new Error('仅支持 https://pan.quark.cn/s/ 开头的分享链接');
    if (['pwd', 'passcode', 'password'].some((key) => url.searchParams.has(key)))
      throw new Error('首版暂不支持带提取码的分享，请使用无需提取码的视频分享');
    const normalized = url.origin + url.pathname.replace(/\/$/, '');
    const status = await catvodRequest<CatvodStatus>('/status');
    if (!status.running || !status.entry) throw new Error('猫影视源包尚未运行');
    const source = { key: 'catvod_nodejs_push', name: '夸克分享', url: status.entry + '#nodejs_push' };
    const id = encodeCatvodId(normalized);
    const detail = await detailCatvod(source, id);
    const sourceTitle = detail.videoInfo.title || '';
    const title = /^https?:\/\//i.test(sourceTitle)
      ? detail.lines?.[0]?.name.split(' / ')[1] || '夸克分享'
      : sourceTitle || '夸克分享';
    return Response.json({
      watchUrl: buildWatchUrl({ sourceKey: source.key, sourceUrl: source.url, vodId: id,
        title, index: 0 }),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : '分享链接打开失败' }, { status: 400 });
  }
}
