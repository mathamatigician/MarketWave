import os
import json
import time
import logging
from typing import Optional
from google.cloud import firestore

# Setup Logger
logger = logging.getLogger("Database")

from config import settings

# Firestore mode is decided purely by whether FIRESTORE_EMULATOR_HOST is set in
# the process environment (config.py sets it from settings.firestore_emulator_host
# unless GOOGLE_APPLICATION_CREDENTIALS/K_SERVICE are present). Emulator mode keeps
# today's lenient local-file fallback; cloud mode hard-fails instead of risking
# silent data divergence between a developer's machine and the real database.
FIRESTORE_MODE = "emulator" if "FIRESTORE_EMULATOR_HOST" in os.environ else "cloud"

# Company name -> real market ticker symbol. Lives here (not main.py) so both
# main.py and pipeline.py can import it without a circular import (main.py
# already imports pipeline). This app otherwise works in company-name space
# throughout (watchlists, run_pipeline's ticker_arg) -- this map is the one
# place that bridges to a real tradeable symbol, e.g. for a news API that
# takes symbols rather than free-text company names.
COMPANY_TICKER_MAP = {
    "Tesla": "TSLA",
    "Apple": "AAPL",
    "Google": "GOOG",
    "Microsoft": "MSFT",
    "Nvidia": "NVDA",
    "Amazon": "AMZN",
    "Intel": "INTC",
    "Meta": "META",
    "Reliance Industries": "RELIANCE.NS",
    "Tata Motors": "TATAMOTORS.NS",
    "Infosys": "INFY.NS"
}

db = None
if settings.firestore_project_id:
    try:
        db = firestore.Client(project=settings.firestore_project_id)
        logger.info(f"Firestore Client initialized successfully ({FIRESTORE_MODE} mode).")
    except Exception as e:
        logger.error(f"Failed to initialize Firestore Client: {e}")
        if FIRESTORE_MODE == "cloud":
            raise RuntimeError(
                f"Firestore client failed to initialize in cloud mode: {e}"
            ) from e
        db = None
else:
    logger.info("Firestore Client initialization skipped (no FIRESTORE_PROJECT_ID configured).")


def _handle_firestore_failure(action: str, exc: Exception) -> None:
    """Handles a Firestore operation failure.

    In emulator mode, logs and lets the caller fall back to its local JSON
    file, matching today's lenient offline-friendly behavior. In cloud mode,
    re-raises so callers cannot silently fall back to a local file and let
    data quietly diverge from the real, shared database.
    """
    logger.error(f"Error {action}: {exc}")
    if FIRESTORE_MODE == "cloud":
        raise RuntimeError(f"Firestore operation failed in cloud mode while {action}") from exc


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
            _handle_firestore_failure("loading users from Firestore", e)
            
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
            _handle_firestore_failure("saving users to Firestore", e)
            
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

def get_orders_file_path() -> str:
    """Resolves the path to the local orders.json file."""
    if os.path.exists('orders.json'):
        return 'orders.json'
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_dir, 'orders.json')

def save_order(order_id: str, data: dict) -> None:
    """Persists a subscription order (order_id -> plan_id/email) at creation time.

    This is the source of truth for what a payment actually paid for, so that
    payment verification can bind the granted plan to the stored order instead
    of trusting client-supplied request fields.
    """
    if db is not None:
        try:
            db.collection("orders").document(order_id).set(data)
            logger.info(f"Saved order {order_id} to Firestore.")
            return
        except Exception as e:
            _handle_firestore_failure(f"saving order {order_id} to Firestore", e)

    # Fallback to local orders.json
    try:
        filepath = get_orders_file_path()
        orders = {}
        if os.path.exists(filepath):
            with open(filepath, 'r') as f:
                orders = json.load(f)
        orders[order_id] = data
        with open(filepath, 'w') as f:
            json.dump(orders, f, indent=4)
        logger.info(f"Saved order {order_id} to local file: {filepath}")
    except Exception as e:
        logger.error(f"Error saving order {order_id} to local file: {e}")

def get_order(order_id: str) -> Optional[dict]:
    """Fetches a previously created order by ID, Firestore first, then local file."""
    if db is not None:
        try:
            doc = db.collection("orders").document(order_id).get()
            if doc.exists:
                return doc.to_dict()
        except Exception as e:
            _handle_firestore_failure(f"fetching order {order_id} from Firestore", e)

    filepath = get_orders_file_path()
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r') as f:
                orders = json.load(f)
            return orders.get(order_id)
        except Exception as e:
            logger.error(f"Error reading local orders file: {e}")
    return None

_watchlist_tickers_cache: Optional[list] = None
_watchlist_tickers_cached_at: float = 0.0
_WATCHLIST_CACHE_TTL_SECONDS = 60  # matches main.py's per-ticker cooldown window

def load_all_watchlist_tickers() -> list:
    """Compiles all unique watchlist tickers from users, falling back to local users.json.

    Cached in-process for _WATCHLIST_CACHE_TTL_SECONDS. This is called on
    every unauthenticated POST /api/pipeline/run?ticker=X request in
    main.py (to validate the ticker before the 429 cooldown check even
    runs), which itself calls load_users() and streams the entire `users`
    collection -- without this cache, that's unauthenticated Firestore read
    amplification: cheap for a caller to trigger repeatedly, not cheap for
    Firestore. The cache benefits every caller (including run_pipeline's
    own unscoped path), not just main.py's route.
    """
    global _watchlist_tickers_cache, _watchlist_tickers_cached_at
    now = time.time()
    if _watchlist_tickers_cache is not None and (now - _watchlist_tickers_cached_at) < _WATCHLIST_CACHE_TTL_SECONDS:
        return _watchlist_tickers_cache

    default_tickers = ["Tesla", "Apple", "Google", "Microsoft", "Nvidia", "Amazon"]

    users = load_users()
    if not users:
        result = default_tickers
    else:
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

            result = sorted(list(tickers)) if tickers else default_tickers
        except Exception as e:
            logger.error(f"Error compiling watchlist: {e}")
            result = default_tickers

    _watchlist_tickers_cache = result
    _watchlist_tickers_cached_at = now
    return result

def seed_demo_users():
    """Seeds default demo users and local JSON users in Firestore for testing persistence."""
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
                "watchlist": "Tesla,Apple,Google",
                "subscription": {
                    "plan_id": "pro",
                    "plan_name": "Pro Trader",
                    "status": "active",
                    "badge": "PRO"
                }
            },
            "demo2@globepulse.com": {
                "first_name": "Jane",
                "last_name": "Smith",
                "email": "demo2@globepulse.com",
                "phone": "+1 555-0200",
                "password_hash": pass_hash,
                "watchlist": "Microsoft,Nvidia,Amazon",
                "subscription": {
                    "plan_id": "free",
                    "plan_name": "Starter",
                    "status": "active",
                    "badge": "FREE"
                }
            }
        }
        
        # Also seed any local users from users.json so that existing sessions work
        filepath = get_users_file_path()
        if os.path.exists(filepath):
            try:
                with open(filepath, 'r') as f:
                    local_users = json.load(f)
                for email, udata in local_users.items():
                    if email not in demo_users:
                        # Make sure there is a default watchlist if missing
                        if "watchlist" not in udata:
                            udata["watchlist"] = "Tesla,Apple,Google"
                        if "subscription" not in udata:
                            udata["subscription"] = {
                                "plan_id": "free",
                                "plan_name": "Starter",
                                "status": "active",
                                "badge": "FREE"
                            }
                        demo_users[email] = udata
            except Exception as e:
                logger.error(f"Error reading users.json for seeding: {e}")
        
        for email, data in demo_users.items():
            doc_ref = users_ref.document(email)
            doc_ref.set(data, merge=True)
        logger.info("Successfully seeded demo and local users in Firestore.")
        
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

def get_feedback_file_path() -> str:
    """Resolves the path to the local feedback.json file."""
    if os.path.exists('feedback.json'):
        return 'feedback.json'
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_dir, 'feedback.json')

def load_feedback() -> list:
    """Loads all feedback entries from Firestore if available, otherwise from feedback.json."""
    feedbacks = []
    if db is not None:
        try:
            docs = db.collection("feedback").stream()
            for doc in docs:
                feedbacks.append(doc.to_dict())
            if feedbacks:
                logger.info("Loaded feedback entries from Firestore.")
                feedbacks = sorted(feedbacks, key=lambda x: x.get('created_at', ''), reverse=True)
                return feedbacks
        except Exception as e:
            _handle_firestore_failure("loading feedback from Firestore", e)

    filepath = get_feedback_file_path()
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r') as f:
                feedbacks = json.load(f)
            logger.info(f"Loaded feedback from local file: {filepath}")
        except Exception as e:
            logger.error(f"Error loading local feedback file: {e}")
            feedbacks = []

    feedbacks = sorted(feedbacks, key=lambda x: x.get('created_at', ''), reverse=True)
    return feedbacks

def save_feedback(feedback_item: dict) -> None:
    """Persists a new feedback entry to Firestore and local feedback.json."""
    if db is not None:
        try:
            doc_id = feedback_item.get("id")
            if doc_id:
                db.collection("feedback").document(doc_id).set(feedback_item)
                logger.info(f"Saved feedback {doc_id} to Firestore.")
        except Exception as e:
            _handle_firestore_failure("saving feedback to Firestore", e)

    try:
        filepath = get_feedback_file_path()
        dir_name = os.path.dirname(filepath)
        if dir_name:
            os.makedirs(dir_name, exist_ok=True)
            
        current_list = []
        if os.path.exists(filepath):
            try:
                with open(filepath, 'r') as f:
                    current_list = json.load(f)
            except Exception:
                current_list = []

        current_list.insert(0, feedback_item)
        with open(filepath, 'w') as f:
            json.dump(current_list, f, indent=4)
        logger.info(f"Saved feedback to local file: {filepath}")
    except Exception as e:
        logger.error(f"Error saving feedback to local file: {e}")

def seed_demo_feedback(force_reset: bool = False):
    """Seeds default sample feedback entries into local feedback.json and Firestore if empty or forced."""
    sample_feedbacks = [
        {
            "id": "fb_demo_1",
            "rating": "Excellent",
            "comment": "The real-time sentiment watchdog is game-changing! Caught the TSLA sentiment shift right before the Q3 earnings call.",
            "user_name": "Arjun Mehta",
            "user_email": "hello@javacapital.co",
            "created_at": "2026-08-16T14:20:00Z"
        },
        {
            "id": "fb_demo_2",
            "rating": "Excellent",
            "comment": "Extremely impressive AI orchestration. The sub-agent thought stream gives complete transparency into how sentiment scores are calculated.",
            "user_name": "Zain Sheikh",
            "user_email": "contact.zauey@gmail.com",
            "created_at": "2026-08-15T10:45:00Z"
        },
        {
            "id": "fb_demo_3",
            "rating": "Good",
            "comment": "Love the stock price vs sentiment overlay charts. Would love to see support for crypto tickers and European index options in future updates.",
            "user_name": "Aarav Goodall",
            "user_email": "agoodall@hunterbond.com",
            "created_at": "2026-08-15T09:30:00Z"
        },
        {
            "id": "fb_demo_4",
            "rating": "Excellent",
            "comment": "Seamless integration with Razorpay UPI payments for Pro Trader subscription. Clean UI design and lightning-fast websocket chat response.",
            "user_name": "Fatima Hussain",
            "user_email": "fatimahhussain@berkeley.edu",
            "created_at": "2026-08-14T15:10:00Z"
        },
        {
            "id": "fb_demo_5",
            "rating": "Need Improvement",
            "comment": "The dark mode aesthetic is top-notch, but initial watchlist aggregation latency can occasionally spike during high news volume hours.",
            "user_name": "Mukesh Sharma",
            "user_email": "mukesh@equibeeipo.com",
            "created_at": "2026-08-14T11:15:00Z"
        },
        {
            "id": "fb_demo_6",
            "rating": "Excellent",
            "comment": "The 18-topic granular sentiment breakdown (layoffs, board changes, disputes, ESG) provides insights that raw news summaries completely miss.",
            "user_name": "Tim Thomas",
            "user_email": "tim@techwithtim.net",
            "created_at": "2026-08-13T16:05:00Z"
        },
        {
            "id": "fb_demo_7",
            "rating": "Good",
            "comment": "Great financial AI copilot. Answers detailed questions on market trends effortlessly. Highly recommended for daily market monitoring.",
            "user_name": "Mayank Shah",
            "user_email": "heymayankshah@gmail.com",
            "created_at": "2026-08-13T12:50:00Z"
        },
        {
            "id": "fb_demo_8",
            "rating": "Need Improvement",
            "comment": "Solid platform overall. Suggest adding export functionality for sentiment history as CSV so we can pipe data into custom models.",
            "user_name": "Akshay Khanna",
            "user_email": "akshay.khanna@gmail.com",
            "created_at": "2026-08-12T08:40:00Z"
        },
        {
            "id": "fb_demo_9",
            "rating": "Excellent",
            "comment": "The real-time WebSocket sentiment heatmap streaming gives our desk an edge during early morning market opens. Remarkable accuracy.",
            "user_name": "Rohit Kumar",
            "user_email": "rohitcsk88@gmail.com",
            "created_at": "2026-08-11T18:25:00Z"
        },
        {
            "id": "fb_demo_10",
            "rating": "Good",
            "comment": "The Gemini 2.5 integration provides concise, context-aware macro summaries without the fluff. Very clean UI interface.",
            "user_name": "Vivian Rao",
            "user_email": "vivian@streaml.app",
            "created_at": "2026-08-10T14:15:00Z"
        }
    ]

    filepath = get_feedback_file_path()
    if force_reset or not os.path.exists(filepath):
        try:
            dir_name = os.path.dirname(filepath)
            if dir_name:
                os.makedirs(dir_name, exist_ok=True)
            with open(filepath, 'w') as f:
                json.dump(sample_feedbacks, f, indent=4)
            logger.info("Successfully seeded realistic demo feedbacks in local feedback.json.")
        except Exception as e:
            logger.error(f"Error seeding demo feedbacks locally: {e}")

    if db is not None:
        try:
            coll = db.collection("feedback")
            existing = list(coll.limit(1).stream())
            if force_reset or not existing:
                batch = db.batch()
                for fb in sample_feedbacks:
                    doc_ref = coll.document(fb["id"])
                    batch.set(doc_ref, fb)
                batch.commit()
                logger.info("Successfully seeded realistic demo feedbacks in Firestore.")
        except Exception as e:
            logger.error(f"Error seeding demo feedbacks in Firestore: {e}")

