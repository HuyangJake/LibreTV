import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { guardRequest } from './api-guard';
export const ADMIN_COOKIE = 'ltv_admin';
function signature(value: string) {
  return createHmac('sha256', process.env.ADMIN_PASSWORD || '')
    .update('catvod-admin:' + value)
    .digest('hex');
}
export function adminConfigured() {
  return !!process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD !== process.env.PASSWORD;
}
export function checkAdminPassword(input: string) {
  if (!adminConfigured()) return false;
  return timingSafeEqual(
    createHash('sha256').update(input).digest(),
    createHash('sha256').update(process.env.ADMIN_PASSWORD!).digest()
  );
}
export function signAdmin() {
  const expires = String(Date.now() + 30 * 60000);
  return `${expires}.${signature(expires)}`;
}
export function isAdmin(req: Request) {
  if (!adminConfigured()) return false;
  const value =
    req.headers
      .get('cookie')
      ?.split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(ADMIN_COOKIE + '='))
      ?.slice(ADMIN_COOKIE.length + 1) || '';
  const [expires, sig] = value.split('.');
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now() || !sig) return false;
  const a = Buffer.from(sig),
    b = Buffer.from(signature(expires));
  return a.length === b.length && timingSafeEqual(a, b);
}
export function guardAdmin(req: Request) {
  const denied = guardRequest(req);
  if (denied) return denied;
  // Reject cross-site writes even if a proxy strips Origin accidentally elsewhere.
  if (!['GET', 'HEAD'].includes(req.method)) {
    if (req.headers.get('sec-fetch-site') === 'cross-site')
      return Response.json({ error: '拒绝跨站管理请求' }, { status: 403 });
  }
  if (!isAdmin(req)) return Response.json({ error: '需要管理员授权' }, { status: 403 });
  return null;
}
