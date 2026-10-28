import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { POST } from './route';
import { catvodRequest } from '@/lib/catvod-client';
import { detailCatvod } from '@/lib/catvod';
import { SESSION_COOKIE, signSession } from '@/lib/auth';
vi.mock('@/lib/catvod-client', () => ({ catvodRequest: vi.fn() }));
vi.mock('@/lib/catvod', async (original) => ({ ...await original<typeof import('@/lib/catvod')>(), detailCatvod: vi.fn() }));
beforeEach(() => { vi.stubEnv('PASSWORD', 'test-viewer'); });
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
function request(url: string, login = true) {
  const { token } = signSession();
  return new Request('http://localhost/api/catvod/open', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(login ? { Cookie: `${SESSION_COOKIE}=${token}` } : {}) }, body: JSON.stringify({ url }) });
}
it('requires viewing authorization before enumerating a share', async () => {
  expect((await POST(request('https://pan.quark.cn/s/public123', false))).status).toBe(401);
  expect(catvodRequest).not.toHaveBeenCalled();
});
it('rejects non-Quark targets and unsupported password links before runtime access', async () => {
  for (const url of ['http://pan.quark.cn/s/abc', 'https://pan.quark.cn.evil.test/s/abc', 'https://user:pass@pan.quark.cn/s/abc', 'https://pan.quark.cn/s/abc?pwd=1234', 'https://pan.quark.cn/s/abc/other']) {
    expect((await POST(request(url))).status).toBe(400);
  }
  expect(catvodRequest).not.toHaveBeenCalled();
});
it('normalizes a public share and returns a local watch page without playback resolution', async () => {
  vi.mocked(catvodRequest).mockResolvedValue({ running: true, entry: 'https://source.test/index.js.md5' });
  vi.mocked(detailCatvod).mockResolvedValue({ episodes: ['/api/catvod/play?id=opaque'], videoInfo: { title: '测试分享', sourceKey: 'catvod_nodejs_push', sourceName: '夸克分享' } });
  const response = await POST(request('https://pan.quark.cn/s/public123/?from=share#fragment'));
  expect(response.status).toBe(200);
  const data = await response.json(); const url = new URL(data.watchUrl, 'http://localhost');
  expect(url.pathname).toBe('/watch');
  expect(Buffer.from(url.searchParams.get('id')!, 'base64url').toString()).toBe('https://pan.quark.cn/s/public123');
  expect(detailCatvod).toHaveBeenCalledOnce();
  expect(catvodRequest).toHaveBeenCalledOnce();
  expect(catvodRequest).toHaveBeenCalledWith('/status');
});

it('uses the shared folder name when the source only returns a URL as its title', async () => {
  vi.mocked(catvodRequest).mockResolvedValue({ running: true, entry: 'https://source.test/index.js.md5' });
  vi.mocked(detailCatvod).mockResolvedValue({ episodes: ['opaque'], lines: [{ name: '夸克-share / 测试剧集 / 第一季', episodes: [{ name: '01', url: 'opaque' }] }], videoInfo: { title: 'https://pan.quark.cn/s/public123', sourceKey: 'catvod_nodejs_push', sourceName: '夸克分享' } });
  const response = await POST(request('https://pan.quark.cn/s/public123'));
  const data = await response.json();
  expect(new URL(data.watchUrl, 'http://localhost').searchParams.get('title')).toBe('测试剧集');
});
