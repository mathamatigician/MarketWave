import os
import sys
import json
import time
import uuid
import logging
import threading
from typing import List, Dict, Any, Optional, Union
from contextvars import ContextVar

# ContextVar to track current trace_id in execution context (async & multi-threaded safe)
_current_trace_id: ContextVar[Optional[str]] = ContextVar("current_trace_id", default=None)

logger = logging.getLogger("AgentTraces")
logger.setLevel(logging.INFO)

def get_traces_file_path() -> str:
    """Resolves the path to db/traces.json dynamically."""
    if os.path.exists(os.path.join('db', 'traces.json')):
        return os.path.join('db', 'traces.json')
    base_dir = os.path.dirname(os.path.abspath(__file__))
    target_path = os.path.join(base_dir, 'db', 'traces.json')
    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    return target_path

class TraceStep:
    def __init__(
        self,
        step_id: str,
        step_type: str,
        agent_name: str,
        title: str,
        details: Optional[Any] = None,
        latency_ms: Optional[float] = None,
        timestamp: Optional[float] = None
    ):
        self.step_id = step_id
        self.step_type = step_type  # agent_start, thought, tool_call, tool_result, subagent_delegation, subagent_result, final_response, error
        self.agent_name = agent_name
        self.title = title
        self.details = details or {}
        self.latency_ms = latency_ms
        self.timestamp = timestamp or time.time()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "step_id": self.step_id,
            "step_type": self.step_type,
            "agent_name": self.agent_name,
            "title": self.title,
            "details": self.details,
            "latency_ms": round(self.latency_ms, 2) if self.latency_ms is not None else None,
            "timestamp": self.timestamp,
            "time_formatted": time.strftime("%H:%M:%S", time.localtime(self.timestamp))
        }

class TraceSession:
    def __init__(
        self,
        trace_id: str,
        agent_name: str,
        user_query: str,
        ticker: Optional[str] = None,
        status: str = "running",
        start_time: Optional[float] = None
    ):
        self.trace_id = trace_id
        self.agent_name = agent_name
        self.user_query = user_query
        self.ticker = ticker
        self.status = status  # running, completed, failed
        self.start_time = start_time or time.time()
        self.end_time: Optional[float] = None
        self.duration_ms: Optional[float] = None
        self.steps: List[TraceStep] = []
        self.final_output: Optional[str] = None

    def add_step(
        self,
        step_type: str,
        agent_name: str,
        title: str,
        details: Optional[Any] = None,
        latency_ms: Optional[float] = None
    ) -> TraceStep:
        step_id = f"step_{len(self.steps) + 1}_{uuid.uuid4().hex[:6]}"
        step = TraceStep(
            step_id=step_id,
            step_type=step_type,
            agent_name=agent_name,
            title=title,
            details=details,
            latency_ms=latency_ms
        )
        self.steps.append(step)
        return step

    def finish(self, status: str = "completed", final_output: Optional[str] = None):
        self.status = status
        self.end_time = time.time()
        self.duration_ms = (self.end_time - self.start_time) * 1000
        if final_output:
            self.final_output = final_output
            self.add_step(
                step_type="final_response",
                agent_name=self.agent_name,
                title="Generated Final Response",
                details={"output_length": len(final_output), "preview": final_output[:300]}
            )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "trace_id": self.trace_id,
            "agent_name": self.agent_name,
            "user_query": self.user_query,
            "ticker": self.ticker,
            "status": self.status,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "duration_ms": round(self.duration_ms, 2) if self.duration_ms is not None else None,
            "start_time_formatted": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(self.start_time)),
            "steps": [s.to_dict() for s in self.steps],
            "total_steps": len(self.steps),
            "final_output": self.final_output
        }

class TraceTrackerManager:
    _instance = None
    _lock = threading.Lock()

    def __init__(self):
        self._traces: Dict[str, TraceSession] = {}
        self._max_history = 100
        self._load_from_disk()

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = TraceTrackerManager()
        return cls._instance

    def _load_from_disk(self):
        file_path = get_traces_file_path()
        if os.path.exists(file_path):
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        for item in data:
                            trace_id = item.get("trace_id")
                            if not trace_id:
                                continue
                            session = TraceSession(
                                trace_id=trace_id,
                                agent_name=item.get("agent_name", "Orchestrator"),
                                user_query=item.get("user_query", ""),
                                ticker=item.get("ticker"),
                                status=item.get("status", "completed"),
                                start_time=item.get("start_time", time.time())
                            )
                            session.end_time = item.get("end_time")
                            session.duration_ms = item.get("duration_ms")
                            session.final_output = item.get("final_output")

                            for step_data in item.get("steps", []):
                                step = TraceStep(
                                    step_id=step_data.get("step_id", f"step_{len(session.steps)+1}"),
                                    step_type=step_data.get("step_type", "thought"),
                                    agent_name=step_data.get("agent_name", session.agent_name),
                                    title=step_data.get("title", ""),
                                    details=step_data.get("details"),
                                    latency_ms=step_data.get("latency_ms"),
                                    timestamp=step_data.get("timestamp", time.time())
                                )
                                session.steps.append(step)
                            self._traces[trace_id] = session
            except Exception as e:
                logger.error(f"Failed to load traces from disk: {e}")

    def save_to_disk(self):
        file_path = get_traces_file_path()
        try:
            traces_list = [s.to_dict() for s in sorted(self._traces.values(), key=lambda x: x.start_time, reverse=True)[:self._max_history]]
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(traces_list, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save traces to disk: {e}")

    def create_trace(self, agent_name: str, user_query: str, ticker: Optional[str] = None) -> TraceSession:
        trace_id = f"trc_{int(time.time())}_{uuid.uuid4().hex[:6]}"
        session = TraceSession(
            trace_id=trace_id,
            agent_name=agent_name,
            user_query=user_query,
            ticker=ticker,
            status="running"
        )
        session.add_step(
            step_type="agent_start",
            agent_name=agent_name,
            title=f"Initialized {agent_name} Execution",
            details={"query": user_query, "ticker": ticker}
        )
        with self._lock:
            self._traces[trace_id] = session
            # Evict oldest if exceeding capacity
            if len(self._traces) > self._max_history:
                oldest_key = min(self._traces.keys(), key=lambda k: self._traces[k].start_time)
                del self._traces[oldest_key]

        _current_trace_id.set(trace_id)
        self.save_to_disk()
        return session

    def add_step(
        self,
        trace_id: Optional[str] = None,
        step_type: str = "thought",
        agent_name: str = "Orchestrator",
        title: str = "",
        details: Optional[Any] = None,
        latency_ms: Optional[float] = None
    ) -> Optional[TraceStep]:
        target_id = trace_id or _current_trace_id.get()
        if not target_id:
            return None

        with self._lock:
            session = self._traces.get(target_id)
            if not session:
                return None
            step = session.add_step(
                step_type=step_type,
                agent_name=agent_name,
                title=title,
                details=details,
                latency_ms=latency_ms
            )

        self.save_to_disk()
        return step

    def finish_trace(
        self,
        trace_id: Optional[str] = None,
        status: str = "completed",
        final_output: Optional[str] = None
    ) -> Optional[TraceSession]:
        target_id = trace_id or _current_trace_id.get()
        if not target_id:
            return None

        with self._lock:
            session = self._traces.get(target_id)
            if not session:
                return None
            session.finish(status=status, final_output=final_output)

        self.save_to_disk()
        return session

    def get_trace_by_id(self, trace_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            session = self._traces.get(trace_id)
            return session.to_dict() if session else None

    def get_traces(
        self,
        limit: int = 50,
        agent_filter: Optional[str] = None,
        status_filter: Optional[str] = None,
        ticker_filter: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        with self._lock:
            sessions = list(self._traces.values())

        if agent_filter and agent_filter != "all":
            sessions = [s for s in sessions if s.agent_name.lower() == agent_filter.lower() or any(st.agent_name.lower() == agent_filter.lower() for st in s.steps)]
        if status_filter and status_filter != "all":
            sessions = [s for s in sessions if s.status.lower() == status_filter.lower()]
        if ticker_filter:
            tf = ticker_filter.lower()
            sessions = [s for s in sessions if (s.ticker and tf in s.ticker.lower()) or (s.user_query and tf in s.user_query.lower())]

        sessions.sort(key=lambda x: x.start_time, reverse=True)
        return [s.to_dict() for s in sessions[:limit]]

    def clear_traces(self):
        with self._lock:
            self._traces.clear()
        self.save_to_disk()

# Global helper functions
def trace_tracker() -> TraceTrackerManager:
    return TraceTrackerManager.get_instance()

def get_current_trace_id() -> Optional[str]:
    return _current_trace_id.get()

def set_current_trace_id(trace_id: Optional[str]):
    _current_trace_id.set(trace_id)

class TraceContext:
    def __init__(self, agent_name: str, user_query: str, ticker: Optional[str] = None):
        self.agent_name = agent_name
        self.user_query = user_query
        self.ticker = ticker
        self.session: Optional[TraceSession] = None
        self.token = None

    def __enter__(self) -> TraceSession:
        self.session = trace_tracker().create_trace(self.agent_name, self.user_query, self.ticker)
        return self.session

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            trace_tracker().add_step(
                step_type="error",
                agent_name=self.agent_name,
                title=f"Exception in {self.agent_name}",
                details={"error_type": exc_type.__name__, "message": str(exc_val)}
            )
            trace_tracker().finish_trace(status="failed")
        else:
            if self.session and self.session.status == "running":
                trace_tracker().finish_trace(status="completed")

    async def __aenter__(self) -> TraceSession:
        return self.__enter__()

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        self.__exit__(exc_type, exc_val, exc_tb)
