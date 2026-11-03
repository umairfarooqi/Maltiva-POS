import React, { useEffect, useState } from 'react';
import { UserPlus, KeyRound, Check } from 'lucide-react';
import { StaffEvent, User, UserRole } from '../types/pos';
import { Dialog, DialogHeader } from './ui/Dialog';
import { Button } from './ui/Button';
import { Input, Select } from './ui/Field';
import { alertClasses } from './ui/Alert';

interface StaffManagementViewProps {
  users: User[];
  currentUser: User;
  onAddUser: (user: Partial<User> & { password: string; pin: string }) => Promise<void>;
  onToggleUserActive: (userId: string, active: boolean) => Promise<void>;
  onResetUserPin?: (userId: string, pin: string, password?: string, currentPassword?: string) => Promise<void>;
  /** Loads the account change history. The panel is hidden when not provided. */
  loadStaffEvents?: () => Promise<StaffEvent[]>;
}

const ACTION_TEXT: Record<StaffEvent['action'], string> = {
  created: 'created',
  renamed: 'renamed',
  role_changed: 'changed the role of',
  suspended: 'suspended',
  reactivated: 'reactivated',
  password_changed: 'changed the password of',
  pin_changed: 'changed the PIN of',
  reset_by_cli: 'reset',
};

function eventDetail(event: StaffEvent) {
  if (!event.detail) return '';
  return event.action === 'created' ? `as ${event.detail}` : event.detail;
}

function eventTime(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export const StaffManagementView: React.FC<StaffManagementViewProps> = ({
  users,
  currentUser,
  onAddUser,
  onToggleUserActive,
  onResetUserPin,
  loadStaffEvents,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('cashier');
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [listError, setListError] = useState('');
  const [listSuccess, setListSuccess] = useState('');

  // Reset PIN / Password Modal State
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPin, setResetPin] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetCurrentPassword, setResetCurrentPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const resettingSelf = resetTarget?.id === currentUser.id;

  // Account history reloads whenever the staff list changes (every change updates it).
  const [events, setEvents] = useState<StaffEvent[] | null>(null);
  const [eventsError, setEventsError] = useState('');
  useEffect(() => {
    if (!loadStaffEvents) return;
    let cancelled = false;
    loadStaffEvents()
      .then(next => { if (!cancelled) { setEvents(next); setEventsError(''); } })
      .catch(error => { if (!cancelled) setEventsError((error as Error).message || 'Could not load account history.'); });
    return () => { cancelled = true; };
  }, [loadStaffEvents, users]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSaving) return;

    const cleanUsername = (username.trim() || name.toLowerCase().replace(/\s+/g, '')).toLowerCase();
    if (users.some(u => u.username?.toLowerCase() === cleanUsername)) {
      setUsernameError(`Username "${cleanUsername}" is already taken. Please choose another.`);
      return;
    }
    if (password.length < 8) { setUsernameError('Password must be at least 8 characters.'); return; }
    if (!/^\d{4}$/.test(pin)) { setUsernameError('PIN must be exactly 4 digits.'); return; }

    setIsSaving(true);
    try {
      await onAddUser({
        name: name.trim(),
        username: cleanUsername,
        email: email.trim() || `${cleanUsername}@maltivacrust.com`,
        role,
        pin,
        password,
        active: true,
      });
    } catch (error) {
      setUsernameError((error as Error).message);
      setIsSaving(false);
      return;
    }
    setIsSaving(false);

    setName('');
    setUsername('');
    setEmail('');
    setRole('cashier');
    setPin('');
    setPassword('');
    setUsernameError('');
    setIsModalOpen(false);
  };

  const handleToggle = async (u: User) => {
    setListError('');
    setListSuccess('');
    try { await onToggleUserActive(u.id, !u.active); }
    catch (error) { setListError((error as Error).message); }
  };

  const handleOpenReset = (u: User) => {
    setResetTarget(u);
    setResetPin('');
    setResetPassword('');
    setResetCurrentPassword('');
    setResetError('');
    setListError('');
    setListSuccess('');
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget || !onResetUserPin || isResetting) return;
    if (!/^\d{4}$/.test(resetPin)) {
      setResetError('New PIN must be exactly 4 digits.');
      return;
    }
    if (resetPassword && resetPassword.length < 8) {
      setResetError('New password must be at least 8 characters (or leave blank to keep current password).');
      return;
    }
    if (resettingSelf && !resetCurrentPassword) {
      setResetError('Enter your current password to change your own PIN or password.');
      return;
    }
    setIsResetting(true);
    setResetError('');
    try {
      await onResetUserPin(resetTarget.id, resetPin, resetPassword || undefined, resettingSelf ? resetCurrentPassword : undefined);
      setListSuccess(`Credentials updated and account unlocked for ${resetTarget.name}.`);
      setResetTarget(null);
    } catch (error) {
      setResetError((error as Error).message);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-pos-canvas">
      <div className="pos-panel flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 sm:p-5">
        <div>
          <h1 className="text-xl font-bold text-pos-text tracking-tight">
            Staff & Role-Based Access Control
          </h1>
          <p className="text-xs text-pos-muted mt-0.5">
            Strict permission gating: Cashiers (Order Line only), Managers (Menu, Daily Sales & Settings), Admins (Full Control)
          </p>
        </div>

        <Button variant="primary" size="compact"
          onClick={() => setIsModalOpen(true)}
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Add Staff Member</span>
        </Button>
      </div>

      {/* Role Permissions Matrix Explainer Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="pos-panel p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-pos-success-text" />
            <h3 className="text-xs font-bold text-pos-text uppercase tracking-wider">
              Cashier Role
            </h3>
          </div>
          <p className="text-xs text-pos-muted">
            Dedicated front-desk operator. Can view Order Line, take orders, customize items, and issue receipts.
          </p>
          <div className="text-xs text-pos-muted space-y-0.5 pt-1 border-t border-pos-divider">
            <p>✓ Order Line / POS checkout</p>
            <p>✓ Thermal printer receipt</p>
            <p className="text-pos-danger-text">✕ No inventory edit or P&L access</p>
          </div>
        </div>

        <div className="pos-panel p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-pos-info-text" />
            <h3 className="text-xs font-bold text-pos-text uppercase tracking-wider">
              Manager Role
            </h3>
          </div>
          <p className="text-xs text-pos-muted">
            Store supervisor. Manages dishes, variations, stock updates and daily sales. Store, tax and printer settings require an administrator.
          </p>
          <div className="text-xs text-pos-muted space-y-0.5 pt-1 border-t border-pos-divider">
            <p>✓ Add & update menu dishes</p>
            <p>✓ Today & yesterday sales summary</p>
            <p className="text-pos-danger-text">✕ Confidential full P&L hidden</p>
          </div>
        </div>

        <div className="pos-panel p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-pos-reserved-text" />
            <h3 className="text-xs font-bold text-pos-text uppercase tracking-wider">
              Admin Role
            </h3>
          </div>
          <p className="text-xs text-pos-muted">
            Full enterprise administrative privileges including financial reports, raw ingredient cost audits, and staff management.
          </p>
          <div className="text-xs text-pos-muted space-y-0.5 pt-1 border-t border-pos-divider">
            <p>✓ Complete P&L and raw cost data</p>
            <p>✓ Export reports & audit logs</p>
            <p>✓ Staff credentials & roles</p>
          </div>
        </div>
      </div>

      {listError && (
        <div role="alert" className={alertClasses('danger')}>{listError}</div>
      )}
      {listSuccess && (
        <div role="status" className={alertClasses('success', 'flex items-center gap-2')}>
          <Check className="w-4 h-4 shrink-0" />
          <span>{listSuccess}</span>
        </div>
      )}

      {/* Staff Members List */}
      <div className="pos-panel overflow-hidden">
        <table className="w-full text-xs text-left">
          <thead className="bg-pos-inset border-b border-pos-border text-pos-muted font-semibold uppercase text-xs">
            <tr>
              <th className="p-4">Staff Member</th>
              <th className="p-4">Assigned Role</th>
              <th className="p-4">Branch Location</th>
              <th className="p-4">Sign-in</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-pos-divider">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-pos-inset">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    {u.avatar ? (
                    <img
                      src={u.avatar}
                      alt={u.name}
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-full object-cover border border-pos-border"
                    />
                    ) : (
                    <div className="w-9 h-9 rounded-full bg-pos-raised border border-pos-border flex items-center justify-center text-xs font-bold text-pos-secondary">
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    )}
                    <div>
                      <p className="font-bold text-pos-text">{u.name}</p>
                      <p className="text-xs text-pos-muted tabular-nums">
                        @{u.username || u.name.toLowerCase().replace(/\s+/g, '')} • {u.email}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="p-4">
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                      u.role === 'admin'
                        ? 'bg-pos-reserved-bg text-pos-reserved-text'
                        : u.role === 'manager'
                        ? 'bg-pos-info-bg text-pos-info-text'
                        : 'bg-pos-success-bg text-pos-success-text'
                    }`}
                  >
                    {u.role}
                  </span>
                </td>
                <td className="p-4 text-pos-secondary font-medium">
                  {u.branch || 'Branch #01'}
                </td>
                <td className="p-4 tabular-nums text-pos-muted">
                  PIN & password set
                </td>
                <td className="p-4">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold ${
                      u.active ? 'text-pos-success-text bg-pos-success-bg' : 'text-pos-muted bg-pos-raised'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${u.active ? 'bg-pos-success-text' : 'bg-pos-control'}`} />
                    {u.active ? 'Active' : 'Suspended'}
                  </span>
                </td>
                <td className="p-4 text-center">
                  <div className="inline-flex items-center gap-2">
                    {onResetUserPin && (
                      <Button variant="ghost" size="compact"
                        type="button"
                        onClick={() => handleOpenReset(u)}
                      >
                        <KeyRound className="w-3 h-3" />
                        <span>Reset PIN</span>
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleToggle(u)}
                      disabled={u.id === currentUser.id}
                      title={u.id === currentUser.id ? 'You cannot suspend your own account' : undefined}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                        u.active
                          ? 'text-pos-danger-text hover:bg-pos-danger-bg'
                          : 'text-pos-success-text hover:bg-pos-success-bg'
                      }`}
                    >
                      {u.active ? 'Suspend' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Account change history */}
      {loadStaffEvents && (
        <section aria-labelledby="staff-history-heading" className="pos-panel overflow-hidden">
          <div className="flex items-baseline justify-between gap-3 px-4 py-3 border-b border-pos-border bg-pos-inset">
            <h2 id="staff-history-heading" className="text-xs font-bold text-pos-text uppercase tracking-wider">
              Account history
            </h2>
            <p className="text-xs text-pos-muted">Who created, changed or suspended each account. Kept through database restores.</p>
          </div>
          {eventsError ? (
            <div role="alert" className={alertClasses('danger', 'm-4')}>{eventsError}</div>
          ) : events === null ? (
            <p className="p-4 text-xs text-pos-muted">Loading account history...</p>
          ) : events.length === 0 ? (
            <p className="p-4 text-xs text-pos-muted">No account changes recorded yet.</p>
          ) : (
            <ol className="divide-y divide-pos-divider max-h-80 overflow-y-auto">
              {events.map(event => (
                <li key={event.id} className="flex items-start justify-between gap-4 px-4 py-2.5 text-xs">
                  <p className="text-pos-secondary min-w-0">
                    <span className="font-semibold text-pos-text">{event.actorId ? `@${event.actorUsername}` : event.actorUsername}</span>
                    {' '}{ACTION_TEXT[event.action] ?? event.action}{' '}
                    <span className="font-semibold text-pos-text">@{event.targetUsername}</span>
                    {eventDetail(event) && <span className="text-pos-muted"> · {eventDetail(event)}</span>}
                  </p>
                  <time dateTime={event.createdAt} className="shrink-0 text-pos-muted tabular-nums">{eventTime(event.createdAt)}</time>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {/* MODAL: Add New Staff */}
      {isModalOpen && (
        <Dialog size="md" label="Add staff member" busy={isSaving} onClose={() => setIsModalOpen(false)} className="p-4">
            <DialogHeader title="Add Staff Member" onClose={() => setIsModalOpen(false)} closeLabel="Close staff editor" closeDisabled={isSaving} className="mb-3" />

            {usernameError && (
              <div role="alert" className={alertClasses('danger', 'shrink-0 mb-3')}>
                {usernameError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="min-h-0 flex flex-col overflow-hidden">
              <fieldset disabled={isSaving} className="contents">
              <div className="min-h-0 overflow-y-auto space-y-3 pr-1">
              <div>
                <label htmlFor="staffmanagementview-field-1" className="text-xs font-bold text-pos-secondary block mb-1">
                  Full Name *
                </label>
                <Input size="compact" id="staffmanagementview-field-1"
                  type="text"
                  required
                  value={name}
                  onChange={e => {
                    setName(e.target.value);
                    if (!username) {
                      setUsername(e.target.value.toLowerCase().replace(/\s+/g, ''));
                    }
                  }}
                  placeholder="e.g. Jordan Smith"
                  className="w-full"
                />
              </div>

              <div>
                <label htmlFor="staffmanagementview-field-2" className="text-xs font-bold text-pos-secondary block mb-1">
                  Unique Username * (Used for Sign In)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-pos-muted text-xs tabular-nums">@</span>
                  <Input size="compact" id="staffmanagementview-field-2"
                    type="text"
                    required
                    value={username}
                    onChange={e => {
                      setUsername(e.target.value);
                      setUsernameError('');
                    }}
                    placeholder="e.g. jordansmith or cashier2"
                    className="w-full pl-7 pr-3 tabular-nums"
                  />
                </div>
                <p className="text-xs text-pos-muted mt-0.5">
                  Staff will use this unique username to sign in to their terminal role.
                </p>
              </div>

              <div>
                <label htmlFor="staffmanagementview-field-3" className="text-xs font-bold text-pos-secondary block mb-1">
                  Email Address
                </label>
                <Input size="compact" id="staffmanagementview-field-3"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="jordan@maltivacrust.com"
                  className="w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="staffmanagementview-field-4" className="text-xs font-bold text-pos-secondary block mb-1">
                    System Role *
                  </label>
                  <Select size="compact" id="staffmanagementview-field-4"
                    value={role}
                    onChange={e => setRole(e.target.value as UserRole)}
                    className="w-full"
                  >
                    <option value="cashier">Cashier (Order Line only)</option>
                    <option value="manager">Manager (Dishes + Daily Sales)</option>
                    <option value="admin">Admin (Full Control)</option>
                  </Select>
                </div>

                <div>
                  <label htmlFor="staffmanagementview-field-5" className="text-xs font-bold text-pos-secondary block mb-1">
                    Password * (min 8 characters)
                  </label>
                  <Input size="compact" id="staffmanagementview-field-5"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full"
                  />
                </div>

                <div>
                  <label htmlFor="staffmanagementview-field-6" className="text-xs font-bold text-pos-secondary block mb-1">
                    4-digit PIN *
                  </label>
                  <Input size="compact" id="staffmanagementview-field-6"
                    type="password"
                    inputMode="numeric"
                    required
                    maxLength={4}
                    autoComplete="off"
                    value={pin}
                    onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="4-digit PIN"
                    className="w-full text-center tabular-nums"
                  />
                </div>
              </div>

              </div>
              <div className="shrink-0 border-t border-pos-divider mt-3 pt-3 flex justify-end gap-2">
                <Button variant="ghost"
                  type="button"
                  disabled={isSaving} onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button variant="primary"
                  type="submit"
                  disabled={isSaving}
                >
                  {isSaving ? 'Creating...' : 'Create Staff Account'}
                </Button>
              </div>
              </fieldset>
            </form>
        </Dialog>
      )}

      {/* MODAL: Reset Staff PIN / Password */}
      {resetTarget && (
        <Dialog size="sm" label="Reset staff PIN" busy={isResetting} onClose={() => setResetTarget(null)} className="p-4">
            <DialogHeader title="Reset PIN & Unlock" description={`${resetTarget.name} (@${resetTarget.username})`}
              onClose={() => setResetTarget(null)} closeLabel="Close PIN reset" closeDisabled={isResetting} className="mb-3" />

            {resetError && (
              <div role="alert" className={alertClasses('danger', 'shrink-0 mb-3')}>
                {resetError}
              </div>
            )}

            <form onSubmit={handleResetSubmit} className="min-h-0 flex flex-col overflow-hidden">
              <fieldset disabled={isResetting} className="contents">
              <div className="min-h-0 overflow-y-auto space-y-3 pr-1">
              <div>
                <label htmlFor="staffmanagementview-field-7" className="text-xs font-bold text-pos-secondary block mb-1">
                  New 4-Digit PIN *
                </label>
                <Input size="compact" id="staffmanagementview-field-7"
                  type="password"
                  inputMode="numeric"
                  required
                  maxLength={4}
                  autoComplete="off"
                  value={resetPin}
                  onChange={e => setResetPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="4-digit PIN"
                  className="w-full text-center tabular-nums"
                />
              </div>

              <div>
                <label htmlFor="staffmanagementview-field-8" className="text-xs font-bold text-pos-secondary block mb-1">
                  New Password (optional, min 8 characters)
                </label>
                <Input size="compact" id="staffmanagementview-field-8"
                  type="password"
                  autoComplete="new-password"
                  value={resetPassword}
                  onChange={e => setResetPassword(e.target.value)}
                  placeholder="Leave blank to keep existing password"
                  className="w-full"
                />
              </div>

              {resettingSelf && (
                <div>
                  <label htmlFor="staffmanagementview-field-9" className="text-xs font-bold text-pos-secondary block mb-1">
                    Your Current Password *
                  </label>
                  <Input size="compact" id="staffmanagementview-field-9"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={resetCurrentPassword}
                    onChange={e => setResetCurrentPassword(e.target.value)}
                    className="w-full"
                  />
                  <p className="text-xs text-pos-muted mt-0.5">
                    Changing your own sign-in details signs you out on every till.
                  </p>
                </div>
              )}

              </div>
              <div className="shrink-0 border-t border-pos-divider mt-3 pt-3 flex justify-end gap-2">
                <Button variant="ghost"
                  type="button"
                  disabled={isResetting} onClick={() => setResetTarget(null)}
                >
                  Cancel
                </Button>
                <Button variant="primary"
                  type="submit"
                  disabled={isResetting}
                >
                  {isResetting ? 'Updating...' : 'Save New PIN'}
                </Button>
              </div>
              </fieldset>
            </form>
        </Dialog>
      )}
    </div>
  );
};
