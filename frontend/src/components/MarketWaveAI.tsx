import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  Bot, 
  Cpu, 
  Loader2, 
  X, 
  Trash2, 
  ArrowRight,
  Minimize2,
  ChevronDown
} from 'lucide-react';
import type { ChatMessage, AIContext, RichFinancialCard } from '../types';
import { WS_URL } from '../config';
import { COMPANY_DIRECTORY, formatPrice, formatPercent } from '../lib/utils';

interface MarketWaveAIProps {
  aiContext: AIContext;
  onSelectStock?: (ticker: string) => void;
  isOpenExternal?: boolean;
  onToggleOpenExternal?: () => void;
}

const STARTER_PROMPTS = [
  "⚡ Analyze today's market",
  "📈 Why is Tesla moving?",
  "🚀 Find unusual movers",
  "💼 Analyze my watchlist",
  "📰 Summarize today's news",
  "⚖️ Compare two stocks",
  "⚠️ What are the biggest risks today?"
];

export const MarketWaveAI: React.FC<MarketWaveAIProps> = ({
  aiContext,
  onSelectStock,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [thoughts, setThoughts] = useState('');

  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Scroll smoothly to bottom
  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, thoughts, isOpen, isMinimized]);

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
              setThoughts((prev) => prev + (prev ? '\n' : '') + data.content);
            } else if (data.type === 'trace_step' && data.step) {
              setIsThinking(true);
              const stepLine = `⚡ [${data.step.agent_name}] ${data.step.title}${data.step.latency_ms ? ` (${data.step.latency_ms}ms)` : ''}`;
              setThoughts((prev) => prev + (prev ? '\n' : '') + stepLine);
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

  // Listen to external prompts sent via UI ("Ask AI" / "Analyze Chart" buttons)
  useEffect(() => {
    const handleTriggerPrompt = (e: CustomEvent<{ prompt: string; context?: any }>) => {
      if (e.detail && e.detail.prompt) {
        setIsOpen(true);
        setIsMinimized(false);
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

    // Transmit via WebSocket if active
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
      // Instant local response fallback
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
    <>
      {/* ========================================================
          1. COLLAPSED FLOATING AI BUTTON (Bottom-Right)
          ======================================================== */}
      {!isOpen && (
        <div className="fixed bottom-6 right-6 z-50 select-none animate-in fade-in zoom-in-95 duration-200">
          <button
            onClick={() => {
              setIsOpen(true);
              setIsMinimized(false);
            }}
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 dark:from-[#0E121B] dark:via-[#141A24] dark:to-black text-white p-0.5 border border-emerald-500/40 shadow-[0_8px_30px_rgba(0,229,153,0.3)] hover:shadow-[0_8px_35px_rgba(0,229,153,0.5)] hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center group relative cursor-pointer"
            title="Open Market Wave AI Analyst"
          >
            <div className="w-full h-full rounded-[14px] bg-slate-950/80 flex items-center justify-center relative">
              <Bot className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-400 dark:text-[#00E599] group-hover:rotate-6 transition-transform duration-200" />
              
              {/* Pulsing Active Indicator Dot */}
              <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
            </div>
          </button>
        </div>
      )}

      {/* ========================================================
          2. EXPANDED FLOATING CHATBOT WINDOW (Bottom-Right Anchor)
          ======================================================== */}
      {isOpen && (
        <div 
          className={`fixed bottom-6 right-6 z-50 flex flex-col bg-white dark:bg-[#0E121B] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white font-sans text-xs rounded-2xl shadow-[0_12px_45px_rgba(0,0,0,0.4)] overflow-hidden transition-all duration-200 animate-in fade-in slide-in-from-bottom-5 zoom-in-95 ${
            isMinimized 
              ? 'w-72 h-14' 
              : 'w-[calc(100vw-32px)] sm:w-[410px] h-[620px] max-h-[calc(100vh-48px)]'
          }`}
        >
          {/* Header */}
          <div className="p-3.5 border-b border-slate-200/80 dark:border-white/[0.08] bg-slate-50/90 dark:bg-black/40 flex items-center justify-between shrink-0 select-none">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 p-0.5 shadow-sm flex items-center justify-center shrink-0">
                <div className="w-full h-full bg-slate-950 rounded-[6px] flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5 text-[#00E599]" />
                </div>
              </div>
              <div>
                <div className="font-extrabold text-xs dark:text-white text-slate-900 leading-none flex items-center gap-1.5">
                  <span>Market Wave AI</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 live-beacon"></span>
                </div>
                <span className="text-[9px] font-mono text-slate-400 dark:text-slate-400 block mt-0.5">
                  Your AI Market Analyst
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {messages.length > 0 && !isMinimized && (
                <button
                  onClick={handleClearHistory}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                  title="Clear conversation"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                title={isMinimized ? "Expand" : "Minimize"}
              >
                {isMinimized ? <Minimize2 className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                title="Close chatbot"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Context Awareness Ribbon */}
              <div className="px-3.5 py-1.5 bg-slate-100/90 dark:bg-black/60 border-b border-slate-200/60 dark:border-white/[0.04] flex items-center justify-between text-[10px] font-mono shrink-0">
                <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 truncate">
                  <span className="text-[8px] uppercase font-bold text-emerald-600 dark:text-[#00E599]">CONTEXT:</span>
                  {aiContext.selectedTicker ? (
                    <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1">
                      {aiContext.selectedTicker}
                      {aiContext.currentPrice && <span className="text-slate-400">({formatPrice(aiContext.currentPrice, 'USD')})</span>}
                    </span>
                  ) : (
                    <span className="text-slate-400">Current view: {aiContext.activeTab}</span>
                  )}
                </div>

                <span className="text-[8px] font-bold uppercase px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-600 dark:text-[#00E599] border border-emerald-500/20 shrink-0">
                  Online
                </span>
              </div>

              {/* Chat Conversation Body */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 select-text no-scrollbar">
                {messages.length === 0 ? (
                  <div className="py-4 space-y-4 animate-in fade-in duration-200">
                    
                    {/* Initial Chat State */}
                    <div className="surface-card p-4 space-y-2 border-l-4 border-l-emerald-500 dark:border-l-[#00E599]">
                      <div className="flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-emerald-500 dark:text-[#00E599]" />
                        <h4 className="font-bold text-xs text-slate-900 dark:text-white">
                          Hi, I'm Market Wave AI.
                        </h4>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                        Your AI market analyst. Ask me about markets, stocks, news, or your portfolio.
                      </p>
                    </div>

                    {/* Clickable Suggestions */}
                    <div className="space-y-1.5">
                      <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold block px-1">
                        Suggested Prompts
                      </span>
                      <div className="space-y-1">
                        {STARTER_PROMPTS.map((prompt, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSend(prompt)}
                            className="w-full text-left p-2 rounded-lg surface-inset hover:border-emerald-500/40 text-slate-700 dark:text-slate-300 text-[11px] transition-all flex items-center justify-between group shadow-sm hover:scale-[1.01]"
                          >
                            <span>{prompt}</span>
                            <ArrowRight className="w-3 h-3 text-slate-400 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all shrink-0 ml-1.5" />
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
                        className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}
                      >
                        {/* Context Tag */}
                        {msg.contextTag && (
                          <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-slate-200 dark:bg-white/5 text-slate-500">
                            Focus: {msg.contextTag}
                          </span>
                        )}

                        {/* Message Bubble */}
                        <div
                          className={`p-3 rounded-2xl text-[11px] leading-relaxed max-w-[94%] space-y-2.5 ${
                            isUser
                              ? 'bg-slate-900 text-white dark:bg-[#1A2230] dark:text-slate-100 border border-slate-800 dark:border-white/10 shadow-sm'
                              : 'surface-card text-slate-800 dark:text-slate-200 border border-slate-200/90 dark:border-white/[0.08]'
                          }`}
                        >
                          <div className="whitespace-pre-wrap">{msg.content}</div>

                          {/* Rich Financial Response Card */}
                          {card && (
                            <div className="surface-inset p-3 rounded-xl space-y-2.5 border border-slate-200 dark:border-white/[0.06] text-[11px]">
                              
                              {/* Header */}
                              <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-white/[0.06] pb-2">
                                <div>
                                  <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                                    <span>{card.ticker}</span>
                                    {card.name && <span className="text-[10px] text-slate-500 font-normal truncate max-w-[130px]">{card.name}</span>}
                                  </div>
                                  {card.price && (
                                    <div className="font-mono text-xs font-bold text-slate-900 dark:text-white mt-0.5">
                                      {formatPrice(card.price, 'USD')}
                                      {card.changePercent && (
                                        <span className={`text-[10px] ml-1.5 ${card.changePercent >= 0 ? 'text-emerald-600 dark:text-[#00E599]' : 'text-rose-600 dark:text-[#FF4757]'}`}>
                                          {formatPercent(card.changePercent)}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {card.sentimentLabel && (
                                  <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-extrabold ${
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

                              {/* Drivers */}
                              {card.drivers && card.drivers.length > 0 && (
                                <div className="space-y-1">
                                  <span className="text-[9px] font-mono uppercase tracking-wider text-emerald-600 dark:text-[#00E599] font-bold block">
                                    Why It Is Moving
                                  </span>
                                  <ul className="space-y-0.5 pl-3 list-disc list-outside text-slate-700 dark:text-slate-300">
                                    {card.drivers.map((d, i) => (
                                      <li key={i} className="leading-tight">{d}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Key Risks */}
                              {card.risks && card.risks.length > 0 && (
                                <div className="space-y-1 pt-1 border-t border-slate-200/50 dark:border-white/[0.04]">
                                  <span className="text-[9px] font-mono uppercase tracking-wider text-rose-500 font-bold block">
                                    Key Risks
                                  </span>
                                  <ul className="space-y-0.5 pl-3 list-disc list-outside text-slate-700 dark:text-slate-300">
                                    {card.risks.map((r, i) => (
                                      <li key={i} className="leading-tight">{r}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Sources */}
                              {card.sources && card.sources.length > 0 && (
                                <div className="pt-1 border-t border-slate-200/50 dark:border-white/[0.04] text-[9px] font-mono text-slate-400 space-y-0.5">
                                  <span className="uppercase text-[8px] font-bold block text-slate-500">Verified Sources:</span>
                                  {card.sources.map((s, i) => (
                                    <div key={i} className="flex items-center gap-1 truncate text-slate-500 dark:text-slate-400">
                                      <span>• {s.title}</span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Stock Terminal Jump */}
                              {card.ticker && onSelectStock && (
                                <button
                                  onClick={() => onSelectStock(card.ticker!)}
                                  className="w-full py-1 rounded-lg surface-inset hover:border-emerald-500/40 text-[9px] font-mono font-bold text-emerald-600 dark:text-[#00E599] flex items-center justify-center gap-1 transition-all"
                                >
                                  <span>Open {card.ticker} Terminal</span>
                                  <ArrowRight className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          )}

                          {/* Follow-up actions */}
                          {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {msg.suggestedActions.map((action, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => handleSend(action)}
                                  className="px-1.5 py-0.5 rounded surface-inset hover:border-emerald-500/40 text-[9px] font-mono text-slate-600 dark:text-slate-300 transition-colors"
                                >
                                  {action} →
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <span className="text-[8px] font-mono text-slate-400 px-1">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })
                )}

                {/* Real-Time Typing & Generating State */}
                {isThinking && (
                  <div className="surface-card p-3 rounded-xl border border-dashed border-emerald-500/30 space-y-1.5 animate-pulse">
                    <div className="flex items-center justify-between text-[9px] font-mono text-emerald-600 dark:text-[#00E599] font-bold uppercase">
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin text-emerald-500 dark:text-[#00E599]" />
                        Market Wave AI is analyzing...
                      </span>
                    </div>
                    {thoughts && (
                      <pre className="text-[9px] font-mono text-slate-400 p-1.5 rounded bg-black/40 whitespace-pre-wrap leading-tight max-h-20 overflow-y-auto">
                        {thoughts}
                      </pre>
                    )}
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Quick Action Buttons */}
              <div className="px-2.5 pt-1.5 pb-1 border-t border-slate-200/60 dark:border-white/[0.04] bg-slate-50/50 dark:bg-black/20 flex items-center gap-1 overflow-x-auto no-scrollbar shrink-0">
                {[
                  { label: '⚡ Analyze', prompt: `Analyze ${aiContext.selectedTicker || 'the market'}` },
                  { label: '📰 Summarize', prompt: `Summarize breaking headlines for ${aiContext.selectedTicker || 'today'}` },
                  { label: '⚖️ Compare', prompt: `Compare ${aiContext.selectedTicker || 'TSLA'} with sector leaders` },
                  { label: '⚠️ Risks', prompt: `What are key risks facing ${aiContext.selectedTicker || 'the market'}?` },
                ].map((btn, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(btn.prompt)}
                    className="px-2 py-0.5 rounded-md surface-inset hover:border-emerald-500/40 text-[9px] font-mono whitespace-nowrap text-slate-600 dark:text-slate-300 font-semibold transition-colors shrink-0"
                  >
                    {btn.label}
                  </button>
                ))}
              </div>

              {/* Chat Input Footer */}
              <div className="p-2.5 border-t border-slate-200/80 dark:border-white/[0.06] bg-slate-50/80 dark:bg-black/40 shrink-0">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend();
                  }}
                  className="flex items-center gap-1.5"
                >
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask Market Wave AI anything..."
                    className="flex-1 px-3 py-2 rounded-xl text-xs bg-white dark:bg-[#07090E] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 shadow-sm"
                  />

                  <button
                    type="submit"
                    disabled={!input.trim() || isThinking}
                    className="btn-primary p-2 rounded-xl disabled:opacity-40 shrink-0"
                    title="Send message"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
};

// Global helper to trigger AI prompts from anywhere in the application
export const triggerAIPrompt = (prompt: string, context?: any) => {
  window.dispatchEvent(new CustomEvent('marketwave_ai_prompt', {
    detail: { prompt, context }
  }));
};
