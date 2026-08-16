import os
import sys
import unittest
from unittest.mock import patch

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import database


class TestLoadAllWatchlistTickersCache(unittest.TestCase):
    """Covers Important #4: load_all_watchlist_tickers() must cache its
    result for _WATCHLIST_CACHE_TTL_SECONDS, since it's now called on every
    unauthenticated POST /api/pipeline/run?ticker=X request in main.py --
    without a cache, that's read amplification against the entire `users`
    Firestore collection (via load_users())."""

    def setUp(self):
        # Reset module-level cache state before each test so tests don't
        # leak into each other.
        database._watchlist_tickers_cache = None
        database._watchlist_tickers_cached_at = 0.0
        self.addCleanup(self._reset_cache)

    def _reset_cache(self):
        database._watchlist_tickers_cache = None
        database._watchlist_tickers_cached_at = 0.0

    def test_second_call_within_ttl_does_not_reinvoke_load_users(self):
        with patch.object(database, "load_users", return_value={"a@x.com": {"watchlist": "TSLA,AAPL"}}) as mock_load_users:
            first = database.load_all_watchlist_tickers()
            second = database.load_all_watchlist_tickers()

        self.assertEqual(mock_load_users.call_count, 1)
        self.assertEqual(first, second)
        self.assertEqual(first, ["AAPL", "TSLA"])

    def test_call_after_ttl_expires_reinvokes_load_users(self):
        with patch.object(database, "load_users", return_value={"a@x.com": {"watchlist": "TSLA"}}) as mock_load_users:
            database.load_all_watchlist_tickers()
            self.assertEqual(mock_load_users.call_count, 1)

            # Simulate TTL expiry by backdating the cache timestamp rather
            # than patching time.time() globally (less invasive to the
            # production code, per the brief's own suggestion).
            database._watchlist_tickers_cached_at -= (database._WATCHLIST_CACHE_TTL_SECONDS + 1)

            database.load_all_watchlist_tickers()
            self.assertEqual(mock_load_users.call_count, 2)


if __name__ == "__main__":
    unittest.main()
