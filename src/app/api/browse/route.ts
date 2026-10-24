import { guardRequest } from '@/lib/api-guard';
import { browseCategories, browseVideos } from '@/lib/source-browse';
import type { SourceConfig } from '@/lib/types';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const denied = guardRequest(req); if (denied) return denied;
  let source: SourceConfig;
  let action: string;
  let category: string;
  let page: number;
  let filterAdult: boolean;
  try {
    const raw = await req.text();
    if (Buffer.byteLength(raw) > 64000) throw new Error('请求过大');
    const body = JSON.parse(raw);
    source = body.source;
    if (!source || typeof source.key !== 'string' || !source.key || source.key.length > 200 || typeof source.name !== 'string' || source.name.length > 200 || typeof source.url !== 'string' || source.url.length > 8192 || !/^https?:\/\//.test(source.url)) throw new Error('无效的数据源配置');
    action = body.action;
    if (!['categories', 'videos'].includes(action)) throw new Error('无效的浏览操作');
    category = body.category ?? '';
    if (typeof category !== 'string' || category.length > 16000) throw new Error('影片分类无效');
    page = body.page ?? 1;
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new Error('页码必须在 1 到 10000 之间');
    filterAdult = body.filterAdult !== false;
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '请求格式错误' }, { status: 400 });
  }
  if (filterAdult && source.isAdult) return Response.json({ error: '此源受成人内容过滤限制，请先在设置中调整过滤选项' }, { status: 403 });
  try {
    const result = action === 'categories'
      ? { categories: await browseCategories(source, filterAdult) }
      : await browseVideos(source, category, page, filterAdult);
    return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '暂时无法读取这个源的片库' }, { status: 502 });
  }
}
