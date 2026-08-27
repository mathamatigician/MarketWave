import { useState, useEffect } from 'react';
import { Sun, Moon, MessageSquare, LogOut, X, Crown, Menu, User as UserIcon } from 'lucide-react';
import { Dashboard } from './components/Dashboard';
import { Home } from './components/Home';
import { SignIn, SignUp } from './components/AuthForms';
import { About, Contact, FAQ } from './components/StaticPages';
import { Feedback } from './components/Feedback';
import { AgentChat } from './components/AgentChat';
import { SubscriptionModal } from './components/SubscriptionModal';
import { FEATURES } from './config';


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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Load user session from localStorage on startup
  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('marketwave_user') || localStorage.getItem('marketwave_user');
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
    localStorage.setItem('marketwave_user', JSON.stringify(loggedInUser));
    setView('dashboard');
    setIsMobileMenuOpen(false);
  };

  const handleSubscriptionSuccess = (newSub: UserSubscription) => {
    if (user) {
      const updatedUser = { ...user, subscription: newSub };
      setUser(updatedUser);
      localStorage.setItem('marketwave_user', JSON.stringify(updatedUser));
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('marketwave_user');
    localStorage.removeItem('marketwave_user');
    setView('home');
    setIsAgentOpen(false);
    setIsMobileMenuOpen(false);
  };

  const handleNavigate = (newView: ViewState) => {
    setView(newView);
    setIsMobileMenuOpen(false);
  };

  const renderView = () => {
    switch (view) {
      case 'home':
        return <Home onEnter={() => handleNavigate(user ? 'dashboard' : 'signin')} />;
      case 'dashboard':
        if (!user) {
          return <SignIn onToggleMode={() => handleNavigate('signup')} onLoginSuccess={handleLoginSuccess} />;
        }
        return <Dashboard email={user.email} />;
      case 'signin':
        return <SignIn onToggleMode={() => handleNavigate('signup')} onLoginSuccess={handleLoginSuccess} />;
      case 'signup':
        return <SignUp onToggleMode={() => handleNavigate('signin')} onSignupSuccess={() => handleNavigate('signin')} onLoginSuccess={handleLoginSuccess} />;
      case 'about':
        return <About />;
      case 'contact':
        return <Contact />;
      case 'faq':
        return <FAQ />;
      case 'feedback':
        return FEATURES.feedback ? <Feedback user={user} /> : <Home onEnter={() => handleNavigate(user ? 'dashboard' : 'signin')} />;
      default:
        return <Home onEnter={() => handleNavigate(user ? 'dashboard' : 'signin')} />;
    }
  };

  return (
    <div className="min-h-screen dark:bg-[#070709] bg-slate-50 dark:text-white text-slate-900 flex flex-col font-sans transition-colors duration-300 relative overflow-x-hidden">
      <div className="flex-grow flex flex-col w-full max-w-7xl mx-auto px-3 sm:px-6 md:px-8">

        {/* Top Navigation */}
        <header className="flex justify-between items-center py-4 sm:py-6 border-b dark:border-white/10 border-slate-200 gap-2 shrink-0">
          <button onClick={() => handleNavigate('home')} className="text-left group flex-shrink-0">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tighter uppercase flex items-center gap-2 sm:gap-3 group-hover:opacity-80 transition-opacity">
              <img src="/favicon.svg" alt="MarketWave Logo" className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8" />
              MarketWave<span className="text-[#00FF94] dark:text-[#00FF94] text-emerald-500">AI</span>
            </h1>
            <p className="text-[8px] sm:text-[9px] uppercase tracking-[0.2em] sm:tracking-[0.3em] dark:text-white/40 text-slate-500 mt-0.5 sm:mt-1 font-mono">Sentiment Ingestion Engine v2.5</p>
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex flex-wrap gap-3 sm:gap-4 items-center justify-end">
            <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition-colors" title="Toggle Theme">
              {theme === 'dark' ? <Sun className="w-4 h-4 text-white/60 hover:text-white" /> : <Moon className="w-4 h-4 text-slate-600 hover:text-slate-900" />}
            </button>

            {FEATURES.pricing && (
              <button
                onClick={() => setIsSubscriptionOpen(true)}
                className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-emerald-600 dark:text-[#00FF94] hover:opacity-80 transition-opacity px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20"
                title="View Subscription Plans"
              >
                <Crown className="w-3.5 h-3.5 animate-bounce" />
                <span>Pricing</span>
              </button>
            )}

            <button
              onClick={() => handleNavigate(user ? 'dashboard' : 'signin')}
              className={`text-[11px] font-black uppercase tracking-widest ${view === 'dashboard' ? 'dark:text-white text-slate-900 border-b-2 dark:border-[#00FF94] border-emerald-500 pb-1' : 'dark:text-white/40 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors pb-1'}`}
            >
              Dashboard
            </button>

            {FEATURES.feedback && (
              <button
                onClick={() => handleNavigate('feedback')}
                className={`text-[11px] font-black uppercase tracking-widest ${view === 'feedback' ? 'dark:text-white text-slate-900 border-b-2 dark:border-[#00FF94] border-emerald-500 pb-1' : 'dark:text-white/40 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors pb-1'}`}
              >
                Feedback
              </button>
            )}

            <div className="w-px h-4 dark:bg-white/20 bg-slate-300"></div>

            {user ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => FEATURES.pricing && setIsSubscriptionOpen(true)}
                  disabled={!FEATURES.pricing}
                  className={`text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded transition-transform ${FEATURES.pricing
                    ? 'cursor-pointer hover:scale-105'
                    : 'cursor-default'
                    } ${user.subscription?.badge === 'PRO'
                    ? 'bg-emerald-500/20 text-[#00FF94] border border-[#00FF94]/40 shadow-[0_0_10px_rgba(0,255,148,0.2)]'
                    : user.subscription?.badge === 'ENTERPRISE'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-400/40'
                      : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-white/60'
                    }`}
                  title={FEATURES.pricing ? "Click to change plan" : undefined}
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
                  <span>Logout</span>
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => handleNavigate('signin')}
                  className={`text-[11px] font-black uppercase tracking-widest ${view === 'signin' ? 'dark:text-white text-slate-900 border-b-2 dark:border-[#00FF94] border-emerald-500 pb-1' : 'dark:text-white/40 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors pb-1'}`}
                >
                  Sign In
                </button>
                <button
                  onClick={() => handleNavigate('signup')}
                  className={`text-[11px] font-black uppercase tracking-widest px-4 py-2 ${view === 'signup' ? 'dark:bg-[#00FF94] bg-emerald-500 text-white dark:text-black' : 'dark:bg-white bg-slate-800 text-white dark:text-black hover:bg-emerald-500 dark:hover:bg-[#00FF94]'} transition-colors rounded-sm`}
                >
                  Sign Up
                </button>
              </>
            )}
          </nav>

          {/* Mobile Navigation Header Actions */}
          <div className="flex md:hidden items-center gap-2">
            <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition-colors" title="Toggle Theme">
              {theme === 'dark' ? <Sun className="w-4 h-4 text-white/60" /> : <Moon className="w-4 h-4 text-slate-600" />}
            </button>
            {FEATURES.pricing && (
              <button
                onClick={() => setIsSubscriptionOpen(true)}
                className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-[#00FF94] px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20"
              >
                <Crown className="w-3 h-3" />
                <span>Pro</span>
              </button>
            )}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-lg border dark:border-white/10 border-slate-200 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
              aria-label="Toggle Navigation Menu"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </header>

        {/* Mobile Dropdown Drawer */}
        {isMobileMenuOpen && (
          <div className="md:hidden py-4 border-b dark:border-white/10 border-slate-200 flex flex-col gap-3 animate-in slide-in-from-top-2 duration-200 bg-white/95 dark:bg-[#070709]/95 backdrop-blur">
            {user && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-100 dark:bg-white/5 mb-1">
                <div className="flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-emerald-500 dark:text-[#00FF94]" />
                  <span className="text-xs font-mono font-bold dark:text-white text-slate-900 truncate max-w-[180px]">
                    {user.first_name || user.email}
                  </span>
                </div>
                <button
                  onClick={() => { if (FEATURES.pricing) { setIsSubscriptionOpen(true); setIsMobileMenuOpen(false); } }}
                  disabled={!FEATURES.pricing}
                  className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-[#00FF94] ${FEATURES.pricing ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  [{user.subscription?.badge || 'STARTER'}]
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleNavigate(user ? 'dashboard' : 'signin')}
                className={`p-2.5 text-xs font-bold uppercase tracking-wider rounded-lg text-left transition-colors ${view === 'dashboard' ? 'bg-emerald-500/10 text-emerald-600 dark:text-[#00FF94] border border-emerald-500/20' : 'hover:bg-slate-100 dark:hover:bg-white/5'}`}
              >
                📊 Dashboard
              </button>
              {FEATURES.feedback && (
                <button
                  onClick={() => handleNavigate('feedback')}
                  className={`p-2.5 text-xs font-bold uppercase tracking-wider rounded-lg text-left transition-colors ${view === 'feedback' ? 'bg-emerald-500/10 text-emerald-600 dark:text-[#00FF94] border border-emerald-500/20' : 'hover:bg-slate-100 dark:hover:bg-white/5'}`}
                >
                  💬 Feedback
                </button>
              )}
              <button
                onClick={() => handleNavigate('about')}
                className={`p-2.5 text-xs font-bold uppercase tracking-wider rounded-lg text-left transition-colors ${view === 'about' ? 'bg-emerald-500/10 text-emerald-600 dark:text-[#00FF94] border border-emerald-500/20' : 'hover:bg-slate-100 dark:hover:bg-white/5'}`}
              >
                ℹ️ About Us
              </button>
              <button
                onClick={() => handleNavigate('faq')}
                className={`p-2.5 text-xs font-bold uppercase tracking-wider rounded-lg text-left transition-colors ${view === 'faq' ? 'bg-emerald-500/10 text-emerald-600 dark:text-[#00FF94] border border-emerald-500/20' : 'hover:bg-slate-100 dark:hover:bg-white/5'}`}
              >
                ❓ FAQ
              </button>
            </div>

            <div className="pt-2 border-t dark:border-white/10 border-slate-200 flex gap-2">
              {user ? (
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 p-2.5 text-xs font-bold uppercase tracking-widest text-rose-500 bg-rose-500/10 rounded-lg hover:bg-rose-500/20 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </button>
              ) : (
                <>
                  <button
                    onClick={() => handleNavigate('signin')}
                    className="flex-1 p-2.5 text-xs font-bold uppercase tracking-widest text-center rounded-lg border border-slate-300 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => handleNavigate('signup')}
                    className="flex-1 p-2.5 text-xs font-bold uppercase tracking-widest text-center rounded-lg bg-emerald-500 dark:bg-[#00FF94] text-white dark:text-black font-extrabold hover:opacity-90 transition-opacity"
                  >
                    Sign Up
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Subscription Modal */}
        {FEATURES.pricing && (
          <SubscriptionModal
            isOpen={isSubscriptionOpen}
            onClose={() => setIsSubscriptionOpen(false)}
            userEmail={user?.email || ''}
            currentSubscription={user?.subscription}
            onSubscriptionSuccess={handleSubscriptionSuccess}
          />
        )}

        {/* Main Content */}
        <main className="flex-grow w-full mx-auto py-4 sm:py-6 flex flex-col overflow-y-auto min-h-0">
          {renderView()}
        </main>

        {/* Footer */}
        <footer className="border-t dark:border-white/10 border-slate-200 py-6 mt-auto flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0">
          <nav className="flex flex-wrap gap-4 sm:gap-6 justify-center">
            <button
              onClick={() => handleNavigate('about')}
              className={`text-[10px] uppercase tracking-widest ${view === 'about' ? 'dark:text-white text-slate-900 font-bold' : 'dark:text-white/40 text-slate-500 hover:text-slate-900 dark:hover:text-white'} transition-colors`}
            >
              About Us
            </button>
            <button
              onClick={() => handleNavigate('contact')}
              className={`text-[10px] uppercase tracking-widest ${view === 'contact' ? 'dark:text-white text-slate-900 font-bold' : 'dark:text-white/40 text-slate-500 hover:text-slate-900 dark:hover:text-white'} transition-colors`}
            >
              Contact
            </button>
            {FEATURES.feedback && (
              <button
                onClick={() => handleNavigate('feedback')}
                className={`text-[10px] uppercase tracking-widest ${view === 'feedback' ? 'dark:text-white text-slate-900 font-bold' : 'dark:text-white/40 text-slate-500 hover:text-slate-900 dark:hover:text-white'} transition-colors`}
              >
                Feedback
              </button>
            )}
            <button
              onClick={() => handleNavigate('faq')}
              className={`text-[10px] uppercase tracking-widest ${view === 'faq' ? 'dark:text-white text-slate-900 font-bold' : 'dark:text-white/40 text-slate-500 hover:text-slate-900 dark:hover:text-white'} transition-colors`}
            >
              FAQ
            </button>
          </nav>

        </footer>
      </div>

      {/* Floating Agent Chat Bubble */}
      {user && view === 'dashboard' && (
        <button
          onClick={() => setIsAgentOpen(true)}
          className="fixed bottom-4 sm:bottom-6 right-4 sm:right-6 p-3.5 sm:p-4 rounded-full bg-slate-900 dark:bg-white text-white dark:text-black shadow-[0_0_15px_#00FF94] dark:shadow-[0_0_15px_rgba(255,255,255,0.2)] hover:scale-105 transition-transform flex items-center justify-center z-40 group"
          title="Open MarketWaveAI Assistant"
        >
          <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 animate-bounce" />
          <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 font-black uppercase text-[10px] tracking-widest pl-0 group-hover:pl-2">
            MarketWaveAI
          </span>
        </button>
      )}

      {/* Sliding Agent Panel Drawer - Responsive on Mobile & Desktop */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:max-w-md bg-white dark:bg-[#0E0E10] border-l border-slate-200 dark:border-white/10 shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${isAgentOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="p-4 border-b border-slate-200 dark:border-white/10 flex justify-between items-center dark:bg-white/2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00FF94] animate-pulse"></span>
            <span className="text-xs font-black uppercase tracking-widest dark:text-white">MARKETWAVE<span className="text-[#00FF94] dark:text-[#00FF94]">AI</span></span>
          </div>
          <button
            onClick={() => setIsAgentOpen(false)}
            className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 dark:text-white/60 hover:dark:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <AgentChat />
        </div>
      </div>
    </div>
  );
}
