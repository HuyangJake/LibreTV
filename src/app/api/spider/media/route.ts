import { guardRequest } from '@/lib/api-guard';
import { spiderMedia } from '@/lib/spider-media';
export const runtime = 'nodejs';
export async function GET(req: Request) {
  const denied = guardRequest(req); if (denied) return denied;
  const p = new URL(req.url).searchParams;
  try { return await spiderMedia(req, p.get('url') || '', p.get('token') || ''); }
  catch (err) { return new Response(err instanceof Error ? err.message : '媒体请求失败', { status: 502 }); }
}
