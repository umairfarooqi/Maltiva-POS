import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ManageDishesView } from '../src/components/ManageDishesView';
import { PosApi } from '../src/services/api';
import { PosStorage } from '../src/services/storage';
import { Category, User } from '../src/types/pos';

const adminUser: User = {
  id: 'user-admin',
  name: 'Admin',
  username: 'admin',
  email: 'admin@example.com',
  role: 'admin',
  avatar: '',
  active: true,
  branch: 'Main',
};

const baseCategories: Category[] = [
  { id: 'cat-all', name: 'All Menu', icon: '🍲', itemCount: 0, order: 0 },
];

describe('category management', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('deletes a newly created online category using the id returned from create', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1790000000000);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'cat-server-remapped', name: 'Quick Snacks', icon: '🍔' }),
        })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
    );

    const created = await PosApi.createCategory('Quick Snacks', '🍔', true);
    await PosApi.deleteCategory(created.id, true);

    expect(PosStorage.getCategories().map(category => category.name)).not.toContain('Quick Snacks');
  });

  it('keeps the category locally when an online delete fails on the server', async () => {
    PosStorage.setCategories([
      ...baseCategories,
      { id: 'cat-snacks', name: 'Quick Snacks', icon: '🍔', itemCount: 0, order: 99 },
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Delete failed' }),
      })
    );

    await expect(PosApi.deleteCategory('cat-snacks', true)).rejects.toThrow('Delete failed');

    expect(PosStorage.getCategories().map(category => category.name)).toContain('Quick Snacks');
  });

  it('offers fast-food emoji presets when creating a category', async () => {
    const user = userEvent.setup();
    const onSaveCategory = vi.fn().mockResolvedValue(undefined);

    render(
      <ManageDishesView
        products={[]}
        categories={baseCategories}
        currentUser={adminUser}
        onSaveProduct={vi.fn()}
        onDeleteProduct={vi.fn()}
        onSaveCategory={onSaveCategory}
        onUpdateCategory={vi.fn()}
        onDeleteCategory={vi.fn()}
        onAdjustStock={vi.fn()}
      />
    );

    await user.click(screen.getAllByRole('button', { name: /add category/i })[0]);
    await user.click(screen.getByRole('button', { name: 'Use burger emoji' }));

    expect(screen.getByLabelText(/icon emoji/i)).toHaveValue('🍔');
  });
});
