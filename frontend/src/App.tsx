import { useState, useEffect, useCallback, useMemo } from 'react';
import { SidebarNav } from './components/SidebarNav';
import { TopHeader } from './components/TopHeader';
import { MarketWaveAI } from './components/MarketWaveAI';
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
import { AgentTracesView } from './components/AgentTracesView';
import { Feedback } from './components/Feedback';
import { SubscriptionModal } from './components/SubscriptionModal';
import { API_URL, WS_URL, MARKET_DATA_REFRESH_INTERVAL_MS, API_REQUEST_TIMEOUT_MS } from './config';
import type { MainNavTab, Stock, ArticleItem, BriefingItem, ActivityEvent, AIContext } from './types';
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

  // Global shared market state
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

  // AI Briefing State
  const [briefing, setBriefing] = useState<BriefingItem[]>([]);
  const [loadingBriefing, setLoadingBriefing] = useState<boolean>(false);
  const [briefingTimestamp, setBriefingTimestamp] = useState<number | null>(null);
  const [briefingStatus, setBriefingStatus] = useState<'idle' | 'updating' | 'live' | 'error'>('idle');

  // Modals & Panels
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
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
        setIsSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const handleLoginSuccess = (userData: UserInfo) => {
    setUser(userData);
    localStorage.setItem('marketwave_user', JSON.stringify(userData));
    if (userData.watchlist && userData.watchlist.length > 0) {
      setWatchlist(userData.watchlist);
    }
    setView('app');
  };

  const handleLogout = () => {
    localStorage.removeItem('marketwave_user');
    setUser(null);
    setView('home');
  };

  // Helper fetch with timeout
  const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs = API_REQUEST_TIMEOUT_MS) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(id);
    }
  };

  // Fetch Core Market Data & Watchlist
  const fetchMarketData = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const userEmail = user?.email || 'demo1@marketwave.com';

      // 1. Fetch user profile & watchlist
      const userRes = await fetchWithTimeout(`${API_URL}/api/user?email=${encodeURIComponent(userEmail)}`);
      let currentWatchlist = watchlist;
      if (userRes.ok) {
        const userData = await userRes.json();
        if (userData.watchlist && Array.isArray(userData.watchlist) && userData.watchlist.length > 0) {
          currentWatchlist = userData.watchlist;
          setWatchlist(currentWatchlist);
        }
      }

      // 2. Concurrently fetch all quotes for watchlist + benchmark universe
      const allTickersToFetch = Array.from(new Set([...currentWatchlist, 'TSLA', 'AAPL', 'NVDA', 'MSFT', 'GOOG', 'AMZN', 'META', 'RELIANCE.NS']));
      
      const promises = allTickersToFetch.map(async (ticker) => {
        try {
          const res = await fetchWithTimeout(`${API_URL}/api/stock/history?ticker=${ticker}&period=5d`);
          if (res.ok) {
            const data = await res.json();
            const prices = data.price_series || [];
            const sentiments = data.sentiment_series || [];
            const articles = data.recent_articles || [];

            let price = COMPANY_DIRECTORY[ticker]?.basePrice || 200.0;
            let changePercent = 0.85;
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
          console.error(`Error loading stock quote for ${ticker}:`, e);
        }
        return null;
      });

      const results = await Promise.allSettled(promises);
      const validStocks: Stock[] = [];
      const gatheredArticles: ArticleItem[] = [];

      results.forEach(res => {
        if (res.status === 'fulfilled' && res.value) {
          validStocks.push(res.value as Stock);
          if ((res.value as any).recentArticles) {
            gatheredArticles.push(...(res.value as any).recentArticles);
          }
        }
      });

      if (validStocks.length > 0) {
        setStocksData(validStocks);
      }
      if (gatheredArticles.length > 0) {
        setRecentArticles(gatheredArticles);
      }

      // 3. Fetch alerts
      try {
        const alertsRes = await fetchWithTimeout(`${API_URL}/api/alerts?email=${encodeURIComponent(userEmail)}`);
        if (alertsRes.ok) {
          const alertsData = await alertsRes.json();
          if (Array.isArray(alertsData)) {
            setAlerts(alertsData);
          }
        }
      } catch (e) {
        console.error(e);
      }

      // 4. Fetch heatmap
      try {
        const heatRes = await fetchWithTimeout(`${API_URL}/api/heatmap`);
        if (heatRes.ok) {
          const heatData = await heatRes.json();
          if (Array.isArray(heatData)) setHeatmapData(heatData);
        }
      } catch (e) {
        console.error(e);
      }

      setLastSyncTimestamp(Date.now());
    } catch (err) {
      console.error('Failed to sync market data', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [user, watchlist]);

  // Fetch AI Briefing
  const fetchBriefing = useCallback(async () => {
    const userEmail = user?.email || 'demo1@marketwave.com';
    setLoadingBriefing(true);
    setBriefingStatus('updating');

    try {
      const res = await fetchWithTimeout(`${API_URL}/api/gemma/briefing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, tickers: watchlist })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success' && Array.isArray(data.briefing)) {
          setBriefing(data.briefing);
          setBriefingTimestamp(Date.now());
          setBriefingStatus('live');
        }
      }
    } catch (e) {
      setBriefingStatus('error');
    } finally {
      setLoadingBriefing(false);
    }
  }, [user, watchlist]);

  // Initial Sync & Scheduled Consistency Refresh (Every 300s)
  useEffect(() => {
    fetchMarketData();
    fetchBriefing();
    const interval = setInterval(() => {
      fetchMarketData();
      fetchBriefing();
    }, MARKET_DATA_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchMarketData, fetchBriefing]);

  // WebSocket Connection
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    const connect = () => {
      try {
        ws = new WebSocket(`${WS_URL}/ws/ingest`);
        
        ws.onopen = () => {
          setConnectionStatus('LIVE');
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'ingest_activity') {
              const newEvt: ActivityEvent = {
                id: `evt-${Date.now()}-${Math.random()}`,
                ticker: msg.ticker,
                title: msg.title || `News ingested for ${msg.ticker}`,
                impact: msg.impact || 'MEDIUM',
                sentimentScore: msg.sentiment_score || 0.0,
                timestamp: Date.now()
              };
              setActivityEvents(prev => [newEvt, ...prev.slice(0, 49)]);
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

        ws.onerror = () => {
          setConnectionStatus('OFFLINE');
        };
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

  // Trigger Immediate Ingest
  const triggerIngestNews = async () => {
    if (isIngesting) return;
    setIsIngesting(true);
    try {
      await fetchWithTimeout(`${API_URL}/api/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: watchlist, limit: 3 })
      });
      setTimeout(() => {
        fetchMarketData();
        fetchBriefing();
        setIsIngesting(false);
      }, 1500);
    } catch (e) {
      console.error(e);
      setIsIngesting(false);
    }
  };

  // Toggle Watchlist ticker
  const handleToggleWatchlist = async (ticker: string) => {
    const isPresent = watchlist.includes(ticker);
    const updated = isPresent ? watchlist.filter(t => t !== ticker) : [...watchlist, ticker];
    setWatchlist(updated);

    if (user?.email) {
      try {
        await fetchWithTimeout(`${API_URL}/api/user/watchlist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email, watchlist: updated })
        });
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleSelectStock = (ticker: string) => {
    setSelectedStockTicker(ticker);
    setCurrentTab('stocks');
    setIsSearchOpen(false);
  };

  const handleManualRefresh = () => {
    fetchMarketData();
    fetchBriefing();
  };

  // Filtered search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return Object.entries(COMPANY_DIRECTORY).filter(([ticker, meta]) => {
      return ticker.toLowerCase().includes(q) || meta.name.toLowerCase().includes(q) || meta.sector.toLowerCase().includes(q);
    }).slice(0, 8);
  }, [searchQuery]);

  // Current active quote for AI Context
  const currentStockQuote = useMemo(() => {
    return stocksData.find(s => s.ticker === selectedStockTicker) || {
      ticker: selectedStockTicker,
      name: COMPANY_DIRECTORY[selectedStockTicker]?.name || `${selectedStockTicker} Corp`,
      price: COMPANY_DIRECTORY[selectedStockTicker]?.basePrice || 250,
      sentimentScore: 0.65,
      changePercent: 1.25,
      currency: 'USD'
    };
  }, [stocksData, selectedStockTicker]);

  // Active AI Context passed to the Right-Side Panel
  const aiContext: AIContext = useMemo(() => ({
    activeTab: currentTab,
    selectedTicker: selectedStockTicker,
    stockName: currentStockQuote.name,
    currentPrice: currentStockQuote.price,
    sentimentScore: currentStockQuote.sentimentScore ?? undefined,
    portfolioSummary: {
      totalValue: 125480,
      totalReturn: 18450,
      holdingsCount: watchlist.length
    }
  }), [currentTab, selectedStockTicker, currentStockQuote, watchlist]);

  // Public Static and Auth View Rendering
  if (view === 'home') {
    return <Home onEnter={() => setView('app')} />;
  }

  if (view === 'signin') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#07090E] flex flex-col justify-between">
        <SignIn 
          onLoginSuccess={handleLoginSuccess}
          onToggleMode={() => setView('signup')}
        />
      </div>
    );
  }

  if (view === 'signup') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#07090E] flex flex-col justify-between">
        <SignUp 
          onSignupSuccess={() => setView('signin')}
          onLoginSuccess={handleLoginSuccess}
          onToggleMode={() => setView('signin')}
        />
      </div>
    );
  }

  if (view === 'about') return <About />;
  if (view === 'contact') return <Contact />;
  if (view === 'faq') return <FAQ />;

  // Render Core Workspace View
  const renderWorkspaceContent = () => {
    switch (currentTab) {
      case 'dashboard':
        return (
          <Dashboard 
            email={user?.email || 'demo1@marketwave.com'}
            onNavigateTab={(tab) => setCurrentTab(tab)}
            onSelectStock={handleSelectStock}
          />
        );
      case 'markets':
        return (
          <MarketsView 
            stocksData={stocksData}
            watchlist={watchlist}
            onToggleWatchlist={handleToggleWatchlist}
            onSelectStock={handleSelectStock}
          />
        );
      case 'stocks':
        return (
          <StockDetailView 
            initialTicker={selectedStockTicker}
            watchlist={watchlist}
            onToggleWatchlist={handleToggleWatchlist}
            onSelectStock={handleSelectStock}
          />
        );
      case 'watchlist':
        return (
          <PortfolioView 
            watchlist={watchlist}
            stocksData={stocksData}
            onToggleWatchlist={handleToggleWatchlist}
            onSelectStock={handleSelectStock}
          />
        );
      case 'intelligence':
      case 'news':
        return (
          <MarketIntelligenceView 
            briefing={briefing}
            loadingBriefing={loadingBriefing}
            briefingStatus={briefingStatus}
            briefingError={null}
            briefingTimestamp={briefingTimestamp}
            onRefreshBriefing={fetchBriefing}
            stocksData={stocksData}
            watchlist={watchlist}
            recentArticles={recentArticles}
            onSelectStock={handleSelectStock}
          />
        );
      case 'analytics':
        return (
          <AnalyticsView 
            heatmapData={heatmapData}
            stocksData={stocksData}
            watchlist={watchlist}
            activityEvents={activityEvents}
            connectionStatus={connectionStatus}
            onSelectStock={handleSelectStock}
          />
        );
      case 'alerts':
        return (
          <AlertsView 
            alerts={alerts}
            watchlist={watchlist}
            onSelectStock={handleSelectStock}
          />
        );
      case 'agent_traces':
        return (
          <AgentTracesView 
            onSelectStock={handleSelectStock}
          />
        );
      case 'feedback':
        return <Feedback user={user} />;
      default:
        return (
          <Dashboard 
            email={user?.email || 'demo1@marketwave.com'}
            onNavigateTab={(tab) => setCurrentTab(tab)}
            onSelectStock={handleSelectStock}
          />
        );
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 dark:bg-[#07090E] text-slate-900 dark:text-slate-100 font-sans">
      
      {/* ========================================================
          1. LEFT ZONE: Slim Vertical Navigation Sidebar
          ======================================================== */}
      <div className="hidden md:block h-full shrink-0">
        <SidebarNav
          currentTab={currentTab}
          onSelectTab={(tab) => setCurrentTab(tab)}
          alertCount={alerts.length}
          user={user}
          onLogout={handleLogout}
          onOpenPricing={() => setIsSubscriptionOpen(true)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(prev => !prev)}
        />
      </div>

      {/* Mobile Drawer Overlay for Sidebar on small screens */}
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsMobileSidebarOpen(false)} />
          <div className="relative w-64 h-full z-10 shadow-2xl">
            <SidebarNav
              currentTab={currentTab}
              onSelectTab={(tab) => {
                setCurrentTab(tab);
                setIsMobileSidebarOpen(false);
              }}
              alertCount={alerts.length}
              user={user}
              onLogout={handleLogout}
              onOpenPricing={() => {
                setIsSubscriptionOpen(true);
                setIsMobileSidebarOpen(false);
              }}
            />
          </div>
        </div>
      )}

      {/* ========================================================
          2. CENTER ZONE: Main Market Workspace Content
          ======================================================== */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-slate-100/50 dark:bg-[#07090E]">
        
        {/* Spacious Top Header */}
        <TopHeader
          currentTab={currentTab}
          selectedTicker={selectedStockTicker}
          theme={theme}
          onToggleTheme={toggleTheme}
          alertCount={alerts.length}
          onOpenAlerts={() => setCurrentTab('alerts')}
          onOpenSearch={() => setIsSearchOpen(true)}
          onTriggerIngest={triggerIngestNews}
          isIngesting={isIngesting}
          onManualRefresh={handleManualRefresh}
          isRefreshing={isRefreshing}
          connectionStatus={connectionStatus}
          lastSyncTimestamp={lastSyncTimestamp}
          onToggleMobileMenu={() => setIsMobileSidebarOpen(true)}
        />

        {/* Scrollable Center Full-Width Workspace */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7 no-scrollbar">
          <div className="max-w-[1600px] mx-auto pb-10">
            {renderWorkspaceContent()}
          </div>
        </main>
      </div>

      {/* ========================================================
          3. FLOATING BOTTOM-RIGHT AI MARKET ANALYST ASSISTANT
          ======================================================== */}
      <MarketWaveAI
        aiContext={aiContext}
        onSelectStock={handleSelectStock}
      />

      {/* ========================================================
          4. GLOBAL SEARCH MODAL (⌘K)
          ======================================================== */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsSearchOpen(false)} />
          <div className="relative w-full max-w-xl surface-card p-4 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 z-10 border border-slate-200 dark:border-white/10">
            <div className="flex items-center gap-3 border-b border-slate-200/80 dark:border-white/[0.08] pb-3">
              <Search className="w-5 h-5 text-emerald-500 dark:text-[#00E599]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search symbol, company name, or sector..."
                autoFocus
                className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
              />
              <button 
                onClick={() => setIsSearchOpen(false)} 
                className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-1">
              {searchResults.length > 0 ? (
                searchResults.map(([sym, meta]) => (
                  <button
                    key={sym}
                    onClick={() => handleSelectStock(sym)}
                    className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-left transition-colors group"
                  >
                    <div>
                      <div className="font-bold text-xs text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-[#00E599] font-mono">
                        {sym}
                      </div>
                      <span className="text-[11px] text-slate-400">{meta.name} • {meta.sector}</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                      ${meta.basePrice.toFixed(2)}
                    </span>
                  </button>
                ))
              ) : searchQuery.trim() ? (
                <div className="text-center py-6 text-xs text-slate-400">
                  No equities matching "{searchQuery}".
                </div>
              ) : (
                <div className="text-center py-6 text-xs text-slate-400 space-y-1">
                  <span>Start typing a ticker symbol (e.g. <code>TSLA</code>, <code>NVDA</code>, <code>AAPL</code>)</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          5. PRICING MODAL
          ======================================================== */}
      {isSubscriptionOpen && (
        <SubscriptionModal 
          isOpen={isSubscriptionOpen}
          userEmail={user?.email || 'demo1@marketwave.com'}
          currentSubscription={user?.subscription || null}
          onClose={() => setIsSubscriptionOpen(false)}
          onSubscriptionSuccess={(newSub) => {
            setIsSubscriptionOpen(false);
            if (user) {
              setUser({ ...user, subscription: newSub });
            }
            fetchMarketData();
          }}
        />
      )}

    </div>
  );
}
