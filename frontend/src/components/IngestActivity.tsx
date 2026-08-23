import React, { useState, useEffect, useRef } from 'react';
import { Terminal, ChevronDown, ChevronUp } from 'lucide-react';
import { WS_URL } from '../config';

interface ActivityEvent {
  type: 'start' | 'activity' | 'done' | 'error';
  agent?: string;
  ticker?: string;
  status?: string;
  detail?: string;
  article_title?: string;
  total_items?: number;
  new_articles?: number;
  skipped_duplicates?: number;
}

export const IngestActivity: React.FC = () => {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [showActivity, setShowActivity] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const logRef = useRef<HTMLPreElement | null>(null);
  const isUnmountingRef = useRef(false);

  useEffect(() => {
    isUnmountingRef.current = false;
    connectWebSocket();
    return () => {
      isUnmountingRef.current = true;
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  const connectWebSocket = () => {
    const ws = new WebSocket(`${WS_URL}/ws/ingest`);

    ws.onopen = () => {
      console.log('Connected to ingest activity WebSocket');
    };

    ws.onmessage = (event) => {
      const data: ActivityEvent = JSON.parse(event.data);

      if (data.type === 'start') {
        setShowActivity(true);
      }

      // Cap the rolling log instead of clearing it on every ticker's
      // 'start' event -- a multi-ticker run fires one 'start' per ticker,
      // and clearing here would wipe out earlier tickers' activity lines,
      // leaving only the last ticker's output visible.
      setEvents((prev) => [...prev, data].slice(-200));

      if (logRef.current) {
        logRef.current.scrollTop = logRef.current.scrollHeight;
      }
    };

    ws.onclose = () => {
      // Don't reconnect if the close was triggered by our own cleanup
      // (component unmount, e.g. a dashboard tab switch) -- IngestActivity
      // mounts/unmounts repeatedly, unlike AgentChat which mounts once for
      // the app's lifetime, so scheduling a reconnect here unconditionally
      // would leak one permanent orphaned WebSocket per unmount.
      if (isUnmountingRef.current) return;
      console.log('Ingest activity WebSocket disconnected. Reconnecting...');
      setTimeout(connectWebSocket, 3000);
    };

    socketRef.current = ws;
  };

  const formatEvent = (e: ActivityEvent): string => {
    if (e.type === 'start') return `▸ Starting ingestion for ${e.ticker}...`;
    if (e.type === 'done') return `✓ Done: ${e.ticker} — ${e.new_articles ?? 0} new articles, ${e.skipped_duplicates ?? 0} skipped`;
    if (e.type === 'error') return `✗ Error (${e.ticker}): ${e.detail}`;
    return `${e.agent} · ${e.ticker} · ${e.status}: ${e.detail}`;
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
          {events.length > 0
            ? events.map(formatEvent).join('\n')
            : 'No activity yet — click "Run Pipeline" to see ResearchAgent and SentimentAnalyst work in real time.'}
        </pre>
      )}
    </div>
  );
};
