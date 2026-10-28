import { guardRequest } from '@/lib/api-guard';
import { getTrack } from '@/lib/catvod';
import { catvodRequest } from '@/lib/catvod-client';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  const denied = guardRequest(req);
  if (denied) return denied;
  try {
    const { id } = await req.json();
    if (typeof id !== 'string' || id.length > 100) throw new Error('播放参数无效');
    getTrack(id);
    await catvodRequest('/lease', 'POST', {});
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: '播放会话已过期' }, { status: 410 });
  }
}
