import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import {
  ADMIN_COOKIE,
  adminConfigured,
  checkAdminPassword,
  isAdmin,
  signAdmin,
} from '@/lib/admin-auth';
import { checkRateLimit } from '@/lib/auth';
export const runtime = 'nodejs';
export async function GET(req: Request) {
  const d = guardRequest(req);
  if (d) return d;
  return Response.json({ configured: adminConfigured(), admin: isAdmin(req) });
}
export async function POST(req: Request) {
  const d = guardRequest(req);
  if (d) return d;
  if (req.headers.get('sec-fetch-site') === 'cross-site')
    return Response.json({ error: '拒绝跨站请求' }, { status: 403 });
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  if (!checkRateLimit('catvod-admin:' + ip))
    return Response.json({ error: '尝试过多，请稍后重试' }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.password !== 'string' || !checkAdminPassword(body.password))
    return Response.json({ error: '管理员密码错误或尚未配置独立 ADMIN_PASSWORD' }, { status: 403 });
  const res = NextResponse.json({ admin: true });
  res.cookies.set(ADMIN_COOKIE, signAdmin(), {
    httpOnly: true,
    sameSite: 'strict',
    secure:
      process.env.COOKIE_SECURE === 'true' || req.headers.get('x-forwarded-proto') === 'https',
    path: '/api/catvod',
    maxAge: 1800,
  });
  return res;
}
export async function DELETE() {
  const res = NextResponse.json({ admin: false });
  res.cookies.set(ADMIN_COOKIE, '', { httpOnly: true, path: '/api/catvod', maxAge: 0 });
  return res;
}
