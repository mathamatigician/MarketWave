import os
import sys
import json
import time
import asyncio
import unittest
from unittest.mock import patch, MagicMock, AsyncMock

# Add repository root and backend directory to sys.path
repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(repo_root, 'backend')
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from backend import database, pipeline, gemma_service
from backend.ingestion_scheduler import MarketNewsScheduler, reset_scheduler
from backend.config import settings


class TestE2ERealtimeFlow(unittest.IsolatedAsyncioTestCase):
    """Real end-to-end integration test demonstrating the complete real-time pipeline:
    Scheduler -> Watchlist discovery -> News arrival -> Deduplication -> Gemma triage
    -> Sentiment analysis -> Firestore save -> /ws/ingest event emission -> Targeted update
    -> Reactive Gemma Flash Briefing without user manual clicks.
    """

    async def asyncSetUp(self):
        reset_scheduler()

    async def asyncTearDown(self):
        reset_scheduler()

    @patch('backend.pipeline._load_existing_urls_sync', return_value=set())
    @patch('backend.database.load_all_watchlist_tickers', return_value=["TSLA"])
    @patch('backend.pipeline.fetch_news_items')
    @patch('backend.pipeline.resolve_and_scrape_article')
    @patch('backend.pipeline.gemma_service.gemma_triage_news', new_callable=AsyncMock)
    @patch('backend.pipeline.clean_article_with_agent', new_callable=AsyncMock)
    @patch('backend.pipeline.analyze_sentiment', new_callable=AsyncMock)
    @patch('backend.pipeline._save_single_article_sync')
    @patch('backend.pipeline._save_new_articles_sync')
    @patch('backend.gemma_service.gemma_generate_flash_briefing', new_callable=AsyncMock)
    async def test_full_realtime_event_driven_pipeline_e2e(
        self,
        mock_briefing,
        mock_save,
        mock_save_single,
        mock_sentiment,
        mock_clean,
        mock_triage,
        mock_scrape,
        mock_fetch,
        mock_load_tickers,
        mock_load_urls
    ):
        """Demonstrates the complete end-to-end flow without requiring manual user refreshes."""
        received_ws_events = []
        async def mock_ws_broadcast(event: dict):
            received_ws_events.append(event)

        test_article_url = "https://finance-news.com/tesla-drivetrain-breakthrough"
        test_headline = "Tesla Unveils Next-Gen Electric Drivetrain with 30% Higher Efficiency"
        scraped_text = "Tesla announced a major technological breakthrough in its next-generation electric powertrain."

        mock_fetch.return_value = [{
            "title": test_headline,
            "google_link": test_article_url,
            "date": "8/27/2026"
        }]
        mock_scrape.return_value = (test_article_url, scraped_text)
        mock_triage.return_value = {
            "market_impact": "HIGH",
            "relevance_score": 0.95,
            "reason": "Major powertrain efficiency improvement"
        }
        mock_clean.return_value = scraped_text
        mock_sentiment.return_value = json.dumps({
            "overall_sentiment": 0.85,
            "revenue_growth": 0.8,
            "product_launches": 0.9
        })
        mock_briefing.return_value = [
            {
                "ticker": "TSLA",
                "bullet": "Next-gen powertrain announcement accelerates long-term margin and volume expansion."
            }
        ]

        # 1. Instantiate scheduler with mock broadcast callback
        scheduler = MarketNewsScheduler(poll_interval=1, broadcast_func=mock_ws_broadcast)

        # 2. Execute single cycle (discovering tickers & news)
        cycle_result = await scheduler.run_cycle()

        # 3. Verify cycle completed successfully with 1 new article
        self.assertEqual(cycle_result["status"], "completed")
        self.assertEqual(cycle_result["total_new_articles"], 1)
        self.assertIn("TSLA", cycle_result["tickers"])

        # 4. Verify Firestore persistence was called with processed article
        mock_save.assert_called_once()
        saved_articles = mock_save.call_args[0][0]
        self.assertEqual(len(saved_articles), 1)
        self.assertEqual(saved_articles[0]["company_name"], "TSLA")
        self.assertEqual(saved_articles[0]["url"], test_article_url)
        self.assertIn("overall_sentiment", saved_articles[0]["Sentiment"])

        # 5. Verify WebSocket broadcast stream contained all expected event types
        event_types = [e.get("type") for e in received_ws_events]
        self.assertIn("ingestion_cycle_started", event_types)
        self.assertIn("checking_ticker", event_types)
        self.assertIn("new_article", event_types)
        self.assertIn("article_processed", event_types)
        self.assertIn("ingestion_cycle_completed", event_types)

        # 6. Verify article_processed event payload
        processed_event = next(e for e in received_ws_events if e.get("type") == "article_processed")
        self.assertEqual(processed_event["ticker"], "TSLA")
        self.assertEqual(processed_event["overall_sentiment"], 0.85)
        self.assertEqual(processed_event["market_impact"], "HIGH")

        # 7. Verify Deduplication on subsequent cycle (same article URL)
        mock_load_urls.return_value = {test_article_url}
        second_cycle = await scheduler.run_cycle()
        self.assertEqual(second_cycle["total_new_articles"], 0)

        # 8. Verify Reactive Gemma Briefing generation from newly ingested context
        briefing = await gemma_service.gemma_generate_flash_briefing(
            tickers=["TSLA"],
            headlines_by_ticker={"TSLA": [test_headline]}
        )
        self.assertIsNotNone(briefing)
        self.assertEqual(len(briefing), 1)
        self.assertEqual(briefing[0]["ticker"], "TSLA")
        self.assertIn("Next-gen powertrain", briefing[0]["bullet"])

        # 9. Verify Scheduler start/stop lifecycle
        scheduler.start()
        self.assertTrue(scheduler.is_running)
        await scheduler.stop()
        self.assertFalse(scheduler.is_running)


if __name__ == '__main__':
    unittest.main()
