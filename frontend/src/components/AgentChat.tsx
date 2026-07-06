import React, { useState, useEffect, useRef } from 'react';
import { Send, Terminal, ChevronDown, ChevronUp, Bot, User } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export const AgentChat: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I am your Antigravity Financial Orchestrator. Ask me about news, market movements, or to run a sentiment evaluation on your watchlist stocks.' }
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
    const ws = new WebSocket('ws://localhost:8000/ws/chat');
    
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

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;

    const userMsg = input.trim();
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setInput('');
    setThoughts(''); // Clear thoughts for new turn
    setIsThinking(true);
    setShowThoughts(true);

    // Initialize assistant message placeholder
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    socketRef.current.send(JSON.stringify({ prompt: userMsg }));
  };

  return (
    <div className="flex flex-col h-full text-slate-200">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Bot size={18} className="text-cyan-400" />
          <h3 className="text-md font-bold text-white tracking-tight m-0">Antigravity Financial Orchestrator</h3>
        </div>
        {isThinking && (
          <span className="flex items-center gap-1.5 text-[10px] text-cyan-400 font-semibold uppercase tracking-wider animate-pulse">
            <span className="h-1.5 w-1.5 bg-cyan-400 rounded-full animate-ping" />
            Agent reasoning...
          </span>
        )}
      </div>

      {/* Messages Window */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1 min-h-[220px]">
        {messages.map((msg, index) => {
          if (msg.role === 'assistant' && !msg.content && isThinking) return null; // Wait to show until we get tokens
          
          const isUser = msg.role === 'user';
          return (
            <div key={index} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
              {!isUser && (
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-slate-800 border border-slate-700/80">
                  <Bot size={16} className="text-cyan-400" />
                </div>
              )}
              <div className={`max-w-[75%] rounded-lg p-3 text-xs leading-relaxed border ${
                isUser 
                  ? 'bg-blue-600/10 border-blue-500/20 text-white rounded-tr-none' 
                  : 'bg-slate-900/40 border-slate-800/80 text-slate-200 rounded-tl-none'
              }`}>
                {msg.content}
              </div>
              {isUser && (
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-blue-600/15 border border-blue-500/25">
                  <User size={16} className="text-blue-400" />
                </div>
              )}
            </div>
          );
        })}
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

      {/* Chat Input Area */}
      <form onSubmit={sendMessage} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask orchestrator about stock sentiments..."
          className="flex-1 px-3 py-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/40"
        />
        <button
          type="submit"
          disabled={!input.trim() || isThinking}
          className="flex items-center justify-center w-10 h-10 gradient-btn rounded-lg disabled:opacity-50"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
};
