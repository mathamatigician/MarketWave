import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, User, Phone, AlertTriangle } from 'lucide-react';

interface UserInfo {
  email: string;
  first_name: string;
  last_name: string;
  watchlist: string[];
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
    setLoading(false);
    
    try {
      setLoading(true);
      const res = await fetch('http://localhost:8000/api/login', {
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

  return (
    <div className="flex flex-col h-full justify-center items-center text-center animate-in fade-in duration-500 w-full max-w-md mx-auto py-12">
      <div className="mb-8 w-full text-center">
        <h2 className="text-3xl font-black tracking-tight dark:text-white text-slate-900">Welcome back to GlobePulse</h2>
        <p className="text-xs uppercase tracking-widest dark:text-white/40 text-slate-500 mt-2">Initialize secure session</p>
      </div>
      
      {errorMsg && (
        <div className="w-full flex items-center gap-3 p-4 mb-6 text-sm bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-lg text-left">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form className="w-full space-y-4 text-left" onSubmit={handleSubmit}>
        <div className="space-y-1.5">
          <label className="text-xs dark:text-white/80 text-slate-700 font-bold uppercase tracking-widest">Email Address *</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dark:text-white/30 text-slate-400" />
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operator@company.com" 
              className="w-full dark:bg-white/5 bg-white border dark:border-white/10 border-slate-300 rounded-lg py-3 pl-10 pr-4 text-sm dark:text-white text-slate-900 focus:outline-none focus:border-[#00FF94] transition-colors" 
              required
            />
          </div>
        </div>
        
        <div className="space-y-1.5">
          <label className="text-xs dark:text-white/80 text-slate-700 font-bold uppercase tracking-widest">Password *</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dark:text-white/30 text-slate-400" />
            <input 
              type={showPassword ? 'text' : 'password'} 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" 
              className="w-full dark:bg-white/5 bg-white border dark:border-white/10 border-slate-300 rounded-lg py-3 pl-10 pr-12 text-sm dark:text-white text-slate-900 focus:outline-none focus:border-[#00FF94] transition-colors" 
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 dark:text-white/40 text-slate-400 hover:dark:text-white hover:text-slate-900 cursor-pointer"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        
        <button 
          type="submit"
          disabled={loading}
          className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-[#00FF94] dark:text-black text-white rounded-lg p-3 text-xs font-black uppercase tracking-widest transition-colors mt-2 disabled:opacity-50"
        >
          {loading ? 'Authenticating...' : 'Sign In'}
        </button>
      </form>
      
      <div className="mt-6 flex items-center justify-between w-full text-sm">
        <button className="dark:text-white/60 text-slate-600 hover:text-[#00FF94] transition-colors">Forgot Password?</button>
        <button onClick={onToggleMode} className="text-[#00FF94] hover:text-[#00FF94]/80 transition-colors font-medium">Sign Up for Free</button>
      </div>
    </div>
  );
}

interface SignUpProps {
  onToggleMode: () => void;
  onSignupSuccess: () => void;
}

export function SignUp({ onToggleMode, onSignupSuccess }: SignUpProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName || !lastName || !email || !password) {
      setErrorMsg('Please fill in all required fields.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    setErrorMsg('');
    setLoading(true);

    try {
      const res = await fetch('http://localhost:8000/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          password,
          phone
        })
      });
      if (res.ok) {
        alert('Registration successful! Please log in.');
        onSignupSuccess();
      } else {
        const err = await res.json();
        setErrorMsg(err.detail || 'Sign up failed. User may already exist.');
      }
    } catch (e) {
      setErrorMsg('Network error connecting to backend.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full justify-center items-center text-center animate-in fade-in duration-500 w-full max-w-md mx-auto py-8">
      <div className="mb-6 w-full text-center">
        <h2 className="text-3xl font-black tracking-tight dark:text-white text-slate-900">Create Account</h2>
        <p className="text-xs uppercase tracking-widest dark:text-white/40 text-slate-500 mt-2">Join GlobePulse Sentiment Terminal</p>
      </div>
      
      {errorMsg && (
        <div className="w-full flex items-center gap-3 p-4 mb-6 text-sm bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-lg text-left">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form className="w-full space-y-4 text-left" onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] dark:text-white/80 text-slate-700 font-bold uppercase tracking-widest">First Name *</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dark:text-white/30 text-slate-400" />
              <input 
                type="text" 
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="John" 
                className="w-full dark:bg-white/5 bg-white border dark:border-white/10 border-slate-300 rounded-lg py-2.5 pl-10 pr-4 text-sm dark:text-white text-slate-900 focus:outline-none focus:border-[#00FF94] transition-colors" 
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] dark:text-white/80 text-slate-700 font-bold uppercase tracking-widest">Last Name *</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dark:text-white/30 text-slate-400" />
              <input 
                type="text" 
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Doe" 
                className="w-full dark:bg-white/5 bg-white border dark:border-white/10 border-slate-300 rounded-lg py-2.5 pl-10 pr-4 text-sm dark:text-white text-slate-900 focus:outline-none focus:border-[#00FF94] transition-colors" 
                required
              />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] dark:text-white/80 text-slate-700 font-bold uppercase tracking-widest">Email Address *</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dark:text-white/30 text-slate-400" />
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com" 
              className="w-full dark:bg-white/5 bg-white border dark:border-white/10 border-slate-300 rounded-lg py-2.5 pl-10 pr-4 text-sm dark:text-white text-slate-900 focus:outline-none focus:border-[#00FF94] transition-colors" 
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] dark:text-white/80 text-slate-700 font-bold uppercase tracking-widest">Phone Number</label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dark:text-white/30 text-slate-400" />
            <input 
              type="text" 
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210" 
              className="w-full dark:bg-white/5 bg-white border dark:border-white/10 border-slate-300 rounded-lg py-2.5 pl-10 pr-4 text-sm dark:text-white text-slate-900 focus:outline-none focus:border-[#00FF94] transition-colors" 
            />
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] dark:text-white/80 text-slate-700 font-bold uppercase tracking-widest">Password *</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dark:text-white/30 text-slate-400" />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" 
                className="w-full dark:bg-white/5 bg-white border dark:border-white/10 border-slate-300 rounded-lg py-2.5 pl-10 pr-10 text-sm dark:text-white text-slate-900 focus:outline-none focus:border-[#00FF94] transition-colors" 
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] dark:text-white/80 text-slate-700 font-bold uppercase tracking-widest">Confirm *</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dark:text-white/30 text-slate-400" />
              <input 
                type="password" 
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••" 
                className="w-full dark:bg-white/5 bg-white border dark:border-white/10 border-slate-300 rounded-lg py-2.5 pl-10 pr-10 text-sm dark:text-white text-slate-900 focus:outline-none focus:border-[#00FF94] transition-colors" 
                required
              />
            </div>
          </div>
        </div>
        
        <button 
          type="submit"
          disabled={loading}
          className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-[#00FF94] dark:text-black text-white rounded-lg p-3 text-xs font-black uppercase tracking-widest transition-colors mt-2 disabled:opacity-50"
        >
          {loading ? 'Creating Account...' : 'Sign Up'}
        </button>
      </form>
      
      <div className="mt-6 flex items-center justify-center w-full text-sm">
        <span className="dark:text-white/60 text-slate-600 mr-2">Already have an account?</span>
        <button onClick={onToggleMode} className="text-[#00FF94] hover:text-[#00FF94]/80 transition-colors font-medium">Sign In</button>
      </div>
    </div>
  );
}
