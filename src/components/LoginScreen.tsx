import React, { useState } from 'react';
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
  Sparkles,
  ArrowLeft,
  UserPlus,
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

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);

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

  const [signupName, setSignupName] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupPin, setSignupPin] = useState('1234');
  const [signupError, setSignupError] = useState('');

  const cleanTyped = username.trim().toLowerCase();
  const detectedUser = availableUsers.find(
    u => u.username?.toLowerCase() === cleanTyped || u.email?.toLowerCase() === cleanTyped
  );

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (failedAttempts >= 5) {
      setErrorMessage('Terminal locked for 30 seconds due to security.');
      setTimeout(() => setFailedAttempts(0), 30000);
      return;
    }
    if (!username.trim() || !password.trim()) {
      setErrorMessage('Please enter both username and password.');
      return;
    }
    setIsLoading(true);
    setErrorMessage('');
    const res = await PosApi.login(username, password, isOnline);
    setIsLoading(false);
    if (res.success && res.user) {
      setFailedAttempts(0);
      onLoginSuccess(res.user);
    } else {
      setFailedAttempts(prev => prev + 1);
      setErrorMessage(res.error || 'Invalid credentials. Please try again.');
    }
  };

  const handleQuickFill = (u: User) => {
    setUsername(u.username);
    setPassword(u.pin || u.password || '1234');
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
    const res = await PosApi.resetPassword(recoveryAccount.username, newPassword.trim(), verificationCode.trim(), isOnline);
    setIsLoading(false);
    if (res.success) {
      setForgotSuccessMsg('Password updated! Please sign in.');
      setMode('signin');
      setForgotStep(1);
      setRecoveryAccount(null);
    } else {
      setForgotErrorMsg(res.error || 'Reset failed. Check your recovery PIN.');
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

  return (
    <div className="w-screen h-screen bg-pos-canvas flex items-center justify-center p-4 font-sans select-none">
      <div className="w-full max-w-md relative z-10">
        <div className="bg-pos-surface rounded-lg border border-pos-border overflow-hidden animate-in fade-in zoom-in-95 duration-300">
          
          {/* Brand Header Section */}
          <div className="bg-pos-chrome p-7 text-center">
            <div className="flex flex-col items-center gap-3">
              <MaltivaLogo size="md" showSubtitle={true} />
              <div className="flex items-center gap-2 px-2 py-1 rounded bg-pos-surface/5 text-[10px] font-mono font-bold text-pos-success-text border border-white/10 uppercase tracking-wider">
                <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-pos-success-text animate-pulse' : 'bg-pos-warning-text'}`} />
                <span>{isOnline ? 'System Online' : 'Offline Mode'}</span>
              </div>
            </div>
          </div>

          {/* Form Content Area */}
          <div className="p-8">
            {mode === 'signin' && (
              <div className="space-y-6">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-black text-pos-text tracking-tight">Terminal Login</h2>
                  <p className="text-xs text-pos-muted mt-1">Enter your credentials to access the POS</p>
                </div>

                {errorMessage && (
                  <div className="p-3 rounded-lg bg-pos-danger-bg border border-pos-danger-border text-pos-danger-text text-xs flex items-center gap-2 animate-in slide-in-from-top-2 duration-200">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="font-medium">{errorMessage}</span>
                  </div>
                )}

                <form onSubmit={handleSignIn} className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-pos-secondary ml-1">Username</label>
                    <div className="relative group">
                      <UserIcon className="w-4 h-4 text-pos-muted absolute left-4 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-pos-accent" />
                      <input
                        type="text"
                        autoFocus
                        required
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        placeholder="admin or cashier"
                        className="w-full pl-11 pr-4 py-3 bg-pos-inset border border-pos-control rounded-md text-sm text-pos-text placeholder:text-pos-muted focus-visible:border-pos-accent transition-colors"
                      />
                      {detectedUser && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-md bg-pos-action/10 text-pos-accent text-[9px] font-bold uppercase">
                          {detectedUser.role}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-pos-secondary ml-1">Password / PIN</label>
                      <button
                        type="button"
                        onClick={() => { setMode('forgot'); setForgotIdentifier(username); }}
                        className="text-[11px] font-bold text-pos-accent hover:underline cursor-pointer"
                      >
                        Forgot?
                      </button>
                    </div>
                    <div className="relative group">
                      <Lock className="w-4 h-4 text-pos-muted absolute left-4 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-pos-accent" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Enter 4-digit PIN"
                        className="w-full pl-11 pr-11 py-3 bg-pos-inset border border-pos-control rounded-md text-sm text-pos-text placeholder:text-pos-muted focus-visible:border-pos-accent transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-pos-muted hover:text-pos-secondary transition cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3.5 bg-pos-action hover:bg-pos-action-hover text-white rounded-md text-sm font-bold flex items-center justify-center gap-2 transition-colors active:scale-[0.98] disabled:opacity-70 cursor-pointer"
                  >
                    {isLoading ? 'Verifying...' : (
                      <>
                        <span>Sign In to Terminal</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>

                <div className="pt-6 border-t border-pos-divider">
                  <p className="text-[10px] font-bold text-pos-muted uppercase tracking-wider text-center mb-3">Quick Access</p>
                  <div className="grid grid-cols-2 gap-3">
                    {availableUsers.slice(0, 2).map(u => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleQuickFill(u)}
                        className="p-3 bg-pos-inset hover:bg-pos-selected border border-pos-control rounded-md text-left transition-colors group cursor-pointer"
                      >
                        <span className="block text-[11px] font-bold text-pos-text group-hover:text-pos-accent capitalize">{u.role}</span>
                        <span className="block text-[10px] text-pos-muted font-mono">@{u.username}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="text-center mt-6">
                  <button
                    type="button"
                    onClick={() => setMode('signup')}
                    className="text-xs font-medium text-pos-muted hover:text-pos-text transition cursor-pointer"
                  >
                    New Admin? <span className="text-pos-accent font-bold">Register Account</span>
                  </button>
                </div>
              </div>
            )}

            {mode === 'forgot' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-black text-pos-text">Password Reset</h2>
                  <button onClick={() => setMode('signin')} className="p-2 text-pos-muted hover:text-pos-secondary rounded-lg transition cursor-pointer">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                </div>

                {forgotStep === 1 ? (
                  <form onSubmit={handleLookupAccount} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-pos-secondary">Username</label>
                      <div className="relative">
                        <UserIcon className="w-4 h-4 text-pos-muted absolute left-4 top-1/2 -translate-y-1/2" />
                        <input type="text" value={forgotIdentifier} onChange={e => setForgotIdentifier(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-pos-inset border border-pos-control rounded-md text-sm focus-visible:border-pos-accent" placeholder="e.g. admin" />
                      </div>
                    </div>
                    <button type="submit" className="w-full py-3 bg-pos-action hover:bg-pos-action-hover text-white rounded-md text-sm font-bold transition-colors">Find Account</button>
                  </form>
                ) : (
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <div className="p-3 bg-pos-success-bg rounded-lg border border-pos-success-border text-pos-success-text text-xs flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4" />
                      <span>{recoveryAccount?.name} found!</span>
                    </div>
                    <div className="space-y-3">
                      <input type="text" value={verificationCode} onChange={e => setVerificationCode(e.target.value)} placeholder="Enter Recovery PIN" className="w-full px-4 py-3 bg-pos-inset border border-pos-control rounded-md text-sm focus-visible:border-pos-accent" />
                      <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New Password" className="w-full px-4 py-3 bg-pos-inset border border-pos-control rounded-md text-sm focus-visible:border-pos-accent" />
                      <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm New Password" className="w-full px-4 py-3 bg-pos-inset border border-pos-control rounded-md text-sm focus-visible:border-pos-accent" />
                    </div>
                    <button type="submit" className="w-full py-3 bg-pos-action hover:bg-pos-action-hover text-white rounded-md text-sm font-bold transition-colors">Update Password</button>
                  </form>
                )}
              </div>
            )}

            {mode === 'signup' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-black text-pos-text">Register Admin</h2>
                  <button onClick={() => setMode('signin')} className="p-2 text-pos-muted hover:text-pos-secondary rounded-lg transition cursor-pointer"><ArrowLeft className="w-4 h-4" /></button>
                </div>
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-3">
                    <input type="text" value={signupName} onChange={e => setSignupName(e.target.value)} placeholder="Full Name" className="w-full px-4 py-3 bg-pos-inset border border-pos-control rounded-md text-sm focus-visible:border-pos-accent" required />
                    <input type="text" value={signupUsername} onChange={e => setSignupUsername(e.target.value)} placeholder="Username" className="w-full px-4 py-3 bg-pos-inset border border-pos-control rounded-md text-sm focus-visible:border-pos-accent" required />
                    <input type="password" value={signupPassword} onChange={e => setSignupPassword(e.target.value)} placeholder="Password" className="w-full px-4 py-3 bg-pos-inset border border-pos-control rounded-md text-sm focus-visible:border-pos-accent" required />
                    <input type="text" maxLength={4} value={signupPin} onChange={e => setSignupPin(e.target.value)} placeholder="4-Digit Recovery PIN" className="w-full px-4 py-3 bg-pos-inset border border-pos-control rounded-md text-sm font-mono focus-visible:border-pos-accent" />
                  </div>
                  <button type="submit" className="w-full py-3 bg-pos-action hover:bg-pos-action-hover text-white rounded-md text-sm font-bold transition-colors">Create Admin Account</button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
