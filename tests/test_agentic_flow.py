import os
import sys
import unittest
from unittest.mock import patch, MagicMock, AsyncMock

# Ensure parent directory is in sys.path so we can import backend packages
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.agents.tools import fetch_news_tool, get_stock_history_tool
from backend.agents.orchestrator import orchestrator_config, research_agent_config, sentiment_analyst_config
from backend.agents.triggers import check_watchlist_sentiment

class TestAgenticFlow(unittest.TestCase):

    @patch('backend.agents.tools.pipeline.fetch_news_items')
    @patch('backend.agents.tools.pipeline.resolve_and_scrape_article')
    def test_fetch_news_tool(self, mock_scrape, mock_fetch):
        # Setup mocks
        mock_fetch.return_value = [{'google_link': 'http://gnews.com/1', 'title': 'Test Article'}]
        mock_scrape.return_value = ('http://actualsite.com/1', 'Test content body for the article.')
        
        # Run tool
        result = fetch_news_tool('TSLA')
        
        # Verify
        self.assertIn('Title: Test Article', result)
        self.assertIn('URL: http://actualsite.com/1', result)
        self.assertIn('Content: Test content body', result)
        mock_fetch.assert_called_once_with('TSLA', limit=5)
        mock_scrape.assert_called_once_with('http://gnews.com/1')

    @patch('backend.agents.tools.functions.get_stock_history')
    def test_get_stock_history_tool(self, mock_get_history):
        # Setup mocks
        mock_get_history.return_value = [{'time': '2026-07-06', 'value': 250.0}]
        
        # Run tool
        result = get_stock_history_tool('TSLA', period='30d')
        
        # Verify
        self.assertIn('time', result)
        self.assertIn('value', result)
        self.assertIn('250.0', result)
        mock_get_history.assert_called_once_with('TSLA', '30d', interval='1d')

    def test_agent_configurations(self):
        # Verify orchestrator and sub-agents configurations loaded correctly
        self.assertEqual(orchestrator_config.model, 'gemini-2.5-flash')
        self.assertTrue(orchestrator_config.capabilities.enable_subagents)
        self.assertEqual(research_agent_config.model, 'gemini-2.5-flash')
        self.assertEqual(sentiment_analyst_config.model, 'gemini-2.5-flash')
        self.assertIsNotNone(sentiment_analyst_config.response_schema)

    @patch('backend.agents.triggers.database.load_all_watchlist_tickers')
    @patch('backend.agents.triggers.pipeline.fetch_news_items')
    @patch('backend.agents.triggers.pipeline.resolve_and_scrape_article')
    @patch('backend.agents.triggers.pipeline.score_sentiment_with_agent', new_callable=AsyncMock)
    @patch('backend.agents.triggers.database.db')
    @patch('backend.agents.triggers.get_alerts_file_path')
    def test_watchdog_trigger(self, mock_alerts_path, mock_db, mock_score, mock_scrape, mock_fetch, mock_load_tickers):
        # Setup temp alerts file path
        mock_alerts_path.return_value = 'test_alerts.json'

        # Setup mocks
        mock_load_tickers.return_value = ['TSLA']
        mock_fetch.return_value = [{'google_link': 'http://gnews.com/1', 'title': 'Negative News'}]
        mock_scrape.return_value = ('http://site.com/1', 'Bad news content')
        mock_score.return_value = {'overall_sentiment': -0.8}
        
        # Run watchdog trigger (using asyncio since check_watchlist_sentiment is async)
        import asyncio
        ctx = MagicMock()
        asyncio.run(check_watchlist_sentiment(ctx))
        
        # Verify alerts file was created
        self.assertTrue(os.path.exists('test_alerts.json'))
        
        # Clean up
        if os.path.exists('test_alerts.json'):
            os.remove('test_alerts.json')

if __name__ == '__main__':
    unittest.main()
