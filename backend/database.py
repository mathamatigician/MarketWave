import os
import logging
from google.cloud import firestore

# Setup Logger
logger = logging.getLogger("Database")

# Automatically default to the local Firestore Emulator if not running in cloud production
if "GOOGLE_APPLICATION_CREDENTIALS" not in os.environ and "K_SERVICE" not in os.environ:
    os.environ.setdefault("FIRESTORE_EMULATOR_HOST", "localhost:8080")
    logger.info("Configured default FIRESTORE_EMULATOR_HOST to localhost:8080")

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
