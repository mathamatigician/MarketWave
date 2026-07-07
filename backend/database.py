import os
import logging
from google.cloud import firestore

# Setup Logger
logger = logging.getLogger("Database")

# Automatically default to the local Firestore Emulator if not running in cloud production
if "GOOGLE_APPLICATION_CREDENTIALS" not in os.environ and "K_SERVICE" not in os.environ:
    os.environ.setdefault("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080")
    logger.info("Configured default FIRESTORE_EMULATOR_HOST to 127.0.0.1:8080")

# Initialize Firestore Client
# Specifying a project name is required when connecting to the emulator
try:
    db = firestore.Client(project="globepulse-demo")
    logger.info("Firestore Client initialized successfully.")
except Exception as e:
    logger.error(f"Failed to initialize Firestore Client: {e}")
    db = None

def load_users() -> dict:
    """Fetches all users from the Firestore 'users' collection."""
    users = {}
    if db is None:
        return users
        
    try:
        docs = db.collection("users").stream()
        for doc in docs:
            users[doc.id] = doc.to_dict()
    except Exception as e:
        logger.error(f"Error loading users from Firestore: {e}")
    return users

def save_users(users: dict):
    """Saves user records into the Firestore 'users' collection."""
    if db is None:
        return
        
    try:
        batch = db.batch()
        for email_key, data in users.items():
            doc_ref = db.collection("users").document(email_key)
            batch.set(doc_ref, data)
        batch.commit()
    except Exception as e:
        logger.error(f"Error saving users to Firestore: {e}")

def load_all_watchlist_tickers() -> list:
    """Compiles all unique watchlist tickers from users in Firestore."""
    default_tickers = ["Tesla", "Apple", "Google", "Microsoft", "Nvidia", "Amazon"]
    if db is None:
        return default_tickers
        
    try:
        docs = db.collection("users").stream()
        tickers = set()
        for doc in docs:
            watchlist_str = doc.to_dict().get("watchlist", "")
            if watchlist_str:
                for symbol in watchlist_str.split(','):
                    symbol = symbol.strip()
                    if symbol:
                        tickers.add(symbol)
                        
        if not tickers:
            return default_tickers
            
        return sorted(list(tickers))
    except Exception as e:
        logger.error(f"Error compiling watchlist from Firestore: {e}")
        return default_tickers

def seed_demo_users():
    """Seeds two default demo users in Firestore for testing persistence."""
    if db is None:
        return
    try:
        import hashlib
        users_ref = db.collection("users")
        
        # Hash for 'password123'
        pass_hash = hashlib.sha256("password123".encode('utf-8')).hexdigest()
        
        demo_users = {
            "demo1@globepulse.com": {
                "first_name": "John",
                "last_name": "Doe",
                "email": "demo1@globepulse.com",
                "phone": "+1 555-0100",
                "password_hash": pass_hash,
                "watchlist": "Tesla,Apple,Google"
            },
            "demo2@globepulse.com": {
                "first_name": "Jane",
                "last_name": "Smith",
                "email": "demo2@globepulse.com",
                "phone": "+1 555-0200",
                "password_hash": pass_hash,
                "watchlist": "Microsoft,Nvidia,Amazon"
            }
        }
        
        for email, data in demo_users.items():
            doc_ref = users_ref.document(email)
            doc_ref.set(data, merge=True)
        logger.info("Successfully seeded demo users in Firestore.")
        
        # Seed mock articles too
        seed_demo_articles()
    except Exception as e:
        logger.error(f"Error seeding demo users: {e}")

def seed_demo_articles():
    """Seeds default sample articles with non-zero sentiment scores in Firestore."""
    if db is None:
        return
    try:
        import hashlib
        articles_ref = db.collection("articles")
        
        # Check if articles already exist
        existing = list(articles_ref.limit(1).stream())
        if existing:
            logger.info("Articles collection is already populated. Skipping seeding.")
            return

        mock_articles = [
            {
                "url": "https://example.com/tesla-1",
                "company_name": "Tesla",
                "content": "Tesla rolls out next-gen FSD software update, receiving widespread praise for smoother transitions and enhanced neural safety.",
                "date": "07/07/2026",
                "sentiment": {
                    "layoffs": None, "restructuring": None, "board_changes": None, "mergers": None,
                    "investor_activity": None, "esg": None, "revenue_growth": None, "product_launches": 0.8,
                    "expansion": None, "disputes": None, "geo_political": None, "macro_economic": None,
                    "partnerships": None, "cyber_security": None, "supply_chain": None, "labor_issues": None,
                    "product_recalls": None, "overall_sentiment": 0.75
                }
            },
            {
                "url": "https://example.com/tesla-2",
                "company_name": "Tesla",
                "content": "Tesla recalls 15,000 Model Y vehicles over seatbelt sensor issue, according to NHTSA filings.",
                "date": "07/05/2026",
                "sentiment": {
                    "layoffs": None, "restructuring": None, "board_changes": None, "mergers": None,
                    "investor_activity": None, "esg": None, "revenue_growth": None, "product_launches": None,
                    "expansion": None, "disputes": -0.5, "geo_political": None, "macro_economic": None,
                    "partnerships": None, "cyber_security": None, "supply_chain": None, "labor_issues": None,
                    "product_recalls": -0.8, "overall_sentiment": -0.40
                }
            },
            {
                "url": "https://example.com/tesla-3",
                "company_name": "Tesla",
                "content": "Tesla stock rallies as retail interest spikes following CEO's Miami robotaxi demonstration.",
                "date": "07/06/2026",
                "sentiment": {
                    "layoffs": None, "restructuring": None, "board_changes": None, "mergers": None,
                    "investor_activity": 0.7, "esg": None, "revenue_growth": None, "product_launches": 0.6,
                    "expansion": None, "disputes": None, "geo_political": None, "macro_economic": None,
                    "partnerships": None, "cyber_security": None, "supply_chain": None, "labor_issues": None,
                    "product_recalls": None, "overall_sentiment": 0.80
                }
            },
            {
                "url": "https://example.com/apple-1",
                "company_name": "Apple",
                "content": "Apple signs new multi-billion dollar chip supply contract with Broadcom for upcoming hardware design cycle.",
                "date": "07/07/2026",
                "sentiment": {
                    "layoffs": None, "restructuring": None, "board_changes": None, "mergers": None,
                    "investor_activity": None, "esg": None, "revenue_growth": None, "product_launches": None,
                    "expansion": None, "disputes": None, "geo_political": None, "macro_economic": None,
                    "partnerships": 0.85, "cyber_security": None, "supply_chain": 0.7, "labor_issues": None,
                    "product_recalls": None, "overall_sentiment": 0.80
                }
            },
            {
                "url": "https://example.com/apple-2",
                "company_name": "Apple",
                "content": "Apple Intelligence gains significant popularity as developers explore new system capabilities in beta channels.",
                "date": "07/04/2026",
                "sentiment": {
                    "layoffs": None, "restructuring": None, "board_changes": None, "mergers": None,
                    "investor_activity": None, "esg": None, "revenue_growth": None, "product_launches": 0.6,
                    "expansion": None, "disputes": None, "geo_political": None, "macro_economic": None,
                    "partnerships": None, "cyber_security": None, "supply_chain": None, "labor_issues": None,
                    "product_recalls": None, "overall_sentiment": 0.60
                }
            },
            {
                "url": "https://example.com/google-1",
                "company_name": "Google",
                "content": "Google launches two new lightweight generative AI models, outperforming major proprietary alternatives in speed and cost.",
                "date": "07/07/2026",
                "sentiment": {
                    "layoffs": None, "restructuring": None, "board_changes": None, "mergers": None,
                    "investor_activity": None, "esg": None, "revenue_growth": None, "product_launches": 0.95,
                    "expansion": None, "disputes": None, "geo_political": None, "macro_economic": None,
                    "partnerships": None, "cyber_security": None, "supply_chain": None, "labor_issues": None,
                    "product_recalls": None, "overall_sentiment": 0.90
                }
            },
            {
                "url": "https://example.com/google-2",
                "company_name": "Google",
                "content": "Google Cloud announces expansion of server footprint in India to support growing corporate AI compute workloads.",
                "date": "07/05/2026",
                "sentiment": {
                    "layoffs": None, "restructuring": None, "board_changes": None, "mergers": None,
                    "investor_activity": None, "esg": None, "revenue_growth": None, "product_launches": None,
                    "expansion": 0.8, "disputes": None, "geo_political": None, "macro_economic": None,
                    "partnerships": None, "cyber_security": None, "supply_chain": None, "labor_issues": None,
                    "product_recalls": None, "overall_sentiment": 0.70
                }
            },
            {
                "url": "https://example.com/microsoft-1",
                "company_name": "Microsoft",
                "content": "Microsoft announces reorganization of Xbox gaming division, cutting 4,800 jobs globally.",
                "date": "07/07/2026",
                "sentiment": {
                    "layoffs": -0.9, "restructuring": -0.8, "board_changes": None, "mergers": None,
                    "investor_activity": None, "esg": None, "revenue_growth": None, "product_launches": None,
                    "expansion": -0.4, "disputes": None, "geo_political": None, "macro_economic": None,
                    "partnerships": None, "cyber_security": None, "supply_chain": None, "labor_issues": None,
                    "product_recalls": None, "overall_sentiment": -0.85
                }
            },
            {
                "url": "https://example.com/microsoft-2",
                "company_name": "Microsoft",
                "content": "Microsoft Cloud quarterly revenue beats expectations, growing 22% year-over-year.",
                "date": "07/03/2026",
                "sentiment": {
                    "layoffs": None, "restructuring": None, "board_changes": None, "mergers": None,
                    "investor_activity": None, "esg": None, "revenue_growth": 0.9, "product_launches": None,
                    "expansion": 0.7, "disputes": None, "geo_political": None, "macro_economic": None,
                    "partnerships": None, "cyber_security": None, "supply_chain": None, "labor_issues": None,
                    "product_recalls": None, "overall_sentiment": 0.80
                }
            },
            {
                "url": "https://example.com/nvidia-1",
                "company_name": "Nvidia",
                "content": "Nvidia AI chips in massive demand as cloud providers double capital expenditure forecasts.",
                "date": "07/07/2026",
                "sentiment": {
                    "layoffs": None, "restructuring": None, "board_changes": None, "mergers": None,
                    "investor_activity": 0.8, "esg": None, "revenue_growth": 0.9, "product_launches": None,
                    "expansion": None, "disputes": None, "geo_political": None, "macro_economic": None,
                    "partnerships": None, "cyber_security": None, "supply_chain": None, "labor_issues": None,
                    "product_recalls": None, "overall_sentiment": 0.85
                }
            },
            {
                "url": "https://example.com/nvidia-2",
                "company_name": "Nvidia",
                "content": "Rumors of next-gen AI chip hardware design corrections send short-term stock price lower.",
                "date": "07/05/2026",
                "sentiment": {
                    "layoffs": None, "restructuring": None, "board_changes": None, "mergers": None,
                    "investor_activity": None, "esg": None, "revenue_growth": None, "product_launches": None,
                    "expansion": None, "disputes": None, "geo_political": None, "macro_economic": None,
                    "partnerships": None, "cyber_security": None, "supply_chain": -0.4, "labor_issues": None,
                    "product_recalls": None, "overall_sentiment": -0.30
                }
            },
            {
                "url": "https://example.com/amazon-1",
                "company_name": "Amazon",
                "content": "Amazon launches ultra-fast logistics hubs in major Indian metropolitan regions, competing directly with local startups.",
                "date": "07/07/2026",
                "sentiment": {
                    "layoffs": None, "restructuring": None, "board_changes": None, "mergers": None,
                    "investor_activity": None, "esg": None, "revenue_growth": None, "product_launches": None,
                    "expansion": 0.8, "disputes": None, "geo_political": None, "macro_economic": None,
                    "partnerships": None, "cyber_security": None, "supply_chain": None, "labor_issues": None,
                    "product_recalls": None, "overall_sentiment": 0.70
                }
            },
            {
                "url": "https://example.com/amazon-2",
                "company_name": "Amazon",
                "content": "Amazon extends warehouse robotics deployment, planning integration of 10,000 new automated units next quarter.",
                "date": "07/04/2026",
                "sentiment": {
                    "layoffs": None, "restructuring": None, "board_changes": None, "mergers": None,
                    "investor_activity": None, "esg": None, "revenue_growth": None, "product_launches": 0.7,
                    "expansion": 0.6, "supply_chain": 0.5, "labor_issues": None, "product_recalls": None,
                    "overall_sentiment": 0.65
                }
            }
        ]

        batch = db.batch()
        for art in mock_articles:
            doc_id = hashlib.sha256(art['url'].encode('utf-8')).hexdigest()
            doc_ref = articles_ref.document(doc_id)
            batch.set(doc_ref, art)
        batch.commit()
        logger.info("Successfully seeded mock articles in Firestore.")
    except Exception as e:
        logger.error(f"Error seeding mock articles: {e}")
