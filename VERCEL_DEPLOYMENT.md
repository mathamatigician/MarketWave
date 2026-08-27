# 🚀 Deploying MarketWave: Vercel (Frontend) + GCP Cloud Run (Backend)

This guide explains how to deploy MarketWave with the **React Vite Frontend on Vercel** and the **FastAPI Intelligence Engine on Google Cloud Platform (GCP Cloud Run)**.

---

## 1. 🌐 Part 1: Deploying the Frontend on Vercel

### Step 1: Import Repository to Vercel
1. Go to **[Vercel Dashboard](https://vercel.com/new)**.
2. Import the Git repository: `mathamatigician/MarketWave`.
3. Configure the Project Settings:

| Setting | Recommended Value | Note |
| :--- | :--- | :--- |
| **Framework Preset** | `Vite` | Auto-detected |
| **Root Directory** | `./` (or `frontend`) | Handled automatically by `vercel.json` |
| **Build Command** | `npm run build` | Handled automatically |
| **Output Directory** | `frontend/dist` (or `dist` if root dir is `frontend`) | Handled automatically |

### Step 2: Configure Environment Variables in Vercel
Under **Project Settings > Environment Variables**, add:

| Variable | Description | Example (GCP Cloud Run Endpoint) |
| :--- | :--- | :--- |
| `VITE_API_URL` | HTTPS URL of your GCP Cloud Run backend | `https://marketwave-backend-xxxxxx-uc.a.run.app` |
| `VITE_WS_URL` | WSS URL for live WebSockets on GCP | `wss://marketwave-backend-xxxxxx-uc.a.run.app` |
| `VITE_GOOGLE_CLIENT_ID` | *(Optional)* Google OAuth Client ID | `12345-abc.apps.googleusercontent.com` |
| `VITE_MARKET_DATA_REFRESH_INTERVAL_MS` | Scheduled consistency refresh (ms) | `300000` (5 minutes) |
| `VITE_GEMMA_BRIEFING_DEBOUNCE_SECONDS` | Real-time debounce window | `10` |
| `VITE_API_REQUEST_TIMEOUT_MS` | HTTP timeout (ms) | `10000` |

---

## 2. ☁️ Part 2: Deploying the Backend on GCP Cloud Run

The backend includes a production-ready container definition in [`backend/Dockerfile`](file:///home/hp/AgentHackathon/MarketWave/backend/Dockerfile).

### Deploy with Google Cloud CLI (`gcloud`):
```bash
# 1. Build and submit container image to Google Artifact Registry / Container Registry
gcloud builds submit --tag gcr.io/YOUR_GCP_PROJECT_ID/marketwave-backend . -f backend/Dockerfile

# 2. Deploy service on Cloud Run
gcloud run deploy marketwave-backend \
  --image gcr.io/YOUR_GCP_PROJECT_ID/marketwave-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars "FIRESTORE_PROJECT_ID=YOUR_GCP_PROJECT_ID,ALLOWED_ORIGINS=https://your-marketwave-app.vercel.app,GEMINI_API_KEY=YOUR_GEMINI_KEY"
```

### GCP Cloud Run Environment Variables:
| Variable | Description |
| :--- | :--- |
| `ALLOWED_ORIGINS` | Comma-separated list including your Vercel URL (e.g. `https://marketwave.vercel.app,https://your-custom-domain.com`) |
| `FIRESTORE_PROJECT_ID` | Your GCP project ID for Google Cloud Firestore |
| `GEMINI_API_KEY` | Google AI Studio / Gemini API key |
| `HF_TOKEN` | Hugging Face user access token for Gemma inference |

> [!TIP]
> **WebSocket Support on GCP Cloud Run**: Google Cloud Run supports WebSockets out-of-the-box on HTTP/1.1 and HTTP/2. The `/ws/ingest` endpoint will connect seamlessly via `wss://your-service.run.app/ws/ingest`.

---

## 3. ⚙️ Included Vercel Configuration (`vercel.json`)

The repository includes pre-configured `vercel.json` files in both root and `frontend/`:
- **Single Page App Routing**: `{"source": "/(.*)", "destination": "/index.html"}` ensuring URL persistence and no 404s on tab refreshes.
- **Cache-Control Headers**: 1-year immutable caching for production bundles in `/assets/*`.
- **Security Headers**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection`, and `Referrer-Policy: strict-origin-when-cross-origin`.

---

## 4. 🧪 Local Verification

```bash
# Verify build from root
npm run build

# Verify build directly inside frontend
cd frontend
npm run build
```
