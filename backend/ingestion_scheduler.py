import os
import sys
import time
import asyncio
import logging
from typing import Optional, Callable, Awaitable, Set, Dict, Any, List

# Ensure repo root and backend directory are in sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.dirname(backend_dir)
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

try:
    from backend.config import settings
except ImportError:
    from config import settings

try:
    from backend import database, pipeline
except ImportError:
    import database
    import pipeline

logger = logging.getLogger("IngestionScheduler")


class MarketNewsScheduler:
    """Persistent background scheduler for real-time market news ingestion.
    
    Continuously monitors all active tickers across user watchlists, detects
    newly published articles, processes them through the Gemma/Gemini pipeline,
    persists them to Firestore, and broadcasts real-time WebSocket events.
    """

    def __init__(self, poll_interval: Optional[int] = None, broadcast_func: Optional[Callable[[dict], Awaitable[None]]] = None):
        self._poll_interval: Optional[int] = poll_interval
        self._broadcast_func = broadcast_func
        self._running: bool = False
        self._task: Optional[asyncio.Task] = None
        self._cycle_lock = asyncio.Lock()
        self._ticker_lock = asyncio.Lock()
        self._in_progress_tickers: Set[str] = set()

    @property
    def poll_interval(self) -> int:
        """Dynamically retrieves the configured polling interval in seconds."""
        if self._poll_interval is not None:
            return max(1, self._poll_interval)
        if settings and hasattr(settings, "market_news_poll_seconds"):
            return max(1, int(settings.market_news_poll_seconds))
        env_val = os.environ.get("MARKET_NEWS_POLL_SECONDS")
        if env_val:
            try:
                return max(1, int(env_val))
            except ValueError:
                pass
        return 60

    @poll_interval.setter
    def poll_interval(self, value: int):
        self._poll_interval = max(1, int(value))

    @property
    def is_running(self) -> bool:
        return self._running and self._task is not None and not self._task.done()

    def is_ticker_in_progress(self, ticker: str) -> bool:
        """Checks if a given ticker or company name is currently being ingested."""
        if not ticker:
            return False
        clean = ticker.strip()
        mapped = database.COMPANY_TICKER_MAP.get(clean, clean)
        return clean in self._in_progress_tickers or mapped in self._in_progress_tickers

    async def mark_ticker_in_progress(self, ticker: str) -> bool:
        """Attempts to lock a ticker for ingestion. Returns False if already in progress."""
        clean = ticker.strip()
        mapped = database.COMPANY_TICKER_MAP.get(clean, clean)
        async with self._ticker_lock:
            if clean in self._in_progress_tickers or mapped in self._in_progress_tickers:
                return False
            self._in_progress_tickers.add(clean)
            self._in_progress_tickers.add(mapped)
            return True

    async def unmark_ticker_in_progress(self, ticker: str) -> None:
        """Releases the in-progress lock for a ticker."""
        clean = ticker.strip()
        mapped = database.COMPANY_TICKER_MAP.get(clean, clean)
        async with self._ticker_lock:
            self._in_progress_tickers.discard(clean)
            self._in_progress_tickers.discard(mapped)

    async def _emit(self, event: dict) -> None:
        """Emits an event to the registered broadcast handler."""
        if self._broadcast_func:
            try:
                await self._broadcast_func(event)
            except Exception as e:
                logger.warning(f"Broadcast callback error: {e}")

    def start(self, broadcast_func: Optional[Callable[[dict], Awaitable[None]]] = None) -> None:
        """Starts the persistent background ingestion loop."""
        if broadcast_func:
            self._broadcast_func = broadcast_func

        if self.is_running:
            logger.info("MarketNewsScheduler is already running. Skipping start.")
            return

        self._running = True
        self._task = asyncio.create_task(self._run_loop(), name="MarketNewsSchedulerLoop")
        logger.info(f"MarketNewsScheduler started with poll_interval={self.poll_interval}s")

    async def stop(self) -> None:
        """Gracefully stops the background ingestion loop."""
        if not self._running and (self._task is None or self._task.done()):
            return

        logger.info("Stopping MarketNewsScheduler...")
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await asyncio.wait_for(self._task, timeout=5.0)
            except asyncio.CancelledError:
                pass
            except asyncio.TimeoutError:
                logger.warning("MarketNewsScheduler task did not terminate within timeout.")
            except Exception as e:
                logger.error(f"Error during MarketNewsScheduler shutdown: {e}")
        self._task = None
        logger.info("MarketNewsScheduler stopped.")

    async def _run_loop(self) -> None:
        """Continuous background polling loop."""
        logger.info(f"MarketNewsScheduler main loop active. Polling every {self.poll_interval} seconds.")
        # Short initial delay on startup so other backend startup tasks complete cleanly
        try:
            await asyncio.sleep(2.0)
        except asyncio.CancelledError:
            return

        while self._running:
            try:
                await self.run_cycle()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Unhandled exception in ingestion cycle: {e}", exc_info=True)

            try:
                interval = self.poll_interval
                logger.debug(f"Sleeping for {interval}s before next ingestion cycle.")
                await asyncio.sleep(interval)
            except asyncio.CancelledError:
                break

    async def run_cycle(self) -> Dict[str, Any]:
        """Executes a single end-to-end ingestion cycle across all active watchlist tickers."""
        if self._cycle_lock.locked():
            logger.warning("Previous ingestion cycle is still running. Skipping this tick to prevent overlap.")
            return {"status": "skipped", "reason": "cycle_locked"}

        async with self._cycle_lock:
            start_time = time.time()
            # 1. Load active watchlist tickers
            tickers = await asyncio.to_thread(database.load_all_watchlist_tickers)
            if not tickers:
                logger.info("No active watchlist tickers found. Skipping cycle.")
                return {"status": "no_tickers", "count": 0}

            logger.info(f"Starting ingestion cycle for {len(tickers)} tickers: {tickers}")
            await self._emit({
                "type": "ingestion_cycle_started",
                "tickers": tickers,
                "timestamp": int(start_time)
            })

            # 2. Load existing URLs for deduplication
            existing_urls = set()
            try:
                existing_urls = await asyncio.to_thread(pipeline._load_existing_urls_sync)
            except Exception as e:
                logger.error(f"Error loading existing URLs from Firestore: {e}")

            total_new_articles = 0
            results_by_ticker = {}

            # 3. Process each ticker
            for ticker in tickers:
                if not self._running:
                    break

                # Acquire ticker lock
                acquired = await self.mark_ticker_in_progress(ticker)
                if not acquired:
                    logger.info(f"Ticker '{ticker}' is already in progress. Skipping for this cycle.")
                    continue

                try:
                    await self._emit({
                        "type": "checking_ticker",
                        "ticker": ticker,
                        "timestamp": int(time.time())
                    })

                    new_items = await pipeline.ingest_news_for_ticker(
                        ticker=ticker,
                        existing_urls=existing_urls,
                        on_activity=self._emit,
                        limit=5
                    )
                    count = len(new_items)
                    total_new_articles += count
                    results_by_ticker[ticker] = count
                    logger.info(f"Ticker '{ticker}' ingestion finished: {count} new articles.")
                except Exception as e:
                    logger.error(f"Error ingesting news for ticker '{ticker}': {e}", exc_info=True)
                    await self._emit({
                        "type": "ingestion_error",
                        "ticker": ticker,
                        "detail": str(e),
                        "timestamp": int(time.time())
                    })
                finally:
                    await self.unmark_ticker_in_progress(ticker)

            duration = round(time.time() - start_time, 2)
            logger.info(f"Ingestion cycle completed in {duration}s. {total_new_articles} new articles saved.")
            await self._emit({
                "type": "ingestion_cycle_completed",
                "tickers": tickers,
                "new_articles_count": total_new_articles,
                "timestamp": int(time.time())
            })

            return {
                "status": "completed",
                "tickers": tickers,
                "total_new_articles": total_new_articles,
                "results": results_by_ticker,
                "duration_seconds": duration
            }


# Singleton instance
_scheduler: Optional[MarketNewsScheduler] = None


def get_scheduler(poll_interval: Optional[int] = None, broadcast_func: Optional[Callable[[dict], Awaitable[None]]] = None) -> MarketNewsScheduler:
    """Returns the shared MarketNewsScheduler singleton instance."""
    global _scheduler
    if _scheduler is None:
        _scheduler = MarketNewsScheduler(poll_interval=poll_interval, broadcast_func=broadcast_func)
    elif broadcast_func is not None:
        _scheduler._broadcast_func = broadcast_func
    return _scheduler


def reset_scheduler() -> None:
    """Resets the singleton instance (primarily for testing)."""
    global _scheduler
    if _scheduler is not None and _scheduler.is_running:
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(_scheduler.stop())
        except Exception:
            pass
    _scheduler = None
