import os
import sys
import logging
import requests
from typing import Optional, Dict, Any, List

# Ensure parent directory is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import settings
import database

logger = logging.getLogger("SECEdgar")

# In-memory cache for ticker -> CIK & company metadata
_TICKER_CIK_CACHE: Dict[str, Dict[str, str]] = {}

PRIORITY_FORMS = {"10-K", "10-Q", "8-K", "10-K/A", "10-Q/A", "8-K/A"}


def clear_cik_cache() -> None:
    """Clears the in-memory ticker-to-CIK cache (useful for test isolation)."""
    _TICKER_CIK_CACHE.clear()


def build_filing_url(cik: str, accession_number: str, primary_document: Optional[str] = None) -> str:
    """Builds the canonical SEC EDGAR archive URL for a filing document.

    Args:
        cik: Central Index Key (with or without leading zeroes).
        accession_number: SEC accession number (e.g., '0000320193-24-000106').
        primary_document: Primary document file name (e.g., 'aapl-20240928.htm').
    """
    try:
        cik_clean = str(int(cik))
    except (ValueError, TypeError):
        cik_clean = str(cik).lstrip("0") or "0"

    accession_clean = accession_number.replace("-", "").strip()

    if primary_document and primary_document.strip():
        return f"https://www.sec.gov/Archives/edgar/data/{cik_clean}/{accession_clean}/{primary_document.strip()}"
    return f"https://www.sec.gov/Archives/edgar/data/{cik_clean}/{accession_clean}/"


def resolve_ticker_to_cik(ticker: str, user_agent: Optional[str] = None) -> Optional[Dict[str, str]]:
    """Resolves a stock ticker or company name to SEC CIK and metadata.

    Uses SEC's public company_tickers.json and caches results in-memory.

    Args:
        ticker: Stock ticker symbol or company name (e.g., 'AAPL', 'Tesla').
        user_agent: Optional custom User-Agent string.

    Returns:
        Dict with keys 'cik' (10-digit zero-padded), 'ticker', 'company_name',
        or None if the ticker cannot be resolved.
    """
    if not ticker or not isinstance(ticker, str):
        return None

    query = ticker.strip()
    if not query:
        return None

    # Check database.COMPANY_TICKER_MAP for company names (e.g., "Tesla" -> "TSLA")
    resolved_symbol = query.upper()
    for comp_name, comp_ticker in database.COMPANY_TICKER_MAP.items():
        if query.lower() == comp_name.lower() or query.lower() == comp_ticker.lower():
            resolved_symbol = comp_ticker.upper()
            break

    # Return cached resolution if present
    if resolved_symbol in _TICKER_CIK_CACHE:
        return _TICKER_CIK_CACHE[resolved_symbol]

    # Fetch SEC's public company tickers mapping
    ua = user_agent or getattr(settings, "sec_user_agent", None) or "GlobePulse/1.0 (admin@globepulse.local)"
    headers = {
        "User-Agent": ua,
        "Accept-Encoding": "gzip, deflate",
    }

    try:
        resp = requests.get(
            "https://www.sec.gov/files/company_tickers.json",
            headers=headers,
            timeout=10,
        )
        if resp.status_code != 200:
            logger.warning(f"SEC company_tickers.json request returned HTTP {resp.status_code}")
            return None

        data = resp.json()
        if isinstance(data, dict):
            for item in data.values():
                if isinstance(item, dict):
                    t = str(item.get("ticker", "")).strip().upper()
                    c = str(item.get("cik_str", "")).strip()
                    name = str(item.get("title", "")).strip()
                    if t and c:
                        _TICKER_CIK_CACHE[t] = {
                            "cik": c.zfill(10),
                            "ticker": t,
                            "company_name": name,
                        }

        return _TICKER_CIK_CACHE.get(resolved_symbol)

    except requests.RequestException as e:
        logger.error(f"Error fetching SEC company tickers for {query}: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error resolving CIK for {query}: {e}")
        return None


def fetch_sec_filings(
    ticker: str,
    limit: int = 5,
    user_agent: Optional[str] = None,
) -> Dict[str, Any]:
    """Retrieves recent SEC EDGAR filings for a given ticker or company name.

    Prioritizes 10-K, 10-Q, and 8-K filings and returns structured metadata
    with verified SEC EDGAR source URLs.

    Args:
        ticker: Stock ticker symbol or company name (e.g., 'AAPL', 'Tesla').
        limit: Maximum number of filings to return (default: 5).
        user_agent: Optional custom User-Agent header.

    Returns:
        Dict containing ticker, company_name, cik, filings list, and optional error.
    """
    if not ticker or not isinstance(ticker, str) or not ticker.strip():
        return {
            "ticker": str(ticker),
            "error": "Invalid ticker provided.",
            "filings": [],
        }

    resolved = resolve_ticker_to_cik(ticker, user_agent=user_agent)
    if not resolved:
        return {
            "ticker": ticker.strip().upper(),
            "error": f"Ticker or company '{ticker.strip()}' not found in SEC EDGAR database.",
            "filings": [],
        }

    cik = resolved["cik"]
    symbol = resolved["ticker"]
    company_name = resolved.get("company_name", symbol)

    ua = user_agent or getattr(settings, "sec_user_agent", None) or "GlobePulse/1.0 (admin@globepulse.local)"
    headers = {
        "User-Agent": ua,
        "Accept-Encoding": "gzip, deflate",
    }

    url = f"https://data.sec.gov/submissions/CIK{cik}.json"

    try:
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code == 429:
            return {
                "ticker": symbol,
                "company_name": company_name,
                "cik": cik,
                "error": "Rate limit exceeded by SEC EDGAR (HTTP 429).",
                "filings": [],
            }
        if resp.status_code != 200:
            return {
                "ticker": symbol,
                "company_name": company_name,
                "cik": cik,
                "error": f"SEC EDGAR request failed with HTTP {resp.status_code}.",
                "filings": [],
            }

        data = resp.json()
        if not isinstance(data, dict):
            return {
                "ticker": symbol,
                "company_name": company_name,
                "cik": cik,
                "error": "Malformed SEC EDGAR submissions response (expected JSON object).",
                "filings": [],
            }

        official_name = data.get("name") or company_name
        recent = data.get("filings", {}).get("recent", {})
        if not isinstance(recent, dict):
            return {
                "ticker": symbol,
                "company_name": official_name,
                "cik": cik,
                "error": "Missing or malformed recent filings section in SEC response.",
                "filings": [],
            }

        forms = recent.get("form", [])
        accessions = recent.get("accessionNumber", [])
        filing_dates = recent.get("filingDate", [])
        report_dates = recent.get("reportDate", [])
        primary_docs = recent.get("primaryDocument", [])
        primary_doc_descs = recent.get("primaryDocDescription", [])
        items_list = recent.get("items", [])

        total_entries = min(len(forms), len(accessions), len(filing_dates))
        if total_entries == 0:
            return {
                "ticker": symbol,
                "company_name": official_name,
                "cik": cik,
                "filings_count": 0,
                "filings": [],
            }

        def _extract_filing(idx: int) -> Dict[str, Any]:
            form_type = forms[idx] if idx < len(forms) else "UNKNOWN"
            acc_num = accessions[idx] if idx < len(accessions) else ""
            f_date = filing_dates[idx] if idx < len(filing_dates) else ""
            r_date = report_dates[idx] if idx < len(report_dates) else ""
            p_doc = primary_docs[idx] if idx < len(primary_docs) else ""
            p_desc = primary_doc_descs[idx] if idx < len(primary_doc_descs) else ""
            item_val = items_list[idx] if idx < len(items_list) else ""

            doc_url = build_filing_url(cik, acc_num, p_doc) if acc_num else ""

            if p_desc and p_desc.strip():
                desc = p_desc.strip()
            elif item_val and str(item_val).strip():
                desc = f"Form {form_type} (Items: {str(item_val).strip()})"
            elif r_date and str(r_date).strip():
                desc = f"Form {form_type} for period ending {str(r_date).strip()}"
            else:
                desc = f"Form {form_type} filed on {f_date}"

            return {
                "ticker": symbol,
                "company_name": official_name,
                "cik": cik,
                "filing_type": form_type,
                "filing_date": f_date,
                "accession_number": acc_num,
                "primary_document": p_doc,
                "filing_url": doc_url,
                "short_description": desc,
            }

        priority_filings: List[Dict[str, Any]] = []
        other_filings: List[Dict[str, Any]] = []

        for i in range(total_entries):
            form_name = forms[i] if i < len(forms) else ""
            if form_name in PRIORITY_FORMS:
                priority_filings.append(_extract_filing(i))
            else:
                other_filings.append(_extract_filing(i))

        selected_filings = priority_filings[:limit]
        if len(selected_filings) < limit:
            remaining = limit - len(selected_filings)
            selected_filings.extend(other_filings[:remaining])

        return {
            "ticker": symbol,
            "company_name": official_name,
            "cik": cik,
            "filings_count": len(selected_filings),
            "filings": selected_filings,
        }

    except requests.Timeout:
        logger.error(f"Timeout querying SEC EDGAR for CIK {cik}")
        return {
            "ticker": symbol,
            "company_name": company_name,
            "cik": cik,
            "error": "Request to SEC EDGAR timed out.",
            "filings": [],
        }
    except requests.RequestException as e:
        logger.error(f"Network error querying SEC EDGAR for CIK {cik}: {e}")
        return {
            "ticker": symbol,
            "company_name": company_name,
            "cik": cik,
            "error": f"Failed to connect to SEC EDGAR: {str(e)}",
            "filings": [],
        }
    except Exception as e:
        logger.error(f"Unexpected error processing SEC filings for CIK {cik}: {e}")
        return {
            "ticker": symbol,
            "company_name": company_name,
            "cik": cik,
            "error": f"Unexpected error processing SEC filings: {str(e)}",
            "filings": [],
        }
