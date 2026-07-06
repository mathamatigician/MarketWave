# GlobePulse Agentic Architecture Transition Tasks

This document contains a structured list of development tasks to migrate the GlobePulse dashboard from its current procedural RAG (Embedchain) pipeline to an **Agentic Architecture** powered by the **Google Antigravity SDK (AGY)**. 

---

## 👥 Role Matrix & Assignment Guidelines
*   **AI-BE**: Lead AI / Backend Engineer (Agent, Tool, & Pipeline Development)
*   **FE**: Frontend UI Engineer (Streamlit Interface & Log Viewer)
*   **QA-DO**: DevOps / QA Engineer (Dependencies, Configs, & Integration Testing)

---

## 📋 Task Board Summary

| Task ID | Phase | Task Title | Primary Role | Est. Effort | Dependencies | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TSK-1.1** | Phase 1 | Setup SDK & Environment Configuration | QA-DO | 3 hours | None | ⬜ Not Started |
| **TSK-2.1** | Phase 2 | Implement News Fetcher Tool | AI-BE | 4 hours | TSK-1.1 | ⬜ Not Started |
| **TSK-2.2** | Phase 2 | Implement Stock Price Retrieval Tool | AI-BE | 3 hours | TSK-1.1 | ⬜ Not Started |
| **TSK-2.3** | Phase 2 | Implement Sentiment Extraction Schema & Tool | AI-BE | 4 hours | TSK-1.1 | ⬜ Not Started |
| **TSK-3.1** | Phase 3 | Implement Sub-Agents Configurations | AI-BE | 6 hours | TSK-2.1, 2.2, 2.3 | ⬜ Not Started |
| **TSK-3.2** | Phase 3 | Implement Orchestrator Chat Loop | AI-BE | 8 hours | TSK-3.1 | ⬜ Not Started |
| **TSK-3.3** | Phase 3 | Implement Watchlist & Conversation Context | AI-BE | 6 hours | TSK-3.2 | ⬜ Not Started |
| **TSK-4.1** | Phase 4 | Streamlit Chat Interface Refactoring | FE | 6 hours | TSK-3.2 | ⬜ Not Started |
| **TSK-4.2** | Phase 4 | Implement Expandable Agent Thought Log Viewer | FE | 5 hours | TSK-4.1 | ⬜ Not Started |
| **TSK-4.3** | Phase 4 | Visual Rendering of Sentiment & Price Charts | FE | 6 hours | TSK-4.1, TSK-2.2 | ⬜ Not Started |
| **TSK-5.1** | Phase 5 | Implement Periodic Sentiment Watchdog Trigger | AI-BE | 6 hours | TSK-1.1, TSK-2.3 | ⬜ Not Started |
| **TSK-5.2** | Phase 5 | Watchdog UI Notifications & Alert Flagging | FE | 4 hours | TSK-5.1 | ⬜ Not Started |
| **TSK-6.1** | Phase 6 | End-to-End Integration Testing | QA-DO | 6 hours | All Phase 1–5 tasks | ⬜ Not Started |

---

## 🛠️ Detailed Task Descriptions

### 📁 Phase 1: Foundation & Dependencies

#### **TSK-1.1: Setup SDK & Environment Configuration**
*   **Assigned Role:** DevOps / QA Engineer (`QA-DO`)
*   **Estimated Effort:** 3 hours
*   **Dependencies:** None
*   **Description:**
    Initialize the workspace with the necessary package updates and ensure credential forwarding is set up safely.
*   **Implementation Spec:**
    1. Update `requirements.txt` to include `google-antigravity`.
    2. Document standard `.env` configuration template:
       ```env
       GEMINI_API_KEY=your_gemini_api_key_here
       ```
    3. Update `test_gemini.py` to verify that `google-antigravity` can be imported and successfully connect using `GEMINI_API_KEY`.
*   **Acceptance Criteria:**
    - `pip install -r requirements.txt` succeeds without version conflicts.
    - `python test_gemini.py` verifies both the direct `google-generativeai` and `google-antigravity` package connectivity.

---

### 🔧 Phase 2: Agent Tools Layer (`backend/agents/tools.py`)

#### **TSK-2.1: Implement News Fetcher Tool**
*   **Assigned Role:** Lead AI / Backend Engineer (`AI-BE`)
*   **Estimated Effort:** 4 hours
*   **Dependencies:** TSK-1.1
*   **Description:**
    Wrap the existing Google News RSS scraper and page decoding functions into an AGY-compatible tool.
*   **Implementation Spec:**
    Create `backend/agents/tools.py` and define:
    ```python
    from google.antigravity import ToolContext
    import pipeline
    
    def fetch_news_tool(ticker: str, market: str = "global") -> str:
        """Fetches and scrapes recent news articles for a given ticker or company.
        
        Args:
            ticker: The stock ticker or company name (e.g., 'AAPL', 'Tesla').
            market: The market scope, either 'global' or 'india'. Defaults to 'global'.
        """
        # 1. Fetch news RSS items using pipeline.fetch_news_items
        # 2. Decode and scrape article bodies using pipeline.resolve_and_scrape_article
        # 3. Concatenate and return a consolidated markdown summary of articles
        pass
    ```
*   **Acceptance Criteria:**
    - Tool docstring is fully defined with type-annotated arguments (necessary for AGY agent routing).
    - Returns a raw string containing the article headlines and contents.

#### **TSK-2.2: Implement Stock Price Retrieval Tool**
*   **Assigned Role:** Lead AI / Backend Engineer (`AI-BE`)
*   **Estimated Effort:** 3 hours
*   **Dependencies:** TSK-1.1
*   **Description:**
    Wrap the `yahooquery` history functions into an AGY-compatible tool.
*   **Implementation Spec:**
    Add to `backend/agents/tools.py`:
    ```python
    import functions
    
    def get_stock_history_tool(ticker: str, period: str = "30d") -> str:
        """Retrieves historical stock price series data for a given ticker.
        
        Args:
            ticker: The stock ticker symbol (e.g., 'AAPL', 'TSLA').
            period: History duration, e.g., '1d', '5d', '1mo', '3mo', '1y'.
        """
        # Call functions.get_stock_history(ticker, period, interval='1d')
        # Return the price list of dicts serialized as a JSON string
        pass
    ```
*   **Acceptance Criteria:**
    - Returns valid JSON list string containing keys `time` and `value`.

#### **TSK-2.3: Implement Sentiment Extraction Schema & Tool**
*   **Assigned Role:** Lead AI / Backend Engineer (`AI-BE`)
*   **Estimated Effort:** 4 hours
*   **Dependencies:** TSK-1.1
*   **Description:**
    Define the structured output extraction tool using the 18-topic sentiment analysis schema.
*   **Implementation Spec:**
    Use the existing `TopicSentimentSchema` (from `pipeline.py`) or re-declare it under `backend/agents/tools.py`.
    ```python
    import pydantic
    from typing import Optional
    
    class TopicSentimentSchema(pydantic.BaseModel):
        layoffs: Optional[float]
        restructuring: Optional[float]
        board_changes: Optional[float]
        mergers: Optional[float]
        investor_activity: Optional[float]
        esg: Optional[float]
        revenue_growth: Optional[float]
        product_launches: Optional[float]
        expansion: Optional[float]
        disputes: Optional[float]
        geo_political: Optional[float]
        macro_economic: Optional[float]
        partnerships: Optional[float]
        cyber_security: Optional[float]
        supply_chain: Optional[float]
        labor_issues: Optional[float]
        product_recalls: Optional[float]
        overall_sentiment: Optional[float]
    ```
*   **Acceptance Criteria:**
    - Schema correctly represents all 18 topics with floating-point values between `-1.0` and `1.0`.

---

### 🧠 Phase 3: Agent Core Implementation (`backend/agents/orchestrator.py`)

#### **TSK-3.1: Implement Sub-Agents Configurations**
*   **Assigned Role:** Lead AI / Backend Engineer (`AI-BE`)
*   **Estimated Effort:** 6 hours
*   **Dependencies:** TSK-2.1, TSK-2.2, TSK-2.3
*   **Description:**
    Declare and configure the specialized sub-agents (`ResearchAgent`, `SentimentAnalyst`, `MarketCorrelator`) using `LocalAgentConfig`.
*   **Implementation Spec:**
    Define subagent personas in `backend/agents/orchestrator.py`:
    ```python
    from google.antigravity import LocalAgentConfig, types
    from backend.agents.tools import TopicSentimentSchema, fetch_news_tool, get_stock_history_tool
    
    research_agent_config = LocalAgentConfig(
        system_instructions="You are a professional financial news researcher. Locate news using fetch_news_tool.",
        tools=[fetch_news_tool]
    )
    
    sentiment_analyst_config = LocalAgentConfig(
        system_instructions="You extract structural topic sentiments from financial text.",
        response_schema=TopicSentimentSchema
    )
    
    correlator_config = LocalAgentConfig(
        system_instructions="You correlate stock price trends with major news topics.",
        tools=[get_stock_history_tool]
    )
    ```
*   **Acceptance Criteria:**
    - Sentiment analyst is configured with `response_schema` to enforce structured JSON output.
    - Tools are properly bound to the respective agent configurations.

#### **TSK-3.2: Implement Orchestrator Chat Loop**
*   **Assigned Role:** Lead AI / Backend Engineer (`AI-BE`)
*   **Estimated Effort:** 8 hours
*   **Dependencies:** TSK-3.1
*   **Description:**
    Implement the main Orchestrator Agent configuration and conversational loop.
*   **Implementation Spec:**
    Define the Orchestrator with delegation capability enabled:
    ```python
    from google.antigravity import Agent, LocalAgentConfig
    
    orchestrator_config = LocalAgentConfig(
        system_instructions=(
            "You are the GlobePulse primary Financial Orchestrator. "
            "You handle user conversations, delegate research to the Research Agent, "
            "request sentiment reports from the Sentiment Analyst, and "
            "cross-reference trends using the Market Correlator Agent."
        ),
        capabilities=types.CapabilitiesConfig(
            enable_subagents=True
        )
    )
    
    async def get_orchestrator_response(user_message: str, chat_history: list = None):
        async with Agent(orchestrator_config) as agent:
            # Load history if present
            response = await agent.chat(user_message)
            return response
    ```
*   **Acceptance Criteria:**
    - Orchestrator agent can successfully run and route tasks to sub-agents.
    - Both raw text and thoughts stream are accessible.

#### **TSK-3.3: Implement Watchlist & Conversation Context**
*   **Assigned Role:** Lead AI / Backend Engineer (`AI-BE`)
*   **Estimated Effort:** 6 hours
*   **Dependencies:** TSK-3.2
*   **Description:**
    Maintain active tickers, watchlist selections, and session state across multiple chat turns.
*   **Implementation Spec:**
    Inject `ToolContext` into orchestrator tools or utilize session state storage to keep track of:
    - Current focused stock ticker.
    - Historical price series retrieved.
    - Last computed sentiment values.
*   **Acceptance Criteria:**
    - Agent correctly references "it" or "this stock" in subsequent prompts based on the context stored in `ToolContext`.

---

### 🖥️ Phase 4: Streamlit Frontend Integration (`app.py`)

#### **TSK-4.1: Streamlit Chat Interface Refactoring**
*   **Assigned Role:** Frontend UI Engineer (`FE`)
*   **Estimated Effort:** 6 hours
*   **Dependencies:** TSK-3.2
*   **Description:**
    Refactor the chatbot section in `app.py` to replace Embedchain's `bot.chat` with a run-loop wrapper for the Google Antigravity `Agent`.
*   **Implementation Spec:**
    Import `asyncio` to run the async agent methods within the Streamlit UI:
    ```python
    import asyncio
    from backend.agents.orchestrator import get_orchestrator_response
    
    # Inside Streamlit response loop:
    # response_obj = asyncio.run(get_orchestrator_response(user_query))
    ```
*   **Acceptance Criteria:**
    - User messages are submitted and the Agent returns replies successfully in the main dashboard tab.

#### **TSK-4.2: Implement Expandable Agent Thought Log Viewer**
*   **Assigned Role:** Frontend UI Engineer (`FE`)
*   **Estimated Effort:** 5 hours
*   **Dependencies:** TSK-4.1
*   **Description:**
    Expose the agent's internal thought process and reasoning steps (e.g. subagent delegation, tool selections) on the UI.
*   **Implementation Spec:**
    Create a `st.expander("🔍 Agent Reasoning & Thoughts", expanded=False)` right above or below the agent response.
    Stream tokens from `response.thoughts` directly into the expander component:
    ```python
    thought_container = st.empty()
    thoughts_accumulated = ""
    async for thought_chunk in response_obj.thoughts:
        thoughts_accumulated += thought_chunk
        thought_container.markdown(f"```\n{thoughts_accumulated}\n```")
    ```
*   **Acceptance Criteria:**
    - Thought process is visible in real-time or updated progressively in the expander.
    - Expander stays collapsed by default to keep the UI clean, but is fully viewable upon clicking.

#### **TSK-4.3: Visual Rendering of Sentiment & Price Charts**
*   **Assigned Role:** Frontend UI Engineer (`FE`)
*   **Estimated Effort:** 6 hours
*   **Dependencies:** TSK-4.1, TSK-2.2
*   **Description:**
    Render interactive charts based on the stock prices and sentiments extracted by the agent.
*   **Implementation Spec:**
    Parse structured output from the Sentiment Analyst and historical prices from the Correlator, then feed them into `functions.plot_chart(price_series, sentiment_series)`.
*   **Acceptance Criteria:**
    - The price chart correctly displays historical prices synchronized with sentiment bars.

---

### ⏱️ Phase 5: Proactive Trigger & Watchdog (`backend/agents/triggers.py`)

#### **TSK-5.1: Implement Periodic Sentiment Watchdog Trigger**
*   **Assigned Role:** Lead AI / Backend Engineer (`AI-BE`)
*   **Estimated Effort:** 6 hours
*   **Dependencies:** TSK-1.1, TSK-2.3
*   **Description:**
    Implement a background monitoring agent that scans watchlist tickers periodically and triggers sentiment warning flags.
*   **Implementation Spec:**
    Create `backend/agents/triggers.py` and implement a periodic check using `every`:
    ```python
    from google.antigravity.triggers import every, TriggerContext
    import pipeline
    import json
    
    async def check_watchlist_sentiment(ctx: TriggerContext):
        # 1. Load watchlist tickers from users.json
        tickers = pipeline.load_all_watchlist_tickers()
        # 2. Fetch and evaluate sentiment for each ticker
        for ticker in tickers:
            # If average sentiment < -0.5, raise flag
            # Write alert state to a local json file (e.g. `db/alerts.json`)
            pass
            
    watchdog_trigger = every(3600, check_watchlist_sentiment) # Run once every hour
    ```
*   **Acceptance Criteria:**
    - Background task executes hourly.
    - Correctly writes detected anomalies/sentiment drops to `db/alerts.json`.

#### **TSK-5.2: Watchdog UI Notifications & Alert Flagging**
*   **Assigned Role:** Frontend UI Engineer (`FE`)
*   **Estimated Effort:** 4 hours
*   **Dependencies:** TSK-5.1
*   **Description:**
    Render warning flags or alert banners on the Streamlit dashboard when the watchdog agent reports low average sentiment.
*   **Implementation Spec:**
    Read `db/alerts.json` on app load. If there are active alerts, display a `st.warning("⚠️ Critical Sentiment Alert: [Ticker] has experienced a negative sentiment drop!")` banner at the top of the dashboard.
*   **Acceptance Criteria:**
    - Dashboard renders warnings dynamically when negative events are recorded by the watchdog.

---

### 🧪 Phase 6: Integration, Testing & Validation

#### **TSK-6.1: End-to-End Integration Testing**
*   **Assigned Role:** DevOps / QA Engineer (`QA-DO`)
*   **Estimated Effort:** 6 hours
*   **Dependencies:** All Phase 1–5 tasks
*   **Description:**
    Run integration tests on the completed agentic modules, verifying that all sub-agent calls, tool invokes, and background loops run correctly.
*   **Implementation Spec:**
    Create `tests/test_agentic_flow.py` and run a mock user chat turn. Verify:
    1. Tool delegation works (mock the network calls to save cost).
    2. Sentiment Analyst correctly enforces the response schema.
    3. The watchdog trigger can be run manually and populates alerts.
*   **Acceptance Criteria:**
    - All test cases pass.
    - System is robust against rate limit issues and API errors.
