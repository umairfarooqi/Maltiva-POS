import React, { useState, useEffect, useCallback } from 'react';
import {
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  Check,
  AlertCircle,
  KeyRound,
  ArrowLeft,
  Delete,
  Store,
} from 'lucide-react';
import { User } from '../types/pos';
import { PosApi } from '../services/api';
import { MaltivaLogo } from './MaltivaLogo';

interface LoginScreenProps {
  onLoginSuccess: (user: User) => void;
  availableUsers: User[];
  isOnline: boolean;
  onAdminRegistered?: (newUser: User) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLoginSuccess,
  availableUsers,
  isOnline,
  onAdminRegistered,
}) => {
  const [mode, setMode] = useState<'signin' | 'forgot' | 'signup'>('signin');
  const [authMethod, setAuthMethod] = useState<'pin' | 'password'>('pin');

  // Active staff selection
  const [selectedUser, setSelectedUser] = useState<User | null>(() => {
    return availableUsers.length > 0 ? availableUsers[0] : null;
  });

  const [username, setUsername] = useState(() => (availableUsers.length > 0 ? availableUsers[0].username : ''));
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
    if (!selectedUser && availableUsers.length > 0) {
      setSelectedUser(availableUsers[0]);
      setUsername(availableUsers[0].username);
    }
  }, [availableUsers, selectedUser]);

  // Forgot password states
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [recoveryAccount, setRecoveryAccount] = useState<{
    username: string;
    name: string;
    role: string;
    securityQuestion: string;
  } | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [forgotSuccessMsg, setForgotSuccessMsg] = useState('');
  const [forgotErrorMsg, setForgotErrorMsg] = useState('');

  // Register admin states
  const [signupName, setSignupName] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupPin, setSignupPin] = useState('1234');
  const [signupError, setSignupError] = useState('');

  // Authentication submission
  const submitAuthentication = useCallback(
    async (targetUsername: string, targetSecret: string) => {
      if (failedAttempts >= 5) {
        setErrorMessage('Terminal locked for 30 seconds due to failed attempts.');
        setTimeout(() => setFailedAttempts(0), 30000);
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
          onLoginSuccess(res.user);
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
    if (authMethod === 'pin') {
      const active = selectedUser || availableUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
      const userToAuth = active ? active.username : username;
      submitAuthentication(userToAuth, pin || password || '1234');
    } else {
      submitAuthentication(username, password);
    }
  };

  const handleKeypadPress = (digit: string) => {
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setErrorMessage('');
      if (nextPin.length === 4) {
        const active = selectedUser || availableUsers[0];
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
    if (mode !== 'signin' || authMethod !== 'pin') return;

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
          const active = selectedUser || availableUsers[0];
          if (active) submitAuthentication(active.username, pin);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, authMethod, pin, selectedUser, availableUsers, submitAuthentication]);

  const handleSelectStaff = (u: User) => {
    setSelectedUser(u);
    setUsername(u.username);
    setPin('');
    setPassword('');
    setErrorMessage('');
  };

  const handleQuickFill = (u: User) => {
    setSelectedUser(u);
    setUsername(u.username);
    const defaultSecret = u.pin || u.password || '1234';
    setPassword(defaultSecret);
    setPin(u.pin || '1234');
    setErrorMessage('');
  };

  const handleLookupAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotIdentifier.trim()) {
      setForgotErrorMsg('Username is required.');
      return;
    }
    setIsLoading(true);
    setForgotErrorMsg('');
    const res = await PosApi.forgotPassword(forgotIdentifier, isOnline);
    setIsLoading(false);
    if (res.success && res.data) {
      setRecoveryAccount(res.data);
      setForgotStep(2);
    } else {
      setForgotErrorMsg(res.error || 'No active account found.');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryAccount || !newPassword.trim()) {
      setForgotErrorMsg('Password is required.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setForgotErrorMsg('Passwords do not match.');
      return;
    }
    setIsLoading(true);
    setForgotErrorMsg('');
    const res = await PosApi.resetPassword(
      recoveryAccount.username,
      newPassword.trim(),
      verificationCode.trim(),
      isOnline
    );
    setIsLoading(false);
    if (res.success) {
      setForgotSuccessMsg('Password updated! Please sign in.');
      setMode('signin');
      setForgotStep(1);
      setRecoveryAccount(null);
    } else {
      setForgotErrorMsg(res.error || 'Reset failed. Check recovery PIN.');
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupName.trim() || !signupUsername.trim() || !signupPassword.trim()) {
      setSignupError('All fields are required.');
      return;
    }
    setIsLoading(true);
    setSignupError('');
    try {
      const newAdmin: User = {
        id: `user-admin-${Date.now()}`,
        name: signupName.trim(),
        username: signupUsername.trim().toLowerCase(),
        email: `${signupUsername.trim().toLowerCase()}@maltivacrust.com`,
        role: 'admin',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        pin: signupPin.trim() || '1234',
        password: signupPassword.trim(),
        active: true,
        branch: 'Phase 3 DHA Lahore',
        securityQuestion: 'Recovery PIN',
        securityAnswer: signupPin.trim() || '1234',
      };
      if (onAdminRegistered) onAdminRegistered(newAdmin);
      setIsLoading(false);
      setMode('signin');
    } catch {
      setIsLoading(false);
      setSignupError('Registration failed.');
    }
  };

  const timeFormatted = currentTime.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0d1013] text-pos-text font-sans select-none flex flex-col justify-between items-center p-4 relative">
      {/* Subtle Ambient Radial Glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[550px] bg-emerald-500/[0.04] rounded-full blur-[120px]" />
      </div>

      {/* -------------------------------------------------------- */}
      {/* TOP COMPACT BAR: BRAND LOGO + STATUS + TIME              */}
      {/* -------------------------------------------------------- */}
      <header className="w-full max-w-4xl flex items-center justify-between z-10 shrink-0 py-1">
        <div className="flex items-center gap-3">
          <MaltivaLogo size="sm" showSubtitle={false} />
          <div className="hidden sm:block border-l border-white/10 pl-3">
            <span className="text-xs font-bold text-white tracking-wide">Maltiva Crust</span>
            <span className="text-[11px] text-gray-400 block leading-none mt-0.5">DHA Phase 3, Lahore</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Online / Offline status */}
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/10 text-[11px] font-mono">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isOnline ? 'bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-amber-400'
              }`}
            />
            <span className={isOnline ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
              {isOnline ? 'System Online' : 'Offline Mode'}
            </span>
          </div>

          {/* Real-time Clock */}
          <div className="hidden sm:block text-right font-mono text-xs font-semibold text-gray-300">
            {timeFormatted}
          </div>
        </div>
      </header>

      {/* -------------------------------------------------------- */}
      {/* CENTER: LOGIN CARD (COMPACT, ELEGANT, NO SCROLL)         */}
      {/* -------------------------------------------------------- */}
      <main className="w-full max-w-[420px] z-10 my-auto">
        <div className="bg-[#15191d] border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/70 overflow-hidden transition-all">
          <div className="p-5 sm:p-6 space-y-4">
            {/* =================================================== */}
            {/* VIEW 1: SIGN IN (STAFF PIN / PASSWORD)              */}
            {/* =================================================== */}
            {mode === 'signin' && (
              <>
                {/* Title Header */}
                <div className="text-center">
                  <h2 className="text-xl font-bold text-white tracking-tight">Terminal Login</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Select profile and enter PIN to access POS</p>
                </div>

                {/* Error Banner */}
                {errorMessage && (
                  <div
                    role="alert"
                    className="p-2.5 rounded-xl bg-red-950/40 border border-red-500/30 text-red-200 text-xs flex items-center gap-2 animate-in fade-in duration-150"
                  >
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <span className="font-medium flex-1">{errorMessage}</span>
                    <button
                      type="button"
                      onClick={() => setErrorMessage('')}
                      className="text-red-400 hover:text-red-200 px-1 cursor-pointer font-bold"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {forgotSuccessMsg && (
                  <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-200 text-xs flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="font-medium flex-1">{forgotSuccessMsg}</span>
                  </div>
                )}

                {/* Staff Selection Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  {availableUsers.slice(0, 2).map(u => {
                    const isSelected = selectedUser?.id === u.id;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleSelectStaff(u)}
                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#1b2523] border-emerald-500/80 shadow-sm ring-1 ring-emerald-500/40'
                            : 'bg-[#111417] border-white/[0.06] hover:border-white/20 hover:bg-[#161a1e]'
                        }`}
                      >
                        <div className="relative shrink-0">
                          {u.avatar ? (
                            <img
                              src={u.avatar}
                              alt={u.name}
                              className="w-9 h-9 rounded-full object-cover border border-white/10"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-emerald-800 flex items-center justify-center text-white font-bold text-xs">
                              {u.name?.charAt(0) || u.username?.charAt(0) || 'U'}
                            </div>
                          )}
                          {isSelected && (
                            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border border-[#15191d]" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-white truncate leading-tight">{u.name}</p>
                          <span
                            className={`text-[9px] font-bold uppercase tracking-wider ${
                              u.role === 'admin' ? 'text-emerald-400' : 'text-teal-400'
                            }`}
                          >
                            {u.role}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Mode Tabs: PIN Pad vs Password */}
                <div className="flex bg-[#0f1214] p-0.5 rounded-lg border border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => setAuthMethod('pin')}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      authMethod === 'pin'
                        ? 'bg-[#1f252b] text-white shadow-sm'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Quick PIN</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMethod('password')}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      authMethod === 'password'
                        ? 'bg-[#1f252b] text-white shadow-sm'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Password</span>
                  </button>
                </div>

                {/* Form: PIN Pad Mode */}
                {authMethod === 'pin' ? (
                  <form onSubmit={handleSignIn} className="space-y-3">
                    {/* 4 PIN Dots */}
                    <div className="py-2 text-center bg-[#0e1113] rounded-xl border border-white/[0.05]">
                      <div className="flex items-center justify-center gap-3.5">
                        {[0, 1, 2, 3].map(i => {
                          const isFilled = pin.length > i;
                          const isNext = pin.length === i;
                          return (
                            <div
                              key={i}
                              className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                                isFilled
                                  ? 'bg-emerald-400 scale-110 shadow-[0_0_8px_rgba(52,211,153,0.7)]'
                                  : isNext
                                  ? 'border-2 border-emerald-400/80 scale-105'
                                  : 'border-2 border-white/20'
                              }`}
                            />
                          );
                        })}
                      </div>
                    </div>

                    {/* Compact Tactile Numpad */}
                    <div className="grid grid-cols-3 gap-1.5">
                      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => handleKeypadPress(num)}
                          className="h-10 rounded-lg bg-[#1a1f24] hover:bg-[#232930] active:scale-95 text-base font-bold text-white transition-all border border-white/[0.04] flex items-center justify-center cursor-pointer select-none"
                        >
                          {num}
                        </button>
                      ))}

                      <button
                        type="button"
                        onClick={handleKeypadClear}
                        className="h-10 rounded-lg bg-[#14181c] hover:bg-[#1c2227] active:scale-95 text-[11px] font-bold text-gray-400 hover:text-white transition-all border border-white/[0.04] flex items-center justify-center cursor-pointer select-none"
                      >
                        C
                      </button>

                      <button
                        type="button"
                        onClick={() => handleKeypadPress('0')}
                        className="h-10 rounded-lg bg-[#1a1f24] hover:bg-[#232930] active:scale-95 text-base font-bold text-white transition-all border border-white/[0.04] flex items-center justify-center cursor-pointer select-none"
                      >
                        0
                      </button>

                      <button
                        type="button"
                        onClick={handleKeypadBackspace}
                        className="h-10 rounded-lg bg-[#14181c] hover:bg-[#1c2227] active:scale-95 text-gray-400 hover:text-white transition-all border border-white/[0.04] flex items-center justify-center cursor-pointer select-none"
                        aria-label="Delete digit"
                      >
                        <Delete className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Primary Button */}
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-950/40 cursor-pointer disabled:opacity-60"
                    >
                      {isLoading ? (
                        <span>Verifying...</span>
                      ) : (
                        <>
                          <span>Sign In to Terminal</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  /* Form: Password Mode */
                  <form onSubmit={handleSignIn} className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-300 ml-1">Username</label>
                      <div className="relative">
                        <UserIcon className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          autoComplete="username"
                          required
                          value={username}
                          onChange={e => setUsername(e.target.value)}
                          placeholder="admin or cashier"
                          className="w-full h-10 pl-10 pr-3 bg-[#0e1113] border border-white/[0.1] rounded-xl text-sm text-white placeholder:text-gray-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-gray-300 ml-1">Password / PIN</label>
                        <button
                          type="button"
                          onClick={() => {
                            setMode('forgot');
                            setForgotIdentifier(username);
                          }}
                          className="text-[11px] text-emerald-400 hover:underline cursor-pointer"
                        >
                          Forgot?
                        </button>
                      </div>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          required
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          placeholder="Enter password or PIN"
                          className="w-full h-10 pl-10 pr-10 bg-[#0e1113] border border-white/[0.1] rounded-xl text-sm text-white placeholder:text-gray-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition cursor-pointer"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-950/40 cursor-pointer disabled:opacity-60"
                    >
                      {isLoading ? (
                        <span>Verifying...</span>
                      ) : (
                        <>
                          <span>Sign In to Terminal</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </form>
                )}

                {/* Quick Access Preset Bar */}
                <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-xs">
                  <span className="text-[11px] text-gray-400">Quick Access:</span>
                  <div className="flex gap-2">
                    {availableUsers.slice(0, 2).map(u => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleQuickFill(u)}
                        className="px-2.5 py-1 rounded-lg bg-[#0e1113] hover:bg-[#1a1f24] border border-white/[0.06] text-[11px] text-gray-300 hover:text-emerald-400 transition cursor-pointer font-medium"
                      >
                        {u.name} (1234)
                      </button>
                    ))}
                  </div>
                </div>

                {/* Footer Register Link */}
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => setMode('signup')}
                    className="text-xs text-gray-400 hover:text-gray-200 transition cursor-pointer"
                  >
                    New Admin? <span className="text-emerald-400 font-semibold hover:underline">Register Account</span>
                  </button>
                </div>
              </>
            )}

            {/* =================================================== */}
            {/* VIEW 2: FORGOT PASSWORD RECOVERY                    */}
            {/* =================================================== */}
            {mode === 'forgot' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-white">Password Reset</h2>
                    <p className="text-xs text-gray-400">Recover your staff credentials</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signin');
                      setForgotErrorMsg('');
                    }}
                    className="p-1.5 text-gray-400 hover:text-white rounded-lg bg-[#111417] border border-white/[0.06] cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                </div>

                {forgotErrorMsg && (
                  <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-500/30 text-red-200 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{forgotErrorMsg}</span>
                  </div>
                )}

                {forgotStep === 1 ? (
                  <form onSubmit={handleLookupAccount} className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-300 ml-1">Username</label>
                      <input
                        type="text"
                        required
                        value={forgotIdentifier}
                        onChange={e => setForgotIdentifier(e.target.value)}
                        placeholder="e.g. admin or cashier"
                        className="w-full h-10 px-3.5 bg-[#0e1113] border border-white/[0.1] rounded-xl text-sm text-white focus:border-emerald-500 outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full h-10 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition cursor-pointer"
                    >
                      {isLoading ? 'Searching...' : 'Find Account'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleResetPassword} className="space-y-3">
                    <div className="p-2 bg-emerald-950/30 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 shrink-0" />
                      <span>{recoveryAccount?.name} identified</span>
                    </div>

                    <div className="space-y-2">
                      <input
                        type="text"
                        required
                        value={verificationCode}
                        onChange={e => setVerificationCode(e.target.value)}
                        placeholder="Security PIN (1234)"
                        className="w-full h-10 px-3.5 bg-[#0e1113] border border-white/[0.1] rounded-xl text-sm text-white font-mono focus:border-emerald-500 outline-none"
                      />
                      <input
                        type="password"
                        required
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="New Password"
                        className="w-full h-10 px-3.5 bg-[#0e1113] border border-white/[0.1] rounded-xl text-sm text-white focus:border-emerald-500 outline-none"
                      />
                      <input
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="Confirm Password"
                        className="w-full h-10 px-3.5 bg-[#0e1113] border border-white/[0.1] rounded-xl text-sm text-white focus:border-emerald-500 outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full h-10 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition cursor-pointer"
                    >
                      {isLoading ? 'Updating...' : 'Update Password'}
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* =================================================== */}
            {/* VIEW 3: REGISTER NEW ADMIN                         */}
            {/* =================================================== */}
            {mode === 'signup' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-white">Register Admin</h2>
                    <p className="text-xs text-gray-400">Add an administrator account</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signin');
                      setSignupError('');
                    }}
                    className="p-1.5 text-gray-400 hover:text-white rounded-lg bg-[#111417] border border-white/[0.06] cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                </div>

                {signupError && (
                  <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-500/30 text-red-200 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{signupError}</span>
                  </div>
                )}

                <form onSubmit={handleSignUp} className="space-y-2.5">
                  <input
                    type="text"
                    required
                    value={signupName}
                    onChange={e => setSignupName(e.target.value)}
                    placeholder="Full Name"
                    className="w-full h-10 px-3.5 bg-[#0e1113] border border-white/[0.1] rounded-xl text-sm text-white focus:border-emerald-500 outline-none"
                  />
                  <input
                    type="text"
                    required
                    value={signupUsername}
                    onChange={e => setSignupUsername(e.target.value)}
                    placeholder="Username"
                    className="w-full h-10 px-3.5 bg-[#0e1113] border border-white/[0.1] rounded-xl text-sm text-white focus:border-emerald-500 outline-none"
                  />
                  <input
                    type="password"
                    required
                    value={signupPassword}
                    onChange={e => setSignupPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full h-10 px-3.5 bg-[#0e1113] border border-white/[0.1] rounded-xl text-sm text-white focus:border-emerald-500 outline-none"
                  />
                  <input
                    type="text"
                    maxLength={4}
                    required
                    value={signupPin}
                    onChange={e => setSignupPin(e.target.value)}
                    placeholder="4-Digit Recovery PIN"
                    className="w-full h-10 px-3.5 bg-[#0e1113] border border-white/[0.1] rounded-xl text-sm text-white font-mono focus:border-emerald-500 outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-10 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition cursor-pointer mt-1"
                  >
                    {isLoading ? 'Registering...' : 'Create Admin'}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* -------------------------------------------------------- */}
      {/* BOTTOM FOOTER: DISCREET TERMINAL METRICS                 */}
      {/* -------------------------------------------------------- */}
      <footer className="w-full max-w-4xl flex items-center justify-between text-[11px] text-gray-500 z-10 shrink-0 py-1">
        <span>Station #01 &bull; Front Counter</span>
        <span>Maltiva POS Core v2.4</span>
      </footer>
    </div>
  );
};
