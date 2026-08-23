import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
# Also add the repo root -- same reasoning as test_pipeline_agents.py.
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pipeline


def _mock_response(status_code=200, json_data=None):
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_data if json_data is not None else []
    return resp


class TestFetchNewsItemsDispatch(unittest.TestCase):
    """fetch_news_items() should route to Finnhub when configured, and fall
    back to Google News RSS when it isn't -- this is the switch the rest of
    the pipeline depends on staying correct."""

    def test_uses_finhub_when_api_key_configured(self):
        with patch("pipeline.settings") as mock_settings, \
             patch("pipeline._fetch_news_items_finhub") as mock_finhub, \
             patch("pipeline._fetch_news_items_google_rss") as mock_rss:
            mock_settings.finhub_api_key = "fake-key"
            mock_finhub.return_value = [{"title": "x", "google_link": "y", "date": "1/1/2026"}]

            result = pipeline.fetch_news_items("Tesla", limit=5)

            mock_finhub.assert_called_once_with("Tesla", 5)
            mock_rss.assert_not_called()
            self.assertEqual(result, mock_finhub.return_value)

    def test_falls_back_to_google_rss_when_no_api_key(self):
        with patch("pipeline.settings") as mock_settings, \
             patch("pipeline._fetch_news_items_finhub") as mock_finhub, \
             patch("pipeline._fetch_news_items_google_rss") as mock_rss:
            mock_settings.finhub_api_key = None
            mock_rss.return_value = [{"title": "x", "google_link": "y", "date": "1/1/2026"}]

            result = pipeline.fetch_news_items("Tesla", limit=5)

            mock_rss.assert_called_once_with("Tesla", 5)
            mock_finhub.assert_not_called()
            self.assertEqual(result, mock_rss.return_value)


class TestFetchNewsItemsFinhub(unittest.TestCase):
    """Direct tests of the Finnhub fetch path itself."""

    def _articles(self, n, base_ts=1_700_000_000):
        return [
            {
                "headline": f"Headline {i}",
                "url": f"https://example-real-source.com/article-{i}",
                "datetime": base_ts + i,  # increasing -> higher i is more recent
            }
            for i in range(n)
        ]

    def test_resolves_company_name_to_symbol_in_request_url(self):
        with patch("pipeline.settings") as mock_settings, \
             patch("pipeline.requests.get") as mock_get:
            mock_settings.finhub_api_key = "fake-key"
            mock_get.return_value = _mock_response(200, [])

            pipeline._fetch_news_items_finhub("Tesla", 5)

            called_url = mock_get.call_args[0][0]
            self.assertIn("symbol=TSLA", called_url)
            self.assertIn("token=fake-key", called_url)

    def test_unmapped_ticker_passed_through_as_symbol(self):
        with patch("pipeline.settings") as mock_settings, \
             patch("pipeline.requests.get") as mock_get:
            mock_settings.finhub_api_key = "fake-key"
            mock_get.return_value = _mock_response(200, [])

            pipeline._fetch_news_items_finhub("XYZQ", 5)

            called_url = mock_get.call_args[0][0]
            self.assertIn("symbol=XYZQ", called_url)

    def test_caps_results_at_limit_most_recent_first(self):
        with patch("pipeline.settings") as mock_settings, \
             patch("pipeline.requests.get") as mock_get:
            mock_settings.finhub_api_key = "fake-key"
            mock_get.return_value = _mock_response(200, self._articles(10))

            items = pipeline._fetch_news_items_finhub("Tesla", 3)

            self.assertEqual(len(items), 3)
            # Most recent (highest datetime -> highest index) first.
            self.assertEqual(items[0]["title"], "Headline 9")
            self.assertEqual(items[1]["title"], "Headline 8")
            self.assertEqual(items[2]["title"], "Headline 7")

    def test_maps_response_fields_to_pipeline_item_shape(self):
        with patch("pipeline.settings") as mock_settings, \
             patch("pipeline.requests.get") as mock_get:
            mock_settings.finhub_api_key = "fake-key"
            mock_get.return_value = _mock_response(200, [
                {"headline": "Tesla beats estimates", "url": "https://real.example/a", "datetime": 1735689600},
            ])

            items = pipeline._fetch_news_items_finhub("Tesla", 5)

            self.assertEqual(len(items), 1)
            self.assertEqual(items[0]["title"], "Tesla beats estimates")
            self.assertEqual(items[0]["google_link"], "https://real.example/a")
            self.assertEqual(items[0]["date"], "1/1/2025")

    def test_skips_articles_with_no_url(self):
        with patch("pipeline.settings") as mock_settings, \
             patch("pipeline.requests.get") as mock_get:
            mock_settings.finhub_api_key = "fake-key"
            mock_get.return_value = _mock_response(200, [
                {"headline": "No URL here", "url": "", "datetime": 1735689600},
                {"headline": "Has URL", "url": "https://real.example/b", "datetime": 1735689601},
            ])

            items = pipeline._fetch_news_items_finhub("Tesla", 5)

            self.assertEqual(len(items), 1)
            self.assertEqual(items[0]["title"], "Has URL")

    def test_non_200_response_returns_empty_list(self):
        with patch("pipeline.settings") as mock_settings, \
             patch("pipeline.requests.get") as mock_get:
            mock_settings.finhub_api_key = "fake-key"
            mock_get.return_value = _mock_response(429, [])

            items = pipeline._fetch_news_items_finhub("Tesla", 5)

            self.assertEqual(items, [])

    def test_unexpected_response_shape_returns_empty_list(self):
        with patch("pipeline.settings") as mock_settings, \
             patch("pipeline.requests.get") as mock_get:
            mock_settings.finhub_api_key = "fake-key"
            mock_get.return_value = _mock_response(200, {"error": "not an array"})

            items = pipeline._fetch_news_items_finhub("Tesla", 5)

            self.assertEqual(items, [])

    def test_request_exception_returns_empty_list(self):
        with patch("pipeline.settings") as mock_settings, \
             patch("pipeline.requests.get", side_effect=Exception("network down")):
            mock_settings.finhub_api_key = "fake-key"

            items = pipeline._fetch_news_items_finhub("Tesla", 5)

            self.assertEqual(items, [])


if __name__ == "__main__":
    unittest.main()
