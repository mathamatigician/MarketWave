# MarketWave Web Scraping & Ingestion Pipeline Details

This document details the step-by-step process of how MarketWave scrapes, decrypts, filters, and processes stock-related news articles from Google News.

---

## 🏗️ Scraping Pipeline Architecture

The scraping process is implemented in [pipeline.py](file:///Users/mathamatigician/datascience/Competitions/Hackathons/Gemini_Hackathon/MarketWave/pipeline.py) and follows a four-step pipeline:

```
+--------------------+
| 1. Watchlist Loader| -> Reads users.json for active tickers
+---------+----------+
          |
          v
+--------------------+
| 2. Google News RSS | -> Fetches top 5 news entries from RSS XML
+---------+----------+
          |
          v
+--------------------+
| 3. URL Decryption  | -> Converts news.google.com redirect links to real source URLs
+---------+----------+
          |
          v
+--------------------+
| 4. BeautifulSoup   | -> Downloads, sanitizes, and cleans text content
+--------------------+
```

---

## 🔍 Detailed Ingestion Steps

### 1. Watchlist Compilation
*   **Function:** `load_all_watchlist_tickers()`
*   **Mechanics:** Reads [users.json](file:///Users/mathamatigician/datascience/Competitions/Hackathons/Gemini_Hackathon/MarketWave/users.json) to retrieve the watchlists of all registered users. It compiles them into a unique, sorted set of tickers.
*   **Fallback:** If `users.json` is missing or empty, it defaults to a standard watchlist: `["Tesla", "Apple", "Google", "Microsoft", "Nvidia", "Amazon"]`.

### 2. Google News RSS Fetching
*   **Function:** `fetch_news_items(ticker, limit=5)`
*   **Mechanics:** Queries the Google News RSS search endpoint:
    `https://news.google.com/rss/search?q={ticker}+stock&hl=en-US&gl=US&ceid=US:en`
*   **Retrieval:** The XML is parsed using Python's standard `xml.etree.ElementTree` to fetch:
    *   **Title**: News headline text.
    *   **Google Link**: Encrypted redirect link pointing to Google News services.
    *   **Date**: Normalizes the date from RFC 822 format (e.g., `Mon, 15 Jun 2026 01:18:00 GMT`) to `%m/%d/%Y` (e.g., `6/15/2026`).

### 3. URL Resolution & Decryption
*   **Function:** `resolve_and_scrape_article(google_link)`
*   **Mechanics:** Google News links resemble obfuscated URLs like `https://news.google.com/rss/articles/CBMi...`. Passing these directly to scrapers leads to redirects.
*   **Resolution:** The pipeline uses the `googlenewsdecoder` package to decode the base64-like redirect parameters into the original destination URL (e.g. Yahoo Finance, Bloomberg, MarketWatch).

### 4. Article Scraping, Cleaning, & Deduplication
*   **Function:** `resolve_and_scrape_article(google_link)` and `run_pipeline()`
*   **Deduplication:** Before sending requests, the pipeline checks both the encrypted Google URL and the resolved original URL against `articles.csv` to ensure we do not scrape or store duplicates.
*   **HTTP request**: Downloads the resolved URL using `requests.get` with a standard browser `User-Agent` header to prevent bot blocks.
*   **HTML Sanitization**: Uses `BeautifulSoup` to clean the DOM by removing non-content tags:
    *   `<script>` and `<style>`
    *   `<nav>`, `<header>`, and `<footer>`
*   **Text Processing**: Collects all `<p>` tags, filters out paragraphs under 30 characters (removes cookie policy popups, short links, or error notices), and joins paragraphs into a single text block.
*   **Fallback**: If page scraping returns no body content, the pipeline falls back to using the headline title as the source content.
*   **Storage**: Cleans whitespaces, runs sentiment calculations, and appends the processed data to [articles.csv](file:///Users/mathamatigician/datascience/Competitions/Hackathons/Gemini_Hackathon/MarketWave/articles.csv).
