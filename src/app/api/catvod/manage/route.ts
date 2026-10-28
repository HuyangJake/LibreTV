import { clearCatvodCache } from '@/lib/catvod-cache';
import { guardAdmin } from '@/lib/admin-auth';
import { catvodRequest } from '@/lib/catvod-client';
export const runtime = 'nodejs';
const actions: Record<string, [string, string]> = {
  install: ['/install', 'POST'],
  rollback: ['/rollback', 'POST'],
  update: ['/update', 'GET'],
  sites: ['/sites', 'PUT'],
  quarkStatus: ['/quark/status', 'GET'],
  cookie: ['/quark/cookie', 'PUT'],
  qr: ['/quark/qr', 'POST'],
  cancelQr: ['/quark/qr/cancel', 'POST'],
  poll: ['/quark/qr/poll', 'POST'],
  files: ['/quark/files', 'GET'],
  cleanup: ['/quark/cleanup', 'POST'],
};
export async function POST(req: Request) {
  const d = guardAdmin(req);
  if (d) return d;
  try {
    const raw = await req.text();
    if (raw.length > 24000) throw new Error('请求过大');
    const body = JSON.parse(raw);
    const target = actions[body.action];
    if (!target) throw new Error('无效的管理操作');
    const result = await catvodRequest<Record<string, unknown>>(target[0], target[1], target[1] === 'GET' ? undefined : body);
    if (['cookie','cleanup','install','rollback'].includes(body.action) || (body.action === 'poll' && result.done)) clearCatvodCache();
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : '管理操作失败' },
      { status: 400 }
    );
  }
}
