# MarketWave AI — Video Presentation Guide & Transcript

This document provides step-by-step instructions and a detailed 4-to-5 minute presentation
script to record an explainer video for the **MarketWave AI** application. It covers the
functional logic, user experience, live ingestion pipeline, and technical architecture
(the **React** dashboard, the **FastAPI** backend, the **Firestore** data store, and the
**Google Antigravity / Gemini** agent layer).

---

## Part 1: Recording Setup & Preparations

Follow these guidelines to prepare a high-quality video capture.

### 1. Hardware & Software Configuration
* **Screen Recorder**: Use **Loom** (easiest for quick captures), **OBS Studio** (best for high-quality layout control), or **Camtasia**.
* **Audio**: Use a dedicated USB microphone (e.g., Blue Yeti, Rode NT-USB) rather than built-in laptop mics. Record in a quiet room with minimal echo.
* **Resolution**: Record your screen at **1080p (1920x1080)**. Close irrelevant browser tabs and hide bookmarks/desktop icons for a clean look.
* **Camera (Optional)**: If including a facecam, position it in a corner (e.g., bottom-right) where it doesn't obstruct key UI components like the dashboard charts or the AI Assistant drawer.

### 2. Pre-Recording Checklist
1. **Launch the Platform**:
   Run the following to spin up the Firestore emulator, the FastAPI backend, and the React frontend together:
   ```bash
   make start        # or ./start.sh
   ```
   Wait for the status report to show all three services running. Stop them afterward with `make stop` (or `./stop.sh`).
2. **Configure API Keys**:
   Ensure `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) is set in your environment or in a `.env` file so the **ingestion pipeline** and the **AI Assistant** work seamlessly during the recording:
   ```bash
   # .env
   GEMINI_API_KEY=your-gemini-api-key
   ```
3. **Set Up Browser Windows**:
   Open two browser tabs/windows:
   * **Tab 1**: The running React app at `http://localhost:5173`. Start at the **Sign Up / Log In** screen.
   * **Tab 2**: `ARCHITECTURE.md` on GitHub (or a Markdown previewer) showing the Mermaid architecture diagrams. Optionally keep the FastAPI docs at `http://localhost:8000/docs` handy.
4. **Prepare Account Credentials**:
   Use the seeded demo account `demo1@globepulse.com` (password: `password123`) or register a fresh account on screen to demonstrate the sign-up / login flow.

---

## Part 2: Video Timing & Structure

| Time | Segment | Focus Area |
|---|---|---|
| **0:00 - 0:45** | **Introduction** | Value proposition, target audience, and UI overview. |
| **0:45 - 2:00** | **Functional Demo: Ingest & Sentiment** | Sign Up/Login, Watchlist management, ingestion trigger, and the sentiment heatmap. |
| **2:00 - 3:00** | **Functional Demo: Stock vs. Sentiment** | Price-vs-sentiment chart and the lightweight-charts overlay. |
| **3:00 - 3:45** | **Functional Demo: AI Assistant** | The streaming Antigravity agent (thoughts + answer) over WebSocket. |
| **3:45 - 4:45** | **Technical Architecture & Data Flows** | React ↔ FastAPI ↔ Firestore, the ingestion pipeline, and the agent orchestration. |
| **4:45 - 5:00** | **Wrap-Up** | Closing remarks, recap of key tech, and future roadmap. |

---

## Part 3: Presentation Script & Visual Cues

### Section 1: Introduction (0:00 - 0:45)

**[Visual: Screen shows the MarketWave home screen with the neon "MarketWave.ai" banner and the Sign In / Sign Up navigation. The mouse pointer sits near the center.]**

**Presenter (Voiceover):**
> "Hello everyone! Welcome to this quick walkthrough of **MarketWave AI**, a modern financial news monitoring and sentiment analysis platform.
>
> In today's fast-moving markets, traders and analysts are flooded with news. The challenge is extracting structured, actionable signals from unstructured articles, and seeing how those signals correlate with stock prices. MarketWave solves this with a React dashboard backed by a FastAPI service — real-time news scraping, structured multi-topic sentiment analysis powered by Google Gemini, stock price overlays, and a conversational AI assistant. Let's dive in!"

---

### Section 2: Functional Demo — Ingest & Sentiment Analysis (0:45 - 2:00)

**[Visual: Click 'Sign In'. Type `demo1@globepulse.com` and password `password123`. Click the 'Sign In' button. The app loads the Dashboard.]**

**Presenter (Voiceover):**
> "We start with our user authentication layer. The React frontend posts to the FastAPI `/api/login` endpoint, which validates a SHA-256 password hash against Firestore — with a local `users.json` fallback — and returns the user's profile and watchlist. The session is kept in the browser's local storage, so a refresh drops you straight back onto the dashboard.
>
> Once logged in, the **Watchlist** panel shows the user's tracked companies. I can add or remove tickers like Tesla, Apple, Google, or Nvidia, and those changes are saved back through `/api/watchlist`.
>
> Now let's pull in fresh news. Triggering the ingestion pipeline calls `/api/pipeline/run`, which launches a background task: it queries the Google News RSS feed for each watchlist company, resolves the redirected URLs, scrapes and cleans the article text, and sends it to **Google Gemini**. Gemini scores the text against an 18-topic structured schema — topics like layoffs, mergers, or revenue growth — from negative one to positive one, and the results are written into the Firestore `articles` collection."

**[Visual: Point to the sentiment heatmap on the dashboard.]**

**Presenter (Voiceover):**
> "The dashboard reads those scores back through `/api/sentiment/heatmap`, which aggregates a **median score per topic** across the whole watchlist.
>
> The heatmap is styled with a dynamic green-to-red gradient. Green represents highly positive news — like product launches or revenue growth — while red highlights negative sentiment, such as layoffs or labor disputes. This gives us an instant, color-coded map of a company's news landscape."

---

### Section 3: Stock Price vs Sentiment (2:00 - 3:00)

**[Visual: Open the 'Stock Price vs Sentiment' view and select 'Tesla' (TSLA).]**

**Presenter (Voiceover):**
> "Next, we cross-reference sentiment with actual market data.
>
> The `/api/stock/history` endpoint pulls historical prices from Yahoo Finance via the `yahooquery` library and, in the same response, returns a daily sentiment series computed from the Firestore articles plus the three most recent headlines.
>
> The frontend renders this as an interactive, high-performance chart. The area series tracks the daily adjusted close price of the stock. Directly underneath, a histogram represents the overall news sentiment — green bars for positive days, red for negative, with the bar height showing the absolute strength of that day's signal. Hovering reveals precise tooltips, so an analyst can spot whether negative sentiment ahead of a price drop is acting as a leading indicator."

**[Visual: Hover over different parts of the chart to show the tooltips updating with price and date. Pan or zoom slightly to show interactivity.]**

---

### Section 4: AI Assistant — Streaming Agent (3:00 - 3:45)

**[Visual: Click the floating 'MarketWave AI' bubble in the bottom-right to open the assistant drawer. Type: 'Why did Tesla sentiment turn negative this week?' and press Enter.]**

**Presenter (Voiceover):**
> "Finally, the **AI Assistant**. Instead of manually scanning dozens of articles, users can just ask.
>
> The chat panel opens a **WebSocket** to the backend's `/ws/chat` endpoint, which drives a **Google Antigravity** orchestrator agent running on Gemini. The orchestrator coordinates three specialized sub-agents — a **Research Agent** that fetches and scrapes news, a **Sentiment Analyst** that returns structured scores, and a **Market Correlator** that pulls price history and links movements to news.
>
> Notice that we stream two channels back in real time: first the agent's **reasoning thoughts**, then the **final answer tokens**. The agent is grounded on live tools — news fetching and stock history — so it distinguishes facts from opinion and never fabricates prices, keeping the response transparent and analytical."

**[Visual: Watch the 'thinking' thoughts stream in, then the final answer render token by token. Point to where sub-agents are named in the reasoning.]**

---

### Section 5: Technical Architecture & Data Flows (3:45 - 4:45)

**[Visual: Switch to the ARCHITECTURE.md tab and scroll to the 'Current Architecture' Mermaid flowchart.]**

**Presenter (Voiceover):**
> "Now let's see how this fits together. MarketWave is a cleanly decoupled system.
>
> The **React + Vite frontend** on port 5173 never talks to the database or the model directly — everything flows through the **FastAPI backend** on port 8000, over REST for the dashboard and a WebSocket for the assistant.
>
> The backend persists users, articles, and alerts in **Google Cloud Firestore**, running locally through the Firestore emulator, with JSON files as a graceful fallback."

**[Visual: Scroll to the 'News Ingestion & Sentiment Pipeline' diagram.]**

**Presenter (Voiceover):**
> "The ingestion pipeline is pure Python: Google News RSS discovery, URL resolution, article scraping with BeautifulSoup, and Gemini structured-output scoring against our 18-topic schema, all landing in Firestore.
>
> An hourly **watchdog** trigger reuses the same scoring path to scan every watchlist ticker and raise an alert whenever average sentiment drops below a critical threshold — surfaced through the `/api/alerts` endpoint."

**[Visual: Scroll to the 'Information Flow' sequence diagram.]**

**Presenter (Voiceover):**
> "This sequence diagram ties it together — a login and dashboard load on one side, and the streaming agent conversation on the other. Everything runs locally with a single `make start`, and the whole stack is Google-native: Gemini, Antigravity, and Firestore."

---

## Part 4: Wrap-up & Conclusion (4:45 - 5:00)

**[Visual: Switch back to the running app on the dashboard. Hover over the MarketWave logo in the top-left corner.]**

**Presenter (Voiceover):**
> "To summarize, MarketWave AI pairs a polished React dashboard with a FastAPI backend and a Google Antigravity agent layer. By turning raw financial news into clean topic sentiment, overlaying it with live stock prices, and letting users interrogate it through a streaming assistant, we transform noise into clear, actionable signals.
>
> Thank you for watching! Feel free to clone the repository, set up your Gemini API key, run `make start`, and explore MarketWave yourself."

**[Visual: Fade screen to black. Stop recording.]**
