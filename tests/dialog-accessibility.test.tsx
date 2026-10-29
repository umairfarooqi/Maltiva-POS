import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from '../src/components/ui/Dialog';
import { StaffManagementView } from '../src/components/StaffManagementView';
import { INITIAL_USERS } from '../src/data/initialData';

describe('dialog keyboard and pending state', () => {
  it('skips controls in CSS-hidden ancestors when trapping focus', async () => {
    const user = userEvent.setup();
    render(<Dialog label="Focus example" onClose={vi.fn()}>
      <div style={{ display: 'none' }}><button>Hidden first</button></div>
      <button>First action</button><button>Last action</button>
      <div style={{ visibility: 'hidden' }}><button>Hidden last</button></div>
    </Dialog>);
    expect(screen.getByRole('button', { name: 'First action' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Last action' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'First action' })).toHaveFocus();
  });

  it('locks PIN reset fields and dismissal until the save resolves', async () => {
    const user = userEvent.setup(); let finish!: () => void;
    const reset = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    render(<StaffManagementView users={[INITIAL_USERS[0]]} currentUser={INITIAL_USERS[0]}
      onAddUser={vi.fn()} onToggleUserActive={vi.fn()} onResetUserPin={reset} />);
    await user.click(screen.getByRole('button', { name: 'Reset PIN' }));
    const pin = screen.getByLabelText('New 4-Digit PIN *');
    await user.type(pin, '9876');
    await user.click(screen.getByRole('button', { name: 'Save New PIN' }));
    expect(pin).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close PIN reset' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Reset staff PIN' })).toBeVisible();
    await act(async () => finish());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
