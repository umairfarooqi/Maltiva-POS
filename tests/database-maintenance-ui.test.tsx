import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseMaintenance } from '../src/components/DatabaseMaintenance';
import { SettingsView } from '../src/components/SettingsView';
import { MaintenanceApi } from '../src/services/maintenanceApi';
import { INITIAL_PRINTER_SETTINGS, INITIAL_USERS } from '../src/data/initialData';

vi.mock('../src/services/maintenanceApi', () => ({ MaintenanceApi: {
  list: vi.fn(), create: vi.fn(), download: vi.fn(), preview: vi.fn(), restore: vi.fn(), discard: vi.fn(),
} }));
const preview = {
  token: 'preview', sha256: 'reviewed-file-hash', expiresAt: Date.now() + 60000,
  current: { counts: { orders: 8, payments: 8, products: 20, users: 3 } },
  backup: { counts: { orders: 5, payments: 5, products: 19, users: 2 }, administrators: [{ username: 'backup-admin', name: 'Owner' }] },
};
beforeEach(() => {
  localStorage.clear(); vi.resetAllMocks();
  vi.mocked(MaintenanceApi.preview).mockResolvedValue(preview);
  vi.mocked(MaintenanceApi.list).mockResolvedValue([{ filename: 'backup-file.db', bytes: 1024, createdAt: new Date().toISOString(), safetyCopy: false }]);
  vi.mocked(MaintenanceApi.create).mockResolvedValue({ filename: 'backup-file.db' });
  vi.mocked(MaintenanceApi.restore).mockResolvedValue({ success: true });
  vi.mocked(MaintenanceApi.discard).mockResolvedValue(undefined);
});
const selectFile = () => fireEvent.change(screen.getByLabelText('Database backup file'), { target: { files: [new File(['SQLite backup'], 'backup.db')] } });

describe('database maintenance settings', () => {
  it('creates a server backup and offers an authenticated download', async () => {
    const user = userEvent.setup(); render(<DatabaseMaintenance />);
    await user.click(screen.getByRole('button', { name: 'Create database backup' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Backup saved on server');
    await user.click(screen.getByRole('button', { name: 'Download backup-file.db' }));
    expect(MaintenanceApi.create).toHaveBeenCalledOnce(); expect(MaintenanceApi.download).toHaveBeenCalledWith('backup-file.db');
  });
  it('previews record counts and backup login accounts before allowing explicit password-confirmed restore', async () => {
    const user = userEvent.setup(); render(<DatabaseMaintenance />); selectFile();
    const dialog = await screen.findByRole('dialog', { name: 'Restore database backup' });
    expect(dialog).toHaveTextContent('backup-admin'); expect(dialog).toHaveTextContent('reviewed-file-hash');
    expect(within(dialog).getByRole('table')).toHaveTextContent('orders85');
    const restore = within(dialog).getByRole('button', { name: 'Restore database' });
    expect(restore).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Your current administrator password'), 'current-secret');
    await user.type(within(dialog).getByLabelText('Type RESTORE to replace server data'), 'RESTORE');
    expect(restore).toBeEnabled(); await user.click(restore);
    await waitFor(() => expect(MaintenanceApi.restore).toHaveBeenCalledWith(preview, 'current-secret', 'RESTORE'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('keeps a failed restore review open with its error and lets the administrator cancel', async () => {
    vi.mocked(MaintenanceApi.restore).mockRejectedValue(new Error('Database changed after preview. Review again.'));
    const user = userEvent.setup(); render(<DatabaseMaintenance />); selectFile();
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Your current administrator password'), 'current-secret');
    await user.type(within(dialog).getByLabelText('Type RESTORE to replace server data'), 'RESTORE');
    await user.click(within(dialog).getByRole('button', { name: 'Restore database' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Database changed after preview');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel restore' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(MaintenanceApi.discard).toHaveBeenCalledWith(preview.token);
  });
  it('reports recovery blocking before opening a destructive confirmation', async () => {
    vi.mocked(MaintenanceApi.preview).mockRejectedValue(new Error('Finish pending orders before restoring.'));
    render(<DatabaseMaintenance />); selectFile();
    expect(await screen.findByRole('alert')).toHaveTextContent('Finish pending orders');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(MaintenanceApi.restore).not.toHaveBeenCalled();
  });
  it('prevents repeated backup clicks while creation is in progress', async () => {
    let resolve!: (value: { filename: string }) => void;
    vi.mocked(MaintenanceApi.create).mockReturnValue(new Promise(done => { resolve = done; }));
    const user = userEvent.setup(); render(<DatabaseMaintenance />);
    const button = screen.getByRole('button', { name: 'Create database backup' });
    await user.dblClick(button); expect(MaintenanceApi.create).toHaveBeenCalledOnce(); expect(button).toBeDisabled();
    resolve({ filename: 'backup-file.db' }); await waitFor(() => expect(button).toBeEnabled());
  });
  it('does not expose database maintenance controls to a cashier', () => {
    render(<SettingsView settings={INITIAL_PRINTER_SETTINGS} currentUser={INITIAL_USERS[1]} onSaveSettings={vi.fn()} onOpenTestPrint={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Create database backup' })).not.toBeInTheDocument();
  });
});
