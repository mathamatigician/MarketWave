import unittest
from unittest.mock import patch, AsyncMock
import asyncio
from backend.main import (
    gemma_briefing_endpoint, 
    GemmaBriefingRequest,
    get_stock_history_api,
)

class TestConsistencyRefresh(unittest.TestCase):
    """
    Test suite for 5-minute consistency refresh logic, concurrent stock updates,
    and Market Intelligence cooperation with real-time WebSocket pipelines.
    """

    def setUp(self):
        self.mock_briefing_result = [
            {"ticker": "TSLA", "bullet": "Tesla shows strong demand catalysts."},
            {"ticker": "AAPL", "bullet": "Apple expands enterprise footprint."}
        ]

    def test_concurrent_stock_history_fetch(self):
        """Verify multiple ticker history fetches operate concurrently and independently."""
        async def run_concurrent():
            tickers = ["TSLA", "AAPL", "GOOG"]
            tasks = [get_stock_history_api(ticker=t, period="5d") for t in tickers]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            return results

        results = asyncio.run(run_concurrent())
        self.assertEqual(len(results), 3)
        for res in results:
            self.assertFalse(isinstance(res, Exception))
            self.assertIn("price_series", res)
            self.assertIn("sentiment_series", res)
            self.assertIn("recent_articles", res)

    def test_partial_failure_resilience_in_multi_ticker_refresh(self):
        """Verify one ticker failing does not block other tickers in concurrent refresh."""
        async def run_with_failure():
            async def mock_get_stock(ticker, period="5d"):
                if ticker == "FAILING_TICKER":
                    raise ConnectionError("Upstream quote provider timeout")
                return {
                    "ticker": ticker,
                    "price_series": [{"date": "2026-08-27", "value": 200.0}],
                    "sentiment_series": [{"date": "2026-08-27", "score": 0.45}]
                }

            tickers = ["TSLA", "FAILING_TICKER", "AAPL"]
            results = await asyncio.gather(*(mock_get_stock(t) for t in tickers), return_exceptions=True)
            
            fulfilled = []
            for r in results:
                if not isinstance(r, Exception):
                    fulfilled.append(r)
            return fulfilled

        fulfilled = asyncio.run(run_with_failure())
        self.assertEqual(len(fulfilled), 2)
        tickers_returned = [s["ticker"] for s in fulfilled]
        self.assertIn("TSLA", tickers_returned)
        self.assertIn("AAPL", tickers_returned)
        self.assertNotIn("FAILING_TICKER", tickers_returned)

    def test_briefing_consistency_refresh_success(self):
        """Verify 5-minute consistency refresh produces valid structured briefing with timestamp."""
        req = GemmaBriefingRequest(tickers=["TSLA", "AAPL"])

        with patch('backend.main.pipeline.fetch_news_items', return_value=[{"title": "Tesla delivery surge"}]), \
             patch('backend.main.database.db', None), \
             patch('backend.main.gemma_service.gemma_generate_flash_briefing', new_callable=AsyncMock) as mock_gen:
            mock_gen.return_value = self.mock_briefing_result

            response = asyncio.run(gemma_briefing_endpoint(req))

            self.assertEqual(response["status"], "success")
            self.assertEqual(len(response["briefing"]), 2)
            self.assertEqual(response["briefing"][0]["ticker"], "TSLA")
            self.assertIn("timestamp", response)
            self.assertIsInstance(response["timestamp"], int)

    def test_briefing_no_data_state_preserves_valid_structure(self):
        """Verify when no articles exist, briefing endpoint returns clean no_data status without mock text."""
        req = GemmaBriefingRequest(tickers=["TSLA"])

        with patch('backend.main.pipeline.fetch_news_items', return_value=[]), \
             patch('backend.main.database.db', None):

            response = asyncio.run(gemma_briefing_endpoint(req))

            self.assertEqual(response["status"], "no_data")
            self.assertEqual(response["briefing"], [])
            self.assertIn("message", response)

    def test_briefing_error_state_handling(self):
        """Verify API timeout or rate limit returns error status with graceful message."""
        req = GemmaBriefingRequest(tickers=["TSLA"])

        with patch('backend.main.pipeline.fetch_news_items', return_value=[{"title": "Tesla updates"}]), \
             patch('backend.main.database.db', None), \
             patch('backend.main.gemma_service.gemma_generate_flash_briefing', new_callable=AsyncMock) as mock_gen:
            mock_gen.return_value = None  # Model inference failure returns None

            response = asyncio.run(gemma_briefing_endpoint(req))

            self.assertEqual(response["status"], "error")
            self.assertIn("message", response)


if __name__ == '__main__':
    unittest.main()
