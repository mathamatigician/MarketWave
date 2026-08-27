import os
import sys
import time
import asyncio
import unittest
from unittest.mock import patch, MagicMock, AsyncMock

# Add parent directory and backend directory to sys.path
repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(repo_root, 'backend')
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from backend import gemma_service, database
from backend.config import settings


class TestLiveBriefing(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        pass

    async def test_automatic_briefing_trigger_with_valid_context(self):
        """Tests that when relevant headlines are available, Gemma synthesizes a structured briefing."""
        tickers = ["TSLA", "AAPL"]
        headlines = {
            "TSLA": ["Tesla expands Gigafactory production capacity", "New battery technology boosts efficiency"],
            "AAPL": ["Apple reports quarterly services revenue growth"]
        }

        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.choices = [
            MagicMock(message=MagicMock(content="""
[
  {"ticker": "TSLA", "bullet": "Production capacity expansion and battery efficiency gains drive strong outlook."},
  {"ticker": "AAPL", "bullet": "Record services revenue underscores steady recurring monetization."}
]
"""))
        ]
        mock_client.chat.completions.create.return_value = mock_response

        with patch('backend.gemma_service.get_hf_client', return_value=mock_client):
            briefing = await gemma_service.gemma_generate_flash_briefing(tickers, headlines)

            self.assertIsNotNone(briefing)
            self.assertEqual(len(briefing), 2)
            self.assertEqual(briefing[0]["ticker"], "TSLA")
            self.assertIn("battery efficiency", briefing[0]["bullet"])
            self.assertEqual(briefing[1]["ticker"], "AAPL")
            self.assertIn("services revenue", briefing[1]["bullet"])

    async def test_no_briefing_for_irrelevant_or_no_new_data(self):
        """Tests that if no relevant headlines exist for active tickers, an empty list is returned without fake catalysts."""
        tickers = ["NVDA", "MSFT"]
        # Empty headlines dictionary
        headlines = {}

        with patch('backend.gemma_service.get_hf_client') as mock_get_client:
            briefing = await gemma_service.gemma_generate_flash_briefing(tickers, headlines)

            # Must return empty list (no hallucinated static text or fake catalysts)
            self.assertEqual(briefing, [])
            # Must NOT call the LLM when there is no data
            mock_get_client.assert_not_called()

    async def test_gemma_failure_preserves_previous_briefing_state(self):
        """Tests that if Gemma inference fails, None is returned so caller preserves previous briefing."""
        tickers = ["TSLA"]
        headlines = {"TSLA": ["Breaking: Tesla announces new autonomous features."]}

        mock_client = MagicMock()
        mock_client.chat.completions.create.side_effect = RuntimeError("API Rate Limit Exceeded (429)")

        with patch('backend.gemma_service.get_hf_client', return_value=mock_client):
            briefing = await gemma_service.gemma_generate_flash_briefing(tickers, headlines)

            # Must return None indicating failure, NOT fake static text
            self.assertIsNone(briefing)

    async def test_debounce_behavior_batches_rapid_events(self):
        """Tests that debouncing mechanism collapses multiple rapid events into a single execution."""
        call_count = 0
        async def mock_briefing_task():
            nonlocal call_count
            call_count += 1

        # Simulate debouncer
        timer_task = None
        debounce_seconds = 0.05

        async def emit_event():
            nonlocal timer_task
            if timer_task and not timer_task.done():
                timer_task.cancel()

            async def delayed():
                await asyncio.sleep(debounce_seconds)
                await mock_briefing_task()

            timer_task = asyncio.create_task(delayed())

        # Fire 5 rapid events in succession
        for _ in range(5):
            await emit_event()
            await asyncio.sleep(0.01)

        # Await final debounce delay
        await asyncio.sleep(0.08)

        # Only 1 briefing synthesis call should have executed despite 5 rapid events
        self.assertEqual(call_count, 1)

    async def test_briefing_endpoint_response_structure(self):
        """Tests that /api/gemma/briefing endpoint returns timestamp, model info, and proper status."""
        from backend.main import app, GemmaBriefingRequest, gemma_briefing_endpoint

        req = GemmaBriefingRequest(tickers=["TSLA", "AAPL"])

        mock_briefing_result = [
            {"ticker": "TSLA", "bullet": "Tesla shows strong momentum in Q3 deliveries."}
        ]

        with patch('backend.main.pipeline.fetch_news_items', return_value=[{"title": "Tesla updates"}]), \
             patch('backend.main.database.db', None), \
             patch('backend.main.gemma_service.gemma_generate_flash_briefing', new_callable=AsyncMock) as mock_gen:
            mock_gen.return_value = mock_briefing_result

            response = await gemma_briefing_endpoint(req)

            self.assertEqual(response["status"], "success")
            self.assertIn("Gemma", response["model"])
            self.assertEqual(response["briefing"], mock_briefing_result)
            self.assertIn("timestamp", response)
            self.assertIsInstance(response["timestamp"], int)


if __name__ == '__main__':
    unittest.main()
