# GlobePulse Data Pipeline & Sentiment Ingestion Documentation

This document describes the design, implementation, and execution details of the GlobePulse Stock Market News Ingestion and Sentiment Ingestion Data Pipeline.

---

## 1. Pipeline Overview & Architecture

The ingestion pipeline is a Python-native data flow that fetches recent news headlines for a user's stock watchlist, resolves redirect URLs, extracts cleaned article body text, and generates structured sentiment scores across 18 financial topics using Google Gemini (with OpenAI fallback).

### Architecture Diagram

```mermaid
flowchart TD
    subgraph Watchlist
        A["Watchlist Loader\n(users.json)"]
    end

    subgraph Data Fetching & Cleaning
        B["Google News RSS Fetcher\n(requests / search?q=...)"]
        C["URL Resolver\n(googlenewsdecoder)"]
        D{"Deduplicator\n(Check articles.csv)"}
        E["BeautifulSoup Scraper\n(Paragraph Extract)"]
    end

    subgraph Sentiment Ingestion
        F{"LLM Router"}
        G["Gemini Structured Outputs\n(gemini-1.5-flash)"]
        H["OpenAI beta parse\n(gpt-4o-mini)"]
        I["Neutral Default Fallback"]
    end

    subgraph Storage
        J[("articles.csv")]
    end

    A -->|Ticker List| B
    B -->|Google Links| C
    C -->|Real URLs| D
    D -->|New URL| E
    D -->|Duplicate URL (Skip)| J
    E -->|Clean Text| F
    F -->|Gemini Key Present| G
    F -->|OpenAI Key Present| H
    F -->|No Keys Present| I
    G -->|JSON Sentiment| J
    H -->|JSON Sentiment| J
    I -->|Neutral JSON| J
```

---

## 2. Ingestion Step-by-Step Flow

### Step 1: Watchlist Compiling
The pipeline loads [users.json](file:///Users/pravintakpire/datascience/Competitions/Hackathons/Gemini_Hackathon/GlobePulse/users.json) and aggregates all tickers from all registered users' watchlists into a unique set (e.g., `['TSLA', 'AAPL', 'GOOGL', 'MSFT', 'NVDA', 'AMZN']`). If no user watchlists are defined, the pipeline falls back to this set of default stock symbols.

### Step 2: Google News RSS Fetching
For each ticker, the pipeline queries the official, free Google News RSS search feed:
```
https://news.google.com/rss/search?q={ticker}+stock&hl=en-US&gl=US&ceid=US:en
```
*   **Benefits:** Free, does not require an API key, highly reliable, and returns real-time business and market news headlines.
*   **Parsing:** The RSS XML response is parsed using Python's built-in `xml.etree.ElementTree` to extract the top 5 articles, retrieving the title, pubDate, and Google's encrypted redirect link.
*   **Date Normalization:** Dates are parsed from RFC 822 format (e.g., `Mon, 15 Jun 2026 01:18:00 GMT`) and formatted to `%m/%d/%Y` (e.g., `6/15/2026`) to match the existing schema.

### Step 3: URL Resolution & Decryption
Google News RSS items point to Google redirect links like `https://news.google.com/rss/articles/CBMi...`. 
*   Because Google resolves these using internal dynamic endpoints (obfuscating the destination URL), we utilize the **`googlenewsdecoder`** library's `gnewsdecoder()` function to decode the base64-like redirect parameters into the original publisher's destination URL (e.g., Yahoo Finance, Barron's, Stocktwits).

### Step 4: Web Page Scraping & Text Cleaning
Once the real URL is resolved, the pipeline downloads the article page:
1.  **Deduplication Check:** Before scraping, the pipeline checks the URL against all existing entries in `articles.csv`. If the URL (or original Google redirect link) has already been processed, it is skipped.
2.  **HTML Parsing:** The pipeline requests the URL with a standard browser `User-Agent` to prevent anti-bot blocks. It uses **`BeautifulSoup`** to clean the page by stripping out non-content HTML elements: `<script>`, `<style>`, `<nav>`, `<header>`, and `<footer>`.
3.  **Content Joining:** It collects all `<p>` tags, filters out empty blocks, cookie consent notices, and short error paragraphs, and joins them into a single cleaned string block. If scraping fails or yields no body paragraphs, the pipeline falls back to using the article title as the content input.

---

## 3. Sentiment Score Generation

Sentiment analysis is evaluated across 18 distinct topics using the following Pydantic schema:

```python
class TopicSentimentSchema(BaseModel):
    layoffs: Optional[float]          # -1 to 1 or null
    restructuring: Optional[float]
    board_changes: Optional[float]
    mergers: Optional[float]
    investor_activity: Optional[float]
    esg: Optional[float]
    revenue_growth: Optional[float]
    product_launches: Optional[float]
    expansion: Optional[float]
    disputes: Optional[float]
    geo_political: Optional[float]
    macro_economic: Optional[float]
    partnerships: Optional[float]
    cyber_security: Optional[float]
    supply_chain: Optional[float]
    labor_issues: Optional[float]
    product_recalls: Optional[float]
    overall_sentiment: Optional[float]
```

### LLM Structured Output Ingestion Routing

#### 1. Google Gemini Ingestion (`gemini-1.5-flash`)
When `GEMINI_API_KEY` is present in the environment or Streamlit secrets:
*   We use the `google-generativeai` package to initialize the model.
*   **Structured Outputs:** We request structured output by specifying:
    ```python
    generation_config=genai.GenerationConfig(
        response_mime_type="application/json",
        response_schema=TopicSentimentSchema
    )
    ```
*   **Compatibility Fix:** To ensure compatibility with the Gemini SDK converter and avoid the `Unknown field for Schema: default` error, all fields in the schema are defined *without* default values (i.e. `Optional[float] = Field(description="...")`), making the keys required in the JSON structure but allowing their values to be `None` (null).

#### 2. OpenAI Fallback (`gpt-4o-mini`)
If the Gemini API key is missing or fails, but `OPENAI_API_KEY` is present:
*   The pipeline routes the text to OpenAI using the standard structured parsing method:
    ```python
    client.beta.chat.completions.parse(
        model="gpt-4o-mini",
        messages=[...],
        response_format=TopicSentimentSchema
    )
    ```

#### 3. Neutral Fallback
If neither API key is available, the pipeline generates a neutral default dictionary with all topics set to `null` and `overall_sentiment` set to `0.0`. This ensures the scraper pipeline completes gracefully without crashes.

---

## 4. UI Dashboard Integration

The pipeline results are written to `articles.csv` and loaded inside `app.py`:

1.  **Watchlist Syncing:** The user edits their watchlist inside the Streamlit multiselect. Any modifications are saved back to `users.json`, which forces a page rerun.
2.  **Ticker Resolution:** To avoid discrepancies between stock names and tickers (e.g. matching "Tesla" with "TSLA" or "Apple" with "AAPL"), we implement a bidirectional `COMPANY_TICKER_MAP` mapper in `app.py`.
3.  **Data Filtering:** The dashboard reads the `articles.csv` table and filters it case-insensitively so that a user only sees headlines and heatmaps for companies in their active watchlist.
4.  **Dynamic Chart Selection:** A selectbox in the *Stock Price vs Sentiment* tab allows users to select which stock symbol from their watchlist they want to render. It pulls stock price history dynamically using `yahooquery` and aligns it with daily sentiment aggregations.
5.  **Sidebar Run Trigger:** Users can manually trigger the pipeline script directly from the sidebar. The UI executes `pipeline.run_pipeline()`, displays a spinner, updates `articles.csv`, and reruns to render the new data.
