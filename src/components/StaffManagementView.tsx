import React, { useState } from 'react';
import { ShieldCheck, UserPlus, Check, X, KeyRound, Mail } from 'lucide-react';
import { User, UserRole } from '../types/pos';

interface StaffManagementViewProps {
  users: User[];
  currentUser: User;
  onAddUser: (user: Partial<User>) => void;
  onToggleUserActive: (userId: string, active: boolean) => void;
}

export const StaffManagementView: React.FC<StaffManagementViewProps> = ({
  users,
  currentUser: _currentUser,
  onAddUser,
  onToggleUserActive,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('cashier');
  const [pin, setPin] = useState('1234');
  const [password, setPassword] = useState('maltiva123');
  const [usernameError, setUsernameError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const cleanUsername = (username.trim() || name.toLowerCase().replace(/\s+/g, '')).toLowerCase();
    const isTaken = users.some(u => u.username?.toLowerCase() === cleanUsername);
    if (isTaken) {
      setUsernameError(`Username "${cleanUsername}" is already taken. Please choose another.`);
      return;
    }

    onAddUser({
      name,
      username: cleanUsername,
      email: email || `${cleanUsername}@maltivacrust.com`,
      role,
      pin: pin || '1234',
      password: password || pin || 'maltiva123',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      active: true,
      branch: 'Maltiva - Central Branch #01',
    });

    setName('');
    setUsername('');
    setEmail('');
    setRole('cashier');
    setPin('1234');
    setPassword('maltiva123');
    setUsernameError('');
    setIsModalOpen(false);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-pos-canvas">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-pos-surface p-4 sm:p-5 rounded-lg border border-pos-border">
        <div>
          <h1 className="text-xl font-bold text-pos-text tracking-tight">
            Staff & Role-Based Access Control
          </h1>
          <p className="text-xs text-pos-muted mt-0.5">
            Strict permission gating: Cashiers (Order Line only), Managers (Menu & Daily Sales), Admins (Full Control)
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-pos-action hover:bg-pos-action-hover text-white rounded-md text-xs font-bold transition"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Add Staff Member</span>
        </button>
      </div>

      {/* Role Permissions Matrix Explainer Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-pos-surface p-4 rounded-lg border border-pos-border space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-pos-success-text" />
            <h3 className="text-xs font-bold text-pos-text uppercase tracking-wider">
              Cashier Role
            </h3>
          </div>
          <p className="text-xs text-pos-muted">
            Dedicated front-desk operator. Can view Order Line, take orders, customize items, and issue receipts.
          </p>
          <div className="text-[11px] text-pos-muted space-y-0.5 pt-1 border-t border-pos-divider">
            <p>✓ Order Line / POS checkout</p>
            <p>✓ Thermal printer receipt</p>
            <p className="text-pos-danger-text">✕ No inventory edit or P&L access</p>
          </div>
        </div>

        <div className="bg-pos-surface p-4 rounded-lg border border-pos-border space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-pos-info-text" />
            <h3 className="text-xs font-bold text-pos-text uppercase tracking-wider">
              Manager Role
            </h3>
          </div>
          <p className="text-xs text-pos-muted">
            Store supervisor. Manages dishes, dynamic variations, stock updates, tables, and views daily & yesterday sales only.
          </p>
          <div className="text-[11px] text-pos-muted space-y-0.5 pt-1 border-t border-pos-divider">
            <p>✓ Add & update menu dishes</p>
            <p>✓ Today & yesterday sales summary</p>
            <p className="text-pos-danger-text">✕ Confidential full P&L hidden</p>
          </div>
        </div>

        <div className="bg-pos-surface p-4 rounded-lg border border-pos-border space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-pos-reserved-text" />
            <h3 className="text-xs font-bold text-pos-text uppercase tracking-wider">
              Admin Role
            </h3>
          </div>
          <p className="text-xs text-pos-muted">
            Full enterprise administrative privileges including financial reports, raw ingredient cost audits, and staff management.
          </p>
          <div className="text-[11px] text-pos-muted space-y-0.5 pt-1 border-t border-pos-divider">
            <p>✓ Complete P&L and raw cost data</p>
            <p>✓ Export reports & audit logs</p>
            <p>✓ Staff credentials & roles</p>
          </div>
        </div>
      </div>

      {/* Staff Members List */}
      <div className="bg-pos-surface rounded-lg border border-pos-border overflow-hidden">
        <table className="w-full text-xs text-left">
          <thead className="bg-pos-inset border-b border-pos-border text-pos-muted font-semibold uppercase text-[10px]">
            <tr>
              <th className="p-4">Staff Member</th>
              <th className="p-4">Assigned Role</th>
              <th className="p-4">Branch Location</th>
              <th className="p-4">PIN Code</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-center">Toggle Access</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-pos-divider">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-pos-inset">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <img
                      src={u.avatar}
                      alt={u.name}
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-full object-cover border border-pos-border"
                    />
                    <div>
                      <p className="font-bold text-pos-text">{u.name}</p>
                      <p className="text-[11px] text-pos-muted font-mono">
                        @{u.username || u.name.toLowerCase().replace(/\s+/g, '')} • {u.email}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="p-4">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
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
                <td className="p-4 font-mono text-pos-muted">
                  •••• ({u.pin})
                </td>
                <td className="p-4">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold ${
                      u.active ? 'text-pos-success-text bg-pos-success-bg' : 'text-pos-muted bg-pos-raised'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${u.active ? 'bg-pos-success-text' : 'bg-pos-control'}`} />
                    {u.active ? 'Active' : 'Suspended'}
                  </span>
                </td>
                <td className="p-4 text-center">
                  <button
                    onClick={() => onToggleUserActive(u.id, !u.active)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                      u.active
                        ? 'text-pos-danger-text hover:bg-pos-danger-bg'
                        : 'text-pos-success-text hover:bg-pos-success-bg'
                    }`}
                  >
                    {u.active ? 'Suspend' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MODAL: Add New Staff */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/65 flex items-center justify-center p-4 z-50">
          <div className="bg-pos-surface rounded-lg max-w-md w-full p-6 border border-pos-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-pos-text">Add Staff Member</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                aria-label="Close staff editor"
                className="w-8 h-8 rounded-md bg-pos-raised text-pos-muted hover:text-pos-secondary flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {usernameError && (
              <div className="mb-3 p-2.5 rounded-md bg-pos-danger-bg border border-pos-danger-border text-pos-danger-text text-xs">
                {usernameError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-pos-secondary block mb-1">
                  Full Name *
                </label>
                <input
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
                  className="w-full px-3 py-2 border border-pos-control rounded-md text-xs focus-visible:border-pos-accent"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-pos-secondary block mb-1">
                  Unique Username * (Used for Sign In)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-pos-muted text-xs font-mono">@</span>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={e => {
                      setUsername(e.target.value);
                      setUsernameError('');
                    }}
                    placeholder="e.g. jordansmith or cashier2"
                    className="w-full pl-7 pr-3 py-2 border border-pos-control rounded-md text-xs font-mono focus-visible:border-pos-accent"
                  />
                </div>
                <p className="text-[10px] text-pos-muted mt-0.5">
                  Staff will use this unique username to sign in to their terminal role.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-pos-secondary block mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="jordan@maltivacrust.com"
                  className="w-full px-3 py-2 border border-pos-control rounded-md text-xs focus-visible:border-pos-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-pos-secondary block mb-1">
                    System Role *
                  </label>
                  <select
                    value={role}
                    onChange={e => setRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 border border-pos-control rounded-md text-xs bg-pos-surface focus-visible:border-pos-accent"
                  >
                    <option value="cashier">Cashier (Order Line only)</option>
                    <option value="manager">Manager (Dishes + Daily Sales)</option>
                    <option value="admin">Admin (Full Control)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-pos-secondary block mb-1">
                    POS PIN / Password
                  </label>
                  <input
                    type="text"
                    maxLength={12}
                    value={pin}
                    onChange={e => {
                      setPin(e.target.value);
                      setPassword(e.target.value);
                    }}
                    placeholder="4-digit PIN"
                    className="w-full px-3 py-2 border border-pos-control rounded-md text-xs font-mono text-center focus-visible:border-pos-accent"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-pos-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-pos-action text-white rounded-md text-xs font-bold hover:bg-pos-action-hover transition"
                >
                  Create Staff Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
