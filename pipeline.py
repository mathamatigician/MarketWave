import os
import sys
import json
import re
import argparse
import requests
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
import pandas as pd
from bs4 import BeautifulSoup
from pydantic import BaseModel, Field
from typing import Optional

# Setup API Key configuration
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")

# Load keys from Streamlit secrets.toml if not already set in environment
secrets_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".streamlit", "secrets.toml")
if os.path.exists(secrets_path):
    try:
        import tomllib
        with open(secrets_path, "rb") as f:
            secrets = tomllib.load(f)
        if not GEMINI_API_KEY:
            # check both gemini_credentials -> API_KEY and simple gemini -> api_key
            GEMINI_API_KEY = secrets.get("gemini_credentials", {}).get("API_KEY") or secrets.get("gemini", {}).get("api_key")
        if not OPENAI_API_KEY:
            OPENAI_API_KEY = secrets.get("openai_credentials", {}).get("API_KEY") or secrets.get("openai", {}).get("api_key")
    except Exception as e:
        print(f"Warning: Could not read secrets from secrets.toml: {e}")

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
    users_file = 'users.json'
    default_tickers = ["Tesla", "Apple", "Google", "Microsoft", "Nvidia", "Amazon"]
    
    if not os.path.exists(users_file):
        return default_tickers
        
    try:
        with open(users_file, 'r') as f:
            users = json.load(f)
    except Exception as e:
        print(f"Error reading users.json: {e}. Using defaults.")
        return default_tickers
        
    tickers = set()
    for user_info in users.values():
        watchlist = user_info.get("watchlist", "")
        if watchlist:
            for symbol in watchlist.split(','):
                symbol = symbol.strip()
                if symbol:
                    tickers.add(symbol)
                    
    if not tickers:
        return default_tickers
        
    return sorted(list(tickers))

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
        r = requests.get(url, headers=headers, timeout=10)
        if r.status_code != 200:
            return url, ""
            
        soup = BeautifulSoup(r.text, 'html.parser')
        
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
    import google.generativeai as genai
    
    if not GEMINI_API_KEY:
        return None
        
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel("gemini-1.5-flash")
        
        prompt = f"""
        Analyze the news about {company} and return sentiment values for the provided topics.
        The sentiment should be defined based on whether it's good for the company and its shareholders (positive) or bad (negative).
        The values should be between -1 for most negative sentiment and 1 for most positive sentiment.
        0 for neutral sentiment. If a topic is not mentioned, the value should be null.

        Article text:
        {text[:4000]}
        """
        
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
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

def analyze_sentiment_openai(text: str, company: str) -> Optional[dict]:
    """Fallback sentiment analyzer using OpenAI."""
    import openai
    
    if not OPENAI_API_KEY:
        return None
        
    try:
        client = openai.OpenAI(api_key=OPENAI_API_KEY)
        
        prompt = f"""
        Analyze the news about {company} and return sentiment values for the provided topics.
        The sentiment should be defined based on whether it's good for the company and its shareholders (positive) or bad (negative).
        The values should be between -1 for most negative sentiment and 1 for most positive sentiment.
        0 for neutral sentiment. If a topic is not mentioned, the value should be null.

        Article text:
        {text[:4000]}
        """
        
        response = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a professional financial sentiment analyst."},
                {"role": "user", "content": prompt}
            ],
            response_format=TopicSentimentSchema
        )
        
        result = json.loads(response.choices[0].message.content)
        return result
    except Exception as e:
        print(f"OpenAI fallback error: {e}")
        return None

def analyze_sentiment(text: str, company: str) -> str:
    """Analyzes sentiment, trying Gemini first, then OpenAI fallback, then neutral default."""
    sentiment_dict = None
    
    # Try Gemini first
    if GEMINI_API_KEY:
        print(f"Using Gemini to analyze sentiment for {company}...")
        sentiment_dict = analyze_sentiment_gemini(text, company)
        
    # Try OpenAI fallback
    if sentiment_dict is None and OPENAI_API_KEY:
        print(f"Using OpenAI fallback to analyze sentiment for {company}...")
        sentiment_dict = analyze_sentiment_openai(text, company)
        
    # Default fallback
    if sentiment_dict is None:
        print(f"Warning: Both LLM APIs failed or are unconfigured. Generating neutral default sentiment for {company}.")
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

def run_pipeline(ticker_arg: Optional[str] = None):
    """Orchestrates the entire scraping and sentiment ingestion pipeline."""
    csv_file = 'articles.csv'
    
    # 1. Load existing URLs to prevent duplicate scraping
    existing_urls = set()
    if os.path.exists(csv_file):
        try:
            df_existing = pd.read_csv(csv_file)
            existing_urls = set(df_existing['url'].dropna().tolist())
            print(f"Loaded {len(existing_urls)} existing URLs from {csv_file}")
        except Exception as e:
            print(f"Could not load existing CSV: {e}")
            
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
                'content': cleaned_text[:1500],  # Truncate content to keep CSV size reasonable
                'company_name': ticker,
                'date': date,
                'Sentiment': sentiment_json_str
            })
            
            # Mark as processed to prevent processing in same run
            existing_urls.add(google_link)
            existing_urls.add(real_url)
            
    # 3. Append to CSV
    if new_articles:
        df_new = pd.DataFrame(new_articles)
        # Rename columns to match existing csv casing (url,content,company_name,date,Sentiment)
        df_new.columns = ['url', 'content', 'company_name', 'date', 'Sentiment']
        
        if os.path.exists(csv_file):
            df_new.to_csv(csv_file, mode='a', header=False, index=False)
        else:
            df_new.to_csv(csv_file, index=False)
            
        print(f"\nSuccessfully ingested and appended {len(new_articles)} new articles to {csv_file}!")
    else:
        print("\nNo new articles to ingest.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GlobePulse Stock News Scraper & Ingestion Pipeline")
    parser.add_argument("--ticker", type=str, help="Specific ticker symbol to run ingestion for (optional)")
    args = parser.parse_args()
    
    run_pipeline(args.ticker)
