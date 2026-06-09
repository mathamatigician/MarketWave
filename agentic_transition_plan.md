# Agentic Architecture Transition Plan

This document outlines the proposed architecture and execution steps to migrate the GlobePulse dashboard and pipeline from a procedural client-server model to an **Agentic Architecture** powered by the **Google Antigravity SDK (AGY)**.

---

## 1. High-Level Design

Instead of hardcoded loops and static queries, the application will interact with a primary orchestrator agent that delegates tasks to specialized sub-agents and programmatic tools:

```
                            +--------------------------+
                            |     User / Streamlit     |
                            +------------+-------------+
                                         |
                                         v (Chat / Watchlist updates)
                            +------------+-------------+
                            |    Orchestrator Agent    |
                            +-----+------+------+------+
                                  |      |      |
         +------------------------+      |      +------------------------+
         |                               v                               |
+--------v-------+              +--------v-------+              +--------v-------+
| Research Agent |              | Analyst Agent  |              | Correlator     |
| (News Scraper) |              | (Sentiment)    |              | (Market Data)  |
+--------+-------+              +--------+-------+              +--------+-------+
         |                               |                               |
         v (Tools)                       v (Tools)                       v (Tools)
+--------v-------+              +--------v-------+              +--------v-------+
|  fetch_news()  |              | analyze_text() |              | get_stock()    |
+----------------+              +----------------+              +----------------+
```

### Agents & Personas
1.  **Orchestrator Agent (`Orchestrator`):** Analyzes incoming user requests, manages state and watchlist context across conversation turns, and orchestrates tasks.
2.  **Research Agent (`ResearchAgent`):** Fetches, filters, and parses news from specified sources (Yahoo Finance, RSS feeds, or APIs).
3.  **Sentiment Analyst Agent (`SentimentAnalyst`):** Uses Gemini with Pydantic structured schemas to output structured sentiment arrays.
4.  **Market Correlator Agent (`MarketCorrelator`):** Correlates real-time price drops or spikes with news events to identify potential cause-and-effect signals.

---

## 2. Proposed Implementation Steps

### Step 1: Initialize SDK & Dependencies
*   Add `google-antigravity` to `requirements.txt`.
*   Configure Google API Keys (`GEMINI_API_KEY`) as environment variables.

### Step 2: Define Agent Tools (`backend/agents/tools.py`)
Wrap existing helper functions and API endpoints into AGY-compatible Python functions with rich docstrings (the agent uses these docstrings to choose when to call the tools):
*   `fetch_news_tool(ticker, market="global"|"india")`: Fetch news stories from Yahoo Finance, Marketaux, or parsed RSS feeds.
*   `get_stock_history_tool(ticker, period="30d")`: Fetch prices using `yahooquery`.
*   `sentiment_extraction_tool(article_text)`: Calls Gemini structured output endpoints to evaluate the 18-topic schema.

### Step 3: Implement Agents (`backend/agents/orchestrator.py`)
*   Define the Orchestrator configuration with `LocalAgentConfig`.
*   Register sub-agents and tool predication functions.
*   Implement multi-agent delegation allowing the main Orchestrator to instantiate subagents as needed.
*   Manage state context (e.g. keeping track of the active watchlist ticker) using `ToolContext`.

### Step 4: Streamlit UI Integration (`app.py`)
*   Replace standard procedural queries with a simple wrapper around the Orchestrator's `await agent.chat()` loop.
*   Add an "Agent Log" expander to allow the user to view the agent's internal thought process, reasoning steps, and tool calls.
*   Render sentiment maps and price charts based on JSON data structures compiled and returned by the agent.

### Step 5: Proactive Trigger (`backend/agents/triggers.py`)
*   Define a background loop using AGY's `periodic_trigger` capabilities.
*   Instruct the background agent to query watchlist tickers once an hour and raise a warning flag on the dashboard if average sentiment drops below `-0.5`.
