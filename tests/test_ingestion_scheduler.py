import os
import sys
import time
import asyncio
import unittest
from unittest.mock import patch, MagicMock, AsyncMock

# Add parent directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.ingestion_scheduler import MarketNewsScheduler, get_scheduler, reset_scheduler
import backend.pipeline as pipeline
from backend.config import settings


class TestIngestionScheduler(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        reset_scheduler()

    def tearDown(self):
        reset_scheduler()

    @patch('backend.ingestion_scheduler.MarketNewsScheduler._run_loop', new_callable=AsyncMock)
    async def test_scheduler_startup_and_shutdown(self, mock_run_loop):
        """Tests that scheduler starts automatically and shuts down cleanly."""
        scheduler = MarketNewsScheduler(poll_interval=10)
        self.assertFalse(scheduler.is_running)

        # Start scheduler
        scheduler.start()
        self.assertTrue(scheduler.is_running)

        # Calling start again should not create multiple tasks
        initial_task = scheduler._task
        scheduler.start()
        self.assertIs(scheduler._task, initial_task)

        # Stop scheduler cleanly
        await scheduler.stop()
        self.assertFalse(scheduler.is_running)
        self.assertIsNone(scheduler._task)

    def test_configurable_poll_interval(self):
        """Tests that polling interval is configurable and not hardcoded."""
        scheduler = MarketNewsScheduler(poll_interval=45)
        self.assertEqual(scheduler.poll_interval, 45)

        scheduler.poll_interval = 120
        self.assertEqual(scheduler.poll_interval, 120)

        # Default comes from settings.market_news_poll_seconds
        default_scheduler = MarketNewsScheduler()
        self.assertEqual(default_scheduler.poll_interval, settings.market_news_poll_seconds)

    async def test_overlap_prevention(self):
        """Tests that in-progress ticker locks prevent overlapping runs."""
        scheduler = MarketNewsScheduler()

        # Mark TSLA in progress
        acquired1 = await scheduler.mark_ticker_in_progress("TSLA")
        self.assertTrue(acquired1)
        self.assertTrue(scheduler.is_ticker_in_progress("TSLA"))
        # Company name mapping check
        self.assertTrue(scheduler.is_ticker_in_progress("Tesla"))

        # Second attempt must be rejected
        acquired2 = await scheduler.mark_ticker_in_progress("TSLA")
        self.assertFalse(acquired2)

        # Unmark releases lock
        await scheduler.unmark_ticker_in_progress("TSLA")
        self.assertFalse(scheduler.is_ticker_in_progress("TSLA"))

        # Now can be acquired again
        acquired3 = await scheduler.mark_ticker_in_progress("TSLA")
        self.assertTrue(acquired3)
        await scheduler.unmark_ticker_in_progress("TSLA")

    @patch('backend.pipeline.fetch_news_items')
    @patch('backend.pipeline.resolve_and_scrape_article')
    @patch('backend.pipeline.clean_article_with_agent', new_callable=AsyncMock)
    @patch('backend.pipeline.analyze_sentiment', new_callable=AsyncMock)
    @patch('backend.pipeline._save_new_articles_sync')
    @patch('backend.pipeline.gemma_service.gemma_triage_news', new_callable=AsyncMock)
    async def test_duplicate_prevention_and_firestore_save(
        self,
        mock_triage,
        mock_save,
        mock_sentiment,
        mock_clean,
        mock_scrape,
        mock_fetch
    ):
        """Tests that duplicate articles are skipped and only genuinely new articles reach Firestore."""
        events = []
        async def mock_broadcast(event: dict):
            events.append(event)

        # Setup 2 news items: 1 already existing, 1 brand new
        existing_url = "https://example.com/existing-news-1"
        new_url = "https://example.com/brand-new-news-2"

        mock_fetch.return_value = [
            {'google_link': existing_url, 'title': 'Old News', 'date': '08/27/2026'},
            {'google_link': new_url, 'title': 'Breaking News', 'date': '08/27/2026'}
        ]
        mock_scrape.return_value = (new_url, "Full article text content about company growth.")
        mock_triage.return_value = {"market_impact": "HIGH", "relevance_score": 0.9, "reason": "Positive growth"}
        mock_clean.return_value = "Cleaned article text content."
        mock_sentiment.return_value = '{"overall_sentiment": 0.85, "revenue_growth": 0.9}'

        existing_urls_set = {existing_url}

        new_articles = await pipeline.ingest_news_for_ticker(
            ticker="TSLA",
            existing_urls=existing_urls_set,
            on_activity=mock_broadcast,
            limit=5
        )

        # 1. Verify only 1 new article was ingested
        self.assertEqual(len(new_articles), 1)
        self.assertEqual(new_articles[0]['url'], new_url)
        self.assertEqual(new_articles[0]['company_name'], "TSLA")

        # 2. Verify Firestore save was called for the new article
        mock_save.assert_called_once()
        saved_batch = mock_save.call_args[0][0]
        self.assertEqual(len(saved_batch), 1)
        self.assertEqual(saved_batch[0]['url'], new_url)

        # 3. Verify deduplication: existing_urls_set now contains new_url
        self.assertIn(new_url, existing_urls_set)

        # 4. Verify WebSocket events emitted
        event_types = [e.get("type") for e in events]
        self.assertIn("checking_ticker", event_types)
        self.assertIn("new_article", event_types)
        self.assertIn("article_processed", event_types)
        self.assertIn("done", event_types)

        # Check new_article event details
        new_art_event = next(e for e in events if e.get("type") == "new_article")
        self.assertEqual(new_art_event.get("ticker"), "TSLA")
        self.assertEqual(new_art_event.get("article_title"), "Breaking News")
        self.assertEqual(new_art_event.get("url"), new_url)
        self.assertIn("timestamp", new_art_event)

        # Check article_processed event details
        processed_event = next(e for e in events if e.get("type") == "article_processed")
        self.assertEqual(processed_event.get("ticker"), "TSLA")
        self.assertEqual(processed_event.get("overall_sentiment"), 0.85)
        self.assertEqual(processed_event.get("market_impact"), "HIGH")

    @patch('backend.pipeline.fetch_news_items')
    async def test_no_new_articles_event(self, mock_fetch):
        """Tests that when no new articles are found, no_new_articles event is emitted."""
        events = []
        async def mock_broadcast(event: dict):
            events.append(event)

        existing_url = "https://example.com/already-scraped"
        mock_fetch.return_value = [
            {'google_link': existing_url, 'title': 'Already Known', 'date': '08/27/2026'}
        ]

        existing_urls_set = {existing_url}

        new_articles = await pipeline.ingest_news_for_ticker(
            ticker="AAPL",
            existing_urls=existing_urls_set,
            on_activity=mock_broadcast,
            limit=5
        )

        self.assertEqual(len(new_articles), 0)
        event_types = [e.get("type") for e in events]
        self.assertIn("no_new_articles", event_types)

    @patch('backend.pipeline.fetch_news_items')
    async def test_error_handling_no_fake_data(self, mock_fetch):
        """Tests that when news source fails, ingestion_error is emitted without fabricating data."""
        events = []
        async def mock_broadcast(event: dict):
            events.append(event)

        mock_fetch.side_effect = ConnectionError("API service unreachable")

        new_articles = await pipeline.ingest_news_for_ticker(
            ticker="GOOG",
            existing_urls=set(),
            on_activity=mock_broadcast,
            limit=5
        )

        self.assertEqual(len(new_articles), 0)
        error_events = [e for e in events if e.get("type") == "ingestion_error"]
        self.assertTrue(len(error_events) > 0)
        self.assertEqual(error_events[0].get("ticker"), "GOOG")
        self.assertIn("API service unreachable", error_events[0].get("detail"))

    @patch('backend.ingestion_scheduler.database.load_all_watchlist_tickers')
    @patch('backend.ingestion_scheduler.pipeline._load_existing_urls_sync')
    @patch('backend.ingestion_scheduler.pipeline.ingest_news_for_ticker', new_callable=AsyncMock)
    async def test_scheduler_full_cycle(self, mock_ingest_ticker, mock_load_urls, mock_load_tickers):
        """Tests that run_cycle orchestrates all watchlist tickers with cycle-level events."""
        events = []
        async def mock_broadcast(event: dict):
            events.append(event)

        mock_load_tickers.return_value = ["Tesla", "Apple"]
        mock_load_urls.return_value = set()
        mock_ingest_ticker.return_value = [{'url': 'http://news.com/1'}]

        scheduler = MarketNewsScheduler(broadcast_func=mock_broadcast)
        scheduler._running = True

        result = await scheduler.run_cycle()

        self.assertEqual(result.get("status"), "completed")
        self.assertEqual(result.get("total_new_articles"), 2)
        self.assertEqual(mock_ingest_ticker.call_count, 2)

        event_types = [e.get("type") for e in events]
        self.assertIn("ingestion_cycle_started", event_types)
        self.assertIn("ingestion_cycle_completed", event_types)

        completed_event = next(e for e in events if e.get("type") == "ingestion_cycle_completed")
        self.assertEqual(completed_event.get("new_articles_count"), 2)
        self.assertEqual(completed_event.get("tickers"), ["Tesla", "Apple"])


if __name__ == '__main__':
    unittest.main()
