import { beforeEach, describe, it, expect, vi } from 'vitest';
import {
  ADMIN_COOKIE,
  adminConfigured,
  checkAdminPassword,
  isAdmin,
  signAdmin,
} from './admin-auth';
describe('CatVod administrator authorization', () => {
  beforeEach(() => {
    vi.stubEnv('PASSWORD', 'viewing');
    vi.stubEnv('ADMIN_PASSWORD', 'separate-admin');
  });
  it('requires a separate administrator secret', () => {
    expect(adminConfigured()).toBe(true);
    vi.stubEnv('ADMIN_PASSWORD', 'viewing');
    expect(adminConfigured()).toBe(false);
    expect(checkAdminPassword('viewing')).toBe(false);
  });
  it('rejects viewing sessions and tampered admin signatures', () => {
    expect(checkAdminPassword('viewing')).toBe(false);
    expect(checkAdminPassword('separate-admin')).toBe(true);
    const token = signAdmin();
    const req = (t: string) =>
      new Request('http://localhost/api/catvod/manage', {
        headers: { cookie: `${ADMIN_COOKIE}=${t}` },
      });
    expect(isAdmin(req(token))).toBe(true);
    expect(isAdmin(req(token + '0'))).toBe(false);
    vi.stubEnv('ADMIN_PASSWORD', 'changed-admin');
    expect(isAdmin(req(token))).toBe(false);
  });
});
