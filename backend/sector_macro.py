import os
import sys
import logging
from typing import Optional, Dict, Any, List

# Ensure parent directory is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import database
import functions
from yahooquery import Ticker

logger = logging.getLogger("SectorMacro")

# Extensible sector-to-benchmark mapping
DEFAULT_SECTOR_BENCHMARKS: Dict[str, Dict[str, str]] = {
    "Technology": {"symbol": "XLK", "name": "Technology Select Sector SPDR Fund"},
    "Financial Services": {"symbol": "XLF", "name": "Financial Select Sector SPDR Fund"},
    "Healthcare": {"symbol": "XLV", "name": "Health Care Select Sector SPDR Fund"},
    "Consumer Cyclical": {"symbol": "XLY", "name": "Consumer Discretionary Select Sector SPDR Fund"},
    "Consumer Defensive": {"symbol": "XLP", "name": "Consumer Staples Select Sector SPDR Fund"},
    "Energy": {"symbol": "XLE", "name": "Energy Select Sector SPDR Fund"},
    "Industrials": {"symbol": "XLI", "name": "Industrial Select Sector SPDR Fund"},
    "Basic Materials": {"symbol": "XLB", "name": "Materials Select Sector SPDR Fund"},
    "Utilities": {"symbol": "XLU", "name": "Utilities Select Sector SPDR Fund"},
    "Real Estate": {"symbol": "XLRE", "name": "Real Estate Select Sector SPDR Fund"},
    "Communication Services": {"symbol": "XLC", "name": "Communication Services Select Sector SPDR Fund"},
}

DEFAULT_US_MARKET_BENCHMARK: Dict[str, str] = {
    "symbol": "SPY",
    "name": "SPDR S&P 500 ETF Trust (SPY)",
}

DEFAULT_INDIA_MARKET_BENCHMARK: Dict[str, str] = {
    "symbol": "^NSEI",
    "name": "NIFTY 50 Index",
}


def resolve_symbol(ticker: str) -> str:
    """Resolves a company name or ticker string to a clean symbol."""
    if not ticker or not isinstance(ticker, str):
        return ""
    clean = ticker.strip()
    if not clean:
        return ""
    for name, sym in database.COMPANY_TICKER_MAP.items():
        if clean.lower() == name.lower() or clean.lower() == sym.lower():
            return sym
    return clean.upper()


def get_company_profile(symbol: str) -> Dict[str, Optional[str]]:
    """Retrieves sector and industry classification from Yahoo Finance asset profile."""
    if not symbol:
        return {"sector": None, "industry": None, "company_name": None}
    try:
        t = Ticker(symbol)
        prof = t.asset_profile
        if isinstance(prof, dict) and symbol in prof and isinstance(prof[symbol], dict):
            p = prof[symbol]
            return {
                "sector": p.get("sector"),
                "industry": p.get("industry"),
                "company_name": p.get("shortName") or p.get("longName"),
            }
        return {"sector": None, "industry": None, "company_name": None}
    except Exception as e:
        logger.warning(f"Failed to fetch profile for {symbol}: {e}")
        return {"sector": None, "industry": None, "company_name": None}


def calculate_performance(price_series: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Calculates return percentage and price metrics from a price series."""
    if not price_series or not isinstance(price_series, list) or len(price_series) < 2:
        return None
    try:
        first_entry = price_series[0]
        last_entry = price_series[-1]
        start_price = float(first_entry.get("value", 0.0))
        end_price = float(last_entry.get("value", 0.0))
        start_date = first_entry.get("time")
        end_date = last_entry.get("time")

        if start_price <= 0:
            return None

        return_dec = (end_price - start_price) / start_price
        return_pct = round(return_dec * 100, 2)

        return {
            "start_date": start_date,
            "end_date": end_date,
            "start_price": round(start_price, 2),
            "end_price": round(end_price, 2),
            "return_pct": return_pct,
            "return_decimal": round(return_dec, 4),
            "data_points": len(price_series),
        }
    except Exception as e:
        logger.warning(f"Error calculating performance: {e}")
        return None


def select_benchmark(symbol: str, sector: Optional[str] = None) -> Optional[Dict[str, str]]:
    """Selects an appropriate sector or broad market benchmark for the asset."""
    if not symbol:
        return None

    # Check for Indian market ticker
    if symbol.endswith(".NS") or symbol.endswith(".BO"):
        return DEFAULT_INDIA_MARKET_BENCHMARK.copy()

    # Check if sector benchmark is mapped
    if sector and sector in DEFAULT_SECTOR_BENCHMARKS:
        return DEFAULT_SECTOR_BENCHMARKS[sector].copy()

    # Fallback to broad US market benchmark
    return DEFAULT_US_MARKET_BENCHMARK.copy()


def fetch_sector_macro_data(ticker: str, period: str = "30d") -> Dict[str, Any]:
    """Gathers sector classification, benchmark performance, and relative return context.

    Args:
        ticker: Stock ticker symbol or company name (e.g. 'AAPL', 'Tesla').
        period: Time duration for historical comparison (e.g. '30d', '1mo').

    Returns:
        Structured dictionary containing company performance, benchmark performance,
        relative performance, sector context, and source attribution.
    """
    if not ticker or not isinstance(ticker, str) or not ticker.strip():
        return {
            "ticker": str(ticker) if ticker is not None else "",
            "company_name": None,
            "sector": None,
            "industry": None,
            "period": period,
            "status": "error",
            "error": "Invalid or missing ticker provided.",
            "company_performance": None,
            "benchmark": None,
            "benchmark_name": None,
            "benchmark_performance": None,
            "relative_performance_pct": None,
            "sector_context": None,
            "sources": ["Yahoo Finance"],
            "notes": "No valid ticker provided.",
        }

    symbol = resolve_symbol(ticker)
    if not symbol:
        return {
            "ticker": ticker.strip(),
            "company_name": None,
            "sector": None,
            "industry": None,
            "period": period,
            "status": "error",
            "error": f"Could not resolve ticker for '{ticker}'.",
            "company_performance": None,
            "benchmark": None,
            "benchmark_name": None,
            "benchmark_performance": None,
            "relative_performance_pct": None,
            "sector_context": None,
            "sources": ["Yahoo Finance"],
            "notes": f"Ticker '{ticker}' could not be resolved.",
        }

    try:
        # 1. Fetch company profile (sector, industry, name)
        profile = get_company_profile(symbol)
        sector = profile.get("sector")
        industry = profile.get("industry")
        comp_name = profile.get("company_name") or ticker.strip()

        # 2. Fetch company price history
        try:
            comp_history = functions.get_stock_history(symbol, period=period, interval="1d")
        except Exception as e:
            logger.warning(f"Error getting stock history for {symbol}: {e}")
            comp_history = []
        comp_perf = calculate_performance(comp_history)

        # 3. Select benchmark
        bench_info = select_benchmark(symbol, sector=sector)
        bench_symbol = bench_info.get("symbol") if bench_info else None
        bench_name = bench_info.get("name") if bench_info else None

        # 4. Fetch benchmark price history
        bench_perf = None
        if bench_symbol:
            try:
                bench_history = functions.get_stock_history(bench_symbol, period=period, interval="1d")
            except Exception as e:
                logger.warning(f"Error getting benchmark history for {bench_symbol}: {e}")
                bench_history = []
            bench_perf = calculate_performance(bench_history)

        # 5. Calculate relative performance
        rel_perf = None
        if comp_perf is not None and bench_perf is not None:
            comp_ret = comp_perf["return_pct"]
            bench_ret = bench_perf["return_pct"]
            rel_perf = round(comp_ret - bench_ret, 2)

        # 6. Sector / Peer context observations
        sector_context = None
        if sector or industry:
            sector_context = {
                "sector": sector,
                "industry": industry,
                "benchmark_used": bench_name or bench_symbol,
                "classification_source": "Yahoo Finance Asset Profile",
            }

        # 7. Construct notes / diagnostic details
        notes_list = []
        if comp_perf is None:
            notes_list.append("Company price history unavailable for requested period.")
        if bench_perf is None and bench_symbol:
            notes_list.append(f"Benchmark price history for {bench_symbol} ({bench_name}) unavailable.")
        elif not bench_symbol:
            notes_list.append("No suitable benchmark identified.")
        if not sector:
            notes_list.append("Sector classification unavailable.")

        status = (
            "success"
            if (comp_perf is not None and bench_perf is not None)
            else ("partial" if comp_perf is not None else "unavailable")
        )

        return {
            "ticker": symbol,
            "company_name": comp_name,
            "sector": sector,
            "industry": industry,
            "period": period,
            "status": status,
            "company_performance": comp_perf,
            "benchmark": bench_symbol,
            "benchmark_name": bench_name,
            "benchmark_performance": bench_perf,
            "relative_performance_pct": rel_perf,
            "sector_context": sector_context,
            "sources": ["Yahoo Finance"],
            "notes": "; ".join(notes_list) if notes_list else "Market and benchmark data retrieved successfully.",
        }
    except Exception as e:
        logger.error(f"Unexpected error in fetch_sector_macro_data for {symbol}: {e}")
        return {
            "ticker": symbol,
            "company_name": ticker.strip(),
            "sector": None,
            "industry": None,
            "period": period,
            "status": "unavailable",
            "error": f"Failed to retrieve sector and macro data: {str(e)}",
            "company_performance": None,
            "benchmark": None,
            "benchmark_name": None,
            "benchmark_performance": None,
            "relative_performance_pct": None,
            "sector_context": None,
            "sources": ["Yahoo Finance"],
            "notes": f"Error occurred during data retrieval: {str(e)}",
        }
