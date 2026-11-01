import React, { useRef, useState } from 'react';
import { MaintenanceApi, BackupFile, RestorePreview } from '../services/maintenanceApi';
import { Dialog } from './ui/Dialog';

const button = 'min-h-11 rounded-md border border-pos-control px-4 py-2 text-sm font-semibold disabled:opacity-50';
const input = 'mt-1 min-h-11 w-full rounded-md border border-pos-control bg-pos-inset px-3 py-2';
export function DatabaseMaintenance() {
  const [files, setFiles] = useState<BackupFile[]>([]);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (error) { setError((error as Error).message || 'Maintenance could not finish. Keep your backup and retry.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const closePreview = () => { setPreview(null); setPassword(''); setConfirmation(''); setError(''); };
  const cancelPreview = () => {
    if (preview) void MaintenanceApi.discard(preview.token).catch(() => { /* expires automatically if the server is unavailable */ });
    closePreview();
  };
  return <section aria-labelledby="database-backup-title" className="rounded-lg border border-pos-border bg-pos-surface p-5 space-y-4">
    <div>
      <h2 id="database-backup-title" className="text-sm font-bold">Database backup and restore</h2>
      <p className="mt-1 text-sm text-pos-secondary">Back up saved sales, payments, stock, menu, staff and settings from the server.</p>
      <p className="mt-1 text-xs text-pos-secondary">Unsynced browser orders and external image files are separate. Backups contain private staff and business data. Download a copy to another drive.</p>
      <p className="mt-1 text-xs text-pos-secondary">Supports this POS database version, up to 64 MB.</p>
    </div>
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={busy} className={`${button} bg-pos-action text-white`} onClick={() => void run(async () => {
        const backup = await MaintenanceApi.create();
        setNotice(`Backup saved on server: ${backup.filename}. Download it below.`);
        setFiles(await MaintenanceApi.list());
      })}>Create database backup</button>
      <button type="button" disabled={busy} className={button} onClick={() => void run(async () => setFiles(await MaintenanceApi.list()))}>Show saved backups</button>
      <button type="button" disabled={busy} className={button} onClick={() => fileInput.current?.click()}>Choose backup to restore</button>
      <input ref={fileInput} type="file" accept=".db,.sqlite,.sqlite3" aria-label="Database backup file" className="sr-only" disabled={busy} onChange={event => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (file) void run(async () => { const result = await MaintenanceApi.preview(file); setPassword(''); setConfirmation(''); setPreview(result); });
      }} />
    </div>
    {busy && !preview && <p role="status" className="text-sm">Checking and saving database files…</p>}
    {notice && <p role="status" className="text-sm text-pos-success-text">{notice}</p>}
    {error && !preview && <p role="alert" className="text-sm text-pos-danger-text">{error}</p>}
    {files.length > 0 && <div tabIndex={0} role="region" aria-label="Saved database backups" className="max-h-64 overflow-auto">
      <ul className="divide-y divide-pos-divider">
        {files.map(file => <li key={file.filename} className="flex flex-wrap items-center justify-between gap-2 py-3">
          <div className="min-w-0 text-xs"><p className="break-all font-mono">{file.filename}</p>
            <p className="text-pos-secondary">{file.safetyCopy ? 'Before restore' : 'Backup'} · {new Date(file.createdAt).toLocaleString()} · {(file.bytes / 1024).toFixed(0)} KB</p></div>
          <button type="button" disabled={busy} className={button} aria-label={`Download ${file.filename}`} onClick={() => void run(async () => MaintenanceApi.download(file.filename))}>Download</button>
        </li>)}
      </ul>
    </div>}
    {preview && <Dialog label="Restore database backup" busy={busy} onClose={cancelPreview} className="flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-pos-border bg-pos-surface">
      <h2 className="shrink-0 border-b border-pos-divider p-4 font-bold">Restore database backup</h2>
      <form className="flex min-h-0 flex-col" onSubmit={event => { event.preventDefault(); void run(async () => { await MaintenanceApi.restore(preview, password, confirmation); closePreview(); }); }}>
        <div className="min-h-0 space-y-4 overflow-y-auto p-4">
          <p className="text-sm">This replaces server data with the selected backup. Later sales will be kept in an automatic safety backup. Issued token numbers will not be reused.</p>
          <p className="text-sm">Stop checkout on all terminals first. Everyone will be signed out. Recovery copies on other devices will need administrator review.</p>
          <table className="w-full text-left text-sm"><caption className="sr-only">Current and backup record counts</caption>
            <thead><tr><th scope="col">Records</th><th scope="col">Current</th><th scope="col">Backup</th></tr></thead>
            <tbody>{['orders', 'payments', 'products', 'users'].map(key => <tr key={key}><th scope="row" className="py-1 font-normal capitalize">{key}</th><td>{preview.current.counts[key]}</td><td>{preview.backup.counts[key]}</td></tr>)}</tbody>
          </table>
          <p className="text-sm">After restore, sign in with a password from the backup. Administrator usernames: <strong>{preview.backup.administrators.map(admin => admin.username).join(', ')}</strong>.</p>
          <p className="break-all text-xs text-pos-secondary">File SHA-256: {preview.sha256}</p>
          <label className="block text-sm" htmlFor="restore-password">Your current administrator password
            <input id="restore-password" type="password" autoComplete="current-password" required disabled={busy} className={input} value={password} onChange={event => setPassword(event.target.value)} /></label>
          <label className="block text-sm" htmlFor="restore-confirmation">Type RESTORE to replace server data
            <input id="restore-confirmation" required disabled={busy} className={input} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
          {error && <p role="alert" className="text-sm text-pos-danger-text">{error}</p>}
        </div>
        <div className="flex shrink-0 justify-end gap-3 border-t border-pos-divider p-4">
          <button type="button" className={button} disabled={busy} onClick={cancelPreview}>Cancel restore</button>
          <button type="submit" disabled={busy || confirmation !== 'RESTORE' || !password} className={`${button} bg-pos-danger-action text-white`}>{busy ? 'Restoring…' : 'Restore database'}</button>
        </div>
      </form>
    </Dialog>}
  </section>;
}
