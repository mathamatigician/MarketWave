import React, { useState, useEffect, useRef } from 'react';
import { Terminal, ChevronDown, ChevronUp } from 'lucide-react';
import { WS_URL } from '../config';

export interface ActivityEvent {
  type: 'start' | 'activity' | 'done' | 'error' | 'ingestion_cycle_started' | 'checking_ticker' | 'new_article' | 'article_processed' | 'no_new_articles' | 'ingestion_cycle_completed' | 'ingestion_error';
  agent?: string;
  ticker?: string;
  tickers?: string[];
  status?: string;
  detail?: string;
  article_title?: string;
  url?: string;
  overall_sentiment?: number;
  market_impact?: string;
  total_items?: number;
  new_articles?: number;
  new_articles_count?: number;
  skipped_duplicates?: number;
  timestamp?: number;
}

export interface IngestActivityProps {
  events?: ActivityEvent[];
}

export const IngestActivity: React.FC<IngestActivityProps> = ({ events: externalEvents }) => {
  const [internalEvents, setInternalEvents] = useState<ActivityEvent[]>([]);
  const [showActivity, setShowActivity] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const logRef = useRef<HTMLPreElement | null>(null);
  const isUnmountingRef = useRef(false);
  const reconnectAttemptRef = useRef(0);

  const displayEvents = externalEvents !== undefined ? externalEvents : internalEvents;

  useEffect(() => {
    // If events are passed from parent (Dashboard), don't create duplicate socket (R9)
    if (externalEvents !== undefined) {
      if (externalEvents.length > 0) {
        const latest = externalEvents[externalEvents.length - 1];
        if (latest.type === 'start' || latest.type === 'ingestion_cycle_started' || latest.type === 'new_article') {
          setShowActivity(true);
        }
      }
      if (logRef.current) {
        logRef.current.scrollTop = logRef.current.scrollHeight;
      }
      return;
    }

    isUnmountingRef.current = false;
    connectWebSocket();
    return () => {
      isUnmountingRef.current = true;
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [externalEvents]);

  const connectWebSocket = () => {
    if (externalEvents !== undefined) return;
    try {
      const ws = new WebSocket(`${WS_URL}/ws/ingest`);

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data: ActivityEvent = JSON.parse(event.data);
          if (data.type === 'start' || data.type === 'ingestion_cycle_started' || data.type === 'new_article') {
            setShowActivity(true);
          }
          setInternalEvents((prev) => [...prev, data].slice(-200));

          if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
          }
        } catch (err) {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        if (isUnmountingRef.current) return;
        const delay = Math.min(1000 * Math.pow(1.5, reconnectAttemptRef.current), 15000);
        reconnectAttemptRef.current += 1;
        setTimeout(connectWebSocket, delay);
      };

      socketRef.current = ws;
    } catch (e) {
      // ignore
    }
  };

  const formatEvent = (e: ActivityEvent): string => {
    if (e.type === 'ingestion_cycle_started') return `🔄 [Live Watchdog] Ingestion cycle started for: ${e.tickers?.join(', ') || 'portfolio'}`;
    if (e.type === 'checking_ticker') return `🔎 Checking live news for ${e.ticker}...`;
    if (e.type === 'new_article') return `📰 New market-moving news discovered (${e.ticker}): "${e.article_title || ''}"`;
    if (e.type === 'article_processed') return `✨ Processed (${e.ticker}): "${e.article_title || ''}" · Sentiment: ${e.overall_sentiment ?? 'N/A'} · Gemma Impact: ${e.market_impact || 'MEDIUM'}`;
    if (e.type === 'no_new_articles') return `✓ No new articles found for ${e.ticker}`;
    if (e.type === 'ingestion_cycle_completed') return `🏁 Ingestion cycle complete: ${e.new_articles_count ?? 0} new articles ingested to Firestore`;
    if (e.type === 'ingestion_error' || e.type === 'error') return `✗ Error (${e.ticker || 'System'}): ${e.detail}`;
    if (e.type === 'start') return `▸ Starting ingestion for ${e.ticker}...`;
    if (e.type === 'done') return `✓ Done: ${e.ticker} — ${e.new_articles ?? 0} new articles, ${e.skipped_duplicates ?? 0} skipped`;
    return `${e.agent || 'System'} · ${e.ticker || 'General'} · ${e.status || 'info'}: ${e.detail || ''}`;
  };

  return (
    <div className="border border-slate-800/80 rounded-lg bg-slate-950/60 overflow-hidden mb-4">
      <button
        onClick={() => setShowActivity(!showActivity)}
        className="flex items-center justify-between w-full px-3 py-2 bg-slate-950/90 text-left border-none cursor-pointer outline-none text-slate-400 hover:text-slate-200"
      >
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
          <Terminal size={12} className="text-purple-400" />
          <span>Agent Activity</span>
        </div>
        {showActivity ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>

      {showActivity && (
        <pre
          ref={logRef}
          className="p-3 m-0 max-h-[160px] overflow-y-auto text-[10px] font-mono text-purple-300 leading-normal whitespace-pre-wrap select-text bg-[#07080b]"
        >
          {displayEvents.length > 0
            ? displayEvents.map(formatEvent).join('\n')
            : 'No activity yet — click "Run Pipeline" to see ResearchAgent and SentimentAnalyst work in real time.'}
        </pre>
      )}
    </div>
  );
};
