import React, { useState, useEffect, useCallback } from 'react';
import {
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  KeyRound,
} from 'lucide-react';
import { User, LoginStaff } from '../types/pos';
import { PosApi } from '../services/api';
import { MaltivaLogo } from './MaltivaLogo';
import { Button } from './ui/Button';
import { Input } from './ui/Field';
import { SegmentedControl } from './ui/SegmentedControl';
import { Avatar } from './ui/Avatar';
import { Keypad, backspaceKey } from './ui/Keypad';
import { alertClasses } from './ui/Alert';

interface LoginScreenProps {
  notice?: React.ReactNode;
  onLoginSuccess: (user: User, expiresAt?: number) => void;
  availableUsers: LoginStaff[];
  isOnline: boolean;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLoginSuccess,
  notice,
  availableUsers,
  isOnline,
}) => {
  const [authMethod, setAuthMethod] = useState<'pin' | 'password'>('pin');

  const activeStaff = availableUsers;

  // Active staff selection
  const [selectedUser, setSelectedUser] = useState<LoginStaff | null>(() => {
    return activeStaff.length > 0 ? activeStaff[0] : null;
  });

  const [username, setUsername] = useState(() => (activeStaff.length > 0 ? activeStaff[0].username : ''));
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);

  // Live digital clock
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedUser && activeStaff.length > 0) {
      setSelectedUser(activeStaff[0]);
      setUsername(activeStaff[0].username);
    }
  }, [activeStaff, selectedUser]);

  // Authentication submission
  const submitAuthentication = useCallback(
    async (targetUsername: string, targetSecret: string) => {
      if (failedAttempts >= 5) {
        setErrorMessage('Terminal locked due to failed attempts. Wait 5 minutes or ask an administrator to unlock.');
        setTimeout(() => setFailedAttempts(0), 5 * 60 * 1000);
        return;
      }
      if (!targetUsername.trim() || !targetSecret.trim()) {
        setErrorMessage('Please enter credentials to continue.');
        return;
      }
      setIsLoading(true);
      setErrorMessage('');

      try {
        const res = await PosApi.login(targetUsername, targetSecret, isOnline);
        setIsLoading(false);
        if (res.success && res.user) {
          setFailedAttempts(0);
          onLoginSuccess(res.user, res.expiresAt);
        } else {
          setFailedAttempts(prev => prev + 1);
          setErrorMessage(res.error || 'Invalid credentials. Please try again.');
          setPin('');
        }
      } catch {
        setIsLoading(false);
        setFailedAttempts(prev => prev + 1);
        setErrorMessage('Authentication error. Please retry.');
        setPin('');
      }
    },
    [failedAttempts, isOnline, onLoginSuccess]
  );

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    if (authMethod === 'pin') {
      const active = selectedUser || activeStaff.find(u => u.username.toLowerCase() === username.toLowerCase());
      const userToAuth = active ? active.username : username;
      submitAuthentication(userToAuth, pin || password);
    } else {
      submitAuthentication(username, password);
    }
  };

  const handleKeypadPress = (digit: string) => {
    if (isLoading) return;
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setErrorMessage('');
      if (nextPin.length === 4) {
        const active = selectedUser || activeStaff[0];
        if (active) {
          setTimeout(() => {
            submitAuthentication(active.username, nextPin);
          }, 100);
        }
      }
    }
  };

  const handleKeypadBackspace = () => {
    setPin(prev => prev.slice(0, -1));
    setErrorMessage('');
  };

  const handleKeypadClear = () => {
    setPin('');
    setErrorMessage('');
  };

  // Keyboard support for hardware numpad
  useEffect(() => {
    if (authMethod !== 'pin' || isLoading) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleKeypadPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleKeypadBackspace();
      } else if (e.key === 'Escape' || e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleKeypadClear();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (pin.length > 0) {
          const active = selectedUser || activeStaff[0];
          if (active) submitAuthentication(active.username, pin);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [authMethod, pin, selectedUser, activeStaff, submitAuthentication, isLoading]);

  const handleSelectStaff = (u: LoginStaff) => {
    setSelectedUser(u);
    setUsername(u.username);
    setPin('');
    setPassword('');
    setErrorMessage('');
  };

  const timeFormatted = currentTime.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  return (
    <div className="min-h-dvh w-full overflow-y-auto bg-pos-canvas text-pos-text font-sans select-none flex flex-col justify-between items-center p-4 relative">
      {notice && <div className="w-full shrink-0 z-10">{notice}</div>}

      {/* -------------------------------------------------------- */}
      {/* TOP COMPACT BAR: BRAND LOGO + STATUS + TIME              */}
      {/* -------------------------------------------------------- */}
      <header className="w-full max-w-4xl flex items-center justify-between z-10 shrink-0 py-1">
        <div className="flex items-center gap-3">
          <MaltivaLogo size="sm" showSubtitle={false} />
          <div className="hidden sm:block border-l border-pos-border pl-3">
            <span className="text-xs font-bold text-pos-text tracking-wide">Maltiva Crust</span>
            <span className="text-xs text-pos-muted block leading-none mt-0.5">DHA Phase 3, Lahore</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Online / Offline status */}
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-pos-surface border border-pos-border text-xs tabular-nums">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isOnline ? 'bg-pos-success-text animate-pulse' : 'bg-pos-warning-text'
              }`}
            />
            <span className={isOnline ? 'text-pos-success-text font-semibold' : 'text-pos-warning-text font-semibold'}>
              {isOnline ? 'System Online' : 'Offline Mode'}
            </span>
          </div>

          {/* Real-time Clock */}
          <div className="hidden sm:block text-right tabular-nums text-xs font-semibold text-pos-secondary">
            {timeFormatted}
          </div>
        </div>
      </header>

      {/* -------------------------------------------------------- */}
      {/* CENTER: RESPONSIVE STAFF SELECTION AND AUTHENTICATION         */}
      {/* -------------------------------------------------------- */}
      <main className="w-full max-w-[760px] z-10 my-auto py-3">
        <div className="pos-panel overflow-hidden transition-all">
          <div className="p-4 sm:p-5 grid gap-4 sm:grid-cols-2">
            <fieldset disabled={isLoading} className="contents">
            <div className="space-y-4 min-w-0">
            {/* Title Header */}
            <div className="text-center">
              <h2 className="text-xl font-bold text-pos-text tracking-tight">Terminal Login</h2>
              <p className="text-xs text-pos-muted mt-0.5">Select profile and enter PIN to access POS</p>
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div
                role="alert"
                className={alertClasses('danger', 'flex items-center gap-2 animate-in fade-in duration-150')}
              >
                <AlertCircle className="w-4 h-4 text-pos-danger-text shrink-0" />
                <span className="font-medium flex-1">{errorMessage}</span>
                <Button variant="ghost-destructive" size="icon"
                  type="button"
                  aria-label="Dismiss login error"
                  onClick={() => setErrorMessage('')}
                >
                  ✕
                </Button>
              </div>
            )}

            {/* Staff Selection Buttons */}
            <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
              {activeStaff.map(u => {
                const isSelected = selectedUser?.id === u.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    aria-pressed={selectedUser?.id === u.id} onClick={() => handleSelectStaff(u)}
                    className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-pos-selected border-pos-accent shadow-sm ring-1 ring-pos-accent'
                        : 'bg-pos-inset border-pos-border hover:border-pos-border hover:bg-pos-raised'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <Avatar name={u.name || u.username || 'U'} src={u.avatar} size="md" />
                      {isSelected && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-pos-success-text rounded-full border border-pos-surface" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-pos-text truncate leading-tight">{u.name}</p>
                      <span className="text-xs text-pos-muted">@{u.username}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            </div>
            <div className="space-y-3 min-w-0">
            {/* Mode Tabs: PIN Pad vs Password */}
            <SegmentedControl
              label="Sign-in method"
              size="default"
              fill
              value={authMethod}
              onChange={setAuthMethod}
              options={[
                { value: 'pin', label: 'Quick PIN', icon: KeyRound },
                { value: 'password', label: 'Password', icon: Lock },
              ] as const}
            />

            {/* Form: PIN Pad Mode */}
            {authMethod === 'pin' ? (
              <form onSubmit={handleSignIn} className="space-y-3">
                {/* 4 PIN Dots */}
                <div className="py-2 text-center bg-pos-inset rounded-xl border border-pos-border">
                  <div className="flex items-center justify-center gap-3.5">
                    {[0, 1, 2, 3].map(i => {
                      const isFilled = pin.length > i;
                      const isNext = pin.length === i;
                      return (
                        <div
                          key={i}
                          className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                            isFilled
                              ? 'bg-pos-success-text scale-110'
                              : isNext
                              ? 'border-2 border-pos-accent scale-105'
                              : 'border-2 border-pos-border'
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Number pad */}
                <Keypad
                  onPress={key => key === 'Clear' ? handleKeypadClear() : key === 'Backspace' ? handleKeypadBackspace() : handleKeypadPress(key)}
                  bottomRow={[{ value: 'Clear', label: 'C', ariaLabel: 'Clear PIN', secondary: true }, { value: '0' }, backspaceKey('Delete digit')]}
                />

                {/* Primary Button */}
                <Button variant="primary"
                  type="submit"
                  disabled={isLoading}
                  className="w-full"
                >
                  {isLoading ? (
                    <span>Verifying...</span>
                  ) : (
                    <>
                      <span>Sign In to Terminal</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
                <p className="text-xs text-pos-muted text-center">
                  PIN opens the till. Use Password for manager and admin tools.
                </p>
              </form>
            ) : (
              /* Form: Password Mode */
              <form onSubmit={handleSignIn} className="space-y-3">
                <div className="space-y-1">
                  <label htmlFor="loginscreen-field-1" className="text-xs font-medium text-pos-secondary ml-1">Username</label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-pos-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <Input id="loginscreen-field-1"
                      type="text"
                      autoComplete="username"
                      required
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      placeholder="Username"
                      className="w-full pl-10 pr-3"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label htmlFor="login-password" className="text-xs font-medium text-pos-secondary ml-1">Password / PIN</label>
                    <span className="text-xs text-pos-muted">Contact Admin for PIN reset</span>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-pos-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <Input
                      id="login-password" type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter password or PIN"
                      className="w-full pl-10 pr-12"
                    />
                    <Button variant="ghost" size="icon"
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-0 top-1/2 -translate-y-1/2"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                <Button variant="primary"
                  type="submit"
                  disabled={isLoading}
                  className="w-full"
                >
                  {isLoading ? (
                    <span>Verifying...</span>
                  ) : (
                    <>
                      <span>Sign In to Terminal</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </form>
            )}

            </div>
            </fieldset>
            {activeStaff.length === 0 && (
              <p className="text-center text-xs text-pos-muted">
                No active staff accounts found. Provision an administrator from the server terminal (<code className="text-pos-accent">npm run admin:setup</code>).
              </p>
            )}
          </div>
        </div>
      </main>

      {/* -------------------------------------------------------- */}
      {/* BOTTOM FOOTER: DISCREET TERMINAL METRICS                 */}
      {/* -------------------------------------------------------- */}
      <footer className="w-full max-w-4xl flex items-center justify-between text-xs text-pos-muted z-10 shrink-0 py-1">
        <span>Station #01 &bull; Front Counter</span>
        <span>Maltiva POS Core v2.4</span>
      </footer>
    </div>
  );
};
