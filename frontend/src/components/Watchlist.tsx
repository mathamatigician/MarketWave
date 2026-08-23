import React, { useState, useEffect } from 'react';
import { Play, Check, AlertTriangle, RefreshCw } from 'lucide-react';
import { API_URL } from '../config';

interface WatchlistProps {
  email: string;
  activeWatchlist: string[];
  onChange: (newWatchlist: string[]) => void;
}

export const Watchlist: React.FC<WatchlistProps> = ({ email, activeWatchlist, onChange }) => {
  const [options, setOptions] = useState<string[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineMessage, setPipelineMessage] = useState('');

  // Fetch watchlist options and active alerts
  useEffect(() => {
    fetchWatchlistOptions();
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 10000); // Poll alerts every 10s
    return () => clearInterval(interval);
  }, [email]);

  const fetchWatchlistOptions = async () => {
    try {
      const res = await fetch(`${API_URL}/api/watchlist?email=${encodeURIComponent(email)}`);
      if (res.ok) {
        const data = await res.json();
        setOptions(data.all_options || []);
      }
    } catch (e) {
      console.error("Error loading watchlist options", e);
    }
  };

  const fetchAlerts = async () => {
    try {
      const res = await fetch(`${API_URL}/api/alerts`);
      if (res.ok) {
        const data = await res.json();
        setAlerts(data || []);
      }
    } catch (e) {
      console.error("Error loading alerts", e);
    }
  };

  const toggleTicker = async (ticker: string) => {
    let updated: string[];
    if (activeWatchlist.includes(ticker)) {
      // Don't empty the watchlist completely
      if (activeWatchlist.length === 1) return;
      updated = activeWatchlist.filter(t => t !== ticker);
    } else {
      updated = [...activeWatchlist, ticker];
    }

    try {
      const res = await fetch(`${API_URL}/api/watchlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, tickers: updated })
      });
      if (res.ok) {
        onChange(updated);
      }
    } catch (e) {
      console.error("Error updating watchlist", e);
    }
  };

  const triggerPipeline = async () => {
    setPipelineRunning(true);
    setPipelineMessage('Ingestion pipeline started...');
    try {
      const res = await fetch(`${API_URL}/api/pipeline/run`, { method: 'POST' });
      if (res.ok) {
        setPipelineMessage('Pipeline running in background...');
        setTimeout(() => {
          setPipelineRunning(false);
          setPipelineMessage('');
          // Force a watchlist refresh
          onChange([...activeWatchlist]);
        }, 5000);
      } else {
        setPipelineRunning(false);
        setPipelineMessage('Failed to trigger pipeline.');
      }
    } catch (e) {
      setPipelineRunning(false);
      setPipelineMessage('Network error triggering pipeline.');
    }
  };

  return (
    <div className="glass-card flex flex-col h-full p-6 text-slate-200">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-2xl">🌍</span>
        <h2 className="text-xl font-bold tracking-tight text-white m-0">GlobePulse<span className="text-[#00FF94] dark:text-[#00FF94]">AI</span></h2>
      </div>

      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Watchlist Tickers</h3>
      <div className="flex-1 overflow-y-auto mb-6 space-y-1">
        {options.map((ticker) => {
          const isChecked = activeWatchlist.includes(ticker);
          return (
            <button
              key={ticker}
              onClick={() => toggleTicker(ticker)}
              className={`flex items-center justify-between w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                isChecked
                  ? 'bg-blue-600/25 border-l-4 border-blue-500 text-white font-medium'
                  : 'hover:bg-slate-800/40 text-slate-400'
              }`}
              style={{ border: 'none', cursor: 'pointer', outline: 'none' }}
            >
              <span className="text-sm">{ticker}</span>
              {isChecked && <Check size={16} className="text-cyan-400" />}
            </button>
          );
        })}
      </div>

      {/* Alerts Box */}
      {alerts.length > 0 && (
        <div className="bg-red-950/30 border border-red-500/30 rounded-lg p-3.5 mb-6">
          <div className="flex items-center gap-2 text-red-400 font-semibold text-xs uppercase tracking-wider mb-2">
            <AlertTriangle size={14} />
            <span>Watchdog Alerts</span>
          </div>
          <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1">
            {alerts.map((alert, i) => (
              <div key={i} className="text-xs text-red-200 bg-red-900/10 p-2 rounded">
                <strong>{alert.ticker}</strong>: sentiment score dropped to {alert.average_sentiment}!
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Control Actions */}
      <div className="space-y-3">
        <button
          onClick={triggerPipeline}
          disabled={pipelineRunning}
          className="flex items-center justify-center gap-2 w-full py-2.5 px-4 gradient-btn text-sm disabled:opacity-50"
        >
          {pipelineRunning ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
          <span>{pipelineRunning ? 'Ingesting...' : 'Ingest News Pipeline'}</span>
        </button>
        {pipelineMessage && (
          <p className="text-[10px] text-center text-cyan-400 animate-pulse m-0">{pipelineMessage}</p>
        )}
      </div>
    </div>
  );
};
