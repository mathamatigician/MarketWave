import os
import sys
import json
import logging
import datetime

# Ensure parent directory is in sys.path so we can import sibling files
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import database
import pipeline
from google.antigravity.triggers import every, TriggerContext

# Set up logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("WatchdogTrigger")

def get_alerts_file_path() -> str:
    """Resolves the path to db/alerts.json dynamically."""
    if os.path.exists(os.path.join('db', 'alerts.json')):
        return os.path.join('db', 'alerts.json')
    
    # Check parent
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    parent_path = os.path.join(base_dir, 'db', 'alerts.json')
    return parent_path

async def check_watchlist_sentiment(ctx: TriggerContext):
    logger.info("Watchdog execution started: evaluating watchlist sentiments...")
    tickers = database.load_all_watchlist_tickers()
    alerts = []
    
    for ticker in tickers:
        logger.info(f"Watchdog analyzing ticker: {ticker}")
        try:
            # Fetch recent news items
            items = pipeline.fetch_news_items(ticker, limit=3) # Limit to 3 for fast watchdog checks
            if not items:
                continue
                
            sentiments = []
            for item in items:
                _, body_text = pipeline.resolve_and_scrape_article(item['google_link'])
                if not body_text:
                    body_text = item['title']
                
                sentiment_dict = await pipeline.score_sentiment_with_agent(body_text, ticker)
                if sentiment_dict and sentiment_dict.get('overall_sentiment') is not None:
                    sentiments.append(sentiment_dict['overall_sentiment'])
                    
            if sentiments:
                avg_sentiment = sum(sentiments) / len(sentiments)
                logger.info(f"Watchdog sentiment result for {ticker}: {avg_sentiment}")
                if avg_sentiment < -0.5:
                    headlines = [item['title'] for item in items if item.get('title')]
                    try:
                        import gemma_service
                        catalyst = await gemma_service.gemma_generate_catalyst_bullet(ticker, headlines)
                    except Exception:
                        catalyst = f"Severe negative sentiment drop detected for {ticker} across recent news."

                    alerts.append({
                        "ticker": ticker,
                        "average_sentiment": round(avg_sentiment, 2),
                        "message": f"Critical sentiment drop detected for {ticker}: {round(avg_sentiment, 2)}",
                        "catalyst": catalyst,
                        "powered_by": "Google Gemma 2",
                        "timestamp": int(datetime.datetime.now().timestamp())
                    })
        except Exception as e:
            logger.error(f"Error checking sentiment for {ticker} in watchdog: {e}")
            
    # Write alerts to local JSON file
    try:
        alerts_file = get_alerts_file_path()
        dir_name = os.path.dirname(alerts_file)
        if dir_name:
            os.makedirs(dir_name, exist_ok=True)
        with open(alerts_file, 'w') as f:
            json.dump(alerts, f, indent=4)
        logger.info(f"Watchdog run completed. Active alerts saved to local file: {alerts_file}")
    except Exception as e:
        logger.error(f"Error saving watchdog alerts to local file: {e}")

    # Write alerts to Firestore
    if database.db is not None:
        try:
            batch = database.db.batch()
            for alert in alerts:
                doc_ref = database.db.collection("alerts").document()
                batch.set(doc_ref, alert)
            batch.commit()
            logger.info(f"Watchdog run completed. Active alerts saved to Firestore: {len(alerts)}")
        except Exception as e:
            logger.error(f"Error saving watchdog alerts to Firestore: {e}")
        
    logger.info(f"Watchdog run completed. Active alerts recorded: {len(alerts)}")

# Trigger watchdog once an hour (3600 seconds)
watchdog_trigger = every(3600, check_watchlist_sentiment)
