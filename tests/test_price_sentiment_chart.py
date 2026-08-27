import unittest
import pandas as pd
import numpy as np


def normalize_date_str(d: str) -> str:
    if not d:
        return ""
    if len(d) == 10 and d[4] == '-' and d[7] == '-':
        return d
    parts = d.split('/')
    if len(parts) == 3:
        m, day, y = parts[0].zfill(2), parts[1].zfill(2), parts[2]
        year = f"20{y}" if len(y) == 2 else y
        return f"{year}-{m}-{day}"
    try:
        return pd.to_datetime(d).strftime('%Y-%m-%d')
    except Exception:
        return d


def build_unified_chart_dataset(price_series, sentiment_series, recent_articles):
    """Python reference implementation of the frontend chart dataset builder."""
    articles_by_date = {}
    for art in recent_articles:
        nd = normalize_date_str(art.get("date", ""))
        if nd:
            articles_by_date.setdefault(nd, []).append(art)

    sentiment_by_date = {}
    for s in sentiment_series:
        nd = normalize_date_str(s.get("time") or s.get("date", ""))
        if nd:
            score = s.get("score")
            if score is None and s.get("value") is not None:
                is_pos = "0, 150" in s.get("color", "")
                score = s["value"] / 100.0 if is_pos else -(s["value"] / 100.0)
            if score is not None:
                sentiment_by_date[nd] = round(float(score), 2)

    all_dates = set()
    for p in price_series:
        nd = normalize_date_str(p.get("time") or p.get("date", ""))
        if nd:
            all_dates.add(nd)
    for s in sentiment_series:
        nd = normalize_date_str(s.get("time") or s.get("date", ""))
        if nd:
            all_dates.add(nd)
    for a in recent_articles:
        nd = normalize_date_str(a.get("date", ""))
        if nd:
            all_dates.add(nd)

    sorted_dates = sorted(list(all_dates))
    dataset = []
    last_known_close = None

    for d in sorted_dates:
        p_item = next((p for p in price_series if normalize_date_str(p.get("time") or p.get("date", "")) == d), None)
        close = None
        if p_item and p_item.get("value") is not None:
            close = p_item["value"]
            last_known_close = close
        elif last_known_close is not None:
            close = last_known_close

        arts = articles_by_date.get(d, [])
        valid_scores = []
        for a in arts:
            sent = a.get("sentiment")
            if isinstance(sent, dict) and sent.get("overall_sentiment") is not None:
                try:
                    valid_scores.append(float(sent["overall_sentiment"]))
                except (ValueError, TypeError):
                    pass

        sentiment = None
        article_count = 0

        if valid_scores:
            sentiment = round(sum(valid_scores) / len(valid_scores), 2)
            article_count = len(arts)
        elif d in sentiment_by_date:
            sentiment = sentiment_by_date[d]
            article_count = 1
        else:
            # CRITICAL: Do NOT forward-fill sentiment
            sentiment = None
            article_count = 0

        dataset.append({
            "date": d,
            "close": close,
            "sentiment": sentiment,
            "article_count": article_count,
            "articles": arts
        })

    return dataset


class TestPriceSentimentChart(unittest.TestCase):

    def setUp(self):
        self.sample_price_series = [
            {"time": "2026-08-25", "value": 350.25},
            {"time": "2026-08-26", "value": 345.82},
            {"time": "2026-08-27", "value": 348.10}
        ]
        self.sample_recent_articles = [
            {
                "date": "8/27/2026",
                "content": "Tesla overvalued after rally",
                "sentiment": {"overall_sentiment": -0.20}
            },
            {
                "date": "8/27/2026",
                "content": "Tesla autonomous ride-hailing expansion",
                "sentiment": {"overall_sentiment": 0.40}
            },
            {
                "date": "8/26/2026",
                "content": "Strong technical forecast",
                "sentiment": {"overall_sentiment": 0.30}
            }
        ]

    def test_positive_sentiment_above_zero(self):
        """1. Positive sentiment renders above zero (> 0.0)."""
        dataset = build_unified_chart_dataset(self.sample_price_series, [], self.sample_recent_articles)
        aug26 = next(d for d in dataset if d["date"] == "2026-08-26")
        self.assertIsNotNone(aug26["sentiment"])
        self.assertGreater(aug26["sentiment"], 0.0)
        self.assertEqual(aug26["sentiment"], 0.30)

    def test_negative_sentiment_below_zero(self):
        """2. Negative sentiment renders below zero (< 0.0)."""
        articles = [
            {"date": "8/27/2026", "content": "Negative recall news", "sentiment": {"overall_sentiment": -0.45}}
        ]
        dataset = build_unified_chart_dataset(self.sample_price_series, [], articles)
        aug27 = next(d for d in dataset if d["date"] == "2026-08-27")
        self.assertIsNotNone(aug27["sentiment"])
        self.assertLess(aug27["sentiment"], 0.0)
        self.assertEqual(aug27["sentiment"], -0.45)

    def test_neutral_sentiment_at_zero(self):
        """3. Neutral sentiment renders at zero (0.00)."""
        articles = [
            {"date": "8/27/2026", "content": "Standard shareholder meeting", "sentiment": {"overall_sentiment": 0.0}}
        ]
        dataset = build_unified_chart_dataset(self.sample_price_series, [], articles)
        aug27 = next(d for d in dataset if d["date"] == "2026-08-27")
        self.assertEqual(aug27["sentiment"], 0.0)

    def test_missing_sentiment_stays_null(self):
        """4. Missing sentiment stays null without fabricated zero bars."""
        # Aug 25 has price data but no articles or sentiment
        dataset = build_unified_chart_dataset(self.sample_price_series, [], self.sample_recent_articles)
        aug25 = next(d for d in dataset if d["date"] == "2026-08-25")
        self.assertIsNone(aug25["sentiment"])
        self.assertEqual(aug25["article_count"], 0)

    def test_multiple_articles_aggregated_arithmetic_mean(self):
        """5 & 6. Multiple articles on one day are aggregated via arithmetic mean with correct article_count."""
        # Aug 27 has two articles: -0.20 and +0.40 -> mean = 0.10, count = 2
        dataset = build_unified_chart_dataset(self.sample_price_series, [], self.sample_recent_articles)
        aug27 = next(d for d in dataset if d["date"] == "2026-08-27")
        self.assertEqual(aug27["sentiment"], 0.10)
        self.assertEqual(aug27["article_count"], 2)

    def test_price_and_sentiment_aligned_by_date(self):
        """7. Price and sentiment are strictly aligned by date."""
        dataset = build_unified_chart_dataset(self.sample_price_series, [], self.sample_recent_articles)
        aug26 = next(d for d in dataset if d["date"] == "2026-08-26")
        self.assertEqual(aug26["close"], 345.82)
        self.assertEqual(aug26["sentiment"], 0.30)

    def test_no_forward_fill_of_sentiment(self):
        """8. No forward-filling of sentiment across dates."""
        prices = [
            {"time": "2026-08-20", "value": 100.0},
            {"time": "2026-08-21", "value": 102.0},
            {"time": "2026-08-22", "value": 105.0}
        ]
        articles = [
            {"date": "2026-08-20", "sentiment": {"overall_sentiment": 0.80}}
        ]
        dataset = build_unified_chart_dataset(prices, [], articles)
        day1 = next(d for d in dataset if d["date"] == "2026-08-20")
        day2 = next(d for d in dataset if d["date"] == "2026-08-21")
        day3 = next(d for d in dataset if d["date"] == "2026-08-22")

        self.assertEqual(day1["sentiment"], 0.80)
        self.assertIsNone(day2["sentiment"])
        self.assertIsNone(day3["sentiment"])


if __name__ == '__main__':
    unittest.main()
