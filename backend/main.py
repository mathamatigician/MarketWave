import os
import sys
import json
import logging
import time
from typing import List, Optional, Dict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd

# Ensure backend directory is first in sys.path so we prioritize backend files
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import database
import functions
import pipeline
import subscription
import config
from config import settings
import google_auth as google_auth_module
from google.antigravity import Agent, LocalAgentConfig
from backend.agents.orchestrator import orchestrator_config

# Initialize Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("GlobePulseBackend")

app = FastAPI(title="GlobePulse API Backend")

@app.on_event("startup")
def startup_event():
    database.seed_demo_users()
    database.seed_demo_feedback()

# Setup CORS to allow React Frontend (including mobile LAN IPs during local
# dev only -- see config.get_lan_origin_regex(), never applied on Cloud Run).
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.get_allowed_origins(),
    allow_origin_regex=config.get_lan_origin_regex(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory per-ticker cooldown for scoped (non-admin) pipeline runs.
# Resets on process restart -- this is a spam-guard, not a durability
# guarantee, and that's an acceptable tradeoff for this use case.
_PIPELINE_COOLDOWN_SECONDS = 60
_last_ticker_run: Dict[str, float] = {}

# In-process set of connected /ws/ingest clients, for broadcasting live
# pipeline activity. A plain set, not per-user scoped -- every connected
# client sees every in-flight run's activity, which is acceptable at this
# app's scale (matches this feature's spec).
_ingest_websockets: set = set()

async def broadcast_ingest_activity(event: dict):
    """Sends one pipeline activity event to every connected /ws/ingest client.

    Drops any socket that raises (disconnected) rather than letting one
    dead connection break the broadcast for everyone else.
    """
    dead = set()
    # Iterate a snapshot, not the live set -- a client connecting or
    # disconnecting mid-broadcast mutates _ingest_websockets concurrently,
    # which would otherwise raise "Set changed size during iteration" and
    # silently abort the broadcast partway through.
    for ws in list(_ingest_websockets):
        try:
            await ws.send_json(event)
        except Exception:
            dead.add(ws)
    _ingest_websockets.difference_update(dead)

# Moved to database.py so pipeline.py can use it too (without a circular
# import back into main.py). Kept as a module-level name here for backward
# compatibility with the rest of this file's existing references.
COMPANY_TICKER_MAP = database.COMPANY_TICKER_MAP

# --- Pydantic Request Models ---
class LoginRequest(BaseModel):
    email: str
    password: str

class GoogleAuthRequest(BaseModel):
    credential: str  # the ID token JWT from Google's Sign In button

class SignupRequest(BaseModel):
    first_name: str
    last_name: Optional[str] = ""
    email: str
    password: str
    phone: Optional[str] = ""

class WatchlistRequest(BaseModel):
    email: str
    tickers: List[str]

class CreateOrderRequest(BaseModel):
    email: str
    plan_id: str

class VerifyPaymentRequest(BaseModel):
    email: str
    plan_id: str
    razorpay_order_id: Optional[str] = ""
    razorpay_payment_id: Optional[str] = ""
    razorpay_signature: Optional[str] = ""

# --- REST Routes ---

def _sanitize_email(email: str) -> str:
    """Validates and normalizes email inputs to prevent injection and malformed lookups."""
    if not email or not isinstance(email, str) or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email address format")
    sanitized = email.strip().lower()
    if len(sanitized) > 254:
        raise HTTPException(status_code=400, detail="Email address exceeds maximum length")
    return sanitized

@app.post("/api/signup")
def signup(req: SignupRequest):
    users = database.load_users()
    email_key = _sanitize_email(req.email)
    
    if email_key in users:
        raise HTTPException(status_code=400, detail="User already exists")

    if len(users) >= settings.max_total_users:
        raise HTTPException(status_code=403, detail=config.SIGNUP_CLOSED_MESSAGE)

    password_hash = functions.hash_password(req.password)
    users[email_key] = {
        "first_name": req.first_name,
        "last_name": req.last_name,
        "email": req.email,
        "phone": req.phone,
        "password_hash": password_hash,
        "watchlist": "Tesla,Apple,Google",  # Default watchlist
        "subscription": {
            "plan_id": "free",
            "plan_name": "Starter",
            "status": "active",
            "badge": "FREE"
        }
    }
    database.save_users(users)
    return {"message": "Signup successful"}

@app.post("/api/login")
def login(req: LoginRequest):
    users = database.load_users()
    email_key = _sanitize_email(req.email)
    
    if email_key not in users:
        raise HTTPException(status_code=400, detail="User does not exist")
        
    stored_hash = users[email_key].get("password_hash", "")
    
    if not functions.verify_password(req.password, stored_hash):
        raise HTTPException(status_code=400, detail="Incorrect password")
        
    user_info = users[email_key]
    watchlist_str = user_info.get("watchlist", "")
    watchlist = [t.strip() for t in watchlist_str.split(",") if t.strip()]
    sub_info = user_info.get("subscription", {
        "plan_id": "free",
        "plan_name": "Starter",
        "status": "active",
        "badge": "FREE"
    })
    
    return {
        "email": email_key,
        "first_name": user_info.get("first_name"),
        "last_name": user_info.get("last_name"),
        "watchlist": watchlist,
        "subscription": sub_info
    }

@app.post("/api/auth/google")
def google_auth(req: GoogleAuthRequest):
    try:
        user_info = google_auth_module.verify_and_get_user(req.credential)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google token")
    except google_auth_module.SignupCapReached:
        raise HTTPException(status_code=403, detail=config.SIGNUP_CLOSED_MESSAGE)

    watchlist_str = user_info.get("watchlist", "")
    watchlist = [t.strip() for t in watchlist_str.split(",") if t.strip()]

    return {
        "email": user_info.get("email"),
        "first_name": user_info.get("first_name"),
        "last_name": user_info.get("last_name"),
        "watchlist": watchlist,
        "subscription": user_info.get("subscription"),
        "picture": user_info.get("picture", ""),
    }

@app.get("/api/watchlist")
def get_watchlist(email: str = Query(...)):
    users = database.load_users()
    email_key = _sanitize_email(email)
    if email_key not in users:
        raise HTTPException(status_code=404, detail="User not found")
        
    watchlist_str = users[email_key].get("watchlist", "")
    watchlist = [t.strip() for t in watchlist_str.split(",") if t.strip()]
    return {
        "watchlist": watchlist,
        "all_options": list(COMPANY_TICKER_MAP.keys())
    }

@app.post("/api/watchlist")
def update_watchlist(req: WatchlistRequest):
    users = database.load_users()
    email_key = _sanitize_email(req.email)
    if email_key not in users:
        raise HTTPException(status_code=404, detail="User not found")
        
    users[email_key]["watchlist"] = ",".join(req.tickers)
    database.save_users(users)
    return {"message": "Watchlist updated successfully", "watchlist": req.tickers}

# --- Subscription & Payment Gateway Routes ---

@app.get("/api/subscription/plans")
def get_plans():
    return list(subscription.SUBSCRIPTION_PLANS.values())

@app.get("/api/subscription/status")
def get_subscription_status(email: str = Query(...)):
    users = database.load_users()
    email_key = _sanitize_email(email)
    if email_key not in users:
        raise HTTPException(status_code=404, detail="User not found")
    user_info = users[email_key]
    sub = user_info.get("subscription", {
        "plan_id": "free",
        "plan_name": "Starter",
        "status": "active",
        "badge": "FREE"
    })
    return sub

@app.post("/api/subscription/create-order")
def create_order(req: CreateOrderRequest):
    try:
        clean_email = _sanitize_email(req.email)
        order_details = subscription.create_subscription_order(req.plan_id, clean_email)
        return order_details
    except Exception as e:
        logger.error(f"Error creating subscription order: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/subscription/verify-payment")
def verify_payment(req: VerifyPaymentRequest):
    users = database.load_users()
    email_key = _sanitize_email(req.email)
    if email_key not in users:
        raise HTTPException(status_code=404, detail="User not found")
        
    plan = subscription.SUBSCRIPTION_PLANS.get(req.plan_id)
    if not plan:
        raise HTTPException(status_code=400, detail="Invalid subscription plan ID")
        
    # Free tier update (Starter)
    if req.plan_id == "free":
        sub_info = {
            "plan_id": "free",
            "plan_name": plan["name"],
            "status": "active",
            "badge": plan["badge"],
            "payment_id": "free_tier"
        }
        users[email_key]["subscription"] = sub_info
        database.save_users(users)
        return {"status": "success", "message": "Subscribed to Starter plan", "subscription": sub_info}
        
    # Verify payment signature for paid plans (Pro / Enterprise)
    if not req.razorpay_order_id or not req.razorpay_payment_id or not req.razorpay_signature:
        raise HTTPException(status_code=400, detail="Missing payment verification signature parameters")
        
    is_valid = subscription.verify_payment_signature(
        req.razorpay_order_id,
        req.razorpay_payment_id,
        req.razorpay_signature
    )

    if not is_valid:
        raise HTTPException(status_code=400, detail="Razorpay payment signature verification failed")

    # Grant the plan the order was actually created (and paid) for -- never the
    # client-supplied plan_id -- so a genuinely valid signature for a cheaper
    # plan's order can't be replayed with a different plan_id to claim a more
    # expensive plan than what was paid.
    verified_plan_id = subscription.resolve_verified_plan_id(req.razorpay_order_id, req.email)
    if not verified_plan_id:
        raise HTTPException(status_code=400, detail="No matching order found for this payment")
    if verified_plan_id != req.plan_id:
        logger.warning(
            f"Plan mismatch for {req.email}: requested '{req.plan_id}' but order "
            f"{req.razorpay_order_id} was created for '{verified_plan_id}'"
        )
        raise HTTPException(status_code=400, detail="Requested plan does not match the paid order")

    plan = subscription.SUBSCRIPTION_PLANS[verified_plan_id]

    import datetime
    sub_info = {
        "plan_id": verified_plan_id,
        "plan_name": plan["name"],
        "status": "active",
        "badge": plan["badge"],
        "order_id": req.razorpay_order_id,
        "payment_id": req.razorpay_payment_id,
        "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }

    users[email_key]["subscription"] = sub_info
    database.save_users(users)
    logger.info(f"Successfully upgraded subscription for {req.email} to {plan['name']}")
    return {"status": "success", "message": f"Successfully upgraded to {plan['name']}!", "subscription": sub_info}


@app.get("/api/sentiment/heatmap")
def get_heatmap(email: str = Query(...), ticker: Optional[str] = Query(None)):
    users = database.load_users()
    email_key = _sanitize_email(email)
    if email_key not in users:
        raise HTTPException(status_code=404, detail="User not found")
        
    watchlist_str = users[email_key].get("watchlist", "")
    watchlist = [t.strip() for t in watchlist_str.split(",") if t.strip()]
    
    # Filter by specific ticker if provided and not 'ALL'.
    # An unmatched ticker leaves the watchlist empty, which keeps the response
    # scoped to the user's own watchlist (falls through to the `not allowed` guard).
    if ticker and ticker.strip().upper() != "ALL":
        target = ticker.strip().upper()
        watchlist = [t for t in watchlist if t.upper() == target]

    # Compile allowed companies & tickers
    allowed = set()
    for item in watchlist:
        allowed.add(item)
        mapped = COMPANY_TICKER_MAP.get(item)
        if mapped:
            allowed.add(mapped)
        for name, tick in COMPANY_TICKER_MAP.items():
            if tick == item:
                allowed.add(name)
                
    if not allowed:
        return []

    sentiments_list = []
    try:
        # Stream matching articles from Firestore
        docs = database.db.collection("articles").where("company_name", "in", list(allowed)).stream()
        for doc in docs:
            data = doc.to_dict()
            sentiment_map = data.get("sentiment")
            if sentiment_map:
                sentiments_list.append(sentiment_map)
    except Exception as e:
        logger.error(f"Error querying heatmap from Firestore: {e}")
        return []
        
    if not sentiments_list:
        return []
        
    agg_df = functions.aggregate_sentiment(sentiments_list)
    # Convert dataframe to JSON response list and sanitize NaN/inf values
    import math
    records = agg_df.to_dict(orient="records")
    cleaned_records = []
    for r in records:
        cleaned_r = {}
        for k, v in r.items():
            if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                cleaned_r[k] = None
            else:
                cleaned_r[k] = v
        cleaned_records.append(cleaned_r)
    return cleaned_records

@app.get("/api/stock/history")
def get_stock_history_api(ticker: str = Query(...), period: str = Query("30d")):
    # 1. Fetch stock historical price series
    try:
        # Resolve company name to ticker if necessary
        resolved_ticker = COMPANY_TICKER_MAP.get(ticker, ticker)
        price_series = functions.get_stock_history(resolved_ticker, period, interval='1d')
    except Exception as e:
        logger.error(f"Error fetching stock history: {e}")
        price_series = []
        
    # 2. Get Daily Sentiment Trend from Firestore
    sentiment_series = []
    recent_articles = []
    try:
        # Filter articles for ticker name/symbol
        allowed = {ticker, resolved_ticker}
        for name, tick in COMPANY_TICKER_MAP.items():
            if tick == resolved_ticker or name == ticker:
                allowed.add(name)
                allowed.add(tick)
                
        # Stream matching articles from Firestore
        docs = database.db.collection("articles").where("company_name", "in", list(allowed)).stream()
        rows = []
        raw_articles = []
        for doc in docs:
            data = doc.to_dict()
            sentiment_map = data.get("sentiment")
            date_val = data.get("date")
            if sentiment_map and date_val:
                # pass dict as string to match functions.transform_sentiment's eval call
                rows.append({
                    "date": date_val,
                    "sentiment": str(sentiment_map)
                })
                raw_articles.append(data)
                
        if rows:
            df = pd.DataFrame(rows)
            date_df = functions.transform_sentiment(df)
            sentiment_series = functions.transform_date_sentiment(date_df)
            
        # Get the 3 most recent articles
        sorted_articles = sorted(raw_articles, key=lambda x: x.get("date", ""), reverse=True)
        recent_articles = [{
            "url": a.get("url"),
            "content": a.get("content")[:180] + "..." if len(a.get("content", "")) > 180 else a.get("content", ""),
            "date": a.get("date"),
            "sentiment": a.get("sentiment", {})
        } for a in sorted_articles[:3]]
    except Exception as e:
        logger.error(f"Error parsing sentiment series from Firestore for chart: {e}")
            
    return {
        "price_series": price_series,
        "sentiment_series": sentiment_series,
        "recent_articles": recent_articles
    }

@app.post("/api/pipeline/run")
def trigger_pipeline(background_tasks: BackgroundTasks, ticker: Optional[str] = None, admin_key: Optional[str] = Query(None)):
    if ticker and ticker not in database.load_all_watchlist_tickers():
        # Unrecognized ticker string: the cooldown dict alone doesn't stop a
        # scripted caller from bypassing rate-limiting by varying the ticker
        # on every request (each new string gets its own fresh cooldown
        # entry). Only a ticker that's actually on some user's watchlist
        # gets the no-admin-key fast path; anything else falls through to
        # the same admin-gated path as an unscoped run.
        ticker = None

    if ticker:
        # Scoped, single-ticker run: bounded cost (~5 articles), no
        # admin_key required -- it's a legitimate user action, not an
        # admin one. Rate-limited per ticker to prevent spam-clicking from
        # hammering the Gemini API / Firestore.
        now = time.time()
        last_run = _last_ticker_run.get(ticker)
        if last_run is not None and (now - last_run) < _PIPELINE_COOLDOWN_SECONDS:
            raise HTTPException(status_code=429, detail=f"'{ticker}' was refreshed recently, please wait a moment.")
        _last_ticker_run[ticker] = now
    else:
        # Unscoped: refreshes every ticker across every user's watchlist --
        # genuinely expensive, shared-cost. Stays admin-gated, unchanged.
        actual_admin_key = settings.admin_key or os.getenv("ADMIN_KEY")
        if not actual_admin_key:
            logger.error("Configuration Error: ADMIN_KEY is not set.")
            raise HTTPException(status_code=500, detail="Server configuration error")
        import hmac
        if not admin_key or not hmac.compare_digest(str(admin_key), str(actual_admin_key)):
            raise HTTPException(status_code=403, detail="Unauthorized")

    background_tasks.add_task(pipeline.run_pipeline, ticker, on_activity=broadcast_ingest_activity)
    return {"status": "started", "message": "Scraper pipeline running in background"}

def load_local_alerts():
    paths = [
        os.path.join('db', 'alerts.json'),
        os.path.join('backend', 'db', 'alerts.json')
    ]
    for p in paths:
        if os.path.exists(p):
            try:
                with open(p, 'r') as f:
                    return json.load(f)
            except Exception:
                pass
    return []

@app.get("/api/alerts")
def get_alerts():
    alerts = []
    try:
        if database.db is not None:
            # Fetch up to 20 recent alerts from Firestore
            docs = database.db.collection("alerts").order_by("timestamp", direction="DESCENDING").limit(20).stream()
            for doc in docs:
                alerts.append(doc.to_dict())
    except Exception as e:
        logger.error(f"Error fetching alerts from Firestore: {e}")
        
    if not alerts:
        try:
            alerts = load_local_alerts()
            def get_sort_key(x):
                ts = x.get('timestamp')
                if ts is None:
                    return 0.0
                if isinstance(ts, (int, float)):
                    return float(ts)
                if hasattr(ts, 'timestamp'):
                    try:
                        return float(ts.timestamp())
                    except Exception:
                        pass
                if hasattr(ts, 'seconds'):
                    return float(ts.seconds)
                if isinstance(ts, str):
                    try:
                        return float(ts)
                    except ValueError:
                        pass
                    try:
                        import datetime
                        return float(datetime.datetime.fromisoformat(ts.replace('Z', '+00:00')).timestamp())
                    except Exception:
                        pass
                return 0.0
            alerts = sorted(alerts, key=get_sort_key, reverse=True)[:20]
        except Exception as e:
            logger.error(f"Error loading local alerts: {e}")
            
    return alerts


# --- Feedback Routes ---

VALID_FEEDBACK_RATINGS = {"Need Improvement", "Good", "Excellent"}

class FeedbackRequest(BaseModel):
    rating: str
    comment: str
    user_name: Optional[str] = "Anonymous User"
    user_email: Optional[str] = "anonymous@globepulseai.com"

@app.get("/api/feedback")
def get_feedback():
    return database.load_feedback()

@app.post("/api/feedback")
def submit_feedback(req: FeedbackRequest):
    if req.rating not in VALID_FEEDBACK_RATINGS:
        raise HTTPException(status_code=400, detail="Invalid rating value")
    comment = req.comment.strip()
    if not comment:
        raise HTTPException(status_code=400, detail="Comment cannot be empty")

    import uuid
    import datetime
    feedback_item = {
        "id": f"fb_{uuid.uuid4().hex[:12]}",
        "rating": req.rating,
        "comment": comment,
        "user_name": (req.user_name or "").strip() or "Anonymous User",
        "user_email": (req.user_email or "").strip() or "anonymous@globepulseai.com",
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }
    database.save_feedback(feedback_item)
    return {"message": "Feedback submitted successfully", "feedback": feedback_item}


# --- WebSocket Chat Endpoint (Antigravity Agent) ---

@app.websocket("/ws/chat")
async def chat_websocket(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket chat connection established.")
    
    # Establish chat session using google-antigravity Agent
    try:
        async with Agent(orchestrator_config) as agent:
            while True:
                try:
                    # Receive payload
                    message = await websocket.receive_text()
                    try:
                        data = json.loads(message)
                    except Exception:
                        await websocket.send_json({"type": "error", "content": "Malformed JSON payload."})
                        continue

                    prompt = data.get("prompt")
                    if not prompt or not isinstance(prompt, str):
                        continue
                    
                    # Sanitize prompt and enforce maximum character limit to prevent resource exhaustion
                    clean_prompt = prompt.strip()[:4000]
                    if not clean_prompt:
                        continue
                        
                    response = await agent.chat(clean_prompt)
                    
                    # Step 1: Stream reasoning thoughts in real-time
                    async for thought_chunk in response.thoughts:
                        await websocket.send_json({
                            "type": "thought",
                            "content": thought_chunk
                        })
                        
                    # Step 2: Stream final text tokens in real-time
                    async for token_chunk in response:
                        await websocket.send_json({
                            "type": "token",
                            "content": token_chunk
                        })
                        
                    # Signal completion
                    await websocket.send_json({
                        "type": "done"
                    })
                    
                except WebSocketDisconnect:
                    logger.info("WebSocket chat connection closed.")
                    break
                except Exception as e:
                    import uuid
                    err_id = str(uuid.uuid4())
                    logger.error(f"WebSocket error [{err_id}]: {e}")
                    try:
                        await websocket.send_json({
                            "type": "error",
                            "content": f"An internal error occurred. Ref: {err_id}"
                        })
                    except Exception:
                        pass
                    break
    except Exception as e:
        logger.error(f"Error initializing Agent in chat WebSocket: {e}")


# --- WebSocket Ingest Activity Endpoint (Antigravity Agent) ---

@app.websocket("/ws/ingest")
async def ingest_activity_websocket(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket ingest-activity connection established.")
    _ingest_websockets.add(websocket)
    try:
        while True:
            # This channel is push-only from the server; we still need to
            # await something to detect a client-initiated disconnect.
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info("WebSocket ingest-activity connection closed.")
    finally:
        _ingest_websockets.discard(websocket)
