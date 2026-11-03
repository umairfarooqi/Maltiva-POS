import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StaffManagementView } from '../src/components/StaffManagementView';
import { INITIAL_USERS } from '../src/data/initialData';
import type { StaffEvent } from '../src/types/pos';

const event = (overrides: Partial<StaffEvent>): StaffEvent => ({
  id: 'e1', createdAt: '2026-11-04T09:30:00.000Z', actorId: 'user-admin', actorUsername: 'admin',
  targetId: 'user-cashier', targetUsername: 'cashier', action: 'suspended', detail: '', ...overrides,
});

describe('staff account history panel', () => {
  const view = (loadStaffEvents?: () => Promise<StaffEvent[]>) => render(
    <StaffManagementView users={INITIAL_USERS} currentUser={INITIAL_USERS[0]} onAddUser={vi.fn()}
      onToggleUserActive={vi.fn()} onResetUserPin={vi.fn()} loadStaffEvents={loadStaffEvents} />);

  it('lists who changed which account, including out-of-band tools', async () => {
    view(vi.fn().mockResolvedValue([
      event({ id: 'e2', action: 'role_changed', detail: 'cashier to manager' }),
      event({ id: 'e1', action: 'created', detail: 'admin', actorId: null, actorUsername: 'command line', targetUsername: 'admin' }),
    ]));
    const history = await screen.findByRole('list');
    expect(history).toHaveTextContent('@admin changed the role of @cashier · cashier to manager');
    expect(history).toHaveTextContent('command line created @admin · as admin');
  });

  it('shows an empty state, a load failure, and nothing when history is not available', async () => {
    const { unmount } = view(vi.fn().mockResolvedValue([]));
    expect(await screen.findByText('No account changes recorded yet.')).toBeInTheDocument();
    unmount();
    const failed = view(vi.fn().mockRejectedValue(new Error('Administrator access required.')));
    expect(await screen.findByRole('alert')).toHaveTextContent('Administrator access required.');
    failed.unmount();
    view();
    expect(screen.queryByRole('heading', { name: 'Account history' })).not.toBeInTheDocument();
  });
});
