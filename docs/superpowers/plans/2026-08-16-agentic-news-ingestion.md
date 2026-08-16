# Agentic News Ingestion + Live Activity Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the news-ingestion pipeline's two AI touchpoints (article
cleaning, sentiment scoring) to route through the existing `ResearchAgent`/
`SentimentAnalyst` agents instead of a direct `genai.Client()` call, and add
a live "Agent Activity" panel to the Dashboard so a user can watch
ingestion happen step-by-step.

**Architecture:** Keep the deterministic Python loop, dedup logic, and
Firestore persistence in `pipeline.run_pipeline()` exactly as they are.
Only the cleaning/scoring steps become real `Agent(...)` calls (via local
imports, to avoid a real circular import with `orchestrator.py`). Each
checkpoint fires an optional `on_activity` callback; `main.py` broadcasts
those to a new `/ws/ingest` WebSocket, mirroring `/ws/chat`'s existing
pattern. The hourly watchdog (`triggers.py`) gets the same sentiment-scoring
swap. A pre-existing bug (the "Run Pipeline" button 403s today) gets fixed
as part of this work.

**Tech Stack:** FastAPI + `google-antigravity` (backend), React + TypeScript
+ WebSocket (frontend), Firestore (persistence, unchanged).

**Spec:** `docs/superpowers/specs/2026-08-16-agentic-news-ingestion-design.md`

## Global Constraints

- Never import `backend/main.py` or `backend/agents/orchestrator.py` at
  module level from `backend/pipeline.py` — use local imports inside the
  specific async functions that need them (confirmed necessary: a
  top-level import creates a real circular import,
  `orchestrator.py → pipeline.py → orchestrator.py`).
- `pipeline.py`'s CLI entry point (`python pipeline.py --ticker X`) must
  keep working unchanged — `on_activity` defaults to `None`, every
  emission site guards on it before calling it.
- The unscoped ("run for every ticker across every user's watchlist")
  pipeline trigger keeps requiring `admin_key` — do not relax that path.
- `score_sentiment_with_agent()` must return `Optional[dict]` (`None` on
  failure) — NOT a neutral-default dict — matching
  `analyze_sentiment_gemini()`'s exact prior contract. `triggers.py`'s
  watchdog depends on `None` to exclude a failed scoring attempt from its
  average-sentiment calculation; a fabricated neutral score there would
  silently change its alert-triggering math.
- No new secrets, no new env vars. `ADMIN_KEY` usage narrows in scope; it
  is not removed.
- Verification inside ephemeral SDD worktrees uses `python3 -m py_compile`
  only for any file touching `main.py` or `orchestrator.py` (no working
  `.venv` there). This plan's own worktree (`.claude/worktrees/agentic-news-ingestion`)
  has a working `.venv` and may do real imports for final verification.
- Match `AgentChat.tsx`'s existing visual language exactly for
  `IngestActivity.tsx` (dark card, `Terminal`/`ChevronDown`/`ChevronUp`
  icons from `lucide-react`, `#00FF94` accent, monospace log rendering,
  collapse/expand interaction) — no new visual pattern for this feature.
- Existing behavior must be unaffected for anyone not triggering an
  ingest run: no change to `/ws/chat`, no change to the article/sentiment
  data shape stored in Firestore, no change to the unscoped admin pipeline
  trigger's required key.

---

### Task 1: Backend — agentic cleaning/scoring in `pipeline.py`, watchdog swap

**Files:**
- Modify: `backend/pipeline.py`
- Modify: `backend/agents/triggers.py`
- Test: `backend/test_pipeline_agents.py` (new)

**Interfaces:**
- Produces: `async def clean_article_with_agent(text: str, ticker: str, on_activity: Optional[Callable[[dict], Awaitable[None]]] = None) -> str`,
  `async def score_sentiment_with_agent(text: str, ticker: str, on_activity: Optional[Callable[[dict], Awaitable[None]]] = None) -> Optional[dict]`,
  `async def run_pipeline(ticker_arg: Optional[str] = None, on_activity: Optional[Callable[[dict], Awaitable[None]]] = None)`.
  Task 2 (`main.py`) consumes `run_pipeline`'s new signature exactly as
  given here — do not rename parameters.
- Consumes: `backend/agents/orchestrator.py`'s existing
  `research_agent_config` / `sentiment_analyst_config` (via local imports
  inside the two new functions — see Global Constraints).

**Before writing any code**, confirm the real `Agent`/response API shape
this plan assumes, since it's inferred from this repo's two existing call
sites (`main.py`'s `chat_websocket`, `orchestrator.py`'s
`get_orchestrator_response`) rather than SDK documentation:

```bash
cd backend && ../.venv/bin/python3 -c "
import google.antigravity
help(google.antigravity.Agent)
"
```

The pattern this plan uses — `async with Agent(config) as agent: response = await agent.chat(prompt); async for token_chunk in response: ...`
— matches both existing call sites exactly. If the installed package's
real interface differs in any way, use the *installed package's actual
interface*, not this plan's code verbatim — the two existing working call
sites in this repo are the ground truth, this plan's snippets are a
best-effort match to them.

- [ ] **Step 1: Add the two new functions' failing tests first**

Create `backend/test_pipeline_agents.py`:

```python
import os
import sys
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import pipeline


class TestCleanArticleWithAgent(unittest.IsolatedAsyncioTestCase):
    async def test_returns_agent_cleaned_text_on_success(self):
        mock_agent = AsyncMock()
        mock_agent.__aenter__.return_value = mock_agent
        mock_agent.__aexit__.return_value = None

        async def fake_response_iter():
            for chunk in ["Cleaned ", "article ", "text."]:
                yield chunk

        mock_response = fake_response_iter()
        mock_agent.chat = AsyncMock(return_value=mock_response)

        mock_agent_class = MagicMock(return_value=mock_agent)
        mock_research_config = MagicMock()

        with patch("google.antigravity.Agent", mock_agent_class), \
             patch("backend.agents.orchestrator.research_agent_config", mock_research_config):
            result = await pipeline.clean_article_with_agent("raw scraped text here", "TSLA")

        self.assertEqual(result, "Cleaned article text.")
        mock_agent_class.assert_called_once_with(mock_research_config)

    async def test_falls_back_to_regex_clean_on_agent_failure(self):
        mock_agent_class = MagicMock(side_effect=RuntimeError("agent unavailable"))

        with patch("google.antigravity.Agent", mock_agent_class), \
             patch("backend.agents.orchestrator.research_agent_config", MagicMock()):
            result = await pipeline.clean_article_with_agent("raw   scraped\n\ntext", "TSLA")

        # Falls back to the original regex whitespace-clean, never raises.
        self.assertEqual(result, "raw scraped text")

    async def test_emits_fallback_activity_event_on_agent_failure(self):
        mock_agent_class = MagicMock(side_effect=RuntimeError("agent unavailable"))
        emitted_events = []

        async def fake_on_activity(event):
            emitted_events.append(event)

        with patch("google.antigravity.Agent", mock_agent_class), \
             patch("backend.agents.orchestrator.research_agent_config", MagicMock()):
            await pipeline.clean_article_with_agent("raw text", "TSLA", on_activity=fake_on_activity)

        self.assertEqual(len(emitted_events), 1)
        self.assertEqual(emitted_events[0]["status"], "fallback")
        self.assertEqual(emitted_events[0]["agent"], "ResearchAgent")
        self.assertEqual(emitted_events[0]["ticker"], "TSLA")

    async def test_no_error_when_on_activity_omitted_on_failure(self):
        """on_activity is optional -- must not raise when the caller doesn't pass one."""
        mock_agent_class = MagicMock(side_effect=RuntimeError("agent unavailable"))

        with patch("google.antigravity.Agent", mock_agent_class), \
             patch("backend.agents.orchestrator.research_agent_config", MagicMock()):
            result = await pipeline.clean_article_with_agent("raw text", "TSLA")

        self.assertEqual(result, "raw text")


class TestScoreSentimentWithAgent(unittest.IsolatedAsyncioTestCase):
    async def test_returns_parsed_dict_on_success(self):
        mock_agent = AsyncMock()
        mock_agent.__aenter__.return_value = mock_agent
        mock_agent.__aexit__.return_value = None

        async def fake_response_iter():
            yield '{"overall_sentiment": 0.6, "layoffs": null}'

        mock_agent.chat = AsyncMock(return_value=fake_response_iter())
        mock_agent_class = MagicMock(return_value=mock_agent)
        mock_sentiment_config = MagicMock()

        with patch("google.antigravity.Agent", mock_agent_class), \
             patch("backend.agents.orchestrator.sentiment_analyst_config", mock_sentiment_config):
            result = await pipeline.score_sentiment_with_agent("article text", "TSLA")

        self.assertEqual(result, {"overall_sentiment": 0.6, "layoffs": None})
        mock_agent_class.assert_called_once_with(mock_sentiment_config)

    async def test_returns_none_on_agent_failure(self):
        """Must return None, not a fallback dict -- triggers.py's watchdog
        depends on None to exclude a failed score from its average."""
        mock_agent_class = MagicMock(side_effect=RuntimeError("agent unavailable"))

        with patch("google.antigravity.Agent", mock_agent_class), \
             patch("backend.agents.orchestrator.sentiment_analyst_config", MagicMock()):
            result = await pipeline.score_sentiment_with_agent("article text", "TSLA")

        self.assertIsNone(result)

    async def test_emits_fallback_activity_event_on_agent_failure(self):
        mock_agent_class = MagicMock(side_effect=RuntimeError("agent unavailable"))
        emitted_events = []

        async def fake_on_activity(event):
            emitted_events.append(event)

        with patch("google.antigravity.Agent", mock_agent_class), \
             patch("backend.agents.orchestrator.sentiment_analyst_config", MagicMock()):
            await pipeline.score_sentiment_with_agent("article text", "TSLA", on_activity=fake_on_activity)

        self.assertEqual(len(emitted_events), 1)
        self.assertEqual(emitted_events[0]["status"], "fallback")
        self.assertEqual(emitted_events[0]["agent"], "SentimentAnalyst")

    async def test_returns_none_on_malformed_json(self):
        mock_agent = AsyncMock()
        mock_agent.__aenter__.return_value = mock_agent
        mock_agent.__aexit__.return_value = None

        async def fake_response_iter():
            yield "not valid json"

        mock_agent.chat = AsyncMock(return_value=fake_response_iter())
        mock_agent_class = MagicMock(return_value=mock_agent)

        with patch("google.antigravity.Agent", mock_agent_class), \
             patch("backend.agents.orchestrator.sentiment_analyst_config", MagicMock()):
            result = await pipeline.score_sentiment_with_agent("article text", "TSLA")

        self.assertIsNone(result)


class TestAnalyzeSentimentStillAlwaysSucceeds(unittest.IsolatedAsyncioTestCase):
    async def test_falls_back_to_neutral_default_when_agent_scoring_fails(self):
        """analyze_sentiment() must keep its own always-succeeds contract --
        run_pipeline depends on never getting None from this one."""
        with patch("pipeline.score_sentiment_with_agent", AsyncMock(return_value=None)):
            result_json_str = await pipeline.analyze_sentiment("some text", "TSLA")

        import json
        result = json.loads(result_json_str)
        self.assertEqual(result["overall_sentiment"], 0.0)
        self.assertIsNone(result["layoffs"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && ../.venv/bin/python3 -m unittest test_pipeline_agents -v`
Expected: FAIL — `clean_article_with_agent`/`score_sentiment_with_agent`
don't exist yet, and `analyze_sentiment` is not yet `async`.

- [ ] **Step 3: Add `Callable`/`Awaitable` to the typing import**

Current (`backend/pipeline.py:12`):
```python
from typing import Optional
```
Change to:
```python
from typing import Optional, Callable, Awaitable
```

- [ ] **Step 4: Add the two new agent-calling functions**

Insert after `analyze_sentiment_gemini()` (which stays, unchanged) and
before `analyze_sentiment()` (`backend/pipeline.py`, currently ending
around line 181):

```python
async def clean_article_with_agent(text: str, ticker: str, on_activity: Optional[Callable[[dict], Awaitable[None]]] = None) -> str:
    """Cleans and focuses raw scraped article text using the ResearchAgent.

    Falls back to a basic regex whitespace-clean if the agent call fails
    for any reason -- ingestion must never fail outright just because the
    cleaning step did. Fires an "activity"/"fallback" event via
    on_activity (if provided) when that happens, so the failure is visible
    rather than silently masked -- this is the ONLY place that knows a
    fallback actually occurred, so it owns emitting it (the caller in
    run_pipeline only knows it's about to attempt cleaning, not whether
    that attempt will succeed).
    """
    # Local import: avoids a real circular import. orchestrator.py does
    # `from pipeline import TopicSentimentSchema` at its own top level; a
    # top-level import here, before this module finishes loading, breaks
    # with "cannot import name 'TopicSentimentSchema' from partially
    # initialized module 'pipeline'" (confirmed by direct reproduction
    # during this feature's design).
    try:
        from google.antigravity import Agent
        from backend.agents.orchestrator import research_agent_config

        async with Agent(research_agent_config) as agent:
            response = await agent.chat(
                f"Clean and summarize this scraped news article about {ticker} "
                f"for downstream sentiment analysis. Remove boilerplate, "
                f"navigation text, and ads. Keep the actual article content "
                f"intact:\n\n{text[:4000]}"
            )
            cleaned = ""
            async for token_chunk in response:
                cleaned += token_chunk
            cleaned = cleaned.strip()
            if cleaned:
                return cleaned
    except Exception as e:
        print(f"ResearchAgent cleaning failed for {ticker}, falling back to basic cleanup: {e}")
        if on_activity:
            try:
                await on_activity({"type": "activity", "agent": "ResearchAgent", "ticker": ticker, "status": "fallback", "detail": "Agent cleaning failed, using basic text cleanup"})
            except Exception:
                pass

    return re.sub(r'\s+', ' ', text).strip()


async def score_sentiment_with_agent(text: str, ticker: str, on_activity: Optional[Callable[[dict], Awaitable[None]]] = None) -> Optional[dict]:
    """Scores article sentiment using the SentimentAnalyst agent.

    Returns None on failure -- NOT a neutral-default dict -- matching
    analyze_sentiment_gemini()'s exact prior contract. triggers.py's
    watchdog depends on getting None back so it can exclude a failed
    scoring attempt from its average-sentiment calculation; substituting a
    fabricated neutral score here instead would silently change its
    alert-triggering math. Fires an "activity"/"fallback" event via
    on_activity (if provided) on failure, same reasoning as
    clean_article_with_agent above.
    """
    try:
        from google.antigravity import Agent
        from backend.agents.orchestrator import sentiment_analyst_config

        async with Agent(sentiment_analyst_config) as agent:
            prompt = (
                f"Analyze the news about {ticker} and return sentiment values "
                f"for the provided topics. The sentiment should be defined "
                f"based on whether it's good for the company and its "
                f"shareholders (positive) or bad (negative). Values must be "
                f"between -1 (most negative) and 1 (most positive), 0 for "
                f"neutral. If a topic is not mentioned, its value must be "
                f"null.\n\nArticle text:\n{text[:4000]}"
            )
            response = await agent.chat(prompt)
            result_text = ""
            async for token_chunk in response:
                result_text += token_chunk
            return json.loads(result_text)
    except Exception as e:
        print(f"SentimentAnalyst scoring failed for {ticker}: {e}")
        if on_activity:
            try:
                await on_activity({"type": "activity", "agent": "SentimentAnalyst", "ticker": ticker, "status": "fallback", "detail": "Agent scoring failed, using neutral default"})
            except Exception:
                pass
        return None
```

- [ ] **Step 5: Update `analyze_sentiment()` to call the new agent function, and make it `async`**

Current (`backend/pipeline.py`, the function right after
`analyze_sentiment_gemini`):

```python
def analyze_sentiment(text: str, company: str) -> str:
    """Analyzes sentiment, trying Gemini first, then neutral default."""
    sentiment_dict = None
    
    # Try Gemini first
    if GEMINI_API_KEY:
        print(f"Using Gemini to analyze sentiment for {company}...")
        sentiment_dict = analyze_sentiment_gemini(text, company)
        
    # Default fallback
    if sentiment_dict is None:
        print(f"Warning: Gemini API failed or is unconfigured. Generating neutral default sentiment for {company}.")
        sentiment_dict = {
            "layoffs": None, "restructuring": None, "board_changes": None, "mergers": None,
            "investor_activity": None, "esg": None, "revenue_growth": None, "product_launches": None,
            "expansion": None, "disputes": None, "geo_political": None, "macro_economic": None,
            "partnerships": None, "cyber_security": None, "supply_chain": None, "labor_issues": None,
            "product_recalls": None, "overall_sentiment": 0.0
        }
        
    # Clean keys and output a string representation that matches existing format
    # In the csv, null is stored as null (in double quotes inside JSON)
    # Let's ensure it is serializable to valid JSON
    return json.dumps(sentiment_dict)
```

Change to:

```python
async def analyze_sentiment(text: str, company: str, on_activity: Optional[Callable[[dict], Awaitable[None]]] = None) -> str:
    """Analyzes sentiment via the SentimentAnalyst agent, then neutral default."""
    sentiment_dict = await score_sentiment_with_agent(text, company, on_activity=on_activity)

    # Default fallback
    if sentiment_dict is None:
        print(f"Warning: SentimentAnalyst failed or is unconfigured. Generating neutral default sentiment for {company}.")
        sentiment_dict = {
            "layoffs": None, "restructuring": None, "board_changes": None, "mergers": None,
            "investor_activity": None, "esg": None, "revenue_growth": None, "product_launches": None,
            "expansion": None, "disputes": None, "geo_political": None, "macro_economic": None,
            "partnerships": None, "cyber_security": None, "supply_chain": None, "labor_issues": None,
            "product_recalls": None, "overall_sentiment": 0.0
        }
        
    # Clean keys and output a string representation that matches existing format
    # In the csv, null is stored as null (in double quotes inside JSON)
    # Let's ensure it is serializable to valid JSON
    return json.dumps(sentiment_dict)
```

- [ ] **Step 6: Run the tests again to verify they pass**

Run: `cd backend && ../.venv/bin/python3 -m unittest test_pipeline_agents -v`
Expected: all PASS.

- [ ] **Step 7: Make `run_pipeline` async, thread `on_activity` through it**

Current signature and top of `run_pipeline` (`backend/pipeline.py:208-235`):

```python
def run_pipeline(ticker_arg: Optional[str] = None):
    """Orchestrates the entire scraping and sentiment ingestion pipeline."""
    # 1. Load existing URLs from Firestore to prevent duplicate scraping
    existing_urls = set()
    try:
        docs = database.db.collection("articles").select(["url"]).stream()
        for doc in docs:
            url_val = doc.to_dict().get("url")
            if url_val:
                existing_urls.add(url_val)
        print(f"Loaded {len(existing_urls)} existing URLs from Firestore articles collection.")
    except Exception as e:
        print(f"Could not load existing URLs from Firestore: {e}")
            
    # 2. Determine tickers to scrape
    if ticker_arg:
        tickers = [ticker_arg]
    else:
        tickers = load_all_watchlist_tickers()
        
    print(f"Running ingestion pipeline for tickers: {tickers}")
    
    new_articles = []
    
    for ticker in tickers:
        print(f"\n--- Fetching news for {ticker} ---")
        items = fetch_news_items(ticker, limit=5)
        print(f"Found {len(items)} recent news items in RSS feed.")
        
        for item in items:
            google_link = item['google_link']
            title = item['title']
            date = item['date']
            
            # Quick check on Google link
            if google_link in existing_urls:
                print(f"Skipping duplicate Google News link: {title[:50]}...")
                continue
                
            print(f"Processing: {title[:50]}...")
            
            # Resolve original URL and scrape body text
            real_url, text = resolve_and_scrape_article(google_link)
            
            # Deduplicate by resolved original URL
            if real_url in existing_urls:
                print(f"Skipping duplicate resolved link: {real_url[:50]}...")
                continue
                
            if not text:
                # If scraping failed, default to title + excerpt/description if text is empty
                print("Scraping returned no text body. Using article title as fallback.")
                text = title
                
            # Clean text formatting
            cleaned_text = re.sub(r'\s+', ' ', text).strip()
            
            # Generate sentiment scores
            sentiment_json_str = analyze_sentiment(cleaned_text, ticker)
            
            # Add to list
            new_articles.append({
                'url': real_url,
                'content': cleaned_text[:1500],  # Truncate content to keep database size reasonable
                'company_name': ticker,
                'date': date,
                'Sentiment': sentiment_json_str
            })
            
            # Mark as processed to prevent processing in same run
            existing_urls.add(google_link)
            existing_urls.add(real_url)
```

Change to (adding `on_activity` param, making it `async def`, adding
`await` at the two agent call sites, and firing activity events at each
checkpoint — everything else, including the dedup/loop structure, is
unchanged):

```python
async def run_pipeline(ticker_arg: Optional[str] = None, on_activity: Optional[Callable[[dict], Awaitable[None]]] = None):
    """Orchestrates the entire scraping and sentiment ingestion pipeline."""
    async def emit(event: dict):
        if on_activity:
            try:
                await on_activity(event)
            except Exception as e:
                print(f"on_activity callback failed (non-fatal): {e}")

    # 1. Load existing URLs from Firestore to prevent duplicate scraping
    existing_urls = set()
    try:
        docs = database.db.collection("articles").select(["url"]).stream()
        for doc in docs:
            url_val = doc.to_dict().get("url")
            if url_val:
                existing_urls.add(url_val)
        print(f"Loaded {len(existing_urls)} existing URLs from Firestore articles collection.")
    except Exception as e:
        print(f"Could not load existing URLs from Firestore: {e}")
            
    # 2. Determine tickers to scrape
    if ticker_arg:
        tickers = [ticker_arg]
    else:
        tickers = load_all_watchlist_tickers()
        
    print(f"Running ingestion pipeline for tickers: {tickers}")
    
    new_articles = []
    skipped_duplicates = 0
    
    for ticker in tickers:
        print(f"\n--- Fetching news for {ticker} ---")
        await emit({"type": "start", "ticker": ticker})
        await emit({"type": "activity", "agent": "ResearchAgent", "ticker": ticker, "status": "fetching", "detail": "Querying Google News RSS..."})
        items = fetch_news_items(ticker, limit=5)
        print(f"Found {len(items)} recent news items in RSS feed.")
        await emit({"type": "activity", "agent": "ResearchAgent", "ticker": ticker, "status": "found", "detail": f"Found {len(items)} recent articles", "total_items": len(items)})
        
        ticker_new_articles = 0
        
        for idx, item in enumerate(items, start=1):
            google_link = item['google_link']
            title = item['title']
            date = item['date']
            
            # Quick check on Google link
            if google_link in existing_urls:
                print(f"Skipping duplicate Google News link: {title[:50]}...")
                skipped_duplicates += 1
                continue
                
            print(f"Processing: {title[:50]}...")
            
            # Resolve original URL and scrape body text
            real_url, text = resolve_and_scrape_article(google_link)
            
            # Deduplicate by resolved original URL
            if real_url in existing_urls:
                print(f"Skipping duplicate resolved link: {real_url[:50]}...")
                skipped_duplicates += 1
                continue
                
            if not text:
                # If scraping failed, default to title + excerpt/description if text is empty
                print("Scraping returned no text body. Using article title as fallback.")
                text = title
                
            # Clean text via ResearchAgent (falls back to regex clean internally
            # on failure, and emits its own "fallback" activity event when it does)
            await emit({"type": "activity", "agent": "ResearchAgent", "ticker": ticker, "status": "cleaning", "detail": f"Cleaning article {idx}/{len(items)}: \"{title[:60]}\""})
            cleaned_text = await clean_article_with_agent(text, ticker, on_activity=emit)
            
            # Generate sentiment scores via SentimentAnalyst (same fallback +
            # self-emitted "fallback" event pattern as cleaning, above)
            await emit({"type": "activity", "agent": "SentimentAnalyst", "ticker": ticker, "status": "scoring", "detail": f"Scoring article {idx}/{len(items)}"})
            sentiment_json_str = await analyze_sentiment(cleaned_text, ticker, on_activity=emit)
            sentiment_for_event = json.loads(sentiment_json_str)
            overall = sentiment_for_event.get("overall_sentiment")
            await emit({"type": "activity", "agent": "SentimentAnalyst", "ticker": ticker, "status": "scored", "detail": f"overall_sentiment: {overall}", "article_title": title[:60]})
            
            # Add to list
            new_articles.append({
                'url': real_url,
                'content': cleaned_text[:1500],  # Truncate content to keep database size reasonable
                'company_name': ticker,
                'date': date,
                'Sentiment': sentiment_json_str
            })
            ticker_new_articles += 1
            
            # Mark as processed to prevent processing in same run
            existing_urls.add(google_link)
            existing_urls.add(real_url)

        await emit({"type": "done", "ticker": ticker, "new_articles": ticker_new_articles, "skipped_duplicates": skipped_duplicates})
```

- [ ] **Step 8: Update the Firestore batch-write section to emit a "saved" event and confirm the CLI entry point still calls the now-async function correctly**

Current (`backend/pipeline.py`, right after the loop):

```python
    # 3. Save to Firestore
    if new_articles:
        try:
            import hashlib
            batch = database.db.batch()
            for article in new_articles:
                doc_id = hashlib.sha256(article['url'].encode('utf-8')).hexdigest()
                sentiment_map = json.loads(article['Sentiment'])
                
                doc_ref = database.db.collection("articles").document(doc_id)
                batch.set(doc_ref, {
                    'url': article['url'],
                    'content': article['content'],
                    'company_name': article['company_name'],
                    'date': article['date'],
                    'sentiment': sentiment_map
                })
            batch.commit()
            print(f"\nSuccessfully ingested and saved {len(new_articles)} new articles to Firestore!")
        except Exception as e:
            print(f"Error saving new articles to Firestore: {e}")
    else:
        print("\nNo new articles to ingest.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GlobePulse Stock News Scraper & Ingestion Pipeline")
    parser.add_argument("--ticker", type=str, help="Specific ticker symbol to run ingestion for (optional)")
    args = parser.parse_args()
    
    run_pipeline(args.ticker)
```

Change to:

```python
    # 3. Save to Firestore
    if new_articles:
        try:
            import hashlib
            batch = database.db.batch()
            for article in new_articles:
                doc_id = hashlib.sha256(article['url'].encode('utf-8')).hexdigest()
                sentiment_map = json.loads(article['Sentiment'])
                
                doc_ref = database.db.collection("articles").document(doc_id)
                batch.set(doc_ref, {
                    'url': article['url'],
                    'content': article['content'],
                    'company_name': article['company_name'],
                    'date': article['date'],
                    'sentiment': sentiment_map
                })
            batch.commit()
            print(f"\nSuccessfully ingested and saved {len(new_articles)} new articles to Firestore!")
            await emit({"type": "activity", "agent": "System", "ticker": ticker_arg or "ALL", "status": "saved", "detail": f"Saved {len(new_articles)} new articles to Firestore"})
        except Exception as e:
            print(f"Error saving new articles to Firestore: {e}")
            await emit({"type": "error", "ticker": ticker_arg or "ALL", "detail": f"Failed to save articles: {e}"})
    else:
        print("\nNo new articles to ingest.")

if __name__ == "__main__":
    import asyncio

    parser = argparse.ArgumentParser(description="GlobePulse Stock News Scraper & Ingestion Pipeline")
    parser.add_argument("--ticker", type=str, help="Specific ticker symbol to run ingestion for (optional)")
    args = parser.parse_args()
    
    asyncio.run(run_pipeline(args.ticker))
```

Note: the Firestore-save block sits *after* the `for ticker in tickers:`
loop (it's a single batch write for every ticker's new articles combined,
not per-ticker) — `ticker_arg` is used in the "saved" event's `ticker`
field since a bare `ticker` variable isn't in scope there; falls back to
`"ALL"` for the unscoped multi-ticker case.

- [ ] **Step 9: Swap the watchdog's sentiment call in `triggers.py`**

Current (`backend/agents/triggers.py:47`):
```python
                sentiment_dict = pipeline.analyze_sentiment_gemini(body_text, ticker)
```

Change to:
```python
                sentiment_dict = await pipeline.score_sentiment_with_agent(body_text, ticker)
```

`check_watchlist_sentiment` (`triggers.py:28`) is already `async def` —
confirmed by reading the current file — no wrapper change needed. The
line right after this (`if sentiment_dict and sentiment_dict.get('overall_sentiment') is not None:`)
is unchanged; it already handles the `None`-on-failure case correctly.

- [ ] **Step 10: Run the full backend test suite and py_compile check**

Run: `cd backend && ../.venv/bin/python3 -m py_compile pipeline.py agents/triggers.py agents/orchestrator.py`
Expected: exit 0.

Run: `cd backend && ../.venv/bin/python3 -m unittest discover -p "test_*.py" -v`
Expected: all tests pass, including the new `test_pipeline_agents.py`
tests.

- [ ] **Step 11: Commit**

```bash
git add backend/pipeline.py backend/agents/triggers.py backend/test_pipeline_agents.py
git commit -m "feat(ingestion): route article cleaning and sentiment scoring through ResearchAgent/SentimentAnalyst"
```

---

### Task 2: Backend — `/ws/ingest` WebSocket, `admin_key` gating split

**Files:**
- Modify: `backend/main.py`

**Interfaces:**
- Consumes: `pipeline.run_pipeline(ticker_arg, on_activity)` from Task 1
  — exact signature, call with `on_activity=broadcast_ingest_activity`.
- Produces: `POST /api/pipeline/run?ticker=X` (no `admin_key` needed for a
  scoped run), `@app.websocket("/ws/ingest")` — Task 4's frontend work
  connects to this exact path.

- [ ] **Step 1: Add the `time` import and cooldown/broadcast state**

Current top of `backend/main.py`:
```python
import os
import sys
import json
import logging
from typing import List, Optional
```

Change to:
```python
import os
import sys
import json
import logging
import time
from typing import List, Optional, Dict
```

- [ ] **Step 2: Add the cooldown dict, connected-sockets set, and broadcast helper**

Insert right after the CORS `app.add_middleware(...)` block (after the
closing `)` that currently ends around `backend/main.py:42`, before
`COMPANY_TICKER_MAP = {`):

```python
# In-memory per-ticker cooldown for scoped (non-admin) pipeline runs.
# Resets on process restart -- this is a spam-guard, not a durability
# guarantee, and that's an acceptable tradeoff for this use case.
_PIPELINE_COOLDOWN_SECONDS = 60
_last_ticker_run: Dict[str, float] = {}

# In-process set of connected /ws/ingest clients, for broadcasting live
# pipeline activity. A plain set, not per-user scoped -- every connected
# client sees every in-flight run's activity, which is acceptable at this
# app's scale (matches this feature's spec).
_ingest_websockets: set = set()

async def broadcast_ingest_activity(event: dict):
    """Sends one pipeline activity event to every connected /ws/ingest client.

    Drops any socket that raises (disconnected) rather than letting one
    dead connection break the broadcast for everyone else.
    """
    dead = set()
    for ws in _ingest_websockets:
        try:
            await ws.send_json(event)
        except Exception:
            dead.add(ws)
    _ingest_websockets.difference_update(dead)
```

- [ ] **Step 3: Replace `trigger_pipeline` with the gated/cooldown version**

Current (`backend/main.py:415-427`):
```python
@app.post("/api/pipeline/run")
def trigger_pipeline(background_tasks: BackgroundTasks, ticker: Optional[str] = None, admin_key: Optional[str] = Query(None)):
    # ADMIN_KEY must be provided via environment variables.
    # Never commit secrets to source control.
    actual_admin_key = settings.admin_key or os.getenv("ADMIN_KEY")
    if not actual_admin_key:
        logger.error("Configuration Error: ADMIN_KEY is not set.")
        raise HTTPException(status_code=500, detail="Server configuration error")
        
    if admin_key != actual_admin_key:
        raise HTTPException(status_code=403, detail="Unauthorized")
    background_tasks.add_task(pipeline.run_pipeline, ticker)
    return {"status": "started", "message": "Scraper pipeline running in background"}
```

Change to:
```python
@app.post("/api/pipeline/run")
def trigger_pipeline(background_tasks: BackgroundTasks, ticker: Optional[str] = None, admin_key: Optional[str] = Query(None)):
    if ticker:
        # Scoped, single-ticker run: bounded cost (~5 articles), no
        # admin_key required -- it's a legitimate user action, not an
        # admin one. Rate-limited per ticker to prevent spam-clicking from
        # hammering the Gemini API / Firestore.
        now = time.time()
        last_run = _last_ticker_run.get(ticker)
        if last_run is not None and (now - last_run) < _PIPELINE_COOLDOWN_SECONDS:
            raise HTTPException(status_code=429, detail=f"'{ticker}' was refreshed recently, please wait a moment.")
        _last_ticker_run[ticker] = now
    else:
        # Unscoped: refreshes every ticker across every user's watchlist --
        # genuinely expensive, shared-cost. Stays admin-gated, unchanged.
        actual_admin_key = settings.admin_key or os.getenv("ADMIN_KEY")
        if not actual_admin_key:
            logger.error("Configuration Error: ADMIN_KEY is not set.")
            raise HTTPException(status_code=500, detail="Server configuration error")
        if admin_key != actual_admin_key:
            raise HTTPException(status_code=403, detail="Unauthorized")

    background_tasks.add_task(pipeline.run_pipeline, ticker, on_activity=broadcast_ingest_activity)
    return {"status": "started", "message": "Scraper pipeline running in background"}
```

- [ ] **Step 4: Add the `/ws/ingest` WebSocket route**

Insert right after the existing `/ws/chat` route's closing (end of file,
after the section that currently ends around `backend/main.py:579-580`):

```python

# --- WebSocket Ingest Activity Endpoint (Antigravity Agent) ---

@app.websocket("/ws/ingest")
async def ingest_activity_websocket(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket ingest-activity connection established.")
    _ingest_websockets.add(websocket)
    try:
        while True:
            # This channel is push-only from the server; we still need to
            # await something to detect a client-initiated disconnect.
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info("WebSocket ingest-activity connection closed.")
    finally:
        _ingest_websockets.discard(websocket)
```

- [ ] **Step 5: Add a cooldown unit test**

Create `backend/test_pipeline_cooldown.py`:

```python
import os
import sys
import time
import unittest
from unittest.mock import patch

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

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


if __name__ == "__main__":
    unittest.main()
```

Note: this test file does `import main` directly. Per this plan's Global
Constraints, that's `py_compile`-only inside an ephemeral SDD worktree
(no `.venv` there) — but this test is designed to actually *run* (not
just compile), so it must be executed from this plan's own worktree
(`.claude/worktrees/agentic-news-ingestion`), which has a working `.venv`
and where `import main` has already been confirmed to work cleanly.

- [ ] **Step 6: Run verification**

Inside this plan's own worktree (has a working `.venv`):
```bash
cd backend && ../.venv/bin/python3 -m py_compile main.py && ../.venv/bin/python3 -c "import backend.main" 2>&1 | tail -5
```
(run the second command from the repo root, not `backend/`, for the
`backend.main` package path to resolve — see Task 1's Step 1 for the same
pattern)

Run: `cd backend && ../.venv/bin/python3 -m unittest test_pipeline_cooldown -v`
Expected: all 3 tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/main.py backend/test_pipeline_cooldown.py
git commit -m "feat(ingestion): add /ws/ingest broadcast channel and scoped pipeline-run gating"
```

---

### Task 3: Frontend — `IngestActivity.tsx` component

**Files:**
- Create: `frontend/src/components/IngestActivity.tsx`

**Interfaces:**
- Produces: `export const IngestActivity: React.FC` — a self-contained
  component with no props (connects to `/ws/ingest` internally, same
  pattern as `AgentChat`). Task 4 imports and renders it with no props.

- [ ] **Step 1: Create the component**

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { Terminal, ChevronDown, ChevronUp } from 'lucide-react';
import { WS_URL } from '../config';

interface ActivityEvent {
  type: 'start' | 'activity' | 'done' | 'error';
  agent?: string;
  ticker?: string;
  status?: string;
  detail?: string;
  article_title?: string;
  total_items?: number;
  new_articles?: number;
  skipped_duplicates?: number;
}

export const IngestActivity: React.FC = () => {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [showActivity, setShowActivity] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const logRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  const connectWebSocket = () => {
    const ws = new WebSocket(`${WS_URL}/ws/ingest`);

    ws.onopen = () => {
      console.log('Connected to ingest activity WebSocket');
    };

    ws.onmessage = (event) => {
      const data: ActivityEvent = JSON.parse(event.data);

      if (data.type === 'start') {
        setEvents([]);
        setShowActivity(true);
      }

      setEvents((prev) => [...prev, data]);

      if (logRef.current) {
        logRef.current.scrollTop = logRef.current.scrollHeight;
      }
    };

    ws.onclose = () => {
      console.log('Ingest activity WebSocket disconnected. Reconnecting...');
      setTimeout(connectWebSocket, 3000);
    };

    socketRef.current = ws;
  };

  const formatEvent = (e: ActivityEvent): string => {
    if (e.type === 'start') return `▸ Starting ingestion for ${e.ticker}...`;
    if (e.type === 'done') return `✓ Done: ${e.ticker} — ${e.new_articles ?? 0} new articles, ${e.skipped_duplicates ?? 0} skipped`;
    if (e.type === 'error') return `✗ Error (${e.ticker}): ${e.detail}`;
    return `${e.agent} · ${e.ticker} · ${e.status}: ${e.detail}`;
  };

  return (
    <div className="border border-slate-800/80 rounded-lg bg-slate-950/60 overflow-hidden mb-4">
      <button
        onClick={() => setShowActivity(!showActivity)}
        className="flex items-center justify-between w-full px-3 py-2 bg-slate-950/90 text-left border-none cursor-pointer outline-none text-slate-400 hover:text-slate-200"
      >
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
          <Terminal size={12} className="text-purple-400" />
          <span>Agent Activity</span>
        </div>
        {showActivity ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>

      {showActivity && (
        <pre
          ref={logRef}
          className="p-3 m-0 max-h-[160px] overflow-y-auto text-[10px] font-mono text-purple-300 leading-normal whitespace-pre-wrap select-text bg-[#07080b]"
        >
          {events.length > 0
            ? events.map(formatEvent).join('\n')
            : 'No activity yet — click "Run Pipeline" to see ResearchAgent and SentimentAnalyst work in real time.'}
        </pre>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Verify it compiles**

Run (from `frontend/`): `npm run build`
Expected: exit 0, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/IngestActivity.tsx
git commit -m "feat(ingestion): add IngestActivity live agent-activity panel"
```

---

### Task 4: Frontend — wire `IngestActivity` and multi-ticker pipeline trigger into `Dashboard.tsx`

**Files:**
- Modify: `frontend/src/components/Dashboard.tsx`

**Interfaces:**
- Consumes: `IngestActivity` (Task 3), `POST /api/pipeline/run?ticker=X`
  (Task 2's new scoped-run contract).
- Produces: nothing new consumed by later tasks — this is the last code
  task.

- [ ] **Step 1: Import `IngestActivity`**

Current top of `frontend/src/components/Dashboard.tsx`:
```tsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Stock } from '../types';
import { OverallSentiment } from './OverallSentiment';
import { SectorHeatmap, TopStocks } from './DataWidgets';
import { StockTrendDetails } from './StockTrendDetails';
import { StockPriceSentimentTab } from './StockPriceSentimentTab';
import { Activity, RefreshCcw } from 'lucide-react';
import { format } from 'date-fns';
import { API_URL } from '../config';
```

Add the import:
```tsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Stock } from '../types';
import { OverallSentiment } from './OverallSentiment';
import { SectorHeatmap, TopStocks } from './DataWidgets';
import { StockTrendDetails } from './StockTrendDetails';
import { StockPriceSentimentTab } from './StockPriceSentimentTab';
import { IngestActivity } from './IngestActivity';
import { Activity, RefreshCcw } from 'lucide-react';
import { format } from 'date-fns';
import { API_URL } from '../config';
```

- [ ] **Step 2: Rewrite `handleRunPipeline` to loop over the user's own watchlist**

Current (`frontend/src/components/Dashboard.tsx:173-189`):
```tsx
  // Trigger Pipeline Ingestion
  const handleRunPipeline = async () => {
    try {
      setPipelineRunning(true);
      const res = await fetch(`${API_URL}/api/pipeline/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        alert("Scraper pipeline successfully triggered in background. Please wait a few moments for data compilation.");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setPipelineRunning(false);
    }
  };
```

Change to:
```tsx
  // Trigger Pipeline Ingestion for every ticker in this user's watchlist.
  // Sequentially awaited (not concurrent) to keep behavior predictable and
  // avoid bursting Gemini rate limits across a multi-ticker watchlist at
  // once. No more blocking alert() -- the IngestActivity panel now shows
  // real, live progress instead.
  const handleRunPipeline = async () => {
    if (watchlist.length === 0) return;
    try {
      setPipelineRunning(true);
      for (const ticker of watchlist) {
        const res = await fetch(`${API_URL}/api/pipeline/run?ticker=${encodeURIComponent(ticker)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) {
          console.error(`Pipeline run failed for ${ticker}: HTTP ${res.status}`);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setPipelineRunning(false);
    }
  };
```

- [ ] **Step 3: Render `<IngestActivity />` next to the watchlist/pipeline-trigger column**

Current (`frontend/src/components/Dashboard.tsx:296-308`):
```tsx
          <div className="col-span-12 lg:col-span-7 flex flex-col gap-6 sm:gap-8">
            <OverallSentiment overallScore={overallScore} trendLabel={trendLabel} watchlistStocks={stocksData} />
            <TopStocks 
              email={email}
              watchlist={watchlist} 
              stocksData={stocksData} 
              alerts={alerts}
              onWatchlistChange={handleWatchlistChange} 
              onSelectStock={setSelectedStock} 
              onRunPipeline={handleRunPipeline}
              pipelineRunning={pipelineRunning}
            />
          </div>
```

Change to:
```tsx
          <div className="col-span-12 lg:col-span-7 flex flex-col gap-6 sm:gap-8">
            <OverallSentiment overallScore={overallScore} trendLabel={trendLabel} watchlistStocks={stocksData} />
            <TopStocks 
              email={email}
              watchlist={watchlist} 
              stocksData={stocksData} 
              alerts={alerts}
              onWatchlistChange={handleWatchlistChange} 
              onSelectStock={setSelectedStock} 
              onRunPipeline={handleRunPipeline}
              pipelineRunning={pipelineRunning}
            />
            <IngestActivity />
          </div>
```

- [ ] **Step 4: Verify it compiles**

Run (from `frontend/`): `npm run build`
Expected: exit 0, no TypeScript errors — in particular, no "unused import"
warning on `IngestActivity`.

- [ ] **Step 5: Manual smoke test**

Per this feature's spec, there's no frontend test framework, so this step
is a required, real (not skipped) verification: run the backend locally
(`../.venv/bin/python3 -m uvicorn backend.main:app --reload` from the repo
root, or via `start.sh`) and the frontend dev server, log in, click "Run
Pipeline" on a watchlist with at least one ticker, and confirm the
`IngestActivity` panel auto-expands and shows live `ResearchAgent`/
`SentimentAnalyst` events as ingestion proceeds, ending in a `done` line.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Dashboard.tsx
git commit -m "feat(ingestion): wire IngestActivity and per-ticker pipeline runs into Dashboard"
```

---

## After this plan

Manual verification against a real Gemini-backed `ResearchAgent`/
`SentimentAnalyst` call (not mocked) is out of this plan's automated
testing — Task 4's Step 5 manual smoke test is the closest this plan gets,
and should be run for real, not skipped, before considering this feature
done. A follow-up cleanup pass can remove the now-fully-unused
`analyze_sentiment_gemini()` function from `pipeline.py` (left in place by
this plan to keep its blast radius contained — see the spec's "Explicitly
Out of Scope" section).
