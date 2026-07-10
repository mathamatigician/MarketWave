import os
import sys
import json
import logging
from typing import List, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd

# Ensure backend directory is first in sys.path so we prioritize backend files
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import database
import functions
import pipeline
from google.antigravity import Agent, LocalAgentConfig
from backend.agents.orchestrator import orchestrator_config

# Initialize Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("GlobePulseBackend")

app = FastAPI(title="GlobePulse API Backend")

@app.on_event("startup")
def startup_event():
    database.seed_demo_users()

# Setup CORS to allow React Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://localhost:8000",
        "http://127.0.0.1:8000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

# --- Pydantic Request Models ---
class LoginRequest(BaseModel):
    email: str
    password: str

class SignupRequest(BaseModel):
    first_name: str
    last_name: Optional[str] = ""
    email: str
    password: str
    phone: Optional[str] = ""

class WatchlistRequest(BaseModel):
    email: str
    tickers: List[str]

# --- REST Routes ---

@app.post("/api/signup")
def signup(req: SignupRequest):
    users = database.load_users()
    email_key = req.email.lower()
    
    if email_key in users:
        raise HTTPException(status_code=400, detail="User already exists")
        
    password_hash = functions.hash_password(req.password)
    users[email_key] = {
        "first_name": req.first_name,
        "last_name": req.last_name,
        "email": req.email,
        "phone": req.phone,
        "password_hash": password_hash,
        "watchlist": "Tesla,Apple,Google"  # Default watchlist
    }
    database.save_users(users)
    return {"message": "Signup successful"}

@app.post("/api/login")
def login(req: LoginRequest):
    users = database.load_users()
    email_key = req.email.lower()
    
    if email_key not in users:
        raise HTTPException(status_code=400, detail="User does not exist")
        
    stored_hash = users[email_key].get("password_hash")
    entered_hash = functions.hash_password(req.password)
    
    if stored_hash != entered_hash:
        raise HTTPException(status_code=400, detail="Incorrect password")
        
    user_info = users[email_key]
    watchlist_str = user_info.get("watchlist", "")
    watchlist = [t.strip() for t in watchlist_str.split(",") if t.strip()]
    
    return {
        "email": req.email,
        "first_name": user_info.get("first_name"),
        "last_name": user_info.get("last_name"),
        "watchlist": watchlist
    }

@app.get("/api/watchlist")
def get_watchlist(email: str = Query(...)):
    users = database.load_users()
    email_key = email.lower()
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
    email_key = req.email.lower()
    if email_key not in users:
        raise HTTPException(status_code=404, detail="User not found")
        
    users[email_key]["watchlist"] = ",".join(req.tickers)
    database.save_users(users)
    return {"message": "Watchlist updated successfully", "watchlist": req.tickers}

@app.get("/api/sentiment/heatmap")
def get_heatmap(email: str = Query(...)):
    users = database.load_users()
    email_key = email.lower()
    if email_key not in users:
        raise HTTPException(status_code=404, detail="User not found")
        
    watchlist_str = users[email_key].get("watchlist", "")
    watchlist = [t.strip() for t in watchlist_str.split(",") if t.strip()]
    
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
def trigger_pipeline(background_tasks: BackgroundTasks, ticker: Optional[str] = None):
    background_tasks.add_task(pipeline.run_pipeline, ticker)
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


# --- WebSocket Chat Endpoint (Antigravity Agent) ---

@app.websocket("/ws/chat")
async def chat_websocket(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket chat connection established.")
    
    # Establish chat session using google-antigravity Agent
    async with Agent(orchestrator_config) as agent:
        while True:
            try:
                # Receive payload
                message = await websocket.receive_text()
                data = json.loads(message)
                prompt = data.get("prompt")
                
                if not prompt:
                    continue
                    
                response = await agent.chat(prompt)
                
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
                logger.error(f"WebSocket error: {e}")
                try:
                    await websocket.send_json({
                        "type": "error",
                        "content": f"An error occurred: {str(e)}"
                    })
                except Exception:
                    pass
                break
