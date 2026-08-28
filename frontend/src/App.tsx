import { useState, useEffect } from 'react';
import { Navigation } from './components/Navigation';
import { Dashboard } from './components/Dashboard';
import { MarketsView } from './components/MarketsView';
import { StockDetailView } from './components/StockDetailView';
import { PortfolioView } from './components/PortfolioView';
import { MarketIntelligenceView } from './components/MarketIntelligenceView';
import { AnalyticsView } from './components/AnalyticsView';
import { AlertsView } from './components/AlertsView';
import { Home } from './components/Home';
import { SignIn, SignUp } from './components/AuthForms';
import { About, Contact, FAQ } from './components/StaticPages';
import { Feedback } from './components/Feedback';
import { AgentChat } from './components/AgentChat';
import { SubscriptionModal } from './components/SubscriptionModal';
import { FEATURES, API_URL, WS_URL, MARKET_DATA_REFRESH_INTERVAL_MS, API_REQUEST_TIMEOUT_MS } from './config';
import type { MainNavTab, Stock, ArticleItem, BriefingItem, ActivityEvent } from './types';
import { COMPANY_DIRECTORY, generateSyntheticSparkline } from './lib/utils';
import { Search, X } from 'lucide-react';

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
  const [view, setView] = useState<'home' | 'app' | 'signin' | 'signup' | 'about' | 'contact' | 'faq'>('home');
  const [currentTab, setCurrentTab] = useState<MainNavTab>('dashboard');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [user, setUser] = useState<UserInfo | null>(null);

  // Global shared state
  const [selectedStockTicker, setSelectedStockTicker] = useState<string>('TSLA');
  const [watchlist, setWatchlist] = useState<string[]>(['TSLA', 'AAPL', 'GOOG', 'NVDA']);
  const [stocksData, setStocksData] = useState<Stock[]>([]);
  const [heatmapData, setHeatmapData] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [recentArticles, setRecentArticles] = useState<ArticleItem[]>([]);
  
  // Real-time telemetry
  const [connectionStatus, setConnectionStatus] = useState<'LIVE' | 'RECONNECTING' | 'OFFLINE'>('OFFLINE');
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);

  // AI Briefing
  const [briefing, setBriefing] = useState<BriefingItem[]>([]);
  const [loadingBriefing, setLoadingBriefing] = useState<boolean>(false);
  const [briefingTimestamp, setBriefingTimestamp] = useState<number | null>(null);
  const [briefingStatus, setBriefingStatus] = useState<'idle' | 'updating' | 'live' | 'error'>('idle');

  // Modals & Panels
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [isSubscriptionOpen, setIsSubscriptionOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Load user session on boot
  useEffect(() => {
    try {
      const stored = localStorage.getItem('marketwave_user');
      if (stored) {
        const parsed = JSON.parse(stored);
        setUser(parsed);
        setView('app');
        if (parsed.watchlist && parsed.watchlist.length > 0) {
          setWatchlist(parsed.watchlist);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Theme synchronization
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Global Keyboard Shortcuts (⌘K for search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const handleLoginSuccess = (loggedInUser: UserInfo) => {
    setUser(loggedInUser);
    localStorage.setItem('marketwave_user', JSON.stringify(loggedInUser));
    if (loggedInUser.watchlist && loggedInUser.watchlist.length > 0) {
      setWatchlist(loggedInUser.watchlist);
    }
    setView('app');
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('marketwave_user');
    setView('home');
    setIsAgentOpen(false);
  };

  const handleSubscriptionSuccess = (newSub: UserSubscription) => {
    if (user) {
      const updated = { ...user, subscription: newSub };
      setUser(updated);
      localStorage.setItem('marketwave_user', JSON.stringify(updated));
    }
  };

  // Watchlist Toggle
  const handleToggleWatchlist = async (ticker: string) => {
    const isAdded = watchlist.includes(ticker);
    const newWatchlist = isAdded ? watchlist.filter(t => t !== ticker) : [...watchlist, ticker];
    setWatchlist(newWatchlist);

    if (user) {
      const updatedUser = { ...user, watchlist: newWatchlist };
      setUser(updatedUser);
      localStorage.setItem('marketwave_user', JSON.stringify(updatedUser));

      try {
        await fetch(`${API_URL}/api/user/watchlist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email, watchlist: newWatchlist })
        });
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Trigger News Ingestion
  const handleTriggerIngest = async () => {
    setIsIngesting(true);
    try {
      await fetch(`${API_URL}/api/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user?.email || 'demo1@marketwave.com', tickers: watchlist })
      });
      setTimeout(() => {
        setIsIngesting(false);
        setLastSyncTimestamp(Date.now());
      }, 2500);
    } catch (e) {
      console.error(e);
      setIsIngesting(false);
    }
  };

  // Navigate to single stock terminal
  const handleSelectStock = (ticker: string) => {
    setSelectedStockTicker(ticker);
    setCurrentTab('stocks');
    setIsSearchOpen(false);
  };

  // Load app data
  useEffect(() => {
    let isCancelled = false;
    const fetchGlobalData = async () => {
      setIsRefreshing(true);
      try {
        const stockPromises = watchlist.map(async (ticker) => {
          try {
            const res = await fetch(`${API_URL}/api/stock/history?ticker=${ticker}&period=5d`, {
              signal: AbortSignal.timeout(API_REQUEST_TIMEOUT_MS)
            });
            if (res.ok) {
              const data = await res.json();
              const prices = data.price_series || [];
              const sentiments = data.sentiment_series || [];
              const articles = data.recent_articles || [];

              let price = COMPANY_DIRECTORY[ticker]?.basePrice || 150.0;
              let changePercent = 0.65;
              if (prices.length > 0) {
                const latest = prices[prices.length - 1];
                price = latest.value !== undefined ? latest.value : price;
                if (prices.length > 1) {
                  const prev = prices[prices.length - 2]?.value || price;
                  changePercent = ((price - prev) / prev) * 100.0;
                }
              }

              let sentimentScore: number | null = null;
              if (sentiments.length > 0) {
                const latest = sentiments[sentiments.length - 1];
                const val = latest.value !== undefined ? latest.value : (latest.score || 0.0);
                const isPositive = latest.color ? latest.color.includes('0, 150') : val >= 0;
                sentimentScore = isPositive ? Math.abs(val) / 100.0 : -(Math.abs(val) / 100.0);
              }

              return {
                ticker,
                name: COMPANY_DIRECTORY[ticker]?.name || `${ticker} Corp`,
                price,
                changePercent,
                sentimentScore,
                currency: ticker.endsWith('.NS') ? 'INR' : 'USD',
                region: ticker.endsWith('.NS') ? 'IN' : 'US',
                sector: COMPANY_DIRECTORY[ticker]?.sector || 'Technology',
                marketCap: COMPANY_DIRECTORY[ticker]?.marketCap || '500B',
                sparkline: generateSyntheticSparkline(price, changePercent),
                recentArticles: articles
              };
            }
          } catch (e) {
            console.error(e);
          }
          return null;
        });

        const stockResults = await Promise.allSettled(stockPromises);
        const validStocks: Stock[] = [];
        const allArticles: ArticleItem[] = [];

        stockResults.forEach(res => {
          if (res.status === 'fulfilled' && res.value) {
            validStocks.push(res.value as Stock);
            if ((res.value as any).recentArticles) {
              allArticles.push(...(res.value as any).recentArticles);
            }
          }
        });

        if (!isCancelled) {
          if (validStocks.length > 0) setStocksData(validStocks);
          if (allArticles.length > 0) setRecentArticles(allArticles);
        }

        // Fetch heatmap
        const heatRes = await fetch(`${API_URL}/api/sentiment/heatmap`);
        if (heatRes.ok && !isCancelled) {
          const heatData = await heatRes.json();
          if (Array.isArray(heatData)) setHeatmapData(heatData);
        }

        // Fetch alerts
        const alertsRes = await fetch(`${API_URL}/api/alerts?email=${encodeURIComponent(user?.email || 'demo1@marketwave.com')}`);
        if (alertsRes.ok && !isCancelled) {
          const alertsData = await alertsRes.json();
          if (Array.isArray(alertsData)) setAlerts(alertsData);
        }

        // Fetch briefing
        try {
          setLoadingBriefing(true);
          setBriefingStatus('updating');
          const briefRes = await fetch(`${API_URL}/api/gemma/briefing`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user?.email || 'demo1@marketwave.com', tickers: watchlist })
          });
          if (briefRes.ok && !isCancelled) {
            const briefData = await briefRes.json();
            if (briefData.status === 'success' && Array.isArray(briefData.briefing)) {
              setBriefing(briefData.briefing);
              setBriefingTimestamp(Date.now());
              setBriefingStatus('live');
            }
          }
        } catch (e) {
          console.error(e);
          if (!isCancelled) setBriefingStatus('error');
        } finally {
          if (!isCancelled) setLoadingBriefing(false);
        }

        setLastSyncTimestamp(Date.now());
      } catch (err) {
        console.error(err);
      } finally {
        if (!isCancelled) setIsRefreshing(false);
      }
    };

    fetchGlobalData();
    const interval = setInterval(fetchGlobalData, MARKET_DATA_REFRESH_INTERVAL_MS);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [watchlist, user?.email]);

  // WebSocket for ingest stream
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    const connect = () => {
      try {
        ws = new WebSocket(`${WS_URL}/ws/ingest`);
        ws.onopen = () => setConnectionStatus('LIVE');
        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            if (msg.type === 'ingest_activity') {
              const newEvt: ActivityEvent = {
                id: `evt-${Date.now()}-${Math.random()}`,
                ticker: msg.ticker,
                title: msg.title,
                impact: msg.impact || 'MEDIUM',
                sentimentScore: msg.sentiment_score || 0,
                timestamp: msg.timestamp || Date.now()
              };
              setActivityEvents(prev => [newEvt, ...prev.slice(0, 20)]);
              setLastSyncTimestamp(Date.now());
            }
          } catch (e) {
            console.error(e);
          }
        };
        ws.onclose = () => {
          setConnectionStatus('RECONNECTING');
          reconnectTimeout = setTimeout(connect, 3000);
        };
        ws.onerror = () => setConnectionStatus('OFFLINE');
      } catch (e) {
        setConnectionStatus('OFFLINE');
      }
    };

    connect();
    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  const allSearchTickers = Object.keys(COMPANY_DIRECTORY).filter(t => !['Tesla', 'Apple', 'Google', 'Alphabet', 'Microsoft', 'Nvidia', 'Amazon', 'Intel', 'Meta', 'Reliance Industries', 'Tata Motors', 'Infosys'].includes(t));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#07090E] text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      
      {/* 1. Global Navigation Bar */}
      <Navigation
        currentTab={currentTab}
        onSelectTab={(tab) => {
          setCurrentTab(tab);
          if (view !== 'app') setView('app');
        }}
        theme={theme}
        onToggleTheme={toggleTheme}
        user={user}
        onLogout={handleLogout}
        onOpenPricing={() => setIsSubscriptionOpen(true)}
        onOpenAgent={() => setIsAgentOpen(!isAgentOpen)}
        onTriggerIngest={handleTriggerIngest}
        isIngesting={isIngesting}
        connectionStatus={connectionStatus}
        lastSyncTimestamp={lastSyncTimestamp}
        onManualRefresh={() => setLastSyncTimestamp(Date.now())}
        isRefreshing={isRefreshing}
        alertCount={alerts.length}
        onSearchClick={() => setIsSearchOpen(true)}
      />

      {/* 2. Main Body Container */}
      <main className="flex-1 w-full max-w-[1600px] mx-auto px-3 sm:px-6 py-6">
        {view === 'home' && (
          <Home onEnter={() => setView(user ? 'app' : 'signin')} />
        )}

        {view === 'signin' && (
          <SignIn 
            onToggleMode={() => setView('signup')} 
            onLoginSuccess={handleLoginSuccess} 
          />
        )}

        {view === 'signup' && (
          <SignUp 
            onToggleMode={() => setView('signin')} 
            onSignupSuccess={() => setView('signin')} 
            onLoginSuccess={handleLoginSuccess} 
          />
        )}

        {view === 'about' && <About />}
        {view === 'contact' && <Contact />}
        {view === 'faq' && <FAQ />}

        {view === 'app' && (
          <>
            {currentTab === 'dashboard' && (
              <Dashboard 
                email={user?.email || 'demo1@marketwave.com'} 
                onNavigateTab={(tab) => setCurrentTab(tab)}
                onSelectStock={handleSelectStock}
              />
            )}

            {currentTab === 'markets' && (
              <MarketsView 
                stocksData={stocksData} 
                watchlist={watchlist} 
                onToggleWatchlist={handleToggleWatchlist}
                onSelectStock={handleSelectStock}
              />
            )}

            {currentTab === 'stocks' && (
              <StockDetailView 
                initialTicker={selectedStockTicker}
                watchlist={watchlist}
                onToggleWatchlist={handleToggleWatchlist}
                onSelectStock={handleSelectStock}
                lastSyncTimestamp={lastSyncTimestamp}
              />
            )}

            {currentTab === 'watchlist' && (
              <PortfolioView 
                watchlist={watchlist}
                stocksData={stocksData}
                onToggleWatchlist={handleToggleWatchlist}
                onSelectStock={handleSelectStock}
              />
            )}

            {currentTab === 'intelligence' && (
              <MarketIntelligenceView 
                briefing={briefing}
                loadingBriefing={loadingBriefing}
                briefingStatus={briefingStatus}
                briefingError={null}
                briefingTimestamp={briefingTimestamp}
                onRefreshBriefing={() => {}}
                stocksData={stocksData}
                watchlist={watchlist}
                recentArticles={recentArticles}
                onSelectStock={handleSelectStock}
              />
            )}

            {currentTab === 'news' && (
              <MarketIntelligenceView 
                briefing={briefing}
                loadingBriefing={loadingBriefing}
                briefingStatus={briefingStatus}
                briefingError={null}
                briefingTimestamp={briefingTimestamp}
                onRefreshBriefing={() => {}}
                stocksData={stocksData}
                watchlist={watchlist}
                recentArticles={recentArticles}
                onSelectStock={handleSelectStock}
              />
            )}

            {currentTab === 'analytics' && (
              <AnalyticsView 
                heatmapData={heatmapData}
                stocksData={stocksData}
                watchlist={watchlist}
                activityEvents={activityEvents}
                connectionStatus={connectionStatus}
                onSelectStock={handleSelectStock}
              />
            )}

            {currentTab === 'alerts' && (
              <AlertsView 
                alerts={alerts}
                watchlist={watchlist}
                onSelectStock={handleSelectStock}
              />
            )}

            {currentTab === 'feedback' && (
              <Feedback user={user} />
            )}
          </>
        )}
      </main>

      {/* 3. Global AI Copilot Floating Drawer */}
      {isAgentOpen && (
        <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] shadow-2xl animate-in slide-in-from-right duration-200">
          <AgentChat onClose={() => setIsAgentOpen(false)} />
        </div>
      )}

      {/* 4. Global Command Palette / Search Modal (⌘K) */}
      {isSearchOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setIsSearchOpen(false)}
        >
          <div 
            className="surface-card w-full max-w-xl p-4 space-y-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search stocks, sectors, or jump to tabs..."
                className="w-full pl-9 pr-8 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-mono"
                autoFocus
              />
              <button
                onClick={() => setIsSearchOpen(false)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-1 pr-1 text-xs">
              <div className="text-[10px] font-mono uppercase text-slate-400 px-2 py-1">Quick Assets</div>
              {allSearchTickers
                .filter(t => {
                  const m = COMPANY_DIRECTORY[t];
                  const q = searchQuery.toLowerCase();
                  return t.toLowerCase().includes(q) || m?.name.toLowerCase().includes(q) || m?.sector.toLowerCase().includes(q);
                })
                .slice(0, 8)
                .map((ticker) => {
                  const meta = COMPANY_DIRECTORY[ticker];
                  return (
                    <div
                      key={ticker}
                      onClick={() => handleSelectStock(ticker)}
                      className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono font-bold text-slate-900 dark:text-white">{ticker}</span>
                        <span className="text-slate-500 truncate max-w-[200px]">{meta?.name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">{meta?.sector}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* 5. Subscription Upgrade Modal */}
      {FEATURES.pricing && (
        <SubscriptionModal
          isOpen={isSubscriptionOpen}
          onClose={() => setIsSubscriptionOpen(false)}
          userEmail={user?.email || 'demo1@marketwave.com'}
          currentSubscription={user?.subscription}
          onSubscriptionSuccess={handleSubscriptionSuccess}
        />
      )}

      {/* 6. Refined Modern Footer */}
      <footer className="border-t border-slate-200/80 dark:border-white/[0.08] bg-white/60 dark:bg-black/30 py-6 px-4">
        <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900 dark:text-white">MarketWave AI</span>
            <span>•</span>
            <span className="font-mono text-[11px]">Algorithmic Sentiment & Multi-Agent Intelligence v2.5</span>
          </div>

          <div className="flex items-center gap-6 text-xs">
            <button onClick={() => setView('about')} className="hover:text-slate-900 dark:hover:text-white transition-colors">
              About
            </button>
            <button onClick={() => setView('faq')} className="hover:text-slate-900 dark:hover:text-white transition-colors">
              FAQ
            </button>
            <button onClick={() => setView('contact')} className="hover:text-slate-900 dark:hover:text-white transition-colors">
              Contact
            </button>
          </div>
        </div>
      </footer>

    </div>
  );
}
