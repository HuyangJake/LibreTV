import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { POST } from './route';
import { catvodRequest } from '@/lib/catvod-client';
import { saveTrack } from '@/lib/catvod';
import { SESSION_COOKIE, signSession } from '@/lib/auth';
vi.mock('@/lib/catvod-client', () => ({ catvodRequest: vi.fn(async () => ({ ok: true })) }));
beforeEach(() => vi.stubEnv('PASSWORD', 'viewer-test'));
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
function request(id: unknown, authenticated = true) {
 const { token } = signSession();
 return new Request('http://localhost/api/catvod/lease', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Cookie: `${SESSION_COOKIE}=${token}` } : {}) }, body: JSON.stringify({ id }) });
}
it('only a viewing session with a live track can prevent cleanup', async () => {
 expect((await POST(request('unknown', false))).status).toBe(401);
 expect((await POST(request('unknown'))).status).toBe(410);
 expect(catvodRequest).not.toHaveBeenCalled();
 const track = saveTrack({ sourceUrl: 'https://source.test/index.js.md5#nodejs_push', flag: '夸克', id: 'fixture' });
 expect((await POST(request(track.split('=')[1]))).status).toBe(200);
 expect(catvodRequest).toHaveBeenCalledWith('/lease', 'POST', {});
});
