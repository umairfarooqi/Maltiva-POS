import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
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

describe('App login screen', () => {
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

  it('renders the terminal login when no session exists', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Terminal Login' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sign In to Terminal' })).toBeVisible();
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
});
