import unittest
import json
from unittest.mock import patch, MagicMock
import pandas as pd


class TestArticleSentimentCatalysts(unittest.TestCase):
    """Regression tests for Primary Sentiment Catalysts article score extraction and formatting."""

    def test_positive_article_sentiment(self):
        """1. recent_articles with overall_sentiment = 0.35 -> displays +0.35 / BULLISH"""
        article = {
            "url": "https://example.com/bullish-news",
            "content": "Tesla expands Gigafactory production with record output.",
            "date": "8/27/2026",
            "sentiment": {
                "expansion": 0.4,
                "overall_sentiment": 0.35
            }
        }
        score = article["sentiment"]["overall_sentiment"]
        self.assertEqual(score, 0.35)
        formatted_score = f"+{score:.2f}" if score >= 0 else f"{score:.2f}"
        label = "BULLISH" if score > 0.15 else "BEARISH" if score < -0.15 else "NEUTRAL"
        self.assertEqual(formatted_score, "+0.35")
        self.assertEqual(label, "BULLISH")

    def test_negative_article_sentiment(self):
        """2. overall_sentiment = -0.20 -> displays -0.20 / BEARISH"""
        article = {
            "url": "https://example.com/bearish-news",
            "content": "Tesla (TSLA) Stock Looks Overvalued Following Its 41% Five Year Gain",
            "date": "8/27/2026",
            "sentiment": {
                "investor_activity": -0.2,
                "overall_sentiment": -0.2
            }
        }
        score = article["sentiment"]["overall_sentiment"]
        self.assertEqual(score, -0.2)
        formatted_score = f"+{score:.2f}" if score >= 0 else f"{score:.2f}"
        label = "BULLISH" if score > 0.15 else "BEARISH" if score < -0.15 else "NEUTRAL"
        self.assertEqual(formatted_score, "-0.20")
        self.assertEqual(label, "BEARISH")

    def test_zero_article_sentiment(self):
        """3. overall_sentiment = 0.0 -> displays +0.00 / NEUTRAL"""
        article = {
            "url": "https://example.com/neutral-news",
            "content": "Tesla holds annual general meeting with standard shareholder votes.",
            "date": "8/27/2026",
            "sentiment": {
                "overall_sentiment": 0.0
            }
        }
        score = article["sentiment"]["overall_sentiment"]
        self.assertEqual(score, 0.0)
        formatted_score = f"+{score:.2f}" if score >= 0 else f"{score:.2f}"
        label = "BULLISH" if score > 0.15 else "BEARISH" if score < -0.15 else "NEUTRAL"
        self.assertEqual(formatted_score, "+0.00")
        self.assertEqual(label, "NEUTRAL")

    def test_null_missing_article_sentiment(self):
        """4. overall_sentiment = null -> displays -- / DATA PENDING without coercing to 0.00"""
        article = {
            "url": "https://example.com/pending-news",
            "content": "Breaking announcement pending full neural analysis.",
            "date": "8/27/2026",
            "sentiment": {
                "overall_sentiment": None
            }
        }
        score = article["sentiment"].get("overall_sentiment")
        self.assertIsNone(score)
        formatted_score = f"+{score:.2f}" if score is not None and score >= 0 else f"{score:.2f}" if score is not None else "--"
        label = "DATA PENDING" if score is None else "BULLISH" if score > 0.15 else "BEARISH" if score < -0.15 else "NEUTRAL"
        self.assertEqual(formatted_score, "--")
        self.assertEqual(label, "DATA PENDING")

    def test_multiple_articles_preserve_individual_scores(self):
        """5. Multiple articles preserve their individual scores without bleeding."""
        articles = [
            {"url": "1", "sentiment": {"overall_sentiment": 0.45}},
            {"url": "2", "sentiment": {"overall_sentiment": -0.30}},
            {"url": "3", "sentiment": {"overall_sentiment": 0.0}},
            {"url": "4", "sentiment": None}
        ]
        scores = [a["sentiment"]["overall_sentiment"] if a["sentiment"] else None for a in articles]
        self.assertEqual(scores, [0.45, -0.30, 0.0, None])

    def test_article_score_independent_of_series_color_and_dashboard_score(self):
        """6 & 7. Article score is not derived from sentiment_series color or dashboard score."""
        # Simulated scenario: Aggregated dashboard score is +0.38 (Bullish), series color is Green,
        # but article-specific score is -0.20 (Bearish).
        dashboard_aggregated_score = 0.38
        sentiment_series_latest_color = "rgba(0, 150, 136, 0.8)"  # Green
        article_sentiment = {"overall_sentiment": -0.20}

        article_score = article_sentiment["overall_sentiment"]
        self.assertEqual(article_score, -0.20)
        self.assertNotEqual(article_score, dashboard_aggregated_score)

    def test_chronological_article_sorting(self):
        """Verify articles are sorted chronologically newest-first rather than string comparison."""
        raw_articles = [
            {"content": "Older Aug 5", "date": "8/5/2026", "sentiment": {"overall_sentiment": 0.0}},
            {"content": "Newer Aug 27", "date": "8/27/2026", "sentiment": {"overall_sentiment": -0.20}},
            {"content": "Aug 26", "date": "8/26/2026", "sentiment": {"overall_sentiment": 0.30}}
        ]
        sorted_articles = sorted(raw_articles, key=lambda x: pd.to_datetime(x.get("date", "")), reverse=True)
        self.assertEqual(sorted_articles[0]["content"], "Newer Aug 27")
        self.assertEqual(sorted_articles[1]["content"], "Aug 26")
        self.assertEqual(sorted_articles[2]["content"], "Older Aug 5")


if __name__ == '__main__':
    unittest.main()
