import { useState, useEffect } from 'react';
import { Activity, Sun, Moon, MessageSquare, LogOut, X, Crown } from 'lucide-react';
import { Dashboard } from './components/Dashboard';
import { Home } from './components/Home';
import { SignIn, SignUp } from './components/AuthForms';
import { About, Contact, FAQ } from './components/StaticPages';
import { Feedback } from './components/Feedback';
import { AgentChat } from './components/AgentChat';
import { SubscriptionModal } from './components/SubscriptionModal';

type ViewState = 'home' | 'dashboard' | 'signin' | 'signup' | 'about' | 'contact' | 'faq' | 'feedback';
type ThemeState = 'dark' | 'light';

interface UserSubscription {
  plan_id: string;
  plan_name: string;
  status: string;
  badge: string;
  updated_at?: string;
}

interface UserInfo {
  email: string;
  first_name: string;
  last_name: string;
  watchlist: string[];
  subscription?: UserSubscription;
}

export default function App() {
  const [view, setView] = useState<ViewState>('home');
  const [theme, setTheme] = useState<ThemeState>('dark');
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [isSubscriptionOpen, setIsSubscriptionOpen] = useState(false);

  // Load user session from localStorage on startup
  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('globepulse_user');
      if (storedUser) {
        setUser(JSON.parse(storedUser));
        setView('dashboard');
      }
    } catch (e) {
      console.error('Failed to load user session', e);
    }
  }, []);

  // Sync theme
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const handleLoginSuccess = (loggedInUser: UserInfo) => {
    setUser(loggedInUser);
    localStorage.setItem('globepulse_user', JSON.stringify(loggedInUser));
    setView('dashboard');
  };

  const handleSubscriptionSuccess = (newSub: UserSubscription) => {
    if (user) {
      const updatedUser = { ...user, subscription: newSub };
      setUser(updatedUser);
      localStorage.setItem('globepulse_user', JSON.stringify(updatedUser));
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('globepulse_user');
    setView('home');
    setIsAgentOpen(false);
  };

  const renderView = () => {
    switch (view) {
      case 'home':
        return <Home onEnter={() => setView(user ? 'dashboard' : 'signin')} />;
      case 'dashboard':
        if (!user) {
          return <SignIn onToggleMode={() => setView('signup')} onLoginSuccess={handleLoginSuccess} />;
        }
        return <Dashboard email={user.email} />;
      case 'signin':
        return <SignIn onToggleMode={() => setView('signup')} onLoginSuccess={handleLoginSuccess} />;
      case 'signup':
        return <SignUp onToggleMode={() => setView('signin')} onSignupSuccess={() => setView('signin')} />;
      case 'about':
        return <About />;
      case 'contact':
        return <Contact />;
      case 'faq':
        return <FAQ />;
      case 'feedback':
        return <Feedback user={user} />;
      default:
        return <Home onEnter={() => setView(user ? 'dashboard' : 'signin')} />;
    }
  };

  return (
    <div className="min-h-screen dark:bg-[#070709] bg-slate-50 dark:text-white text-slate-900 flex flex-col font-sans transition-colors duration-300 relative overflow-x-hidden">
      <div className="flex-grow flex flex-col w-full max-w-7xl mx-auto px-4 sm:px-6 md:px-8">

        {/* Top Navigation */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-6 border-b dark:border-white/10 border-slate-200 gap-4 shrink-0">
          <button onClick={() => setView('home')} className="text-left group flex-shrink-0">
            <h1 className="text-2xl md:text-3xl font-black tracking-tighter uppercase flex items-center gap-3 group-hover:opacity-80 transition-opacity">
              <Activity className="w-6 h-6 md:w-8 md:h-8 text-[#00FF94] dark:text-[#00FF94] text-emerald-500 animate-pulse" />
              GlobePulse<span className="text-[#00FF94] dark:text-[#00FF94] text-emerald-500">AI</span>
            </h1>
            <p className="text-[9px] uppercase tracking-[0.3em] dark:text-white/40 text-slate-500 mt-1 font-mono">Sentiment Ingestion Engine v2.5</p>
          </button>

          <nav className="flex flex-wrap gap-3 sm:gap-4 items-center w-full sm:w-auto justify-start sm:justify-end">
            <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition-colors" title="Toggle Theme">
              {theme === 'dark' ? <Sun className="w-4 h-4 text-white/60 hover:text-white" /> : <Moon className="w-4 h-4 text-slate-600 hover:text-slate-900" />}
            </button>

            <button
              onClick={() => setIsSubscriptionOpen(true)}
              className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-emerald-600 dark:text-[#00FF94] hover:opacity-80 transition-opacity px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20"
              title="View Subscription Plans"
            >
              <Crown className="w-3.5 h-3.5 animate-bounce" />
              <span>Pricing</span>
            </button>

            <button
              onClick={() => setView(user ? 'dashboard' : 'signin')}
              className={`text-[11px] font-black uppercase tracking-widest ${view === 'dashboard' ? 'dark:text-white text-slate-900 border-b-2 dark:border-[#00FF94] border-emerald-500 pb-1' : 'dark:text-white/40 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors pb-1'}`}
            >
              Dashboard
            </button>

            <div className="w-px h-4 dark:bg-white/20 bg-slate-300 hidden sm:block"></div>

            {user ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsSubscriptionOpen(true)}
                  className={`text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded cursor-pointer transition-transform hover:scale-105 ${user.subscription?.badge === 'PRO'
                    ? 'bg-emerald-500/20 text-[#00FF94] border border-[#00FF94]/40 shadow-[0_0_10px_rgba(0,255,148,0.2)]'
                    : user.subscription?.badge === 'ENTERPRISE'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-400/40'
                      : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-white/60'
                    }`}
                  title="Click to change plan"
                >
                  [{user.subscription?.badge || 'STARTER'}]
                </button>
                <span className="text-[10px] font-mono dark:text-white/60 text-slate-600 font-bold uppercase truncate max-w-[130px]">
                  👤 {user.first_name || user.email}
                </span>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-rose-500 hover:text-rose-600 transition-colors"
                  title="Secure Logout"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setView('signin')}
                  className={`text-[11px] font-black uppercase tracking-widest ${view === 'signin' ? 'dark:text-white text-slate-900 border-b-2 dark:border-[#00FF94] border-emerald-500 pb-1' : 'dark:text-white/40 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors pb-1'}`}
                >
                  Sign In
                </button>
                <button
                  onClick={() => setView('signup')}
                  className={`text-[11px] font-black uppercase tracking-widest px-4 py-2 ${view === 'signup' ? 'dark:bg-[#00FF94] bg-emerald-500 text-white dark:text-black' : 'dark:bg-white bg-slate-800 text-white dark:text-black hover:bg-emerald-500 dark:hover:bg-[#00FF94]'} transition-colors rounded-sm`}
                >
                  Sign Up
                </button>
              </>
            )}
          </nav>
        </header>

        {/* Subscription Modal */}
        <SubscriptionModal
          isOpen={isSubscriptionOpen}
          onClose={() => setIsSubscriptionOpen(false)}
          userEmail={user?.email || ''}
          currentSubscription={user?.subscription}
          onSubscriptionSuccess={handleSubscriptionSuccess}
        />

        {/* Main Content */}
        <main className="flex-grow w-full mx-auto py-6 flex flex-col overflow-y-auto min-h-0">
          {renderView()}
        </main>

        {/* Footer */}
        <footer className="border-t dark:border-white/10 border-slate-200 py-6 mt-auto flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0">
          <nav className="flex flex-wrap gap-6 justify-center">
            <button
              onClick={() => setView('about')}
              className={`text-[10px] uppercase tracking-widest ${view === 'about' ? 'dark:text-white text-slate-900 font-bold' : 'dark:text-white/40 text-slate-500 hover:text-slate-900 dark:hover:text-white'} transition-colors`}
            >
              About Us
            </button>
            <button
              onClick={() => setView('contact')}
              className={`text-[10px] uppercase tracking-widest ${view === 'contact' ? 'dark:text-white text-slate-900 font-bold' : 'dark:text-white/40 text-slate-500 hover:text-slate-900 dark:hover:text-white'} transition-colors`}
            >
              Contact
            </button>
            <button
              onClick={() => setView('feedback')}
              className={`text-[10px] uppercase tracking-widest ${view === 'feedback' ? 'dark:text-white text-slate-900 font-bold' : 'dark:text-white/40 text-slate-500 hover:text-slate-900 dark:hover:text-white'} transition-colors`}
            >
              Feedback
            </button>
            <button
              onClick={() => setView('faq')}
              className={`text-[10px] uppercase tracking-widest ${view === 'faq' ? 'dark:text-white text-slate-900 font-bold' : 'dark:text-white/40 text-slate-500 hover:text-slate-900 dark:hover:text-white'} transition-colors`}
            >
              FAQ
            </button>
          </nav>

          <div className="flex items-center gap-4">
            <p className="text-[10px] dark:text-white/20 text-slate-400 font-mono uppercase tracking-widest text-center sm:text-right">
              GlobePulseAI &copy; {new Date().getFullYear()}
            </p>
          </div>
        </footer>
      </div>

      {/* Floating Agent Chat Bubble */}
      {user && view === 'dashboard' && (
        <button
          onClick={() => setIsAgentOpen(true)}
          className="fixed bottom-6 right-6 p-4 rounded-full bg-slate-900 dark:bg-white text-white dark:text-black shadow-[0_0_15px_#00FF94] dark:shadow-[0_0_15px_rgba(255,255,255,0.2)] hover:scale-105 transition-transform flex items-center justify-center z-40 group"
          title="Open GlobePulseAI Assistant"
        >
          <MessageSquare className="w-6 h-6 animate-bounce" />
          <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 font-black uppercase text-[10px] tracking-widest pl-0 group-hover:pl-2">
            GlobePulseAI
          </span>
        </button>
      )}

      {/* Sliding Agent Panel Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-white dark:bg-[#0E0E10] border-l border-slate-200 dark:border-white/10 shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${isAgentOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="p-4 border-b border-slate-200 dark:border-white/10 flex justify-between items-center dark:bg-white/2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00FF94] animate-pulse"></span>
            <span className="text-xs font-black uppercase tracking-widest dark:text-white">GLOBEPULSE<span className="text-[#00FF94] dark:text-[#00FF94]">AI</span></span>
          </div>
          <button
            onClick={() => setIsAgentOpen(false)}
            className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 dark:text-white/60 hover:dark:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <AgentChat />
        </div>
      </div>
    </div>
  );
}
