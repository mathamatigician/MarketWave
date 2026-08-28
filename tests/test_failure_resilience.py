import os
import sys
import json
import time
import asyncio
import unittest
from unittest.mock import patch, MagicMock, AsyncMock
import requests

# Add repository root and backend directory to sys.path
repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(repo_root, 'backend')
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from backend import database, pipeline, gemma_service, main
from backend.ingestion_scheduler import MarketNewsScheduler, reset_scheduler
from backend.config import settings


class TestFailureResilience(unittest.IsolatedAsyncioTestCase):
    """Comprehensive failure-path integration tests verifying system stability,
    bounded retries, non-destructive error handling, and recovery.
    """

    async def asyncSetUp(self):
        reset_scheduler()

    async def asyncTearDown(self):
        reset_scheduler()

    def test_news_api_429_rate_limit_handled_without_fake_news(self):
        """Tests that external news API 429 returns empty list after bounded retries without fabricating articles."""
        mock_response = MagicMock()
        mock_response.status_code = 429

        with patch('requests.get', return_value=mock_response), \
             patch('time.sleep', return_value=None):
            items = pipeline._fetch_news_items_finhub("TSLA", limit=5)
            self.assertEqual(items, [])

    def test_news_api_500_server_error_handled_cleanly(self):
        """Tests that external news API 500 server error returns empty list after bounded retries."""
        mock_response = MagicMock()
        mock_response.status_code = 500

        with patch('requests.get', return_value=mock_response), \
             patch('time.sleep', return_value=None):
            items = pipeline._fetch_news_items_google_rss("TSLA", limit=5)
            self.assertEqual(items, [])

    def test_news_api_timeout_handled_without_crash(self):
        """Tests that requests.Timeout is caught cleanly without crashing the pipeline."""
        with patch('requests.get', side_effect=requests.exceptions.Timeout("Connection timed out")), \
             patch('time.sleep', return_value=None):
            items = pipeline._fetch_news_items_finhub("AAPL", limit=5)
            self.assertEqual(items, [])

    async def test_gemma_429_returns_none_to_preserve_previous_briefing(self):
        """Tests that Gemma API 429 rate limit returns None so Dashboard preserves last valid briefing."""
        mock_client = MagicMock()
        mock_client.chat.completions.create.side_effect = RuntimeError("Hugging Face API 429 Rate Limit")

        with patch('backend.gemma_service.get_hf_client', return_value=mock_client):
            briefing = await gemma_service.gemma_generate_flash_briefing(
                tickers=["TSLA"],
                headlines_by_ticker={"TSLA": ["Breaking Tesla updates"]}
            )
            # Must return None indicating failure, NOT fake static text
            self.assertIsNone(briefing)

    async def test_gemma_malformed_json_fallback(self):
        """Tests that malformed or non-JSON output from Gemma returns graceful fallback without crashing."""
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.choices = [
            MagicMock(message=MagicMock(content="I am unable to format as JSON at this time."))
        ]
        mock_client.chat.completions.create.return_value = mock_response

        with patch('backend.gemma_service.get_hf_client', return_value=mock_client):
            # Triage fallback test
            triage = await gemma_service.gemma_triage_news("Tesla releases quarterly numbers", "Summary text", "TSLA")
            self.assertEqual(triage["market_impact"], "MEDIUM")

            # Briefing fallback test
            briefing = await gemma_service.gemma_generate_flash_briefing(
                tickers=["TSLA"],
                headlines_by_ticker={"TSLA": ["Headline"]}
            )
            self.assertIsNone(briefing)

    async def test_firestore_write_failure_emits_error_event_without_scheduler_crash(self):
        """Tests that Firestore write failure emits an ingestion_error event and allows scheduler to continue."""
        emitted_events = []
        async def mock_emit(event: dict):
            emitted_events.append(event)

        with patch('backend.pipeline.fetch_news_items', return_value=[{"title": "News 1", "google_link": "http://link.com/1", "date": "8/27/2026"}]), \
             patch('backend.pipeline.resolve_and_scrape_article', return_value=("http://link.com/1", "Content")), \
             patch('backend.gemma_service.gemma_triage_news', new_callable=AsyncMock, return_value={"market_impact": "MEDIUM"}), \
             patch('backend.pipeline.clean_article_with_agent', new_callable=AsyncMock, return_value="Cleaned"), \
             patch('backend.pipeline.analyze_sentiment', new_callable=AsyncMock, return_value='{"overall_sentiment": 0.5}'), \
             patch('backend.pipeline._save_single_article_sync', side_effect=RuntimeError("Firestore connection refused")), \
             patch('backend.pipeline._save_new_articles_sync', side_effect=RuntimeError("Firestore connection refused")):

            new_articles = await pipeline.ingest_news_for_ticker(
                ticker="TSLA",
                existing_urls=set(),
                on_activity=mock_emit,
                limit=1
            )

            # Error event was emitted
            error_events = [e for e in emitted_events if e.get("type") == "ingestion_error"]
            self.assertTrue(len(error_events) > 0)
            self.assertIn("Firestore connection refused", error_events[0]["detail"])

    async def test_websocket_client_disconnect_does_not_break_broadcasting(self):
        """Tests that when one client disconnects abruptly, broadcasting removes dead socket and continues."""
        mock_good_ws = AsyncMock()
        mock_dead_ws = AsyncMock()
        mock_dead_ws.send_json.side_effect = RuntimeError("WebSocket connection is closed")

        main._ingest_websockets.clear()
        main._ingest_websockets.add(mock_good_ws)
        main._ingest_websockets.add(mock_dead_ws)

        test_event = {"type": "article_processed", "ticker": "AAPL", "overall_sentiment": 0.6}
        await main.broadcast_ingest_activity(test_event)

        # Good WS received the event
        mock_good_ws.send_json.assert_called_once_with(test_event)
        # Dead WS was cleaned up from the set
        self.assertNotIn(mock_dead_ws, main._ingest_websockets)
        self.assertIn(mock_good_ws, main._ingest_websockets)

        main._ingest_websockets.clear()

    async def test_scheduler_handles_restart_cleanly(self):
        """Tests that scheduler can be started, stopped, and restarted cleanly without orphaned tasks."""
        scheduler = MarketNewsScheduler(poll_interval=1)
        scheduler.start()
        self.assertTrue(scheduler.is_running)

        await scheduler.stop()
        self.assertFalse(scheduler.is_running)

        scheduler.start()
        self.assertTrue(scheduler.is_running)
        await scheduler.stop()


if __name__ == '__main__':
    unittest.main()
