import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PosApi } from '../src/services/api';
import { PosStorage } from '../src/services/storage';
import { SESSION_ENDED, flushSessionRevocations, sessionFetch } from '../src/services/session';
import { INITIAL_USERS } from '../src/data/initialData';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => { localStorage.clear(); PosStorage.setToken('current-token'); PosStorage.setSession(INITIAL_USERS[0]); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('client session enforcement', () => {
  it('keeps the server expiration supplied at login for immediate expiry scheduling', async () => {
    const expiresAt = Date.now() + 3600000;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ user: INITIAL_USERS[0], token: 'fresh-token', expiresAt })));
    expect(await PosApi.login('admin', 'secret')).toMatchObject({ success: true, expiresAt });
    expect(PosStorage.getToken()).toBe('fresh-token');
  });

  it('ends the current session on an authenticated 401 from any protected operation', async () => {
    const ended = vi.fn(); window.addEventListener(SESSION_ENDED, ended);
    try {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ code: 'SESSION_INVALID' }, 401)));
      await expect(PosApi.deleteProduct('dish', true)).rejects.toThrow();
      expect(PosStorage.getToken()).toBeNull();
      expect(PosStorage.getSession()).toBeNull();
      expect(ended).toHaveBeenCalledOnce();
    } finally { window.removeEventListener(SESSION_ENDED, ended); }
  });

  it.each([['/api/products', 403, {}], ['/api/auth/approve', 401, { error: 'Invalid manager PIN.' }]])(
    'does not log out a valid session for a permission/credential error on %s', async (url, status, body) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(body, status)));
      expect((await sessionFetch(url, { headers: { Authorization: 'Bearer current-token' } })).status).toBe(status);
      expect(PosStorage.getToken()).toBe('current-token');
    });

  it('does not let a delayed response from an old token clear the new login', async () => {
    let respond!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { respond = resolve; })));
    const oldRequest = sessionFetch('/api/data', { headers: { Authorization: 'Bearer current-token' } });
    PosStorage.setToken('new-token'); PosStorage.setSession(INITIAL_USERS[1]);
    respond(json({ code: 'SESSION_INVALID' }, 401));
    await expect(oldRequest).rejects.toThrow('active session changed');
    expect(PosStorage.getToken()).toBe('new-token');
    expect(PosStorage.getSession()?.id).toBe(INITIAL_USERS[1].id);
  });

  it('retains an offline logout for server revocation without affecting a later login', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Server stopped')));
    await PosApi.logout();
    expect(PosStorage.getToken()).toBeNull();
    expect(JSON.parse(localStorage.getItem('tasty_pos_session_revocations')!)).toEqual(['current-token']);
    PosStorage.setToken('new-token');
    const fetcher = vi.fn().mockResolvedValue(json({ success: true })); vi.stubGlobal('fetch', fetcher);
    await flushSessionRevocations();
    expect(fetcher).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ headers: { Authorization: 'Bearer current-token' } }));
    expect(JSON.parse(localStorage.getItem('tasty_pos_session_revocations')!)).toEqual([]);
    expect(PosStorage.getToken()).toBe('new-token');
  });

  it('still locks and attempts server revocation when local revocation storage is full', async () => {
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === 'tasty_pos_session_revocations') throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, key, value);
    });
    const fetcher = vi.fn().mockResolvedValue(json({ success: true })); vi.stubGlobal('fetch', fetcher);
    await PosApi.logout();
    expect(PosStorage.getToken()).toBeNull();
    expect(fetcher).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ headers: { Authorization: 'Bearer current-token' } }));
  });
});
