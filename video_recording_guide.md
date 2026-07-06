# GlobePulse AI — Video Presentation Guide & Transcript

This document provides step-by-step instructions and a detailed 4-to-5 minute presentation script to record an explainer video for the **GlobePulse AI** application. It covers the functional logic, user experience, live ingestion pipeline, and technical architecture (including the live Streamlit server and the offline Databricks data lake pipeline).

---

## Part 1: Recording Setup & Preparations

Follow these guidelines to prepare a high-quality video capture.

### 1. Hardware & Software Configuration
* **Screen Recorder**: Use **Loom** (easiest for quick captures), **OBS Studio** (best for high-quality layout control), or **Camtasia**.
* **Audio**: Use a dedicated USB microphone (e.g., Blue Yeti, Rode NT-USB) rather than built-in laptop mics. Record in a quiet room with minimal echo.
* **Resolution**: Record your screen at **1080p (1920x1080)**. Close irrelevant browser tabs and hide bookmarks/desktop icons for a clean look.
* **Camera (Optional)**: If including a facecam, position it in a corner (e.g., bottom-right) where it doesn't obstruct key UI components like the Streamlit sidebar.

### 2. Pre-Recording Checklist
1. **Launch the Local App**:
   Run the following commands in your terminal to spin up the Streamlit frontend:
   ```bash
   source .venv/bin/activate
   streamlit run app.py
   ```
2. **Configure API Keys**:
   Ensure `GEMINI_API_KEY` or `GOOGLE_API_KEY` is either in your environment variables or placed in `.streamlit/secrets.toml` so that the **Ingestion Pipeline** and **Chatbot RAG** function seamlessly during the recording:
   ```toml
   # .streamlit/secrets.toml
   [gemini_credentials]
   API_KEY = "your-gemini-api-key"
   ```
3. **Set Up Browser Windows**:
   Open two browser tabs/windows:
   * **Tab 1**: The running Streamlit application (at `http://localhost:8501`). Start at the **Sign Up / Log In** screen.
   * **Tab 2**: The `ARCHITECTURE.md` file on GitHub or in a Markdown previewer showing the architecture diagrams.
4. **Prepare Account Credentials**:
   Use a test account like `test@example.com` (password: `test`) or register a fresh account on screen to demonstrate the registration/login flow.

---

## Part 2: Video Timing & Structure

| Time | Segment | Focus Area |
|---|---|---|
| **0:00 - 0:45** | **Introduction** | Value proposition, target audience, and UI overview. |
| **0:45 - 2:00** | **Functional Demo: Ingest & Sentiment** | Sign Up/Login, Watchlist management, Ingestion trigger, and Tab 1 (Sentiment Heatmaps). |
| **2:00 - 3:00** | **Functional Demo: Stock vs. Sentiment** | Tab 2 (Price vs Sentiment Chart) explaining TradingView Lightweight-Charts integration. |
| **3:00 - 3:45** | **Functional Demo: QA Chatbot** | Tab 3 (Chatbot) demonstrating RAG over the news context. |
| **3:45 - 4:45** | **Technical Architecture & Data Flows** | Explanation of live demo vs. the production Databricks Delta pipeline. |
| **4:45 - 5:00** | **Wrap-Up** | Closing remarks, recap of key tech, and future roadmap. |

---

## Part 3: Presentation Script & Visual Cues

### Section 1: Introduction (0:00 - 0:45)

**[Visual: Screen shows the GlobePulse welcome banner at the top, and the Login / Sign Up options on the screen. The mouse pointer sits near the center.]**

**Presenter (Voiceover):**
> "Hello everyone! Welcome to this quick walkthrough of **GlobePulse AI**, a modern financial news monitoring and sentiment analysis dashboard. 
>
> In today's fast-moving markets, traders and analysts are flooded with news. The challenge is extracting structured, actionable signals from unstructured articles, and seeing how those signals correlate with stock prices. GlobePulse solves this by providing real-time news scraping, structured multi-topic sentiment analysis powered by Gemini 1.5 Flash, stock price overlays, and an interactive RAG-based chat assistant. Let's dive in!"

---

### Section 2: Functional Demo — Ingest & Sentiment Analysis (0:45 - 2:00)

**[Visual: Click on 'Log In'. Type in `test@example.com` and password `test`. Click the 'Log In' button. The app loads the main dashboard screen with a sidebar.]**

**Presenter (Voiceover):**
> "We start with our secure user authentication layer, backed by local JSON persistence. The app supports a delayed collection pattern for user mobile numbers, gently prompting profile updates after registration.
>
> Once logged in, the sidebar displays our active stock watchlist. I can customize this by selecting or removing tickers like Tesla, Apple, Google, or Nvidia. 
>
> Now let's trigger a fresh fetch. When I click **'Run Ingestion Pipeline'** in the sidebar, a Python worker queries the Google News RSS feed for our watchlist, resolves redirected URLs, cleans and extracts the article text, and feeds it into Gemini 1.5 Flash. Gemini processes the text against an 18-topic structured schema, scoring topics like layoffs, mergers, or revenue growth from negative one to positive one."

**[Visual: Hover over the sidebar button, click '🔄 Run Ingestion Pipeline'. Wait a brief moment for the success notification. Then, point your mouse to 'Tab 1 — Sentiment Analysis'.]**

**Presenter (Voiceover):**
> "In **Tab 1: Sentiment Analysis**, these scores are aggregated and visualized. 
> 
> On the left, we see a **Topic-by-Date matrix**. Each row is one of our 18 financial topics, and each column represents a date. On the right, we have the **Topic Median score** showing aggregate intensity and frequency.
>
> Both tables are styled using dynamic green-to-red gradient heatmaps. Green represents highly positive news—like product launches or revenue growth—while red highlights negative sentiment, such as layoffs or labor disputes. This gives us an instant, color-coded map of a company's news landscape."

---

### Section 3: Stock Price vs Sentiment (2:00 - 3:00)

**[Visual: Click on 'Stock Price vs Sentiment' tab. Use the select box to select 'TSLA' (Tesla).]**

**Presenter (Voiceover):**
> "Next, in **Tab 2**, we cross-reference this sentiment with actual market data. 
>
> GlobePulse integrates with Yahoo Finance via the `yahooquery` API to fetch historical stock prices for the last 30 days. We then map the overall sentiment score onto the same timeframe.
>
> We use TradingView’s **Lightweight Charts** library to render this interactive, high-performance visualization. The blue area chart tracks the daily adjusted close price of the stock. Directly underneath, the histogram represents the overall news sentiment. Green bars indicate positive sentiment, red bars indicate negative sentiment, and the height of each bar shows the absolute strength of that day's news signals. Hovering over the chart displays precise tooltips, allowing analysts to spot whether negative sentiment preceding market drops represents a leading indicator."

**[Visual: Hover mouse over different parts of the Lightweight Chart, showing the tooltips updating with price and date. Zoom in and out slightly on the chart to show interactivity.]**

---

### Section 4: AI-Powered Chatbot & RAG (3:00 - 3:45)

**[Visual: Click on 'Chatbot' tab. Type in the input box: 'What was the impact of the Supercharger team layoffs?' and press Enter.]**

**Presenter (Voiceover):**
> "In **Tab 3**, we provide an interactive Q&A interface. Instead of manually scanning hundreds of paragraphs, users can ask questions directly.
>
> The chatbot is powered by **Embedchain** with a local **Chroma vector database**. In this demo, the index is pre-loaded with curated news coverage regarding Tesla’s recent Supercharger network cuts.
>
> When I ask about the impact of the charging team layoffs, the system chunks and embeds my question, performs a semantic search against the Chroma store to retrieve the most relevant context, and sends a focused prompt to Google Gemini. It generates a comprehensive, factual answer, and crucially, lists the source URLs. This guarantees transparency and completely eliminates LLM hallucination."

**[Visual: Wait for the response to load. Scroll down to show the text response, and point your mouse at the hyperlinked citation source URLs at the bottom.]**

---

### Section 5: Technical Architecture & Data Flows (3:45 - 4:45)

**[Visual: Switch browser tabs to show the ARCHITECTURE.md file, specifically scrolling to the 'Current Architecture' Mermaid flowchart.]**

**Presenter (Voiceover):**
> "Now let's talk about how this all fits together technically. 
> 
> GlobePulse is architected with a strict separation between the online presentation layer and the data ingestion pipeline.
>
> The frontend presentation layer is built on **Streamlit** for rapid UI updates, customized with custom HTML and CSS components for a dark theme and watermark styling.
>
> In the demo app, data is cached in a local `articles.csv` file for high performance. However, GlobePulse is designed to scale to a full enterprise production system using **Databricks**, as outlined in our offline pipeline notebooks."

**[Visual: Scroll down the ARCHITECTURE.md page to show the 'Original Databricks Pipeline' diagram.]**

**Presenter (Voiceover):**
> "In the Databricks production flow:
> 
> * **Notebook 01** handles ingestion. It triggers DuckDuckGo API searches, resolves links, and utilizes **ScrapeGraphAI** and **Playwright** on spark nodes to scrape full web pages, storing them in a raw Delta Table.
> * **Notebook 02** performs LLM enrichment. It invokes the Databricks Model Serving endpoint—specifically the powerful `dbrx-instruct` model—with Pydantic schemas to merge structured sentiment rows directly back into Delta tables.
> * **Notebook 03** handles enterprise RAG, using Databricks Vector Search with `bge-large` embeddings for automated, production-grade index syncs.
>
> For our live demo, we successfully decoupled the app from Databricks using local CSVs, local Chroma vector indices, and the Google Gemini API, making the app lightweight and easy to run locally or host on Streamlit Community Cloud."

---

## Part 3: Wrap-up & Conclusion (4:45 - 5:00)

**[Visual: Switch back to the Streamlit app showing Tab 2. Hover over the GlobePulse logo in the top-left corner.]**

**Presenter (Voiceover):**
> "To summarize, GlobePulse AI showcases the power of combining modern stream-lit user interfaces with advanced generative AI. By turning raw financial news into clean topic sentiment, and overlaying it with stock tickers, we transform noise into clear, actionable signals.
>
> Thank you for watching! Feel free to clone the repository, set up your API keys, and explore GlobePulse yourself."

**[Visual: Fade screen to black. Stop recording.]**
