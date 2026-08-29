import os
import sys
import unittest
import json

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from agent_traces import (
    TraceTrackerManager,
    TraceContext,
    trace_tracker,
    get_traces_file_path
)

class TestAgentTraces(unittest.TestCase):

    def setUp(self):
        self.tracker = trace_tracker()
        self.tracker.clear_traces()

    def tearDown(self):
        self.tracker.clear_traces()

    def test_create_and_finish_trace(self):
        session = self.tracker.create_trace(
            agent_name="Orchestrator",
            user_query="Why is Tesla moving today?",
            ticker="TSLA"
        )
        self.assertIsNotNone(session.trace_id)
        self.assertEqual(session.agent_name, "Orchestrator")
        self.assertEqual(session.status, "running")

        step = self.tracker.add_step(
            trace_id=session.trace_id,
            step_type="tool_call",
            agent_name="ResearchAgent",
            title="Calling fetch_news_tool",
            details={"ticker": "TSLA"}
        )
        self.assertIsNotNone(step)
        self.assertEqual(step.agent_name, "ResearchAgent")

        finished = self.tracker.finish_trace(
            trace_id=session.trace_id,
            status="completed",
            final_output="Tesla price is rising due to energy storage growth."
        )
        self.assertEqual(finished.status, "completed")
        self.assertIsNotNone(finished.end_time)
        self.assertGreaterEqual(finished.duration_ms, 0)

        trace_data = self.tracker.get_trace_by_id(session.trace_id)
        self.assertIsNotNone(trace_data)
        self.assertEqual(trace_data["ticker"], "TSLA")
        self.assertEqual(len(trace_data["steps"]), 3) # start + tool_call + final_response

    def test_trace_context_manager(self):
        with TraceContext("SentimentAnalyst", "Analyze article text", ticker="NVDA") as session:
            trace_id = session.trace_id
            self.tracker.add_step(
                step_type="thought",
                agent_name="SentimentAnalyst",
                title="Extracting topic scores",
                details={"topic_count": 18}
            )

        trace_data = self.tracker.get_trace_by_id(trace_id)
        self.assertIsNotNone(trace_data)
        self.assertEqual(trace_data["status"], "completed")

    def test_filter_traces(self):
        self.tracker.create_trace("ResearchAgent", "Fetch AAPL news", ticker="AAPL")
        self.tracker.finish_trace(status="completed")

        self.tracker.create_trace("WatchdogTrigger", "Evaluate watchlist", ticker="TSLA")
        self.tracker.finish_trace(status="completed")

        res_aapl = self.tracker.get_traces(ticker_filter="AAPL")
        self.assertEqual(len(res_aapl), 1)
        self.assertEqual(res_aapl[0]["ticker"], "AAPL")

        res_watchdog = self.tracker.get_traces(agent_filter="WatchdogTrigger")
        self.assertEqual(len(res_watchdog), 1)

    def test_disk_persistence(self):
        session = self.tracker.create_trace("Orchestrator", "Persistent trace test", ticker="MSFT")
        self.tracker.finish_trace(status="completed", final_output="Done")

        # Reload from disk
        file_path = get_traces_file_path()
        self.assertTrue(os.path.exists(file_path))

        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            self.assertGreaterEqual(len(data), 1)
            tickers = [item.get("ticker") for item in data]
            self.assertIn("MSFT", tickers)

if __name__ == "__main__":
    unittest.main()
