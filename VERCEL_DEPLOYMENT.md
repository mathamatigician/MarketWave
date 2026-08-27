# 🚀 Deploying MarketWave on Vercel

This guide explains how to deploy the MarketWave frontend on [Vercel](https://vercel.com) in production.

---

## 📋 Quick Setup (1-Click / GitHub Import)

1. Go to your **[Vercel Dashboard](https://vercel.com/new)**.
2. Import the Git repository: `mathamatigician/MarketWave`.
3. Configure the Project Settings:

| Setting | Recommended Value | Note |
| :--- | :--- | :--- |
| **Framework Preset** | `Vite` | Auto-detected |
| **Root Directory** | `./` (or `frontend`) | Both root and `frontend/` are pre-configured with `vercel.json` |
| **Build Command** | `npm run build` | Handled by `vercel.json` |
| **Output Directory** | `frontend/dist` (or `dist` if root dir is `frontend`) | Handled by `vercel.json` |

---

## 🔑 Environment Variables (Vercel Project Settings)

In your Vercel Project under **Settings > Environment Variables**, add:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `VITE_API_URL` | HTTPS URL of your FastAPI backend | `https://marketwave-backend.onrender.com` |
| `VITE_WS_URL` | WSS WebSocket URL of your FastAPI backend | `wss://marketwave-backend.onrender.com` |
| `VITE_GOOGLE_CLIENT_ID` | *(Optional)* Google OAuth Client ID | `12345-abc.apps.googleusercontent.com` |
| `VITE_MARKET_DATA_REFRESH_INTERVAL_MS` | *(Optional)* Consistency refresh interval (ms) | `300000` (5 minutes) |
| `VITE_GEMMA_BRIEFING_DEBOUNCE_SECONDS` | *(Optional)* Real-time debounce delay | `10` |
| `VITE_API_REQUEST_TIMEOUT_MS` | *(Optional)* HTTP fetch timeout | `10000` |

---

## ⚙️ Included Vercel Configuration (`vercel.json`)

The repository includes pre-tuned `vercel.json` files in both root and `frontend/` featuring:
- **SPA Rewrites**: `{"source": "/(.*)", "destination": "/index.html"}` ensuring seamless client-side routing.
- **Cache-Control Headers**: 1-year immutable caching for static bundled assets in `/assets/*`.
- **Security Headers**: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `X-XSS-Protection`, and strict `Referrer-Policy`.

---

## 🧪 Local Verification

Before deploying, you can test the production build locally:

```bash
# Test build from root
npm run build

# Or test directly in frontend
cd frontend
npm run build
npm run preview
```
