import { checkoutData } from './clientPrivacy';
import { PosStorage } from './storage';

export const SESSION_ENDED = 'pos-session-ended';
const REVOCATIONS = 'tasty_pos_session_revocations';

export function captureSession() {
  const token = PosStorage.getToken(), revision = PosStorage.sessionRevision();
  const generation = PosStorage.getDatabaseGeneration();
  const isCurrent = () => PosStorage.getToken() === token && PosStorage.sessionRevision() === revision &&
    (generation === null || PosStorage.getDatabaseGeneration() === generation);
  const assertCurrent = () => {
    if (!isCurrent()) throw Object.assign(new Error('The active session changed.'), { name: 'SessionChangedError' });
  };
  return { token, isCurrent, assertCurrent };
}

if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key === null || event.key === 'tasty_pos_auth_token') {
    PosStorage.invalidatePrivateMemory();
    PosStorage.sanitizeBrowserData();
  }
});

/** An old response must never clear or populate a newer user's session. */
export function endSession(token: string | null, message = 'Your session ended. Please sign in again.') {
  if (PosStorage.getToken() !== token) return;
  try { PosStorage.clearSession(); } catch { /* Lock the current window even when storage is blocked. */ }
  window.dispatchEvent(new CustomEvent(SESSION_ENDED, { detail: message }));
}

export async function sessionFetch(url: string, init: RequestInit = {}, options: { saleAcknowledgment?: boolean } = {}): Promise<Response> {
  const owner = captureSession();
  const authorization = new Headers(init.headers).get('Authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
  if (token && token !== owner.token) throw Object.assign(new Error('The active session changed.'), { name: 'SessionChangedError' });
  let response: Response;
  try { response = await fetch(url, init); }
  catch (error) { owner.assertCurrent(); throw error; }
  if (token && (PosStorage.getToken() !== token || !owner.isCurrent())) {
    throw Object.assign(new Error('The active session changed.'), { name: 'SessionChangedError' });
  }
  const generation = response.headers.get('X-POS-Database-Generation');
  if (generation && url !== '/api/maintenance/restore' &&
      PosStorage.observeDatabaseGeneration(generation, response.headers.get('X-POS-Database-Restored') === 'true')) {
    endSession(token, 'The server database was restored or changed. Sign in again. Recovery copies are retained for administrator review.');
    throw Object.assign(new Error('Database changed. Sign in again.'), { name: 'SessionChangedError' });
  }
  if (response.status === 401 && token) {
    // Invalid manager credentials also use 401, but do not invalidate the
    // requesting cashier's valid session. Middleware identifies session failures.
    const body = await response.clone().json().catch(() => ({}));
    if (url !== '/api/auth/approve' || body.code === 'SESSION_INVALID') endSession(token);
  }
  const delivered = captureSession();
  // A Response resolves before its body. Keep the guard through JSON/blob decoding,
  // including cloned responses. The sole stale-body exception is a safe canonical
  // sale acknowledgment: a paid sale must remain recoverable after logout.
  const wrap = (value: Response): Response => new Proxy(value, {
    get(target, key) {
      const member = Reflect.get(target, key, target);
      if (key === 'clone' && typeof member === 'function') return () => wrap(member.call(target));
      if (typeof member === 'function' && ['json', 'blob', 'text', 'arrayBuffer', 'formData'].includes(String(key))) {
        return async () => {
          let body: any;
          try { body = await member.call(target); }
          catch (error) { delivered.assertCurrent(); throw error; }
          if (key === 'json' && options.saleAcknowledgment && url === '/api/orders' && target.status === 201 && !delivered.isCurrent()) return checkoutData(body);
          delivered.assertCurrent();
          return body;
        };
      }
      return typeof member === 'function' ? member.bind(target) : member;
    },
  });
  return wrap(response);
}

function revocations(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(REVOCATIONS) || '[]');
    return Array.isArray(value) ? value.filter(token => typeof token === 'string') : [];
  } catch { return []; }
}

export function queueSessionRevocation(token: string) {
  localStorage.setItem(REVOCATIONS, JSON.stringify([...new Set([...revocations(), token])]));
}

let flushing: Promise<void> | null = null;
export function flushSessionRevocations(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    for (const token of revocations()) {
      try {
        // Use raw fetch: a former session's revocation cannot invalidate a new one.
        const response = await fetch('/api/auth/logout', { method: 'POST',
          headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
        if (response.ok || response.status === 401) {
          localStorage.setItem(REVOCATIONS, JSON.stringify(revocations().filter(value => value !== token)));
        }
      } catch { /* Retain offline revocations until the local server returns. */ }
    }
  })().finally(() => { flushing = null; });
  return flushing;
}
