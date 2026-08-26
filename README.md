# GlobePulse AI: Financial News Monitoring and Sentiment Analysis

GlobePulse is a React + FastAPI app for tracking business and market-moving news, analyzing article sentiment, and comparing sentiment trends with stock price activity.

**🌐 Live at [globepulseai.com](https://globepulseai.com)** — frontend and backend run on Google Cloud Run, backed by real Cloud Firestore.

## Features
- **Sentiment Analysis:** Visualize news sentiment over time and by topic.
- **Price vs Sentiment:** Compare stock price behavior with sentiment signals.
- **Chat Assistant:** Ask questions about recent news using a streaming, agentic Gemini pipeline (WebSocket).
- **User Authentication:** Email/password sign-up and sign-in plus Google Sign-In, backed by Cloud Firestore.
- **Subscriptions:** Free, Pro Trader, and Enterprise plans with Razorpay checkout.
- **Live News Ingestion:** Company news pulled from the Finnhub API (Google News RSS scraping is kept only as a local-dev fallback — it's blocked on Cloud Run).

## Local Setup
1. Clone the repository or use the existing local folder.
2. Create and activate the virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```
3. Install backend and frontend dependencies:
   ```bash
   make install
   ```
4. Copy `.env.example` to `.env` and fill in `GEMINI_API_KEY`, `ADMIN_KEY`, and Razorpay test keys. The default `.env.example` values point at the local Firestore emulator; see the comments in that file to target real Cloud Firestore instead. Also copy `.env.example.frontend` to `frontend/.env`

5. Run all services (Firestore emulator, FastAPI backend, React frontend):
   ```bash
   make start        # or ./start.sh
   ```
   The frontend is served at `http://localhost:5173` and the FastAPI docs at `http://localhost:8000/docs`.

   Run `make help` to see individual dev targets (`make dev-backend`, `make dev-frontend`, `make dev-emulator`).

## Notes
- News is fetched live from the Finnhub API; Google News RSS scraping only runs as a local-dev fallback (Cloud Run blocks it).
- `GEMINI_API_KEY` (or `GOOGLE_API_KEY`), `ADMIN_KEY`, and Razorpay test keys should be set in a `.env` file or as environment variables — see `.env.example`.
- User, watchlist, and article data are stored in Cloud Firestore in production; local development can run against the Firestore emulator instead (no code changes needed, just env vars).

## Tech Stack
- React 19 (Vite + TypeScript) frontend
- FastAPI backend
- Google Cloud Firestore (Cloud Run in production; local emulator for dev)
- Google Gemini via the `google-antigravity` agent SDK
- Finnhub (news), YahooQuery (stock prices)
- Razorpay (subscriptions/payments)
- Pandas, NumPy
- Deployed on Google Cloud Run (`globepulseai.com`)

## Architecture
See [ARCHITECTURE.md](ARCHITECTURE.md) for the full architecture, information-flow diagrams, and explanation.

![Current architecture](docs/diagrams/01_current_architecture.png)
