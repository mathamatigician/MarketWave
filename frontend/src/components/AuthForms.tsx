import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, AlertTriangle, ArrowRight, ShieldCheck } from 'lucide-react';
import { API_URL } from '../config';
import { GoogleSignInButton } from './GoogleSignInButton';

interface UserInfo {
  email: string;
  first_name: string;
  last_name: string;
  watchlist: string[];
  picture?: string;
}

interface SignInProps {
  onToggleMode: () => void;
  onLoginSuccess: (user: UserInfo) => void;
}

export function SignIn({ onToggleMode, onLoginSuccess }: SignInProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }
    setErrorMsg('');
    setLoading(true);
    
    try {
      const res = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (res.ok) {
        const data = await res.json();
        onLoginSuccess(data);
      } else {
        const err = await res.json();
        setErrorMsg(err.detail || 'Login failed. Please check credentials.');
      }
    } catch (e) {
      setErrorMsg('Network error connecting to backend.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('password123');
    setErrorMsg('');
  };

  return (
    <div className="flex flex-col justify-center items-center py-12 px-4 animate-in fade-in duration-300 w-full max-w-md mx-auto">
      <div className="surface-card w-full p-8 space-y-6 shadow-2xl">
        <div className="text-center space-y-1.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 dark:text-[#00E599] mx-auto mb-2">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight dark:text-white text-slate-900">
            Sign in to MarketWave
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Access your personalized watchlists and real-time signals.
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-lg text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <GoogleSignInButton onLoginSuccess={onLoginSuccess} />

        <div className="relative flex py-1 items-center">
          <div className="flex-grow border-t border-slate-200 dark:border-white/10"></div>
          <span className="flex-shrink mx-4 text-[10px] uppercase font-mono text-slate-400">Or with Email</span>
          <div className="flex-grow border-t border-slate-200 dark:border-white/10"></div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="analyst@firm.com" 
                className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                required
              />
            </div>
          </div>
          
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type={showPassword ? 'text' : 'password'} 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" 
                className="w-full pl-9 pr-10 py-2 rounded-xl text-xs bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full btn-primary text-xs py-2.5 rounded-xl font-bold"
          >
            <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>

        {/* Demo Fast Login Pills */}
        <div className="pt-2 border-t border-slate-200 dark:border-white/10 text-center space-y-2">
          <span className="text-[10px] font-mono text-slate-400 uppercase">1-Click Demo Accounts (Pass: password123):</span>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={() => handleQuickDemo('demo1@marketwave.com')}
              className="px-2.5 py-1 rounded-lg surface-inset hover:border-emerald-500/40 text-[10px] font-mono text-slate-600 dark:text-slate-300 transition-colors"
            >
              demo1@marketwave.com
            </button>
            <button
              type="button"
              onClick={() => handleQuickDemo('demo2@marketwave.com')}
              className="px-2.5 py-1 rounded-lg surface-inset hover:border-emerald-500/40 text-[10px] font-mono text-slate-600 dark:text-slate-300 transition-colors"
            >
              demo2@marketwave.com
            </button>
          </div>
        </div>

        <div className="text-center text-xs text-slate-500">
          Don't have an account?{' '}
          <button onClick={onToggleMode} className="text-emerald-600 dark:text-[#00E599] font-bold hover:underline">
            Sign up here
          </button>
        </div>
      </div>
    </div>
  );
}

interface SignUpProps {
  onToggleMode: () => void;
  onSignupSuccess: () => void;
  onLoginSuccess: (user: UserInfo) => void;
}

export function SignUp({ onToggleMode, onSignupSuccess, onLoginSuccess }: SignUpProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !firstName) {
      setErrorMsg('Please complete all required fields.');
      return;
    }
    setErrorMsg('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email, 
          password, 
          first_name: firstName, 
          last_name: lastName 
        })
      });
      if (res.ok) {
        const data = await res.json();
        onSignupSuccess();
        onLoginSuccess(data);
      } else {
        const err = await res.json();
        setErrorMsg(err.detail || 'Sign up failed.');
      }
    } catch (e) {
      setErrorMsg('Network error connecting to backend.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col justify-center items-center py-12 px-4 animate-in fade-in duration-300 w-full max-w-md mx-auto">
      <div className="surface-card w-full p-8 space-y-6 shadow-2xl">
        <div className="text-center space-y-1.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 dark:text-[#00E599] mx-auto mb-2">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight dark:text-white text-slate-900">
            Create an Account
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Join the MarketWave financial intelligence platform.
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-lg text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <GoogleSignInButton onLoginSuccess={onLoginSuccess} />

        <div className="relative flex py-1 items-center">
          <div className="flex-grow border-t border-slate-200 dark:border-white/10"></div>
          <span className="flex-shrink mx-4 text-[10px] uppercase font-mono text-slate-400">Or with Details</span>
          <div className="flex-grow border-t border-slate-200 dark:border-white/10"></div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">First Name</label>
              <input 
                type="text" 
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Alex" 
                className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Last Name</label>
              <input 
                type="text" 
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Morgan" 
                className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="analyst@firm.com" 
                className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                required
              />
            </div>
          </div>
          
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type={showPassword ? 'text' : 'password'} 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" 
                className="w-full pl-9 pr-10 py-2 rounded-xl text-xs bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full btn-primary text-xs py-2.5 rounded-xl font-bold"
          >
            <span>{loading ? 'Creating Account...' : 'Get Started'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>

        <div className="text-center text-xs text-slate-500">
          Already have an account?{' '}
          <button onClick={onToggleMode} className="text-emerald-600 dark:text-[#00E599] font-bold hover:underline">
            Sign in
          </button>
        </div>
      </div>
    </div>
  );
}
