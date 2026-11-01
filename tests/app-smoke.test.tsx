import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { StaffManagementView } from '../src/components/StaffManagementView';
import { PosApi } from '../src/services/api';
import { PosStorage } from '../src/services/storage';
import { PendingOutbox } from '../src/services/pendingOutbox';
import { saleFixture } from './helpers/sale-fixtures';
import { User } from '../src/types/pos';

const currentUser: User = {
  id: 'user-admin',
  name: 'Admin',
  username: 'admin',
  email: 'admin@example.com',
  role: 'admin',
  avatar: '',
  active: true,
  branch: 'Main',
};

const cashierUser: User = {
  id: 'user-cashier',
  name: 'Front Cashier',
  username: 'cashier1',
  email: 'cashier1@example.com',
  role: 'cashier',
  avatar: '',
  active: true,
  branch: 'Main',
};

describe('App login screen and staff PIN reset', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(PosStorage, 'getSession').mockReturnValue(null);
    vi.spyOn(PosApi, 'fetchLoginStaff').mockResolvedValue([]);
    vi.spyOn(PosApi, 'fetchCatalog').mockResolvedValue({ categories: [], products: [], printerSettings: PosStorage.getPrinterSettings() });
    vi.spyOn(PosApi, 'getSession').mockResolvedValue({ user: currentUser, expiresAt: Date.now() + 3600000 });
    vi.spyOn(PosApi, 'fetchInitialData').mockResolvedValue({
      categories: [],
      products: [],
      orders: [],
      tables: [],
      users: [],
      printerSettings: PosStorage.getPrinterSettings(),
      inventoryLogs: [],
      isOnline: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the terminal login when no session exists and never exposes self-signup or self-reset', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Terminal Login' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sign In to Terminal' })).toBeVisible();
    expect(screen.queryByText(/Create Admin/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/First-Time Setup/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Password/i }));
    expect(screen.queryByRole('button', { name: /Forgot/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Contact Admin for PIN reset/i)).toBeVisible();
  });
  it('does not reparse saved history and the checkout draft on unrelated renders', () => {
    const orders = vi.spyOn(PosStorage, 'getOrders'), draft = vi.spyOn(PosStorage, 'getDraft');
    const view = render(<App />);
    expect(orders).toHaveBeenCalledOnce(); expect(draft).toHaveBeenCalledOnce();
    orders.mockClear(); draft.mockClear();
    view.rerender(<App />);
    expect(orders).not.toHaveBeenCalled(); expect(draft).not.toHaveBeenCalled();
  });
  it('ignores an older pending-count result after a newer outbox notification', async () => {
    let resolveOld!: (orders: any[]) => void;
    const list = vi.spyOn(PendingOutbox, 'list').mockResolvedValueOnce([])
      .mockReturnValueOnce(new Promise(done => { resolveOld = done; })).mockResolvedValue([]);
    render(<App />);
    await waitFor(() => expect(list).toHaveBeenCalledOnce());
    await act(async () => { window.dispatchEvent(new Event('pos-outbox-changed')); });
    await act(async () => { window.dispatchEvent(new Event('pos-outbox-changed')); });
    await act(async () => { resolveOld([saleFixture('stale-count')]); });
    expect(screen.queryByRole('status', { name: 'Pending sales' })).not.toBeInTheDocument();
  });
  it('uses the latest recovery snapshot instead of an older sync response count', async () => {
    PosStorage.setToken('smoke-session');
    vi.spyOn(PendingOutbox, 'list').mockResolvedValue([]);
    vi.spyOn(PosApi, 'syncOfflineQueue').mockResolvedValue({ syncedCount: 0, rejectedCount: 0, pendingCount: 1, reachable: true });
    const recovered = vi.spyOn(PosApi, 'loadRecoveryOrders').mockResolvedValue([]);
    render(<App />);
    await waitFor(() => expect(recovered).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole('status', { name: 'Pending sales' })).not.toBeInTheDocument();
  });

  it('loads only public staff before login and fetches private bootstrap after successful login', async () => {
    const user = userEvent.setup();
    vi.mocked(PosApi.fetchLoginStaff).mockResolvedValue([
      { id: currentUser.id, name: currentUser.name, username: currentUser.username, avatar: currentUser.avatar },
    ]);
    vi.spyOn(PosApi, 'login').mockResolvedValue({ success: true, user: currentUser });
    vi.spyOn(PosApi, 'syncOfflineQueue').mockResolvedValue({ syncedCount: 0, rejectedCount: 0, pendingCount: 0, reachable: true });
    render(<App />);
    await screen.findByRole('button', { name: /Admin @admin/ });
    expect(PosApi.fetchInitialData).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Password' }));
    await user.type(screen.getByLabelText('Password / PIN'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign In to Terminal' }));
    await waitFor(() => expect(PosApi.fetchInitialData).toHaveBeenCalledOnce());
    expect(screen.queryByRole('heading', { name: 'Terminal Login' })).not.toBeInTheDocument();
  });

  it('requires confirmation before logging out', async () => {
    const user = userEvent.setup();
    vi.spyOn(PosStorage, 'getSession').mockReturnValue(currentUser);
    PosStorage.setToken('smoke-session');
    const clearSession = vi.spyOn(PosStorage, 'clearSession').mockImplementation(() => {});

    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Logout' }));
    expect(screen.getByRole('alertdialog', { name: 'Log out?' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(clearSession).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Logout' }));
    await user.click(screen.getByRole('button', { name: 'Log out' }));

    expect(clearSession).toHaveBeenCalledOnce();
    expect(screen.getByRole('heading', { name: 'Terminal Login' })).toBeVisible();
  });

  it('allows an admin to reset a staff member PIN from Staff Management', async () => {
    const user = userEvent.setup();
    const onResetUserPin = vi.fn().mockResolvedValue(undefined);

    render(
      <StaffManagementView
        users={[currentUser, cashierUser]}
        currentUser={currentUser}
        onAddUser={vi.fn()}
        onToggleUserActive={vi.fn()}
        onResetUserPin={onResetUserPin}
      />
    );

    const resetButtons = screen.getAllByRole('button', { name: /Reset PIN/i });
    await user.click(resetButtons[1]);

    expect(screen.getByRole('heading', { name: 'Reset PIN & Unlock' })).toBeVisible();
    await user.type(screen.getByPlaceholderText('4-digit PIN'), '9876');
    await user.click(screen.getByRole('button', { name: 'Save New PIN' }));

    expect(onResetUserPin).toHaveBeenCalledWith('user-cashier', '9876', undefined);
    expect(await screen.findByText(/Credentials updated and account unlocked for Front Cashier/i)).toBeVisible();
  });
});
