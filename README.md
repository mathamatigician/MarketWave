# GlobePulse AI: Financial News Monitoring and Sentiment Analysis

GlobePulse is a React + FastAPI app for tracking business and market-moving news, analyzing article sentiment, and comparing sentiment trends with stock price activity.

## Features
- **Sentiment Analysis:** Visualize news sentiment over time and by topic.
- **Price vs Sentiment:** Compare stock price behavior with sentiment signals.
- **Chat Assistant:** Ask questions about recent news using an embedded question-answering pipeline.
- **User Authentication:** Smooth sliding animation for Log In and Sign Up using local `users.json` persistence, complete with delayed mobile number collection.

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
4. Run all services (Firestore emulator, FastAPI backend, React frontend):
   ```bash
   make start        # or ./start.sh
   ```
   The frontend is served at `http://localhost:5173` and the FastAPI docs at `http://localhost:8000/docs`.

   Run `make help` to see individual dev targets (`make dev-backend`, `make dev-frontend`, `make dev-emulator`).

## Notes
- The current implementation uses a demo news dataset in `articles.csv`.
- `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) should be set in a `.env` file or as an environment variable for the AI agents and chat assistant.
- User data for authentication is stored locally in `users.json`, which will be automatically generated upon your first sign up.

## Tech Stack
- React (Vite) frontend
- FastAPI backend
- Google Cloud Firestore (local emulator)
- Google Gemini
- YahooQuery
- Pandas, NumPy

## Architecture
See [ARCHITECTURE.md](ARCHITECTURE.md) for the full architecture, information-flow diagrams, and explanation.

![Current architecture](docs/diagrams/01_current_architecture.png)

## Visuals
<img src="https://i.postimg.cc/hvqBYt93/newspulse.gif" alt="Demo visualization" />
