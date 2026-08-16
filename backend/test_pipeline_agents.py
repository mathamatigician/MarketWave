import os
import sys
import time
import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
# Also add the repo root (parent of backend/) so that
# `patch("backend.agents.orchestrator....")` below can resolve `backend` as
# a top-level (namespace) package -- it isn't on sys.path by default when
# these tests are invoked from within backend/ (e.g. `cd backend && python3
# -m unittest test_pipeline_agents`), matching main.py's own
# `from backend.agents.orchestrator import ...` which only resolves because
# main.py is always launched with the repo root as cwd (see start.sh /
# Dockerfile).
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pipeline


class TestCleanArticleWithAgent(unittest.IsolatedAsyncioTestCase):
    async def test_returns_agent_cleaned_text_on_success(self):
        mock_agent = AsyncMock()
        mock_agent.__aenter__.return_value = mock_agent
        mock_agent.__aexit__.return_value = None

        async def fake_response_iter():
            for chunk in ["Cleaned ", "article ", "text."]:
                yield chunk

        mock_response = fake_response_iter()
        mock_agent.chat = AsyncMock(return_value=mock_response)

        mock_agent_class = MagicMock(return_value=mock_agent)
        mock_research_config = MagicMock()

        with patch("google.antigravity.Agent", mock_agent_class), \
             patch("backend.agents.orchestrator.research_agent_config", mock_research_config):
            result = await pipeline.clean_article_with_agent("raw scraped text here", "TSLA")

        self.assertEqual(result, "Cleaned article text.")
        mock_agent_class.assert_called_once_with(mock_research_config)

    async def test_falls_back_to_regex_clean_on_agent_failure(self):
        mock_agent_class = MagicMock(side_effect=RuntimeError("agent unavailable"))

        with patch("google.antigravity.Agent", mock_agent_class), \
             patch("backend.agents.orchestrator.research_agent_config", MagicMock()):
            result = await pipeline.clean_article_with_agent("raw   scraped\n\ntext", "TSLA")

        # Falls back to the original regex whitespace-clean, never raises.
        self.assertEqual(result, "raw scraped text")

    async def test_emits_fallback_activity_event_on_agent_failure(self):
        mock_agent_class = MagicMock(side_effect=RuntimeError("agent unavailable"))
        emitted_events = []

        async def fake_on_activity(event):
            emitted_events.append(event)

        with patch("google.antigravity.Agent", mock_agent_class), \
             patch("backend.agents.orchestrator.research_agent_config", MagicMock()):
            await pipeline.clean_article_with_agent("raw text", "TSLA", on_activity=fake_on_activity)

        self.assertEqual(len(emitted_events), 1)
        self.assertEqual(emitted_events[0]["status"], "fallback")
        self.assertEqual(emitted_events[0]["agent"], "ResearchAgent")
        self.assertEqual(emitted_events[0]["ticker"], "TSLA")

    async def test_no_error_when_on_activity_omitted_on_failure(self):
        """on_activity is optional -- must not raise when the caller doesn't pass one."""
        mock_agent_class = MagicMock(side_effect=RuntimeError("agent unavailable"))

        with patch("google.antigravity.Agent", mock_agent_class), \
             patch("backend.agents.orchestrator.research_agent_config", MagicMock()):
            result = await pipeline.clean_article_with_agent("raw text", "TSLA")

        self.assertEqual(result, "raw text")


class TestScoreSentimentWithAgent(unittest.IsolatedAsyncioTestCase):
    async def test_returns_parsed_dict_on_success(self):
        mock_agent = AsyncMock()
        mock_agent.__aenter__.return_value = mock_agent
        mock_agent.__aexit__.return_value = None

        async def fake_response_iter():
            yield '{"overall_sentiment": 0.6, "layoffs": null}'

        mock_agent.chat = AsyncMock(return_value=fake_response_iter())
        mock_agent_class = MagicMock(return_value=mock_agent)
        mock_sentiment_config = MagicMock()

        with patch("google.antigravity.Agent", mock_agent_class), \
             patch("backend.agents.orchestrator.sentiment_analyst_config", mock_sentiment_config):
            result = await pipeline.score_sentiment_with_agent("article text", "TSLA")

        self.assertEqual(result, {"overall_sentiment": 0.6, "layoffs": None})
        mock_agent_class.assert_called_once_with(mock_sentiment_config)

    async def test_returns_none_on_agent_failure(self):
        """Must return None, not a fallback dict -- triggers.py's watchdog
        depends on None to exclude a failed score from its average."""
        mock_agent_class = MagicMock(side_effect=RuntimeError("agent unavailable"))

        with patch("google.antigravity.Agent", mock_agent_class), \
             patch("backend.agents.orchestrator.sentiment_analyst_config", MagicMock()):
            result = await pipeline.score_sentiment_with_agent("article text", "TSLA")

        self.assertIsNone(result)

    async def test_emits_fallback_activity_event_on_agent_failure(self):
        mock_agent_class = MagicMock(side_effect=RuntimeError("agent unavailable"))
        emitted_events = []

        async def fake_on_activity(event):
            emitted_events.append(event)

        with patch("google.antigravity.Agent", mock_agent_class), \
             patch("backend.agents.orchestrator.sentiment_analyst_config", MagicMock()):
            await pipeline.score_sentiment_with_agent("article text", "TSLA", on_activity=fake_on_activity)

        self.assertEqual(len(emitted_events), 1)
        self.assertEqual(emitted_events[0]["status"], "fallback")
        self.assertEqual(emitted_events[0]["agent"], "SentimentAnalyst")

    async def test_returns_none_on_malformed_json(self):
        mock_agent = AsyncMock()
        mock_agent.__aenter__.return_value = mock_agent
        mock_agent.__aexit__.return_value = None

        async def fake_response_iter():
            yield "not valid json"

        mock_agent.chat = AsyncMock(return_value=fake_response_iter())
        mock_agent_class = MagicMock(return_value=mock_agent)

        with patch("google.antigravity.Agent", mock_agent_class), \
             patch("backend.agents.orchestrator.sentiment_analyst_config", MagicMock()):
            result = await pipeline.score_sentiment_with_agent("article text", "TSLA")

        self.assertIsNone(result)


class TestAnalyzeSentimentStillAlwaysSucceeds(unittest.IsolatedAsyncioTestCase):
    async def test_falls_back_to_neutral_default_when_agent_scoring_fails(self):
        """analyze_sentiment() must keep its own always-succeeds contract --
        run_pipeline depends on never getting None from this one."""
        with patch("pipeline.score_sentiment_with_agent", AsyncMock(return_value=None)):
            result_json_str = await pipeline.analyze_sentiment("some text", "TSLA")

        import json
        result = json.loads(result_json_str)
        self.assertEqual(result["overall_sentiment"], 0.0)
        self.assertIsNone(result["layoffs"])


class TestRunPipelineDoesNotBlockEventLoop(unittest.IsolatedAsyncioTestCase):
    """Regression test for Critical #2: run_pipeline's blocking I/O (Firestore
    reads/writes, requests.get-based fetch/scrape) must execute via
    asyncio.to_thread so it doesn't monopolize the event loop -- and
    therefore every other concurrent request/websocket -- for the run's
    duration.

    This is a real concurrency test rather than a mock-of-asyncio.to_thread
    test: it runs a slow/blocking fake fetch_news_items concurrently with a
    fast asyncio.sleep-based task via asyncio.gather, and asserts the fast
    task completes promptly instead of being queued behind the blocking
    call. A true concurrency test was practical here (no real network/
    Firestore access needed -- fetch_news_items and the existing-URLs load
    are both mockable single call sites) and is more convincing than
    asserting asyncio.to_thread was merely called, since it also protects
    against a future regression that swaps in asyncio.to_thread correctly
    for the wrong callable or reintroduces a blocking call elsewhere.
    """

    async def test_fast_concurrent_task_is_not_delayed_by_blocking_fetch(self):
        def slow_fetch(ticker, limit=5):
            time.sleep(0.3)  # simulates blocking requests.get() I/O
            return []  # no items -> run_pipeline finishes quickly after this call

        fast_task_elapsed = None

        async def fast_task(start: float):
            nonlocal fast_task_elapsed
            await asyncio.sleep(0.05)
            fast_task_elapsed = time.monotonic() - start

        with patch("pipeline.fetch_news_items", side_effect=slow_fetch), \
             patch("pipeline._load_existing_urls_sync", return_value=set()):
            start = time.monotonic()
            await asyncio.gather(
                pipeline.run_pipeline("TSLA"),
                fast_task(start),
            )

        self.assertIsNotNone(fast_task_elapsed)
        # The fast task's 0.05s sleep must resolve promptly -- well below
        # the slow fetch's 0.3s blocking duration -- proving the blocking
        # call ran off the event loop rather than stalling it.
        self.assertLess(
            fast_task_elapsed, 0.2,
            "fast concurrent task was delayed -- run_pipeline's blocking "
            "fetch_news_items call appears to be running on the event loop "
            "instead of via asyncio.to_thread",
        )


if __name__ == "__main__":
    unittest.main()
