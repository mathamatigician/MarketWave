# Financial News & Stock Market Data Sources

This document compiles popular, reliable, and accessible news APIs and data feeds for tracking financial news and stock market data, covering both global and Indian markets across Free, Freemium, and Paid categories.

---

## 1. Global Financial & Stock Market News APIs

### Free & Unofficial (No Token Required)
*   **Yahoo Finance (via `yahooquery` Python library):**
    *   **Cost:** Free.
    *   **Features:** Direct retrieval of real-time news headlines and URLs by ticker.
    *   **Python Example:**
        ```python
        from yahooquery import Ticker
        tsla = Ticker("TSLA")
        print(tsla.news(count=5))
        ```
    *   **Pros:** Instant access, zero configuration, covers almost all global tickers.
    *   **Cons:** Subject to rate-limiting and unofficial wrapper breaks.

### Freemium APIs (Free Limits + Paid Tiers)
*   **Finnhub.io:**
    *   **Free Tier:** Generous access to stock and general market news. Rate-limited to ~60 requests/minute.
    *   **Paid Tier:** Deeper historical data, real-time streaming, and premium news feeds.
    *   **Best for:** Developers looking for a balanced mix of stock data, fundamentals, and news.
*   **Marketaux.com:**
    *   **Free Tier:** 100 requests per day.
    *   **Paid Tier:** Starts at ~$15–$30/month for higher daily quotas and deeper history.
    *   **Best for:** Highly structured global financial news that includes pre-computed entity tagging (linking articles to specific tickers).
*   **NewsAPI.org:**
    *   **Free Tier:** 100 requests per day, limited to non-commercial developer use, with a 24-hour delay on news articles.
    *   **Paid Tier:** Starts at ~$449/month for commercial usage and real-time articles.
    *   **Best for:** Fetching general business and macroeconomic headlines rather than specific individual stock tickers.
*   **Alpha Vantage:**
    *   **Free Tier:** 25 requests per day. Includes AI-powered sentiment scoring.
    *   **Paid Tier:** Premium plans starting at ~$50/month for higher API throughput.
    *   **Best for:** Small-scale testing of market news alongside technical indicator sentiment scores.

### Paid & Institutional Grade
*   **Tiingo (Individual "Power" Plan):**
    *   **Cost:** ~$30/month (Note: News endpoints are not available on the free tier).
    *   **Best for:** Clean, structured stock news API with low latency at retail pricing.
*   **Polygon.io:**
    *   **Cost:** Paid tiers for ticker-level news start around ~$30/month.
    *   **Best for:** High-frequency applications requiring official, low-latency market feeds and news.
*   **Benzinga / Bloomberg / Reuters:**
    *   **Cost:** Premium/Institutional custom pricing.
    *   **Best for:** Enterprise-level trading applications where millisecond accuracy is required.

---

## 2. Indian Market (NSE & BSE) News & Data Sources

### Free & Unofficial (No Token Required)
*   **Yahoo Finance India (via `yahooquery`):**
    *   **Exchange Suffixes:** Suffix NSE tickers with `.NS` and BSE tickers with `.BO` (e.g. `RELIANCE.NS`, `TCS.NS`, `INFY.NS`).
    *   **Python Example:**
        ```python
        from yahooquery import Ticker
        reliance = Ticker("RELIANCE.NS")
        print(reliance.news(count=5))
        ```
*   **Open-Source Scrapers (`nsepython` / `nsetools`):**
    *   **Features:** Python libraries designed to scrape live quotes, option chain data, and corporate announcements directly from the official NSE website.
    *   **Pros:** Access to raw exchange data.
    *   **Cons:** Can trigger temporary IP bans if queried too aggressively.
*   **RSS Feeds (Moneycontrol / Economic Times / Livemint):**
    *   **Method:** Parse RSS XML feeds using Python libraries like `feedparser` and `BeautifulSoup`.
    *   **Feed URLs:**
        *   Moneycontrol: `https://www.moneycontrol.com/rss/latestnews.xml`
        *   Economic Times: `https://economictimes.indiatimes.com/rssfeedsdefault.cms`

### Trading Broker APIs (Free / Low Cost for Account Holders)
Most modern Indian discount brokers provide clean API frameworks for accessing pricing and historical records:
*   **Kite Connect (Zerodha):**
    *   **Cost:** ₹2,000/month basic + ₹2,000/month historical data.
    *   **Best for:** Reliable and fast WebSocket tick streams.
*   **Angel One SmartAPI & Upstox API:**
    *   **Cost:** Free for registered account holders.
    *   **Best for:** Low-cost developer integration and algo-trading setups.
*   **Fyers API & DhanHQ API:**
    *   **Cost:** Free for registered account holders. Well-regarded for their technical charting historical database.

### Commercial Data Feeds (Paid)
*   **TrueData / Global Datafeeds:**
    *   **Cost:** Subscription-based (~₹1,500 to ₹4,000 per month).
    *   **Best for:** Low-latency feeds and authorized real-time feeds directly licensed by NSE/BSE.
*   **Marketaux / NewsData.io (Filtered for India):**
    *   **Method:** Use global endpoints filtered with the `country=in` parameter or specific exchange suffixes (`.NS`, `.BO`).
