import os
import json
import logging
from google.cloud import firestore

# Setup Logger
logger = logging.getLogger("Database")

from config import settings

# Setup Firestore Client if environment is present
db = None
if "GOOGLE_APPLICATION_CREDENTIALS" in os.environ or "K_SERVICE" in os.environ or "USE_FIRESTORE" in os.environ:
    try:
        db = firestore.Client(project=settings.firestore_project_id)
        logger.info("Firestore Client initialized successfully.")
    except Exception as e:
        logger.error(f"Failed to initialize Firestore Client: {e}")
        db = None
else:
    logger.info("Firestore Client initialization skipped (local environment mode).")

def get_users_file_path() -> str:
    """Resolves the path to the local users.json file."""
    if os.path.exists('users.json'):
        return 'users.json'
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_dir, 'users.json')

def load_users() -> dict:
    """Fetches all users from Firestore if active, otherwise loads from local users.json."""
    users = {}
    
    # 1. Try Firestore if configured
    if db is not None:
        try:
            docs = db.collection("users").stream()
            for doc in docs:
                users[doc.id] = doc.to_dict()
            logger.info("Loaded users from Firestore.")
            return users
        except Exception as e:
            logger.error(f"Error loading users from Firestore: {e}")
            
    # 2. Fallback to local users.json
    filepath = get_users_file_path()
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r') as f:
                users = json.load(f)
            logger.info(f"Loaded users from local file: {filepath}")
        except Exception as e:
            logger.error(f"Error loading local users: {e}")
            
    return users

def save_users(users: dict):
    """Saves user records to Firestore if active, and always writes locally to users.json."""
    # 1. Try Firestore if configured
    if db is not None:
        try:
            batch = db.batch()
            for email_key, data in users.items():
                doc_ref = db.collection("users").document(email_key)
                batch.set(doc_ref, data)
            batch.commit()
            logger.info("Saved users to Firestore successfully.")
        except Exception as e:
            logger.error(f"Error saving users to Firestore: {e}")
            
    # 2. Always write to local users.json
    try:
        filepath = get_users_file_path()
        dir_name = os.path.dirname(filepath)
        if dir_name:
            os.makedirs(dir_name, exist_ok=True)
        with open(filepath, 'w') as f:
            json.dump(users, f, indent=4)
        logger.info(f"Saved users to local file: {filepath}")
    except Exception as e:
        logger.error(f"Error saving users to local file: {e}")

def load_all_watchlist_tickers() -> list:
    """Compiles all unique watchlist tickers from users, falling back to local users.json."""
    default_tickers = ["Tesla", "Apple", "Google", "Microsoft", "Nvidia", "Amazon"]
    
    users = load_users()
    if not users:
        return default_tickers
        
    try:
        tickers = set()
        for email_key, data in users.items():
            watchlist_val = data.get("watchlist", "")
            if watchlist_val:
                if isinstance(watchlist_val, list):
                    for symbol in watchlist_val:
                        symbol = symbol.strip()
                        if symbol:
                            tickers.add(symbol)
                else:
                    for symbol in watchlist_val.split(','):
                        symbol = symbol.strip()
                        if symbol:
                            tickers.add(symbol)
                            
        if not tickers:
            return default_tickers
            
        return sorted(list(tickers))
    except Exception as e:
        logger.error(f"Error compiling watchlist: {e}")
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
