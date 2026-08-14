import React, { useState, useEffect, useRef } from 'react';
import { Send, Terminal, ChevronDown, ChevronUp, User, Activity } from 'lucide-react';

import { WS_URL } from '../config';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTED_PROMPTS = [
  "Why is NVIDIA stock moving today?",
  "Summarize today's market news.",
  "Analyze sentiment for my watchlist.",
  "Compare Tesla and BYD.",
  "Explain today's market trend.",
  "What sectors look strong this week?"
];

export const AgentChat: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    { 
      role: 'assistant', 
      content: "👋 Welcome to GlobePulseAI.\n\nI'm your intelligent financial copilot designed to help you analyze markets, understand stock movements, monitor watchlists, summarize financial news, compare companies, and generate AI-powered investment insights.\n\nAsk me anything about the markets." 
    }
  ]);
  const [input, setInput] = useState('');
  const [thoughts, setThoughts] = useState('');
  const [showThoughts, setShowThoughts] = useState(true);
  const [isThinking, setIsThinking] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const thoughtsEndRef = useRef<HTMLPreElement | null>(null);

  // Auto-scroll to bottom of messages
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
      const data = JSON.parse(event.data);
      
      if (data.type === 'thought') {
        setIsThinking(true);
        setThoughts((prev) => prev + data.content);
        // Scroll thoughts log to bottom
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
    };

    ws.onclose = () => {
      console.log('Agent chat WebSocket disconnected. Reconnecting...');
      setTimeout(connectWebSocket, 3000);
    };

    socketRef.current = ws;
  };

  const sendPromptDirect = (promptText: string) => {
    if (!promptText.trim() || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;

    setMessages((prev) => [...prev, { role: 'user', content: promptText.trim() }]);
    setThoughts(''); // Clear thoughts for new turn
    setIsThinking(true);
    setShowThoughts(true);

    // Initialize assistant message placeholder
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    socketRef.current.send(JSON.stringify({ prompt: promptText.trim() }));
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    sendPromptDirect(input);
    setInput('');
  };

  const handleSuggestionClick = (promptText: string) => {
    sendPromptDirect(promptText);
  };

  const userMessagesCount = messages.filter(m => m.role === 'user').length;

  return (
    <div className="p-4 flex flex-col h-full text-slate-200">

      {/* Messages Window */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1 min-h-[220px]">
        {messages.map((msg, index) => {
          if (msg.role === 'assistant' && !msg.content && isThinking) return null; // Wait to show until we get tokens
          
          const isUser = msg.role === 'user';
          return (
            <div key={index} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
              {!isUser && (
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-slate-900 border border-slate-800">
                  <Activity size={15} className="text-[#00FF94]" />
                </div>
              )}
              <div className={`max-w-[75%] rounded-lg p-3 text-xs leading-relaxed border whitespace-pre-wrap ${
                isUser 
                  ? 'bg-[#00FF94]/5 border-[#00FF94]/20 text-white rounded-tr-none' 
                  : 'bg-slate-900/60 border-slate-800/80 text-slate-200 rounded-tl-none'
              }`}>
                {msg.content}
              </div>
              {isUser && (
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-[#00FF94]/10 border border-[#00FF94]/20">
                  <User size={15} className="text-[#00FF94]" />
                </div>
              )}
            </div>
          );
        })}

        {/* Suggestion Chips */}
        {userMessagesCount === 0 && !isThinking && (
          <div className="pt-2">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2 font-mono font-bold">Suggested Topics</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SUGGESTED_PROMPTS.map((promptText, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSuggestionClick(promptText)}
                  className="text-left p-2.5 rounded-lg bg-slate-900/40 border border-slate-800/80 hover:bg-[#00FF94]/5 hover:border-[#00FF94]/30 hover:text-white transition-all text-[11px] text-slate-400 cursor-pointer"
                >
                  {promptText}
                </button>
              ))}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Real-time Agent Thoughts Log */}
      {thoughts && (
        <div className="border border-slate-800/80 rounded-lg bg-slate-950/60 mb-4 overflow-hidden">
          <button
            onClick={() => setShowThoughts(!showThoughts)}
            className="flex items-center justify-between w-full px-3 py-2 bg-slate-950/90 text-left border-none cursor-pointer outline-none text-slate-400 hover:text-slate-200"
          >
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
              <Terminal size={12} className="text-purple-400" />
              <span>Orchestrator Thought Stream</span>
            </div>
            {showThoughts ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
          
          {showThoughts && (
            <pre 
              ref={thoughtsEndRef}
              className="p-3 m-0 max-h-[120px] overflow-y-auto text-[10px] font-mono text-purple-300 leading-normal whitespace-pre-wrap select-text bg-[#07080b]"
            >
              {thoughts}
            </pre>
          )}
        </div>
      )}

      {isThinking && (
        <div className="flex items-center gap-1.5 text-[10px] text-[#00FF94] font-semibold uppercase tracking-wider animate-pulse mb-2 px-1">
          <span className="h-1.5 w-1.5 bg-[#00FF94] rounded-full animate-ping" />
          Analyzing markets...
        </div>
      )}

      {/* Chat Input Area */}
      <form onSubmit={sendMessage} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about stocks, market news, watchlists, sentiment, or investment insights..."
          className="flex-1 px-3 py-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00FF94]/30 focus:bg-slate-900/80"
        />
        <button
          type="submit"
          disabled={!input.trim() || isThinking}
          className="flex items-center justify-center w-10 h-10 bg-[#00FF94] hover:bg-[#00FF94]/90 disabled:opacity-50 text-slate-950 font-bold rounded-lg transition-colors"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
};
