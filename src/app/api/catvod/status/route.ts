import { guardRequest } from '@/lib/api-guard';
import { catvodRequest, type CatvodStatus } from '@/lib/catvod-client';
export const runtime = 'nodejs';
export async function GET(req: Request) {
  const d = guardRequest(req);
  if (d) return d;
  if (!process.env.CATVOD_URL)
    return Response.json({ configured: false, running: false, sites: [], sources: [] });
  try {
    return Response.json(await catvodRequest<CatvodStatus>('/status'), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json({ error: '猫影视运行服务暂不可用' }, { status: 502 });
  }
}
