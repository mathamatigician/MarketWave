import os
import sys
import json
import unittest
from unittest.mock import MagicMock, patch
import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sec_edgar
from backend.agents.tools import fetch_filings_tool
from backend.agents.orchestrator import filings_agent_config
from config import settings


# Sample mock data matching SEC EDGAR API formats
MOCK_COMPANY_TICKERS = {
    "0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."},
    "1": {"cik_str": 1318605, "ticker": "TSLA", "title": "Tesla, Inc."},
    "2": {"cik_str": 789019, "ticker": "MSFT", "title": "MICROSOFT CORP"},
}

MOCK_AAPL_SUBMISSIONS = {
    "cik": "0000320193",
    "entityType": "operating",
    "sic": "3571",
    "name": "Apple Inc.",
    "tickers": ["AAPL"],
    "filings": {
        "recent": {
            "accessionNumber": [
                "0000320193-24-000106",
                "0000320193-24-000080",
                "0000320193-24-000050",
                "0000320193-24-000010",
                "0000320193-24-000001",
            ],
            "filingDate": [
                "2024-11-01",
                "2024-08-02",
                "2024-05-03",
                "2024-02-02",
                "2024-01-15",
            ],
            "reportDate": [
                "2024-09-28",
                "2024-06-29",
                "2024-03-30",
                "2023-12-30",
                "2024-01-15",
            ],
            "form": [
                "10-K",
                "10-Q",
                "10-Q",
                "10-Q",
                "4",
            ],
            "primaryDocument": [
                "aapl-20240928.htm",
                "aapl-20240629.htm",
                "aapl-20240330.htm",
                "aapl-20231230.htm",
                "form4.xml",
            ],
            "primaryDocDescription": [
                "10-K Annual Report",
                "10-Q Quarterly Report Q3",
                "10-Q Quarterly Report Q2",
                "10-Q Quarterly Report Q1",
                "Statement of Changes in Beneficial Ownership",
            ],
            "items": ["", "", "", "", ""],
        }
    }
}


class TestSECEdgarResolution(unittest.TestCase):
    def setUp(self):
        sec_edgar.clear_cik_cache()

    def tearDown(self):
        sec_edgar.clear_cik_cache()

    @patch("sec_edgar.requests.get")
    def test_ticker_to_cik_resolution_success(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = MOCK_COMPANY_TICKERS
        mock_get.return_value = mock_resp

        res = sec_edgar.resolve_ticker_to_cik("AAPL")
        self.assertIsNotNone(res)
        self.assertEqual(res["cik"], "0000320193")
        self.assertEqual(res["ticker"], "AAPL")
        self.assertEqual(res["company_name"], "Apple Inc.")

    @patch("sec_edgar.requests.get")
    def test_company_name_resolution_via_map(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = MOCK_COMPANY_TICKERS
        mock_get.return_value = mock_resp

        res = sec_edgar.resolve_ticker_to_cik("Tesla")
        self.assertIsNotNone(res)
        self.assertEqual(res["cik"], "0001318605")
        self.assertEqual(res["ticker"], "TSLA")

    @patch("sec_edgar.requests.get")
    def test_in_memory_caching_avoids_repeated_network_calls(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = MOCK_COMPANY_TICKERS
        mock_get.return_value = mock_resp

        # First call fetches from SEC
        res1 = sec_edgar.resolve_ticker_to_cik("AAPL")
        self.assertEqual(mock_get.call_count, 1)

        # Second call uses memory cache
        res2 = sec_edgar.resolve_ticker_to_cik("AAPL")
        self.assertEqual(mock_get.call_count, 1)
        self.assertEqual(res1, res2)

    @patch("sec_edgar.requests.get")
    def test_unknown_ticker_returns_none(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = MOCK_COMPANY_TICKERS
        mock_get.return_value = mock_resp

        res = sec_edgar.resolve_ticker_to_cik("UNKNOWNXYZ")
        self.assertIsNone(res)

    def test_invalid_or_empty_ticker_returns_none(self):
        self.assertIsNone(sec_edgar.resolve_ticker_to_cik(""))
        self.assertIsNone(sec_edgar.resolve_ticker_to_cik("   "))
        self.assertIsNone(sec_edgar.resolve_ticker_to_cik(None))


class TestSECFilingURLGeneration(unittest.TestCase):
    def test_build_filing_url_with_primary_document(self):
        url = sec_edgar.build_filing_url(
            cik="0000320193",
            accession_number="0000320193-24-000106",
            primary_document="aapl-20240928.htm"
        )
        self.assertEqual(
            url,
            "https://www.sec.gov/Archives/edgar/data/320193/000032019324000106/aapl-20240928.htm"
        )

    def test_build_filing_url_without_primary_document(self):
        url = sec_edgar.build_filing_url(
            cik="0000320193",
            accession_number="0000320193-24-000106",
            primary_document=None
        )
        self.assertEqual(
            url,
            "https://www.sec.gov/Archives/edgar/data/320193/000032019324000106/"
        )

    def test_build_filing_url_with_integer_cik(self):
        url = sec_edgar.build_filing_url(
            cik="320193",
            accession_number="0000320193-24-000106",
            primary_document="doc.htm"
        )
        self.assertEqual(
            url,
            "https://www.sec.gov/Archives/edgar/data/320193/000032019324000106/doc.htm"
        )


class TestSECFilingRetrieval(unittest.TestCase):
    def setUp(self):
        sec_edgar.clear_cik_cache()

    def tearDown(self):
        sec_edgar.clear_cik_cache()

    @patch("sec_edgar.requests.get")
    def test_valid_filing_response_parsing_and_prioritization(self, mock_get):
        def side_effect(url, headers, timeout):
            resp = MagicMock()
            if "company_tickers.json" in url:
                resp.status_code = 200
                resp.json.return_value = MOCK_COMPANY_TICKERS
            elif "submissions" in url:
                resp.status_code = 200
                resp.json.return_value = MOCK_AAPL_SUBMISSIONS
            return resp

        mock_get.side_effect = side_effect

        result = sec_edgar.fetch_sec_filings("AAPL", limit=3)
        self.assertEqual(result["ticker"], "AAPL")
        self.assertEqual(result["cik"], "0000320193")
        self.assertEqual(result["filings_count"], 3)
        self.assertEqual(len(result["filings"]), 3)

        # First filing should be 10-K
        f0 = result["filings"][0]
        self.assertEqual(f0["filing_type"], "10-K")
        self.assertEqual(f0["filing_date"], "2024-11-01")
        self.assertEqual(f0["accession_number"], "0000320193-24-000106")
        self.assertEqual(f0["primary_document"], "aapl-20240928.htm")
        self.assertEqual(
            f0["filing_url"],
            "https://www.sec.gov/Archives/edgar/data/320193/000032019324000106/aapl-20240928.htm"
        )
        self.assertIn("10-K", f0["short_description"])

    @patch("sec_edgar.requests.get")
    def test_rate_limit_handling(self, mock_get):
        def side_effect(url, headers, timeout):
            resp = MagicMock()
            if "company_tickers.json" in url:
                resp.status_code = 200
                resp.json.return_value = MOCK_COMPANY_TICKERS
            elif "submissions" in url:
                resp.status_code = 429
            return resp

        mock_get.side_effect = side_effect

        result = sec_edgar.fetch_sec_filings("AAPL")
        self.assertIn("Rate limit", result.get("error", ""))
        self.assertEqual(result["filings"], [])

    @patch("sec_edgar.requests.get")
    def test_malformed_submissions_response(self, mock_get):
        def side_effect(url, headers, timeout):
            resp = MagicMock()
            if "company_tickers.json" in url:
                resp.status_code = 200
                resp.json.return_value = MOCK_COMPANY_TICKERS
            elif "submissions" in url:
                resp.status_code = 200
                resp.json.return_value = "NOT_A_DICT"
            return resp

        mock_get.side_effect = side_effect

        result = sec_edgar.fetch_sec_filings("AAPL")
        self.assertIn("Malformed", result.get("error", ""))
        self.assertEqual(result["filings"], [])

    @patch("sec_edgar.requests.get")
    def test_network_timeout_handling(self, mock_get):
        def side_effect(url, headers, timeout):
            if "company_tickers.json" in url:
                resp = MagicMock()
                resp.status_code = 200
                resp.json.return_value = MOCK_COMPANY_TICKERS
                return resp
            raise requests.Timeout("Connection timed out")

        mock_get.side_effect = side_effect

        result = sec_edgar.fetch_sec_filings("AAPL")
        self.assertIn("timed out", result.get("error", ""))
        self.assertEqual(result["filings"], [])


class TestFetchFilingsToolAndAgent(unittest.TestCase):
    def setUp(self):
        sec_edgar.clear_cik_cache()

    def tearDown(self):
        sec_edgar.clear_cik_cache()

    @patch("sec_edgar.requests.get")
    def test_fetch_filings_tool_output_format_and_guardrails(self, mock_get):
        def side_effect(url, headers, timeout):
            resp = MagicMock()
            if "company_tickers.json" in url:
                resp.status_code = 200
                resp.json.return_value = MOCK_COMPANY_TICKERS
            elif "submissions" in url:
                resp.status_code = 200
                resp.json.return_value = MOCK_AAPL_SUBMISSIONS
            return resp

        mock_get.side_effect = side_effect

        tool_output = fetch_filings_tool("AAPL", limit=2)
        self.assertIn("<untrusted_source_content>", tool_output)
        self.assertIn("</untrusted_source_content>", tool_output)
        self.assertIn("adversarial", tool_output)

        # Extract enclosed JSON
        start_idx = tool_output.index("<untrusted_source_content>\n") + len("<untrusted_source_content>\n")
        end_idx = tool_output.index("\n</untrusted_source_content>")
        json_str = tool_output[start_idx:end_idx]
        parsed = json.loads(json_str)

        self.assertEqual(parsed["ticker"], "AAPL")
        self.assertEqual(parsed["filings_count"], 2)
        self.assertEqual(len(parsed["filings"]), 2)

    def test_filings_agent_config_narrow_instructions(self):
        self.assertIsNotNone(filings_agent_config)
        self.assertIn("GlobePulse Filings Analyst", filings_agent_config.system_instructions)
        self.assertIn("Use SEC filings only as evidence", filings_agent_config.system_instructions)
        self.assertIn("Never invent filing information", filings_agent_config.system_instructions)
        self.assertIn(fetch_filings_tool, filings_agent_config.tools)

    @patch("sec_edgar.requests.get")
    def test_sec_user_agent_header_forwarded(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = MOCK_COMPANY_TICKERS
        mock_get.return_value = mock_resp

        sec_edgar.resolve_ticker_to_cik("AAPL", user_agent="CustomTestAgent/2.0 (test@test.com)")
        self.assertEqual(mock_get.call_count, 1)
        headers_sent = mock_get.call_args[1]["headers"]
        self.assertEqual(headers_sent["User-Agent"], "CustomTestAgent/2.0 (test@test.com)")


if __name__ == "__main__":
    unittest.main()
