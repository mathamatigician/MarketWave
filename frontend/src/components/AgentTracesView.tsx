import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, 
  Search, 
  RefreshCw, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Terminal, 
  Cpu, 
  Bot, 
  ChevronRight, 
  ChevronDown, 
  Zap, 
  Layers, 
  Copy, 
  Check, 
  SlidersHorizontal,
  ArrowRight
} from 'lucide-react';
import type { TraceSession } from '../types';
import { API_URL, WS_URL } from '../config';

interface AgentTracesViewProps {
  onSelectStock?: (ticker: string) => void;
}

export const AgentTracesView: React.FC<AgentTracesViewProps> = ({ onSelectStock }) => {
  const [traces, setTraces] = useState<TraceSession[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [agentFilter, setAgentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLiveStream, setIsLiveStream] = useState(true);

  // Expanded steps map for JSON inspector
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  const [copiedStepId, setCopiedStepId] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);

  // Fetch traces from backend REST API
  const fetchTraces = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/agent/traces?limit=100`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      if (data.traces) {
        setTraces(data.traces);
        if (data.traces.length > 0 && !selectedTraceId) {
          setSelectedTraceId(data.traces[0].trace_id);
        }
      }
    } catch (err: any) {
      console.error('Failed to load agent traces:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTraces();
  }, []);

  // WebSocket Live Trace Stream Connection
  useEffect(() => {
    if (!isLiveStream) return;

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(`${WS_URL}/ws/traces`);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'trace_step' && data.step) {
            fetchTraces(); // Refresh full traces state when step arrives
          }
        } catch (e) {
          console.error(e);
        }
      };
    } catch (e) {
      console.error('Live trace WebSocket error:', e);
    }

    socketRef.current = ws;

    return () => {
      if (ws) ws.close();
    };
  }, [isLiveStream]);

  const handleClearTraces = async () => {
    try {
      await fetch(`${API_URL}/api/agent/traces/clear`, { method: 'POST' });
      setTraces([]);
      setSelectedTraceId(null);
    } catch (err) {
      console.error(err);
    }
  };

  // Helper colors and icons
  const getAgentBadgeStyle = (agentName: string) => {
    const name = agentName.toLowerCase();
    if (name.includes('orchestrator')) {
      return 'bg-emerald-500/15 text-emerald-600 dark:text-[#00E599] border-emerald-500/30';
    } else if (name.includes('research')) {
      return 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30';
    } else if (name.includes('sentiment')) {
      return 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30';
    } else if (name.includes('correlator')) {
      return 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30';
    } else if (name.includes('watchdog')) {
      return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
    }
    return 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30';
  };

  const getStepTypeBadge = (stepType: string) => {
    switch (stepType) {
      case 'tool_call':
        return { label: 'TOOL CALL', bg: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30', icon: Terminal };
      case 'tool_result':
        return { label: 'TOOL RESULT', bg: 'bg-emerald-500/15 text-emerald-600 dark:text-[#00E599] border-emerald-500/30', icon: CheckCircle2 };
      case 'subagent_delegation':
        return { label: 'DELEGATION', bg: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30', icon: Layers };
      case 'subagent_result':
        return { label: 'SUBAGENT RESULT', bg: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30', icon: Cpu };
      case 'thought':
        return { label: 'THOUGHT', bg: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30', icon: Zap };
      case 'final_response':
        return { label: 'FINAL OUTPUT', bg: 'bg-emerald-500/20 text-emerald-700 dark:text-[#00E599] border-emerald-500/40', icon: CheckCircle2 };
      case 'error':
        return { label: 'ERROR', bg: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30', icon: AlertCircle };
      default:
        return { label: 'AGENT START', bg: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30', icon: Bot };
    }
  };

  // Filtered traces
  const filteredTraces = traces.filter((t) => {
    const matchesSearch = 
      !searchQuery || 
      t.user_query.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.ticker && t.ticker.toLowerCase().includes(searchQuery.toLowerCase())) ||
      t.trace_id.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesAgent = 
      agentFilter === 'all' || 
      t.agent_name.toLowerCase() === agentFilter.toLowerCase() ||
      t.steps.some(s => s.agent_name.toLowerCase() === agentFilter.toLowerCase());

    const matchesStatus = 
      statusFilter === 'all' || 
      t.status.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesAgent && matchesStatus;
  });

  const selectedTrace = traces.find((t) => t.trace_id === selectedTraceId) || filteredTraces[0];

  // Compute summary stats
  const totalExecutions = traces.length;
  const activeRuns = traces.filter(t => t.status === 'running').length;
  const toolCallsCount = traces.reduce((acc, t) => acc + t.steps.filter(s => s.step_type === 'tool_call').length, 0);
  const avgDuration = traces.length > 0
    ? Math.round(traces.reduce((acc, t) => acc + (t.duration_ms || 0), 0) / traces.length)
    : 0;
  const successRate = traces.length > 0
    ? Math.round((traces.filter(t => t.status === 'completed').length / traces.length) * 100)
    : 100;

  const toggleStepExpansion = (stepId: string) => {
    setExpandedSteps(prev => ({ ...prev, [stepId]: !prev[stepId] }));
  };

  const copyToClipboard = (text: string, stepId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedStepId(stepId);
    setTimeout(() => setCopiedStepId(null), 2000);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 bg-slate-50 dark:bg-[#07090E] min-h-screen font-sans text-xs">
      
      {/* 1. Header Section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-[#0E121B] p-4 rounded-2xl border border-slate-200 dark:border-white/[0.08] shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-[#00E599] shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold text-slate-900 dark:text-white leading-none">
                Agent Execution Traces
              </h1>
              <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-emerald-500/15 text-emerald-600 dark:text-[#00E599] border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                AGY Engine
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Real-time audit log of multi-agent reasoning loops, tool invocations, and subagent state transitions.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={() => setIsLiveStream(!isLiveStream)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 transition-colors ${
              isLiveStream 
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-[#00E599] border-emerald-500/40' 
                : 'surface-card text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isLiveStream ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'}`}></span>
            {isLiveStream ? 'Live Stream ON' : 'Live Stream OFF'}
          </button>

          <button
            onClick={fetchTraces}
            className="p-2 rounded-xl surface-card hover:border-emerald-500/40 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 transition-colors"
            title="Refresh Traces"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleClearTraces}
            className="p-2 rounded-xl surface-card hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 border border-slate-200 dark:border-white/10 transition-colors"
            title="Clear Execution Traces"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Executive Metrics Summary Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="surface-card p-3.5 rounded-xl border border-slate-200/80 dark:border-white/[0.06] space-y-1">
          <span className="text-[10px] font-mono uppercase text-slate-500 font-semibold block">Total Executions</span>
          <div className="text-lg font-bold font-mono text-slate-900 dark:text-white flex items-baseline justify-between">
            <span>{totalExecutions}</span>
            <Layers className="w-4 h-4 text-emerald-500 dark:text-[#00E599]" />
          </div>
        </div>

        <div className="surface-card p-3.5 rounded-xl border border-slate-200/80 dark:border-white/[0.06] space-y-1">
          <span className="text-[10px] font-mono uppercase text-slate-500 font-semibold block">Active Runs</span>
          <div className="text-lg font-bold font-mono text-amber-500 flex items-baseline justify-between">
            <span>{activeRuns}</span>
            <Activity className="w-4 h-4 text-amber-500" />
          </div>
        </div>

        <div className="surface-card p-3.5 rounded-xl border border-slate-200/80 dark:border-white/[0.06] space-y-1">
          <span className="text-[10px] font-mono uppercase text-slate-500 font-semibold block">Tool Invocations</span>
          <div className="text-lg font-bold font-mono text-cyan-500 flex items-baseline justify-between">
            <span>{toolCallsCount}</span>
            <Terminal className="w-4 h-4 text-cyan-500" />
          </div>
        </div>

        <div className="surface-card p-3.5 rounded-xl border border-slate-200/80 dark:border-white/[0.06] space-y-1">
          <span className="text-[10px] font-mono uppercase text-slate-500 font-semibold block">Avg Duration</span>
          <div className="text-lg font-bold font-mono text-purple-500 flex items-baseline justify-between">
            <span>{avgDuration} ms</span>
            <Clock className="w-4 h-4 text-purple-500" />
          </div>
        </div>

        <div className="surface-card p-3.5 rounded-xl border border-slate-200/80 dark:border-white/[0.06] col-span-2 sm:col-span-1 space-y-1">
          <span className="text-[10px] font-mono uppercase text-slate-500 font-semibold block">Success Rate</span>
          <div className="text-lg font-bold font-mono text-emerald-600 dark:text-[#00E599] flex items-baseline justify-between">
            <span>{successRate}%</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-[#00E599]" />
          </div>
        </div>
      </div>

      {/* 3. Filter Controls Bar */}
      <div className="surface-card p-3 rounded-2xl border border-slate-200/80 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2 min-w-[220px]">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ticker, query, or trace ID..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-100 dark:bg-black/30 border border-slate-200 dark:border-white/10 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {/* Agent Filter */}
          <div className="flex items-center gap-1">
            <SlidersHorizontal className="w-3 h-3 text-slate-400" />
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl surface-inset border border-slate-200 dark:border-white/10 text-xs font-mono text-slate-700 dark:text-slate-300 focus:outline-none"
            >
              <option value="all">All Agents</option>
              <option value="orchestrator">Orchestrator</option>
              <option value="researchagent">ResearchAgent</option>
              <option value="sentimentanalyst">SentimentAnalyst</option>
              <option value="marketcorrelator">MarketCorrelator</option>
              <option value="watchdogtrigger">WatchdogTrigger</option>
            </select>
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl surface-inset border border-slate-200 dark:border-white/10 text-xs font-mono text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="running">Running</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* 4. Main Master-Detail Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[520px]">
        
        {/* Left Column: Trace Sessions List (4 cols) */}
        <div className="lg:col-span-4 surface-card rounded-2xl border border-slate-200/80 dark:border-white/[0.08] flex flex-col h-[600px] overflow-hidden">
          <div className="p-3 border-b border-slate-200/80 dark:border-white/[0.06] bg-slate-50/80 dark:bg-black/40 flex items-center justify-between">
            <span className="font-bold text-xs uppercase text-slate-700 dark:text-slate-300 font-mono flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-emerald-500" />
              Executions ({filteredTraces.length})
            </span>
            <span className="text-[10px] font-mono text-slate-400">Most Recent First</span>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2 no-scrollbar">
            {filteredTraces.length === 0 ? (
              <div className="p-8 text-center space-y-2 text-slate-400 font-mono">
                <Bot className="w-8 h-8 mx-auto text-slate-400 opacity-50" />
                <p>No execution traces recorded yet.</p>
                <span className="text-[10px]">Ask MarketWave AI Copilot to see live agent traces!</span>
              </div>
            ) : (
              filteredTraces.map((trace) => {
                const isSelected = selectedTrace && selectedTrace.trace_id === trace.trace_id;
                const agentStyle = getAgentBadgeStyle(trace.agent_name);

                return (
                  <button
                    key={trace.trace_id}
                    onClick={() => setSelectedTraceId(trace.trace_id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      isSelected 
                        ? 'bg-emerald-500/10 border-emerald-500/50 shadow-sm' 
                        : 'surface-inset hover:border-slate-300 dark:hover:border-white/20 border-slate-200/60 dark:border-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border uppercase ${agentStyle}`}>
                        {trace.agent_name}
                      </span>

                      {trace.status === 'completed' && (
                        <span className="px-1.5 py-0.2 rounded text-[8px] font-mono font-bold bg-emerald-500/15 text-emerald-600 dark:text-[#00E599] border border-emerald-500/30">
                          SUCCESS
                        </span>
                      )}
                      {trace.status === 'running' && (
                        <span className="px-1.5 py-0.2 rounded text-[8px] font-mono font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30 animate-pulse">
                          RUNNING
                        </span>
                      )}
                      {trace.status === 'failed' && (
                        <span className="px-1.5 py-0.2 rounded text-[8px] font-mono font-bold bg-rose-500/15 text-rose-500 border border-rose-500/30">
                          FAILED
                        </span>
                      )}
                    </div>

                    <div className="font-semibold text-slate-800 dark:text-slate-200 line-clamp-2 leading-tight text-xs mb-2">
                      {trace.user_query || 'Execution turn'}
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 border-t border-slate-200/40 dark:border-white/[0.04] pt-1.5">
                      <div className="flex items-center gap-1.5">
                        {trace.ticker && (
                          <span className="font-bold text-slate-900 dark:text-white bg-slate-200 dark:bg-white/10 px-1 rounded">
                            {trace.ticker}
                          </span>
                        )}
                        <span>{trace.total_steps} steps</span>
                      </div>
                      <span>{trace.duration_ms ? `${trace.duration_ms}ms` : '--'}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Waterfall Trace Visualizer (8 cols) */}
        <div className="lg:col-span-8 surface-card rounded-2xl border border-slate-200/80 dark:border-white/[0.08] flex flex-col h-[600px] overflow-hidden">
          {selectedTrace ? (
            <>
              {/* Trace Detail Header */}
              <div className="p-4 border-b border-slate-200/80 dark:border-white/[0.06] bg-slate-50/90 dark:bg-black/40 space-y-2 shrink-0">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold border uppercase ${getAgentBadgeStyle(selectedTrace.agent_name)}`}>
                      {selectedTrace.agent_name}
                    </span>
                    <span className="text-xs font-mono text-slate-400">ID: {selectedTrace.trace_id}</span>
                  </div>

                  <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
                    <span>Started: {selectedTrace.start_time_formatted}</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      Duration: {selectedTrace.duration_ms ? `${selectedTrace.duration_ms}ms` : 'In Progress'}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl surface-inset border border-slate-200/80 dark:border-white/[0.06] text-xs font-medium text-slate-800 dark:text-slate-200 flex items-start gap-2">
                  <Bot className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="text-[10px] font-mono uppercase text-slate-400 block font-bold">Execution Prompt / Trigger</span>
                    <div className="whitespace-pre-wrap">{selectedTrace.user_query}</div>
                  </div>
                  {selectedTrace.ticker && onSelectStock && (
                    <button
                      onClick={() => onSelectStock(selectedTrace.ticker!)}
                      className="px-2 py-1 rounded surface-card hover:border-emerald-500 text-[10px] font-mono text-emerald-600 dark:text-[#00E599] border flex items-center gap-1 shrink-0"
                    >
                      <span>Terminal ({selectedTrace.ticker})</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Waterfall Execution Steps Feed */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar select-text">
                <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-white/10">
                  {selectedTrace.steps.map((step, idx) => {
                    const badge = getStepTypeBadge(step.step_type);
                    const StepIcon = badge.icon;
                    const isExpanded = !!expandedSteps[step.step_id];

                    return (
                      <div key={step.step_id} className="relative group">
                        {/* Step Marker Icon */}
                        <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-slate-900 dark:bg-black border-2 border-slate-300 dark:border-white/20 flex items-center justify-center text-slate-300">
                          <span className="text-[9px] font-mono font-bold text-slate-400">{idx + 1}</span>
                        </div>

                        {/* Step Card */}
                        <div className="surface-card p-3 rounded-xl border border-slate-200/80 dark:border-white/[0.06] space-y-2">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border uppercase flex items-center gap-1 ${badge.bg}`}>
                                <StepIcon className="w-3 h-3" />
                                {badge.label}
                              </span>
                              
                              <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border uppercase ${getAgentBadgeStyle(step.agent_name)}`}>
                                {step.agent_name}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                              {step.latency_ms !== undefined && step.latency_ms !== null && (
                                <span className="px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-400 font-bold">
                                  {step.latency_ms}ms
                                </span>
                              )}
                              <span>{step.time_formatted}</span>
                            </div>
                          </div>

                          <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center justify-between">
                            <span>{step.title}</span>
                            {step.details && (
                              <button
                                onClick={() => toggleStepExpansion(step.step_id)}
                                className="text-[10px] font-mono text-emerald-600 dark:text-[#00E599] hover:underline flex items-center gap-0.5"
                              >
                                <span>{isExpanded ? 'Hide Payload' : 'Inspect JSON'}</span>
                                {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                              </button>
                            )}
                          </div>

                          {/* Expandable JSON / Details Inspector */}
                          {step.details && (
                            <div className={`mt-2 ${isExpanded ? 'block' : 'hidden'}`}>
                              <div className="relative rounded-lg bg-black/70 p-2.5 font-mono text-[10px] text-emerald-400 border border-white/10 overflow-x-auto">
                                <button
                                  onClick={() => copyToClipboard(JSON.stringify(step.details, null, 2), step.step_id)}
                                  className="absolute top-2 right-2 p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                                  title="Copy JSON"
                                >
                                  {copiedStepId === step.step_id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                </button>
                                <pre className="whitespace-pre-wrap leading-tight">
                                  {typeof step.details === 'string' ? step.details : JSON.stringify(step.details, null, 2)}
                                </pre>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Final Response Section */}
                {selectedTrace.final_output && (
                  <div className="mt-4 p-4 rounded-xl surface-inset border border-emerald-500/30 space-y-2">
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-[#00E599] font-bold text-xs font-mono uppercase">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span>Final Synthesized Output</span>
                    </div>
                    <div className="p-3 rounded-lg bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                      {selectedTrace.final_output}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3 text-slate-400 font-mono">
              <Activity className="w-12 h-12 text-slate-500 opacity-40 animate-pulse" />
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">Select an Execution Trace</h3>
              <p className="text-xs max-w-md">
                Click any execution session from the left list to view step-by-step agent transfers, tool invocations, parameters, and timings.
              </p>
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
