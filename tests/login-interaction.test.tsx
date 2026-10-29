import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginScreen } from '../src/components/LoginScreen';
import { PosApi } from '../src/services/api';
import { INITIAL_USERS } from '../src/data/initialData';

afterEach(() => vi.restoreAllMocks());
describe('login pending state', () => {
  it('prevents changing profiles or submitting a second request during authentication', async () => {
    const user = userEvent.setup(); const onLogin = vi.fn();
    let finish!: (value: Awaited<ReturnType<typeof PosApi.login>>) => void;
    const login = vi.spyOn(PosApi, 'login').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const staff = { ...INITIAL_USERS[0], username: 'admin', active: true };
    render(<LoginScreen availableUsers={[staff]} isOnline onLoginSuccess={onLogin} />);
    await user.click(screen.getByRole('button', { name: 'Password' }));
    await user.type(screen.getByLabelText('Password / PIN'), 'secret123');
    await user.click(screen.getByRole('button', { name: 'Sign In to Terminal' }));
    expect(screen.getByRole('button', { name: 'Quick PIN' })).toBeDisabled();
    expect(screen.getByLabelText('Password / PIN')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Verifying...' })).toBeDisabled();
    await user.keyboard('1234{Enter}');
    expect(login).toHaveBeenCalledTimes(1);
    await act(async () => finish({ success: true, user: staff }));
    await waitFor(() => expect(onLogin).toHaveBeenCalledOnce());
  });
});
