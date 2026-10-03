import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { PosApi } from '../src/services/api';
import { PosStorage } from '../src/services/storage';

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
});
