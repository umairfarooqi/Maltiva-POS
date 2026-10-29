import { PosStorage } from './storage';

export const SESSION_ENDED = 'pos-session-ended';
const REVOCATIONS = 'tasty_pos_session_revocations';

/** An old response must never clear or populate a newer user's session. */
export function endSession(token: string | null, message = 'Your session ended. Please sign in again.') {
  if (PosStorage.getToken() !== token) return;
  try { PosStorage.clearSession(); } catch { /* Lock the current window even when storage is blocked. */ }
  window.dispatchEvent(new CustomEvent(SESSION_ENDED, { detail: message }));
}

export async function sessionFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const authorization = new Headers(init.headers).get('Authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
  const response = await fetch(url, init);
  if (token && PosStorage.getToken() !== token) {
    throw Object.assign(new Error('The active session changed.'), { name: 'SessionChangedError' });
  }
  if (response.status === 401 && token) {
    // Invalid manager credentials also use 401, but do not invalidate the
    // requesting cashier's valid session. Middleware identifies session failures.
    const body = await response.clone().json().catch(() => ({}));
    if (url !== '/api/auth/approve' || body.code === 'SESSION_INVALID') endSession(token);
  }
  return response;
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
