import os
import sys
import json
import re
import asyncio
import argparse
import requests
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
import pandas as pd
from bs4 import BeautifulSoup
from pydantic import BaseModel, Field
from typing import Optional, Callable, Awaitable

# Add path for backend module imports. Must be the repo root (not just
# backend/), matching backend/agents/triggers.py's pattern -- the
# `from backend.agents.orchestrator import ...` imports below need
# `backend` importable as a package, which requires the repo root (parent
# of backend/) on sys.path, not backend/ itself.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import database


from config import settings
GEMINI_API_KEY = settings.gemini_api_key or settings.google_api_key or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")

# Define structured output schema for Topic Sentiment
class TopicSentimentSchema(BaseModel):
    layoffs: Optional[float] = Field(description="Sentiment score for layoffs topic (-1 to 1 or null if not mentioned)")
    restructuring: Optional[float] = Field(description="Sentiment score for org restructuring topic (-1 to 1 or null if not mentioned)")
    board_changes: Optional[float] = Field(description="Sentiment score for board member departures or appointments topic (-1 to 1 or null if not mentioned)")
    mergers: Optional[float] = Field(description="Sentiment score for mergers or acquisitions topic (-1 to 1 or null if not mentioned)")
    investor_activity: Optional[float] = Field(description="Sentiment score for investor activity topic (-1 to 1 or null if not mentioned)")
    esg: Optional[float] = Field(description="Sentiment score for environmental, social, or governance issues (-1 to 1 or null if not mentioned)")
    revenue_growth: Optional[float] = Field(description="Sentiment score for revenue growth topic (-1 to 1 or null if not mentioned)")
    product_launches: Optional[float] = Field(description="Sentiment score for product launches topic (-1 to 1 or null if not mentioned)")
    expansion: Optional[float] = Field(description="Sentiment score for market expansion or contraction topic (-1 to 1 or null if not mentioned)")
    disputes: Optional[float] = Field(description="Sentiment score for legal disputes topic (-1 to 1 or null if not mentioned)")
    geo_political: Optional[float] = Field(description="Sentiment score for geo-political events topic (-1 to 1 or null if not mentioned)")
    macro_economic: Optional[float] = Field(description="Sentiment score for macro-economic events topic (-1 to 1 or null if not mentioned)")
    partnerships: Optional[float] = Field(description="Sentiment score for partnerships, contracts and deals topic (-1 to 1 or null if not mentioned)")
    cyber_security: Optional[float] = Field(description="Sentiment score for cyber security topic (-1 to 1 or null if not mentioned)")
    supply_chain: Optional[float] = Field(description="Sentiment score for supply chain topic (-1 to 1 or null if not mentioned)")
    labor_issues: Optional[float] = Field(description="Sentiment score for labor issues topic (-1 to 1 or null if not mentioned)")
    product_recalls: Optional[float] = Field(description="Sentiment score for product recalls topic (-1 to 1 or null if not mentioned)")
    overall_sentiment: Optional[float] = Field(description="Overall sentiment score for the article (-1 to 1 or null if not mentioned)")

def load_all_watchlist_tickers() -> list:
    """Reads all unique tickers from users.json."""
    return database.load_all_watchlist_tickers()


def fetch_news_items(ticker: str, limit: int = 5) -> list:
    """Fetches recent news items from Google News RSS feed for a ticker."""
    query = f"{ticker} stock"
    url = f"https://news.google.com/rss/search?q={requests.utils.quote(query)}&hl=en-US&gl=US&ceid=US:en"
    
    try:
        r = requests.get(url, timeout=10)
        if r.status_code != 200:
            print(f"Failed to fetch Google News RSS for {ticker}: HTTP {r.status_code}")
            return []
            
        root = ET.fromstring(r.text)
        items = []
        for item in root.findall('.//item')[:limit]:
            title = item.find('title').text if item.find('title') is not None else ""
            link = item.find('link').text if item.find('link') is not None else ""
            pub_date_raw = item.find('pubDate').text if item.find('pubDate') is not None else ""
            
            # Convert date
            try:
                dt = parsedate_to_datetime(pub_date_raw)
                date_str = f"{dt.month}/{dt.day}/{dt.year}"
            except Exception:
                date_str = ""
                
            items.append({
                'title': title,
                'google_link': link,
                'date': date_str
            })
        return items
    except Exception as e:
        print(f"Error fetching RSS for {ticker}: {e}")
        return []

def resolve_and_scrape_article(google_link: str) -> tuple:
    """Decodes Google News redirect URL and scrapes article body text."""
    import googlenewsdecoder
    
    # 1. Resolve redirect URL
    try:
        decoded_res = googlenewsdecoder.gnewsdecoder(google_link)
        if decoded_res.get('status') and decoded_res.get('decoded_url'):
            url = decoded_res['decoded_url']
        else:
            url = google_link
    except Exception as e:
        print(f"Failed decoding URL: {e}. Using original.")
        url = google_link
        
    # 2. Scrape page text
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    try:
        from urllib.parse import urlparse
        import ipaddress
        import socket
        
        hostname = urlparse(url).hostname
        if hostname:
            try:
                ip = socket.gethostbyname(hostname)
                ip_obj = ipaddress.ip_address(ip)
                if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local:
                    print(f"SSRF Blocked: URL {url} resolves to internal IP {ip}")
                    return url, ""
            except Exception:
                pass
                
        r = requests.get(url, headers=headers, timeout=10, stream=True, allow_redirects=False)
        if r.status_code != 200:
            return url, ""
            
        content = r.raw.read(2 * 1024 * 1024)
        soup = BeautifulSoup(content, 'html.parser')
        
        # Clean text: remove script, style, header, footer elements
        for script in soup(["script", "style", "nav", "footer", "header"]):
            script.decompose()
            
        # Get paragraphs
        paragraphs = [p.get_text().strip() for p in soup.find_all('p')]
        # Filter empty and very short paragraphs
        paragraphs = [p for p in paragraphs if len(p) > 30 and "something went wrong" not in p.lower() and "cookies" not in p.lower()]
        
        body_text = "\n".join(paragraphs)
        return url, body_text
    except Exception as e:
        print(f"Error scraping {url}: {e}")
        return url, ""

def analyze_sentiment_gemini(text: str, company: str) -> Optional[dict]:
    """Analyzes article sentiment using Google Gemini 1.5 Flash."""
    # google.genai is the current, actively maintained SDK (successor to the
    # legacy google.generativeai, which is frozen at 0.8.6 and whose pinned
    # google-ai-generativelanguage==0.6.15 caps protobuf<6.0 — incompatible
    # with google-antigravity's protobuf>=7.35.0 floor). google-antigravity
    # already depends on google-genai, so this adds no new transitive weight.
    from google import genai
    from google.genai import types as genai_types

    if not GEMINI_API_KEY:
        return None

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)

        prompt = f"""
        Analyze the news about {company} and return sentiment values for the provided topics.
        The sentiment should be defined based on whether it's good for the company and its shareholders (positive) or bad (negative).
        The values should be between -1 for most negative sentiment and 1 for most positive sentiment.
        0 for neutral sentiment. If a topic is not mentioned, the value should be null.

        Article text:
        {text[:4000]}
        """

        response = client.models.generate_content(
            model=settings.agent_model,
            contents=prompt,
            config=genai_types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=TopicSentimentSchema
            )
        )

        # Parse JSON
        result = json.loads(response.text)
        return result
    except Exception as e:
        print(f"Gemini generation error: {e}")
        return None

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
            # Prefer the SDK's own structured-output extraction over
            # concatenating streamed text deltas and hoping they form bare
            # JSON -- sentiment_analyst_config sets response_schema, so the
            # SDK already parses this for us when structured_output() is
            # available. Falls back to the text-accumulation + json.loads
            # path (below) if structured_output() raises AttributeError
            # (not present on this SDK version) or any other exception.
            try:
                structured = await response.structured_output()
                if isinstance(structured, dict):
                    return structured
            except Exception:
                pass  # fall through to text-accumulation path below

            result_text = ""
            async for token_chunk in response:
                result_text += token_chunk
            parsed = json.loads(result_text)
            return parsed if isinstance(parsed, dict) else None
    except Exception as e:
        print(f"SentimentAnalyst scoring failed for {ticker}: {e}")
        if on_activity:
            try:
                await on_activity({"type": "activity", "agent": "SentimentAnalyst", "ticker": ticker, "status": "fallback", "detail": "Agent scoring failed, using neutral default"})
            except Exception:
                pass
        return None


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

def _load_existing_urls_sync() -> set:
    """Blocking Firestore read: scans the `articles` collection for known URLs.

    Extracted into its own sync function so run_pipeline can run the whole
    multi-statement blocking unit off the event loop in a single
    asyncio.to_thread call, instead of sprinkling to_thread around
    individual lines inside the loop.
    """
    existing_urls = set()
    docs = database.db.collection("articles").select(["url"]).stream()
    for doc in docs:
        url_val = doc.to_dict().get("url")
        if url_val:
            existing_urls.add(url_val)
    return existing_urls


def _save_new_articles_sync(new_articles: list) -> None:
    """Blocking Firestore batch write for the newly-ingested articles.

    Extracted into its own sync function for the same reason as
    _load_existing_urls_sync above -- one asyncio.to_thread call for the
    whole batch-build-and-commit unit.
    """
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
        existing_urls = await asyncio.to_thread(_load_existing_urls_sync)
        print(f"Loaded {len(existing_urls)} existing URLs from Firestore articles collection.")
    except Exception as e:
        print(f"Could not load existing URLs from Firestore: {e}")

    # Everything below is a safety net around the *existing* logic: if
    # anything here raises before reaching one of the emit({"type": "done"/
    # "error", ...}) calls below, the frontend's IngestActivity panel would
    # otherwise be left showing "in progress" forever with no terminal
    # event. This does not change when the existing per-ticker "done"
    # events or the save-block's own "error" event fire -- it only catches
    # what would otherwise propagate uncaught.
    try:
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
            items = await asyncio.to_thread(fetch_news_items, ticker, limit=5)
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
                real_url, text = await asyncio.to_thread(resolve_and_scrape_article, google_link)

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
                overall = sentiment_for_event.get("overall_sentiment") if isinstance(sentiment_for_event, dict) else None
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

        # 3. Save to Firestore
        if new_articles:
            try:
                await asyncio.to_thread(_save_new_articles_sync, new_articles)
                print(f"\nSuccessfully ingested and saved {len(new_articles)} new articles to Firestore!")
                await emit({"type": "activity", "agent": "System", "ticker": ticker_arg or "ALL", "status": "saved", "detail": f"Saved {len(new_articles)} new articles to Firestore"})
            except Exception as e:
                print(f"Error saving new articles to Firestore: {e}")
                await emit({"type": "error", "ticker": ticker_arg or "ALL", "detail": f"Failed to save articles: {e}"})
        else:
            print("\nNo new articles to ingest.")
    except Exception as e:
        print(f"Unhandled exception in run_pipeline: {e}")
        await emit({"type": "error", "ticker": ticker_arg or "ALL", "detail": f"Pipeline run failed: {e}"})

if __name__ == "__main__":
    import asyncio

    parser = argparse.ArgumentParser(description="GlobePulse Stock News Scraper & Ingestion Pipeline")
    parser.add_argument("--ticker", type=str, help="Specific ticker symbol to run ingestion for (optional)")
    args = parser.parse_args()

    asyncio.run(run_pipeline(args.ticker))
