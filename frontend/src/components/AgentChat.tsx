import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  ChevronDown, 
  ChevronUp, 
  Bot, 
  Sparkles, 
  X 
} from 'lucide-react';
import { WS_URL } from '../config';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTED_PROMPTS = [
  "Why is NVIDIA stock moving today?",
  "Synthesize today's top market headlines.",
  "Analyze sentiment breakdown for Tesla.",
  "What sectors look strongest this week?"
];

export const AgentChat: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const [messages, setMessages] = useState<Message[]>([
    { 
      role: 'assistant', 
      content: "👋 Welcome to MarketWave AI Copilot.\n\nI'm your financial multi-agent intelligence copilot. I orchestrate real-time financial researchers, sentiment analysts, and market correlators to synthesize institutional market intelligence.\n\nAsk me anything about stocks, news, or sentiment dynamics." 
    }
  ]);
  const [input, setInput] = useState('');
  const [thoughts, setThoughts] = useState('');
  const [showThoughts, setShowThoughts] = useState(true);
  const [isThinking, setIsThinking] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const thoughtsEndRef = useRef<HTMLPreElement | null>(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thoughts]);

  // Connect to WebSocket
  useEffect(() => {
    connectWebSocket();
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  const connectWebSocket = () => {
    const ws = new WebSocket(`${WS_URL}/ws/chat`);
    
    ws.onopen = () => {
      console.log('Connected to agent chat WebSocket');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'thought') {
          setIsThinking(true);
          setThoughts((prev) => prev + data.content);
          if (thoughtsEndRef.current) {
            thoughtsEndRef.current.scrollTop = thoughtsEndRef.current.scrollHeight;
          }
        } else if (data.type === 'token') {
          setIsThinking(false);
          setMessages((prev) => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...lastMsg,
                content: lastMsg.content + data.content
              };
              return updated;
            } else {
              return [...prev, { role: 'assistant', content: data.content }];
            }
          });
        } else if (data.type === 'done') {
          setIsThinking(false);
        } else if (data.type === 'error') {
          setIsThinking(false);
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: `Error: ${data.content}` }
          ]);
        }
      } catch (e) {
        console.error(e);
      }
    };

    ws.onclose = () => {
      setTimeout(connectWebSocket, 3000);
    };

    socketRef.current = ws;
  };

  const handleSend = (textToSend?: string) => {
    const messageText = textToSend || input;
    if (!messageText.trim()) return;

    setMessages((prev) => [...prev, { role: 'user', content: messageText }]);
    if (!textToSend) setInput('');
    setThoughts('');
    setIsThinking(true);

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ message: messageText }));
    } else {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Connection to AI agent failed. Reconnecting...' }
      ]);
      setIsThinking(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#0E121B] border-l border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white font-sans text-xs">
      
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between bg-slate-50/70 dark:bg-black/20">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <Bot className="w-4 h-4 text-emerald-500 dark:text-[#00E599]" />
          </div>
          <div>
            <h3 className="font-bold text-sm dark:text-white text-slate-900 leading-none">
              MarketWave Copilot
            </h3>
            <span className="text-[10px] font-mono text-emerald-600 dark:text-[#00E599] flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 live-beacon"></span>
              Multi-Agent Orchestrator
            </span>
          </div>
        </div>

        {onClose && (
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Suggested Prompts */}
      <div className="p-3 border-b border-slate-200/60 dark:border-white/[0.04] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {SUGGESTED_PROMPTS.map((prompt, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(prompt)}
            className="px-2.5 py-1 rounded-md surface-inset hover:border-emerald-500/40 text-[10px] whitespace-nowrap text-slate-600 dark:text-slate-300 font-mono transition-colors shrink-0"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-md bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5 text-emerald-500 dark:text-[#00E599]" />
              </div>
            )}

            <div
              className={`max-w-[85%] p-3.5 rounded-xl text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-slate-900 dark:bg-[#00E599] text-white dark:text-black font-medium shadow-sm'
                  : 'surface-inset text-slate-800 dark:text-slate-200 space-y-2 border border-slate-200/80 dark:border-white/[0.06]'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}

        {/* Live Multi-Agent Reasoning Stream */}
        {isThinking && (
          <div className="space-y-2 surface-inset p-3 rounded-xl border border-dashed border-emerald-500/30">
            <button
              onClick={() => setShowThoughts(!showThoughts)}
              className="flex items-center justify-between w-full text-[10px] font-mono text-emerald-600 dark:text-[#00E599] uppercase font-bold"
            >
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 animate-spin" />
                Agents Synthesizing Multi-Source Data...
              </span>
              {showThoughts ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {showThoughts && thoughts && (
              <pre
                ref={thoughtsEndRef}
                className="text-[10px] font-mono text-slate-400 overflow-x-auto max-h-32 p-2 rounded bg-black/40 whitespace-pre-wrap leading-tight"
              >
                {thoughts}
              </pre>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="p-3 border-t border-slate-200 dark:border-white/[0.08] bg-slate-50/70 dark:bg-black/20">
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
            placeholder="Ask about markets, sentiment, or news..."
            className="flex-1 px-3 py-2 rounded-xl text-xs bg-white dark:bg-[#07090E] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 shadow-sm"
          />
          <button
            type="submit"
            disabled={!input.trim() || isThinking}
            className="btn-primary p-2 rounded-xl disabled:opacity-40"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>

    </div>
  );
};
