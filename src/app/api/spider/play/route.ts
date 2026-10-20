import { guardRequest } from '@/lib/api-guard';
import { decodeSpiderExt, runSpider } from '@/lib/spider';
import { saveSpiderHeaders, spiderMedia } from '@/lib/spider-media';
export const runtime = 'nodejs';
export async function GET(req: Request) {
  const denied = guardRequest(req); if (denied) return denied;
  try {
    const p = new URL(req.url).searchParams;
    const result = await runSpider<{ urls: string[]; headers?: Record<string,string>[] }>(p.get('script') || '', 'getPlayinfo', decodeSpiderExt(p.get('ext') || ''));
    if (!result.urls?.[0]) throw new Error('Spider 未返回播放地址');
    const token = saveSpiderHeaders(result.headers?.[0] || {});
    return await spiderMedia(req, result.urls[0], token);
  } catch (err) { return Response.json({ error: err instanceof Error ? err.message : '播放解析失败' }, { status: 502 }); }
}
