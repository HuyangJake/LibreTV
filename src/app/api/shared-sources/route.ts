import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { readShared, writeShared } from '@/lib/shared-sources-server';
import { validateShared } from '@/lib/shared-sources';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const denied = guardRequest(req); if (denied) return denied;
  try { return NextResponse.json(await readShared(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: '无法读取 NAS 源配置，请检查数据目录' }, { status: 500 }); }
}
export async function PUT(req: Request) {
  const denied = guardRequest(req); if (denied) return denied;
  if (!req.headers.get('content-type')?.startsWith('application/json') || req.headers.get('sec-fetch-site') === 'cross-site') {
    return NextResponse.json({ error: '禁止跨站写入' }, { status: 403 });
  }
  let body;
  try {
    const reader = req.body?.getReader();
    if (!reader) throw new Error('请求为空');
    let text = ''; let size = 0; const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) { await reader.cancel(); throw new Error('配置过大'); }
      text += decoder.decode(value, { stream: true });
    }
    body = JSON.parse(text + decoder.decode());
    if (typeof body.revision !== 'string') throw new Error('缺少配置版本');
    body.data = validateShared(body.data);
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : '配置无效' }, { status: 400 }); }
  try {
    const result = await writeShared(body.revision, body.data);
    return NextResponse.json(result.snapshot, { status: result.conflict ? 409 : 200 });
  } catch { return NextResponse.json({ error: '保存失败，请检查 NAS 数据目录权限' }, { status: 500 }); }
}
