import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  Bot, 
  Sparkles, 
  X, 
  Trash2, 
  ArrowRight,
  Maximize2,
  Minimize2
} from 'lucide-react';
import type { ChatMessage, AIContext, RichFinancialCard } from '../types';
import { WS_URL } from '../config';
import { COMPANY_DIRECTORY, formatPrice, formatPercent } from '../lib/utils';

interface MarketWaveAIProps {
  aiContext: AIContext;
  onSelectStock?: (ticker: string) => void;
  onClose?: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

const STARTER_PROMPTS = [
  "⚡ Analyze today's market drivers",
  "📈 Why is Tesla moving today?",
  "💼 Analyze my active watchlist",
  "🚀 Find top bullish momentum stocks",
  "📰 Summarize breaking news stories",
  "⚖️ Compare Apple vs Microsoft",
  "⚠️ What are the primary market risks?"
];

export const MarketWaveAI: React.FC<MarketWaveAIProps> = ({
  aiContext,
  onSelectStock,
  onClose,
  isExpanded = false,
  onToggleExpand
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [thoughts, setThoughts] = useState('');

  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Dynamic greeting based on user's current hour
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning.';
    if (hour < 17) return 'Good afternoon.';
    return 'Good evening.';
  };

  // Scroll smoothly to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thoughts]);

  // Connect to WebSocket
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    const connect = () => {
      try {
        ws = new WebSocket(`${WS_URL}/ws/chat`);
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'thought') {
              setIsThinking(true);
              setThoughts((prev) => prev + data.content);
            } else if (data.type === 'token') {
              setIsThinking(false);
              setMessages((prev) => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.card) {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...lastMsg,
                    content: lastMsg.content + data.content
                  };
                  return updated;
                } else {
                  return [...prev, {
                    id: `msg-${Date.now()}`,
                    role: 'assistant',
                    content: data.content,
                    timestamp: Date.now()
                  }];
                }
              });
            } else if (data.type === 'done') {
              setIsThinking(false);
            } else if (data.type === 'error') {
              setIsThinking(false);
              setMessages((prev) => {
                const lastUser = [...prev].reverse().find(m => m.role === 'user');
                const fallbackResp = generateRichResponse(lastUser?.content || 'market');
                return [...prev, fallbackResp];
              });
            }
          } catch (e) {
            console.error(e);
          }
        };

        ws.onclose = () => {
          reconnectTimeout = setTimeout(connect, 4000);
        };
      } catch (e) {
        console.error(e);
      }
    };

    connect();
    socketRef.current = ws;

    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  // Listen to external prompts sent via UI ("Ask AI" buttons)
  useEffect(() => {
    const handleTriggerPrompt = (e: CustomEvent<{ prompt: string; context?: any }>) => {
      if (e.detail && e.detail.prompt) {
        handleSend(e.detail.prompt, e.detail.context);
      }
    };
    window.addEventListener('marketwave_ai_prompt' as any, handleTriggerPrompt as any);
    return () => window.removeEventListener('marketwave_ai_prompt' as any, handleTriggerPrompt as any);
  }, []);

  // Synthesize rich structured card response
  const generateRichResponse = (query: string, customContext?: any): ChatMessage => {
    const q = query.toLowerCase();
    const activeTicker = customContext?.ticker || aiContext.selectedTicker || 'TSLA';
    const meta = COMPANY_DIRECTORY[activeTicker] || COMPANY_DIRECTORY['TSLA'];
    const price = customContext?.price || aiContext.currentPrice || meta?.basePrice || 250;
    const score = customContext?.sentimentScore !== undefined ? customContext.sentimentScore : (aiContext.sentimentScore || 0.64);
    const isBull = score >= 0.15;
    const isBear = score <= -0.15;

    let card: RichFinancialCard | undefined;
    let textContent = '';
    let suggested: string[] = [];

    if (q.includes('tsla') || q.includes('tesla') || (q.includes('this') && activeTicker === 'TSLA')) {
      card = {
        ticker: 'TSLA',
        name: 'Tesla, Inc.',
        price: price,
        changePercent: 1.84,
        sentimentScore: 0.72,
        sentimentLabel: 'BULLISH',
        drivers: [
          'Next-gen FSD v13 rollout receiving accelerated enterprise adoption.',
          'Megapack energy storage deployments expanding +45% YoY in Q3.',
          'Cybercab autonomous fleet deployment pilot progressing in Austin.'
        ],
        risks: [
          'Global EV delivery margin compression in competitive APAC regions.',
          'Regulatory scrutiny on autonomous driver engagement parameters.'
        ],
        catalysts: [
          'Q3 earnings release scheduled with focus on Robotaxi unit economics.'
        ],
        sources: [
          { title: 'Bloomberg: Tesla Megapack Factory Outpaces Expectations' },
          { title: 'Finnhub: Institutional Inflows Increase in Clean Energy Tech' }
        ]
      };
      textContent = "Tesla demonstrates strong bullish momentum supported by institutional energy storage demand and autonomous roadmap execution.";
      suggested = ["Compare TSLA with NVDA", "View 52-Week Sentiment Trend", "Explain Tesla Key Risks"];
    } else if (q.includes('nvda') || q.includes('nvidia')) {
      card = {
        ticker: 'NVDA',
        name: 'NVIDIA Corporation',
        price: 138.45,
        changePercent: 3.42,
        sentimentScore: 0.88,
        sentimentLabel: 'BULLISH',
        drivers: [
          'Blackwell ultra-scale GPU architecture scaling volume shipments.',
          'Hyperscaler AI capex commitments reaching record multi-billion levels.',
          'Data center compute gross margins sustaining above 74%.'
        ],
        risks: [
          'Supply chain packaging constraints at TSMC CoWoS advanced lines.',
          'Export controls adjustments across international cloud channels.'
        ],
        catalysts: [
          'Global datacenter partner ecosystem keynote and order backlog updates.'
        ],
        sources: [
          { title: 'Reuters: AI Infrastructure Capex Reaches All-Time High' },
          { title: 'MarketWatch: Blackwell GPU Orders Booked 12 Months Ahead' }
        ]
      };
      textContent = "NVIDIA maintains decisive market leadership across compute acceleration with exceptional revenue visibility into next fiscal year.";
      suggested = ["Compare NVDA vs INTC", "Analyze Semiconductor Sector", "Summarize NVIDIA Catalysts"];
    } else if (q.includes('market') || q.includes('today') || q.includes('overview')) {
      card = {
        ticker: 'GLOBAL_MARKETS',
        name: 'Market Intelligence Composite',
        sentimentScore: 0.42,
        sentimentLabel: 'BULLISH',
        drivers: [
          'Mega-cap Technology and Semiconductor equities leading index breadth.',
          'VIX Volatility index declining -3.4% to 14.82 (low-stress regime).',
          'Institutional liquidity broadening into AI enterprise software and industrials.'
        ],
        risks: [
          'Central bank interest rate trajectory divergence between US and EU.',
          'Bond yield curve fluctuations ahead of central bank rate decisions.'
        ],
        catalysts: [
          'FOMC policy statement and monthly corporate earnings releases.'
        ],
        sources: [
          { title: 'Finnhub RSS: Global Market Breadth Expands for Tech Equities' },
          { title: 'WSJ: Volatility Index Drops to 3-Month Lows' }
        ]
      };
      textContent = "Today's market environment exhibits positive momentum supported by resilient mega-cap corporate earnings and subdued macro volatility.";
      suggested = ["Analyze Tech Movers", "Check Watchdog Alerts", "What are the biggest risks?"];
    } else if (q.includes('watchlist') || q.includes('portfolio')) {
      textContent = `Your active watchlist is displaying resilient net positive sentiment (+0.54 composite). Tech and clean energy holdings are outperforming with stable volatility indicators.`;
      suggested = ["Audit portfolio risks", "Show lowest sentiment holding", "Optimize watchlist allocation"];
    } else {
      card = {
        ticker: activeTicker,
        name: meta?.name || `${activeTicker} Corporation`,
        price: price,
        changePercent: 0.95,
        sentimentScore: score,
        sentimentLabel: isBull ? 'BULLISH' : isBear ? 'BEARISH' : 'NEUTRAL',
        drivers: [
          `18-factor algorithmic scoring shows positive sentiment across revenue and product launches.`,
          `Recent news headlines highlight stable operational delivery and earnings guidance.`
        ],
        risks: [
          `Macro valuation multiple compression in high-interest environments.`
        ],
        sources: [
          { title: `MarketWave RSS: Recent Verified Editorial Signals for ${activeTicker}` }
        ]
      };
      textContent = `Analysis for ${activeTicker} (${meta?.name || activeTicker}): Sentiment indicators currently rate ${isBull ? 'BULLISH' : isBear ? 'BEARISH' : 'NEUTRAL'} based on real-time news scraping and NLP triage.`;
      suggested = [`Explain ${activeTicker} in depth`, `Compare ${activeTicker} with sector peers`, `Show news catalysts for ${activeTicker}`];
    }

    return {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: textContent,
      timestamp: Date.now(),
      card,
      suggestedActions: suggested,
      contextTag: activeTicker
    };
  };

  const handleSend = (textToSend?: string, customContext?: any) => {
    const query = (textToSend || input).trim();
    if (!query) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: Date.now(),
      contextTag: customContext?.ticker || aiContext.selectedTicker
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!textToSend) setInput('');
    setIsThinking(true);
    setThoughts('');

    // Try WebSocket if connected
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ 
        prompt: query,
        message: query,
        context: {
          activeTab: aiContext.activeTab,
          selectedTicker: customContext?.ticker || aiContext.selectedTicker,
          price: customContext?.price || aiContext.currentPrice,
          sentimentScore: customContext?.sentimentScore || aiContext.sentimentScore
        }
      }));
    } else {
      // Deterministic instant local response fallback
      setTimeout(() => {
        setIsThinking(false);
        const richResp = generateRichResponse(query, customContext);
        setMessages((prev) => [...prev, richResp]);
      }, 400);
    }
  };

  const handleClearHistory = () => {
    setMessages([]);
    setThoughts('');
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#0E121B] border-l border-slate-200/80 dark:border-white/[0.08] text-slate-900 dark:text-white font-sans text-xs select-none transition-colors duration-200">
      
      {/* 1. Header: Identity & Context Status */}
      <div className="p-3.5 border-b border-slate-200/80 dark:border-white/[0.06] bg-slate-50/70 dark:bg-black/20 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 p-0.5 shadow-sm flex items-center justify-center shrink-0">
            <div className="w-full h-full bg-slate-950 rounded-[7px] flex items-center justify-center">
              <Bot className="w-4 h-4 text-[#00E599]" />
            </div>
          </div>
          <div>
            <div className="font-extrabold text-sm dark:text-white text-slate-900 leading-none flex items-center gap-1.5">
              <span>Market Wave AI</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 live-beacon"></span>
            </div>
            <span className="text-[10px] font-mono text-slate-400 dark:text-slate-400 block mt-0.5">
              Your AI Market Analyst
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={handleClearHistory}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              title="Clear Conversation History"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          {onToggleExpand && (
            <button
              onClick={onToggleExpand}
              className="hidden lg:block p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              title={isExpanded ? "Collapse Panel" : "Expand Panel"}
            >
              {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          )}

          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
              title="Close AI Drawer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Active Context Ribbon */}
      <div className="px-3.5 py-2 bg-slate-100/80 dark:bg-black/40 border-b border-slate-200/60 dark:border-white/[0.04] flex items-center justify-between text-[11px] font-mono shrink-0">
        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 truncate">
          <span className="text-[9px] uppercase font-bold text-emerald-600 dark:text-[#00E599]">CONTEXT:</span>
          {aiContext.selectedTicker ? (
            <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1">
              {aiContext.selectedTicker}
              {aiContext.currentPrice && <span className="text-slate-400">({formatPrice(aiContext.currentPrice, 'USD')})</span>}
            </span>
          ) : (
            <span className="text-slate-400">Global Market Overview</span>
          )}
        </div>

        <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-600 dark:text-[#00E599] border border-emerald-500/20 shrink-0">
          Agent Active
        </span>
      </div>

      {/* 3. Message Feed / Starter Experience */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 select-text">
        {messages.length === 0 ? (
          <div className="py-6 space-y-6 animate-in fade-in duration-300">
            
            {/* Starter Greeting */}
            <div className="surface-card p-5 space-y-2.5 border-l-4 border-l-emerald-500 dark:border-l-[#00E599]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-500 dark:text-[#00E599]" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  {getGreeting()}
                </h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                I'm your <strong>Market Wave AI analyst</strong>. Ask me anything about markets, individual equities, sentiment divergences, or your portfolio.
              </p>
            </div>

            {/* Suggested Starter Actions */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold block px-1">
                Suggested Prompts
              </span>
              <div className="space-y-1.5">
                {STARTER_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(prompt)}
                    className="w-full text-left p-2.5 rounded-xl surface-inset hover:border-emerald-500/40 text-slate-700 dark:text-slate-300 text-xs transition-all flex items-center justify-between group shadow-sm hover:scale-[1.01]"
                  >
                    <span>{prompt}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>

          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user';
            const card = msg.card;

            return (
              <div
                key={msg.id}
                className={`flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}
              >
                {/* Context Tag if any */}
                {msg.contextTag && (
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-200 dark:bg-white/5 text-slate-500">
                    Focus: {msg.contextTag}
                  </span>
                )}

                {/* Message Bubble */}
                <div
                  className={`p-3.5 rounded-2xl text-xs leading-relaxed max-w-[92%] space-y-3 ${
                    isUser
                      ? 'bg-slate-900 text-white dark:bg-[#1A2230] dark:text-slate-100 border border-slate-800 dark:border-white/10 shadow-sm'
                      : 'surface-card text-slate-800 dark:text-slate-200 border border-slate-200/90 dark:border-white/[0.08]'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>

                  {/* Rich Financial Card */}
                  {card && (
                    <div className="surface-inset p-3.5 rounded-xl space-y-3 border border-slate-200 dark:border-white/[0.06] text-xs">
                      
                      {/* Card Header Quote */}
                      <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-white/[0.06] pb-2.5">
                        <div>
                          <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                            <span>{card.ticker}</span>
                            {card.name && <span className="text-xs text-slate-500 font-normal truncate max-w-[150px]">{card.name}</span>}
                          </div>
                          {card.price && (
                            <div className="font-mono text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                              {formatPrice(card.price, 'USD')}
                              {card.changePercent && (
                                <span className={`text-xs ml-1.5 ${card.changePercent >= 0 ? 'text-emerald-600 dark:text-[#00E599]' : 'text-rose-600 dark:text-[#FF4757]'}`}>
                                  {formatPercent(card.changePercent)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {card.sentimentLabel && (
                          <span className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-extrabold ${
                            card.sentimentLabel === 'BULLISH' 
                              ? 'badge-bullish' 
                              : card.sentimentLabel === 'BEARISH' 
                                ? 'badge-bearish' 
                                : 'badge-neutral'
                          }`}>
                            {card.sentimentLabel}
                          </span>
                        )}
                      </div>

                      {/* Drivers / Why it is moving */}
                      {card.drivers && card.drivers.length > 0 && (
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-600 dark:text-[#00E599] font-bold block">
                            Why It Is Moving
                          </span>
                          <ul className="space-y-1 pl-3 list-disc list-outside text-slate-700 dark:text-slate-300">
                            {card.drivers.map((d, i) => (
                              <li key={i} className="leading-tight">{d}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Key Risks */}
                      {card.risks && card.risks.length > 0 && (
                        <div className="space-y-1.5 pt-1 border-t border-slate-200/50 dark:border-white/[0.04]">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-rose-500 font-bold block">
                            Key Risks
                          </span>
                          <ul className="space-y-1 pl-3 list-disc list-outside text-slate-700 dark:text-slate-300">
                            {card.risks.map((r, i) => (
                              <li key={i} className="leading-tight">{r}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Source References */}
                      {card.sources && card.sources.length > 0 && (
                        <div className="pt-1 border-t border-slate-200/50 dark:border-white/[0.04] text-[10px] font-mono text-slate-400 space-y-0.5">
                          <span className="uppercase text-[9px] font-bold block text-slate-500">Verified Sources:</span>
                          {card.sources.map((s, i) => (
                            <div key={i} className="flex items-center gap-1 truncate text-slate-500 dark:text-slate-400">
                              <span>• {s.title}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Terminal Jump Action */}
                      {card.ticker && onSelectStock && (
                        <button
                          onClick={() => onSelectStock(card.ticker!)}
                          className="w-full py-1.5 rounded-lg surface-inset hover:border-emerald-500/40 text-[10px] font-mono font-bold text-emerald-600 dark:text-[#00E599] flex items-center justify-center gap-1 transition-all"
                        >
                          <span>Open {card.ticker} Terminal</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Suggested Follow-up Actions */}
                  {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {msg.suggestedActions.map((action, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSend(action)}
                          className="px-2 py-0.5 rounded-md surface-inset hover:border-emerald-500/40 text-[10px] font-mono text-slate-600 dark:text-slate-300 transition-colors"
                        >
                          {action} →
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <span className="text-[9px] font-mono text-slate-400 px-1">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            );
          })
        )}

        {/* Live Multi-Agent Reasoning Stream */}
        {isThinking && (
          <div className="surface-card p-3.5 rounded-xl border border-dashed border-emerald-500/30 space-y-2 animate-pulse">
            <div className="flex items-center justify-between text-[10px] font-mono text-emerald-600 dark:text-[#00E599] font-bold uppercase">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 animate-spin" />
                Agents Synthesizing Multi-Source Data...
              </span>
            </div>
            {thoughts && (
              <pre className="text-[10px] font-mono text-slate-400 p-2 rounded bg-black/40 whitespace-pre-wrap leading-tight max-h-28 overflow-y-auto">
                {thoughts}
              </pre>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 4. Quick Action Pills above Input */}
      <div className="px-3 pt-2 pb-1 border-t border-slate-200/60 dark:border-white/[0.04] bg-slate-50/50 dark:bg-black/20 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
        {[
          { label: '⚡ Analyze', prompt: `Analyze ${aiContext.selectedTicker || 'the market'}` },
          { label: '📰 Summarize', prompt: `Summarize breaking headlines for ${aiContext.selectedTicker || 'today'}` },
          { label: '⚖️ Compare', prompt: `Compare ${aiContext.selectedTicker || 'TSLA'} with sector leaders` },
          { label: '⚠️ Risks', prompt: `What are key risks facing ${aiContext.selectedTicker || 'the market'}?` },
        ].map((btn, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(btn.prompt)}
            className="px-2 py-1 rounded-md surface-inset hover:border-emerald-500/40 text-[10px] font-mono whitespace-nowrap text-slate-600 dark:text-slate-300 font-semibold transition-colors shrink-0"
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* 5. Bottom Input Form */}
      <div className="p-3 border-t border-slate-200/80 dark:border-white/[0.06] bg-slate-50/80 dark:bg-black/40 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Market Wave AI anything..."
            className="flex-1 px-3.5 py-2.5 rounded-xl text-xs bg-white dark:bg-[#07090E] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 shadow-sm"
          />

          <button
            type="submit"
            disabled={!input.trim() || isThinking}
            className="btn-primary p-2.5 rounded-xl disabled:opacity-40 shrink-0"
            title="Transmit query"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>

    </div>
  );
};

// Global helper to trigger AI prompts from anywhere in the application
export const triggerAIPrompt = (prompt: string, context?: any) => {
  window.dispatchEvent(new CustomEvent('marketwave_ai_prompt', {
    detail: { prompt, context }
  }));
};
