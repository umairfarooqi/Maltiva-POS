import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Header } from '../src/components/Header';
import { Sidebar } from '../src/components/Sidebar';
import { User } from '../src/types/pos';

const user: User = {
  id: 'admin-1',
  name: 'Admin',
  username: 'admin',
  email: 'admin@maltiva.local',
  role: 'admin',
  avatar: '',
  pin: '1234',
  active: true,
  branch: 'Main',
};

describe('mobile navigation controls', () => {
  it('opens navigation from a labelled control', async () => {
    const onOpenMobileSidebar = vi.fn();
    const interaction = userEvent.setup();

    render(<Header currentUser={user} onOpenMobileSidebar={onOpenMobileSidebar} />);

    await interaction.click(screen.getByRole('button', { name: 'Open navigation' }));

    expect(onOpenMobileSidebar).toHaveBeenCalledOnce();
  });

  it('closes navigation from a labelled control', async () => {
    const onCloseMobile = vi.fn();
    const interaction = userEvent.setup();

    render(
      <Sidebar
        activeTab="order_line"
        onSelectTab={vi.fn()}
        userRole="admin"
        userName="Admin"
        onLogout={vi.fn()}
        isMobileOpen
        onCloseMobile={onCloseMobile}
      />
    );

    await interaction.click(screen.getByRole('button', { name: 'Close navigation' }));

    expect(onCloseMobile).toHaveBeenCalledOnce();
  });
});
