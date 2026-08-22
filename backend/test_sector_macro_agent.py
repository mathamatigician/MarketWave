import os
import sys
import json
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sector_macro
from backend.agents.tools import get_sector_macro_tool
from backend.agents.orchestrator import sector_macro_agent_config


MOCK_AAPL_PROFILE = {
    "AAPL": {
        "sector": "Technology",
        "industry": "Consumer Electronics",
        "shortName": "Apple Inc.",
        "longName": "Apple Inc.",
    }
}

MOCK_AAPL_PRICES = [
    {"time": "2026-07-20", "value": 200.0},
    {"time": "2026-07-25", "value": 210.0},
    {"time": "2026-08-01", "value": 220.0},
    {"time": "2026-08-19", "value": 230.0},
]

MOCK_XLK_PRICES = [
    {"time": "2026-07-20", "value": 100.0},
    {"time": "2026-07-25", "value": 102.0},
    {"time": "2026-08-01", "value": 105.0},
    {"time": "2026-08-19", "value": 110.0},
]


class TestSectorMacroCalculations(unittest.TestCase):
    def test_company_return_calculation(self):
        perf = sector_macro.calculate_performance(MOCK_AAPL_PRICES)
        self.assertIsNotNone(perf)
        self.assertEqual(perf["start_price"], 200.0)
        self.assertEqual(perf["end_price"], 230.0)
        self.assertEqual(perf["start_date"], "2026-07-20")
        self.assertEqual(perf["end_date"], "2026-08-19")
        # (230 - 200) / 200 = 0.15 = 15.0%
        self.assertEqual(perf["return_pct"], 15.0)
        self.assertEqual(perf["return_decimal"], 0.15)
        self.assertEqual(perf["data_points"], 4)

    def test_benchmark_return_calculation(self):
        perf = sector_macro.calculate_performance(MOCK_XLK_PRICES)
        self.assertIsNotNone(perf)
        self.assertEqual(perf["start_price"], 100.0)
        self.assertEqual(perf["end_price"], 110.0)
        # (110 - 100) / 100 = 0.10 = 10.0%
        self.assertEqual(perf["return_pct"], 10.0)
        self.assertEqual(perf["return_decimal"], 0.10)

    def test_relative_performance_calculation(self):
        comp_perf = sector_macro.calculate_performance(MOCK_AAPL_PRICES)
        bench_perf = sector_macro.calculate_performance(MOCK_XLK_PRICES)
        # Company: +15.0%, Benchmark: +10.0% -> Relative: +5.0% (outperformed by 5%)
        rel_perf = round(comp_perf["return_pct"] - bench_perf["return_pct"], 2)
        self.assertEqual(rel_perf, 5.0)

    def test_empty_or_insufficient_price_series(self):
        self.assertIsNone(sector_macro.calculate_performance([]))
        self.assertIsNone(sector_macro.calculate_performance([{"time": "2026-08-01", "value": 100.0}]))
        self.assertIsNone(sector_macro.calculate_performance(None))
        self.assertIsNone(sector_macro.calculate_performance([{"time": "2026-08-01", "value": 0.0}, {"time": "2026-08-02", "value": 10.0}]))


class TestBenchmarkAndProfileSelection(unittest.TestCase):
    def test_sector_benchmark_selection(self):
        bench = sector_macro.select_benchmark("AAPL", sector="Technology")
        self.assertIsNotNone(bench)
        self.assertEqual(bench["symbol"], "XLK")
        self.assertIn("Technology", bench["name"])

        bench_fin = sector_macro.select_benchmark("JPM", sector="Financial Services")
        self.assertEqual(bench_fin["symbol"], "XLF")

    def test_indian_market_benchmark_selection(self):
        bench_ns = sector_macro.select_benchmark("RELIANCE.NS", sector="Energy")
        self.assertEqual(bench_ns["symbol"], "^NSEI")
        self.assertEqual(bench_ns["name"], "NIFTY 50 Index")

        bench_bo = sector_macro.select_benchmark("TCS.BO")
        self.assertEqual(bench_bo["symbol"], "^NSEI")

    def test_missing_sector_falls_back_to_us_market_index(self):
        bench = sector_macro.select_benchmark("UNKNOWN_US", sector=None)
        self.assertEqual(bench["symbol"], "SPY")

    def test_empty_symbol_returns_none(self):
        self.assertIsNone(sector_macro.select_benchmark(""))
        self.assertIsNone(sector_macro.select_benchmark(None))

    def test_resolve_symbol_company_map(self):
        self.assertEqual(sector_macro.resolve_symbol("Tesla"), "TSLA")
        self.assertEqual(sector_macro.resolve_symbol("Apple"), "AAPL")
        self.assertEqual(sector_macro.resolve_symbol("TSLA"), "TSLA")
        self.assertEqual(sector_macro.resolve_symbol("  msft  "), "MSFT")
        self.assertEqual(sector_macro.resolve_symbol(""), "")


class TestSectorMacroRetrieval(unittest.TestCase):
    @patch("sector_macro.Ticker")
    @patch("sector_macro.functions.get_stock_history")
    def test_valid_ticker_market_context_retrieval(self, mock_get_history, mock_ticker):
        # Mock asset profile
        mock_instance = MagicMock()
        mock_instance.asset_profile = MOCK_AAPL_PROFILE
        mock_ticker.return_value = mock_instance

        # Mock stock histories for AAPL and XLK
        def history_side_effect(symbol, period, interval):
            if symbol == "AAPL":
                return MOCK_AAPL_PRICES
            elif symbol == "XLK":
                return MOCK_XLK_PRICES
            return []

        mock_get_history.side_effect = history_side_effect

        data = sector_macro.fetch_sector_macro_data("AAPL", period="30d")
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["ticker"], "AAPL")
        self.assertEqual(data["company_name"], "Apple Inc.")
        self.assertEqual(data["sector"], "Technology")
        self.assertEqual(data["industry"], "Consumer Electronics")
        self.assertEqual(data["benchmark"], "XLK")
        self.assertIsNotNone(data["company_performance"])
        self.assertEqual(data["company_performance"]["return_pct"], 15.0)
        self.assertIsNotNone(data["benchmark_performance"])
        self.assertEqual(data["benchmark_performance"]["return_pct"], 10.0)
        self.assertEqual(data["relative_performance_pct"], 5.0)
        self.assertEqual(data["sources"], ["Yahoo Finance"])
        self.assertIsNotNone(data["sector_context"])

    @patch("sector_macro.Ticker")
    @patch("sector_macro.functions.get_stock_history")
    def test_missing_sector_handling(self, mock_get_history, mock_ticker):
        mock_instance = MagicMock()
        mock_instance.asset_profile = {"MOCK": {}}  # No sector
        mock_ticker.return_value = mock_instance

        mock_get_history.return_value = MOCK_AAPL_PRICES

        data = sector_macro.fetch_sector_macro_data("MOCK", period="30d")
        self.assertIsNone(data["sector"])
        self.assertIsNone(data["industry"])
        self.assertEqual(data["benchmark"], "SPY")
        self.assertIn("Sector classification unavailable", data["notes"])

    @patch("sector_macro.Ticker")
    @patch("sector_macro.functions.get_stock_history")
    def test_empty_or_failed_price_history_handling(self, mock_get_history, mock_ticker):
        mock_instance = MagicMock()
        mock_instance.asset_profile = MOCK_AAPL_PROFILE
        mock_ticker.return_value = mock_instance

        mock_get_history.return_value = []

        data = sector_macro.fetch_sector_macro_data("AAPL", period="30d")
        self.assertEqual(data["status"], "unavailable")
        self.assertIsNone(data["company_performance"])
        self.assertIsNone(data["relative_performance_pct"])
        self.assertIn("Company price history unavailable", data["notes"])

    def test_invalid_or_empty_ticker(self):
        data1 = sector_macro.fetch_sector_macro_data("")
        self.assertEqual(data1["status"], "error")
        self.assertIn("Invalid or missing", data1["error"])

        data2 = sector_macro.fetch_sector_macro_data(None)
        self.assertEqual(data2["status"], "error")

    @patch("sector_macro.Ticker")
    @patch("sector_macro.functions.get_stock_history")
    def test_exception_in_market_data_fetch(self, mock_get_history, mock_ticker):
        mock_ticker.side_effect = Exception("Yahoo Finance connection failed")
        mock_get_history.side_effect = Exception("Price fetch failed")

        data = sector_macro.fetch_sector_macro_data("AAPL")
        # Should not crash, returns structured response
        self.assertEqual(data["ticker"], "AAPL")
        self.assertEqual(data["status"], "unavailable")
        self.assertIsNone(data["company_performance"])


class TestSectorMacroToolAndAgent(unittest.TestCase):
    @patch("sector_macro.Ticker")
    @patch("sector_macro.functions.get_stock_history")
    def test_tool_output_format_and_guardrails(self, mock_get_history, mock_ticker):
        mock_instance = MagicMock()
        mock_instance.asset_profile = MOCK_AAPL_PROFILE
        mock_ticker.return_value = mock_instance

        def history_side_effect(symbol, period, interval):
            if symbol == "AAPL":
                return MOCK_AAPL_PRICES
            elif symbol == "XLK":
                return MOCK_XLK_PRICES
            return []

        mock_get_history.side_effect = history_side_effect

        tool_output = get_sector_macro_tool("AAPL", period="30d")
        self.assertIn("<untrusted_source_content>", tool_output)
        self.assertIn("</untrusted_source_content>", tool_output)
        self.assertIn("adversarial", tool_output)

        # Parse enclosed JSON
        start_idx = tool_output.index("<untrusted_source_content>\n") + len("<untrusted_source_content>\n")
        end_idx = tool_output.index("\n</untrusted_source_content>")
        json_str = tool_output[start_idx:end_idx]
        parsed = json.loads(json_str)

        self.assertEqual(parsed["ticker"], "AAPL")
        self.assertEqual(parsed["sector"], "Technology")
        self.assertEqual(parsed["relative_performance_pct"], 5.0)
        self.assertEqual(parsed["sources"], ["Yahoo Finance"])

    def test_sector_macro_agent_config(self):
        self.assertIsNotNone(sector_macro_agent_config)
        self.assertIn("GlobePulse Sector & Macro Analyst", sector_macro_agent_config.system_instructions)
        self.assertIn("Do not produce the final stock verdict", sector_macro_agent_config.system_instructions)
        self.assertIn("Do not fabricate sector information", sector_macro_agent_config.system_instructions)
        self.assertIn(get_sector_macro_tool, sector_macro_agent_config.tools)


if __name__ == "__main__":
    unittest.main()
