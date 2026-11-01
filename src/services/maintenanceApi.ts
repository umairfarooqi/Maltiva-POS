import { PosStorage } from './storage';
import { captureSession, endSession, sessionFetch } from './session';
import { PendingOutbox } from './pendingOutbox';

export interface BackupFile { filename: string; bytes: number; createdAt: string; safetyCopy: boolean }
export interface RestorePreview {
  token: string; sha256: string; expiresAt: number;
  backup: { counts: Record<string, number>; administrators: { username: string; name: string }[] };
  current: { counts: Record<string, number> };
}
async function request(url: string, init: RequestInit = {}) {
  const owner = captureSession(), token = owner.token;
  const response = await sessionFetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers }, signal: AbortSignal.timeout(60000) });
  owner.assertCurrent();
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Database maintenance failed. Keep your backup and retry.');
  }
  return response;
}
export async function requireClearRecovery() {
  const [pending, rejected] = await Promise.all([PendingOutbox.list(), PendingOutbox.rejected()]);
  const draft = PosStorage.getDraft();
  if (pending.length || rejected.length || draft?.attempt || draft?.cart.length) {
    throw new Error('Finish or reconcile this device’s pending, rejected and draft orders before restoring. Recovery copies have been kept.');
  }
}
export const MaintenanceApi = {
  async discard(token: string) {
    const owner = captureSession();
    await request(`/api/maintenance/restore/preview/${encodeURIComponent(token)}`, { method: 'DELETE' });
    owner.assertCurrent();
  },
  async list(): Promise<BackupFile[]> {
    const owner = captureSession();
    const body = await (await request('/api/maintenance/backups')).json();
    owner.assertCurrent();
    return body.backups;
  },
  async create(): Promise<{ filename: string }> {
    const owner = captureSession();
    const body = await (await request('/api/maintenance/backups', { method: 'POST' })).json();
    owner.assertCurrent();
    return body;
  },
  async download(filename: string) {
    const owner = captureSession();
    const response = await request(`/api/maintenance/backups/${encodeURIComponent(filename)}`);
    const blob = await response.blob();
    owner.assertCurrent();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = filename;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  async preview(file: File): Promise<RestorePreview> {
    const owner = captureSession();
    await requireClearRecovery();
    owner.assertCurrent();
    if (file.size > 64 * 1024 * 1024) throw new Error('Choose a backup up to 64 MB.');
    const bytes = await file.arrayBuffer();
    owner.assertCurrent();
    const result = await (await request('/api/maintenance/restore/preview', {
      method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes,
    })).json();
    owner.assertCurrent();
    return result;
  },
  async restore(preview: RestorePreview, password: string, confirmation: string) {
    const owner = captureSession();
    await requireClearRecovery();
    owner.assertCurrent();
    const token = owner.token;
    const result = await (await request('/api/maintenance/restore', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: preview.token, password, confirmation }),
    })).json();
    owner.assertCurrent();
    PosStorage.observeDatabaseGeneration(result.databaseGeneration, true);
    endSession(token, `Database restored. A safety backup was saved as ${result.safetyFilename}. Sign in with an account from the selected backup.`);
    return result;
  },
};
