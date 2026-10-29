import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { StaffManagementView } from '../src/components/StaffManagementView';
import { PosApi } from '../src/services/api';
import { PosStorage } from '../src/services/storage';
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
    vi.spyOn(PosStorage, 'getSession').mockReturnValue(null);
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

  it('requires confirmation before logging out', async () => {
    const user = userEvent.setup();
    vi.spyOn(PosStorage, 'getSession').mockReturnValue(currentUser);
    const clearSession = vi.spyOn(PosStorage, 'clearSession').mockImplementation(() => {});

    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Logout' }));
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
