import { useState, useEffect } from 'react';
import { Watchlist } from './components/Watchlist';
import { ChartPanel } from './components/ChartPanel';
import { Heatmap } from './components/Heatmap';
import { AgentChat } from './components/AgentChat';
import { LogOut, User, Lock, Mail, ChevronRight, TrendingUp, Sparkles, BarChart2 } from 'lucide-react';

interface UserInfo {
  email: string;
  first_name: string;
  last_name: string;
  watchlist: string[];
}

function App() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<string>('Tesla');
  const [heatmapData, setHeatmapData] = useState<any[]>([]);
  const [loadingHeatmap, setLoadingHeatmap] = useState<boolean>(false);

  // Auth States
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch heatmap data whenever user or their watchlist changes
  useEffect(() => {
    if (user) {
      fetchHeatmapData();
    }
  }, [user]);

  const fetchHeatmapData = async () => {
    if (!user) return;
    setLoadingHeatmap(true);
    try {
      const res = await fetch(`http://localhost:8000/api/sentiment/heatmap?email=${encodeURIComponent(user.email)}`);
      if (res.ok) {
        const data = await res.json();
        setHeatmapData(data || []);
      }
    } catch (e) {
      console.error("Error loading heatmap data", e);
    } finally {
      setLoadingHeatmap(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      const res = await fetch('http://localhost:8000/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        if (data.watchlist && data.watchlist.length > 0) {
          setSelectedTicker(data.watchlist[0]);
        }
      } else {
        const err = await res.json();
        setErrorMsg(err.detail || 'Login failed.');
      }
    } catch (e) {
      setErrorMsg('Network error connecting to backend.');
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
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
        setAuthMode('login');
        setErrorMsg('');
        alert('Registration successful! Please log in.');
      } else {
        const err = await res.json();
        setErrorMsg(err.detail || 'Signup failed.');
      }
    } catch (e) {
      setErrorMsg('Network error connecting to backend.');
    }
  };

  const handleLogout = () => {
    setUser(null);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setFirstName('');
    setLastName('');
    setPhone('');
  };

  const onWatchlistChange = (newWatchlist: string[]) => {
    if (user) {
      setUser({ ...user, watchlist: newWatchlist });
      if (newWatchlist.length > 0 && !newWatchlist.includes(selectedTicker)) {
        setSelectedTicker(newWatchlist[0]);
      }
    }
  };

  // --- Auth View (Login / Signup) ---
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden" style={{ background: 'radial-gradient(circle at 50% 0%, #151824 0%, #08090c 70%)' }}>
        {/* Decorative Blurred Spots */}
        <div className="absolute top-[-100px] left-[10%] w-[300px] h-[300px] rounded-full bg-cyan-500/10 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-100px] right-[10%] w-[300px] h-[300px] rounded-full bg-purple-500/10 blur-[120px] pointer-events-none" />

        <div className="glass-card w-full max-w-md p-8 flex flex-col items-center">
          <div className="flex items-center gap-2 mb-6">
            <span className="text-3xl">🌍</span>
            <span className="text-2xl font-bold Outfit tracking-tight text-white">GlobePulse</span>
          </div>

          <h2 className="text-xl font-bold tracking-tight text-white mb-6 text-center">
            {authMode === 'login' ? 'Access Financial Intelligence' : 'Create Intelligence Account'}
          </h2>

          {errorMsg && (
            <div className="w-full bg-red-950/40 border border-red-500/30 rounded-lg p-3 text-rose-400 text-xs text-center mb-4">
              {errorMsg}
            </div>
          )}

          <form onSubmit={authMode === 'login' ? handleLogin : handleSignup} className="w-full space-y-4">
            {authMode === 'signup' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">First Name *</label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/40"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Last Name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/40"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Email Address *</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 text-slate-500" size={14} />
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/40"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Password *</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 text-slate-500" size={14} />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-400/40"
                />
              </div>
            </div>

            {authMode === 'signup' && (
              <>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Confirm Password *</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 text-slate-500" size={14} />
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-400/40"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Phone Number</label>
                  <input
                    type="text"
                    placeholder="+91 XXXXX XXXXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/40"
                  />
                </div>
              </>
            )}

            <button type="submit" className="w-full py-2.5 px-4 gradient-btn flex items-center justify-center gap-2 mt-2">
              <span>{authMode === 'login' ? 'Log In' : 'Sign Up'}</span>
              <ChevronRight size={14} />
            </button>
          </form>

          <div className="flex items-center gap-1.5 mt-6 text-xs text-slate-400">
            <span>{authMode === 'login' ? "Don't have an account?" : "Already have an account?"}</span>
            <button
              onClick={() => {
                setAuthMode(authMode === 'login' ? 'signup' : 'login');
                setErrorMsg('');
              }}
              className="text-cyan-400 font-semibold bg-transparent border-none p-0 cursor-pointer hover:underline"
            >
              {authMode === 'login' ? 'Sign Up' : 'Log In'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Main Dashboard View ---
  return (
    <div className="dashboard-grid min-h-screen">
      {/* 1. Left Sidebar */}
      <aside className="p-4 bg-slate-950/20 border-r border-slate-800/40">
        <Watchlist
          email={user.email}
          activeWatchlist={user.watchlist}
          onChange={onWatchlistChange}
        />
      </aside>

      {/* 2. Main Content Plane */}
      <div className="flex flex-col min-h-screen">
        {/* Top Navbar */}
        <header className="flex justify-between items-center px-8 py-4 bg-slate-950/30 border-b border-slate-900">
          <div className="flex items-center gap-2.5">
            <Sparkles size={16} className="text-cyan-400" />
            <h1 className="text-base font-bold text-white tracking-tight m-0">GlobePulse Dashboard</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-400 flex items-center gap-1.5 font-medium">
              <User size={14} className="text-cyan-400" />
              Welcome, <strong className="text-white font-semibold">{user.first_name}</strong>
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 bg-transparent text-xs tracking-wide"
              style={{ cursor: 'pointer', outline: 'none' }}
            >
              <LogOut size={12} />
              <span>Log Out</span>
            </button>
          </div>
        </header>

        {/* Dashboard Panels Layout */}
        <main className="flex-1 grid grid-cols-1 xl:grid-cols-3 gap-6 p-6 overflow-y-auto">
          {/* Main Visuals (2/3 width on large screens) */}
          <div className="xl:col-span-2 space-y-6">
            {/* Stock and Daily Sentiment Chart */}
            <section className="glass-card p-6 min-h-[350px]">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
                <TrendingUp size={14} className="text-cyan-400" />
                <span>Price Trend & Sentiment Overlay</span>
              </div>
              <div className="flex items-center gap-2 mb-4 bg-slate-900/40 p-2 rounded-lg border border-slate-800/60 w-fit">
                <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider px-1">Selected Stock:</span>
                <select
                  value={selectedTicker}
                  onChange={(e) => setSelectedTicker(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-white font-medium focus:outline-none"
                >
                  {user.watchlist.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="h-[280px]">
                <ChartPanel ticker={selectedTicker} />
              </div>
            </section>

            {/* Overall Sentiment Heatmap */}
            <section className="glass-card p-6 min-h-[250px]">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
                <BarChart2 size={14} className="text-emerald-400" />
                <span>Topic Sentiment Heatmap</span>
              </div>
              {loadingHeatmap ? (
                <div className="flex justify-center items-center h-[200px] text-xs text-slate-500 font-medium animate-pulse">
                  Aggregating topic sentiments...
                </div>
              ) : (
                <Heatmap data={heatmapData} />
              )}
            </section>
          </div>

          {/* Right AI Orchestrator Panel (1/3 width) */}
          <section className="glass-card p-6 flex flex-col h-full min-h-[500px]">
            <AgentChat />
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;
