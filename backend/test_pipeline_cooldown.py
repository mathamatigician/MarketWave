import os
import sys
import time
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
# Also add the repo root (parent of backend/) so that main.py's own
# `from backend.agents.orchestrator import ...` can resolve `backend` as a
# top-level (namespace) package -- it isn't on sys.path by default when
# these tests are invoked from within backend/ (e.g. `cd backend && python3
# -m unittest test_pipeline_cooldown`). Same fix as test_pipeline_agents.py.
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import HTTPException

import main


class TestPipelineCooldown(unittest.TestCase):
    def setUp(self):
        main._last_ticker_run.clear()

    def test_first_call_for_a_ticker_is_not_gated(self):
        self.assertNotIn("TSLA", main._last_ticker_run)
        # Directly exercises the same lookup trigger_pipeline() does.
        now = time.time()
        last_run = main._last_ticker_run.get("TSLA")
        gated = last_run is not None and (now - last_run) < main._PIPELINE_COOLDOWN_SECONDS
        self.assertFalse(gated)

    def test_second_call_within_window_is_gated(self):
        main._last_ticker_run["TSLA"] = time.time()
        now = time.time()
        last_run = main._last_ticker_run.get("TSLA")
        gated = last_run is not None and (now - last_run) < main._PIPELINE_COOLDOWN_SECONDS
        self.assertTrue(gated)

    def test_call_after_window_passes(self):
        main._last_ticker_run["TSLA"] = time.time() - main._PIPELINE_COOLDOWN_SECONDS - 1
        now = time.time()
        last_run = main._last_ticker_run.get("TSLA")
        gated = last_run is not None and (now - last_run) < main._PIPELINE_COOLDOWN_SECONDS
        self.assertFalse(gated)


class TestTriggerPipelineTickerValidation(unittest.TestCase):
    """Covers the fix for an unrecognized `ticker` string bypassing the
    admin_key requirement entirely (cooldown alone doesn't stop a scripted
    caller from varying the ticker string on every request)."""

    def setUp(self):
        main._last_ticker_run.clear()

    def test_recognized_ticker_skips_admin_key_requirement(self):
        bg = MagicMock()
        with patch.object(main.database, "load_all_watchlist_tickers", return_value=["TSLA", "AAPL"]):
            result = main.trigger_pipeline(bg, ticker="TSLA", admin_key=None)

        self.assertEqual(result["status"], "started")
        bg.add_task.assert_called_once_with(
            main.pipeline.run_pipeline, "TSLA", on_activity=main.broadcast_ingest_activity
        )

    def test_unrecognized_ticker_falls_through_to_admin_gated_path(self):
        bg = MagicMock()
        with patch.object(main.database, "load_all_watchlist_tickers", return_value=["TSLA", "AAPL"]), \
             patch.object(main.settings, "admin_key", "correct-secret"):
            with self.assertRaises(HTTPException) as ctx:
                main.trigger_pipeline(bg, ticker="NOT_A_REAL_TICKER", admin_key="wrong-guess")

        self.assertEqual(ctx.exception.status_code, 403)
        bg.add_task.assert_not_called()
        # Also confirms the bypass is actually closed: varying the
        # unrecognized ticker string per request can't rack up free cooldown
        # entries, because it never reaches the cooldown branch at all.
        self.assertNotIn("NOT_A_REAL_TICKER", main._last_ticker_run)

    def test_unrecognized_ticker_with_correct_admin_key_still_runs_unscoped(self):
        # Matches the documented ruling: an unrecognized ticker falls
        # through to the *same* path an unscoped (ticker=None) call takes,
        # not a new rejection path -- so a valid admin_key still works, but
        # the resulting run is unscoped (ticker=None goes to run_pipeline).
        bg = MagicMock()
        with patch.object(main.database, "load_all_watchlist_tickers", return_value=["TSLA", "AAPL"]), \
             patch.object(main.settings, "admin_key", "correct-secret"):
            result = main.trigger_pipeline(bg, ticker="NOT_A_REAL_TICKER", admin_key="correct-secret")

        self.assertEqual(result["status"], "started")
        bg.add_task.assert_called_once_with(
            main.pipeline.run_pipeline, None, on_activity=main.broadcast_ingest_activity
        )


class TestBroadcastIngestActivityConcurrency(unittest.IsolatedAsyncioTestCase):
    """Covers the fix for RuntimeError: Set changed size during iteration,
    triggered when a client connects/disconnects while a broadcast is
    in-flight."""

    async def asyncSetUp(self):
        main._ingest_websockets.clear()

    async def test_broadcast_survives_socket_set_mutation_mid_iteration(self):
        ws_a = MagicMock()
        ws_a.send_json = AsyncMock()

        ws_c = MagicMock()
        ws_c.send_json = AsyncMock()

        async def mutate_during_send(event):
            # Simulates a new client connecting (or another one
            # disconnecting) concurrently with the broadcast loop -- exactly
            # what the ingest_activity_websocket route does to this same
            # set on every real connect/disconnect.
            main._ingest_websockets.add(ws_c)

        ws_b = MagicMock()
        ws_b.send_json = AsyncMock(side_effect=mutate_during_send)

        main._ingest_websockets.update({ws_a, ws_b})

        try:
            await main.broadcast_ingest_activity({"type": "test"})
        except RuntimeError as e:
            self.fail(f"broadcast_ingest_activity raised on concurrent mutation: {e}")

        ws_a.send_json.assert_awaited_once_with({"type": "test"})
        ws_b.send_json.assert_awaited_once_with({"type": "test"})
        # ws_c joined mid-broadcast; it's fine (and correct) that it did not
        # receive this particular event, it just must not have crashed the
        # loop for ws_a/ws_b.
        ws_c.send_json.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
