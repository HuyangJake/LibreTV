import { guardRequest } from '@/lib/api-guard';
import { catvodMedia } from '@/lib/catvod-media';
export const runtime = 'nodejs';
export async function GET(req: Request) {
  const d = guardRequest(req);
  if (d) return d;
  try {
    return await catvodMedia(req, new URL(req.url).searchParams.get('id') || '');
  } catch {
    return new Response('视频连接失败，请重新打开影片或更换线路', { status: 502 });
  }
}
