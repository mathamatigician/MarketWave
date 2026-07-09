import os
import sys

# Ensure parent directory is in sys.path so we can import sibling files
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from google.antigravity import Agent, LocalAgentConfig, types
from pipeline import TopicSentimentSchema
from backend.agents.tools import fetch_news_tool, get_stock_history_tool

from config import settings

# 1. Research Agent Configuration
# Dedicated to fetching and parsing raw news texts
research_agent_config = LocalAgentConfig(
    system_instructions=(
        "You are the GlobePulse News Researcher. Your job is to locate and scrape news "
        "articles for a specific company or ticker. Use the fetch_news_tool to obtain "
        "news contents. Clean and summarize the output for downstream sentiment analysis."
    ),
    tools=[fetch_news_tool],
    model=settings.agent_model
)

# 2. Sentiment Analyst Agent Configuration
# Enforces structured output format matching TopicSentimentSchema
sentiment_analyst_config = LocalAgentConfig(
    system_instructions=(
        "You are the GlobePulse Sentiment Analyst. Your job is to analyze the provided article "
        "texts and return structured sentiment scores for the 18 financial topics. "
        "Values must be between -1.0 (most negative) and 1.0 (most positive). "
        "If a topic is not mentioned, its score must be null."
    ),
    response_schema=TopicSentimentSchema,
    model=settings.agent_model
)

# 3. Market Correlator Agent Configuration
# Correlates stock history with news sentiment
correlator_config = LocalAgentConfig(
    system_instructions=(
        "You are the GlobePulse Market Correlator. Use the get_stock_history_tool to retrieve "
        "historical price series and cross-reference price movements (drops/spikes) with "
        "sentiment scores and news events. Highlight any cause-and-effect patterns."
    ),
    tools=[get_stock_history_tool],
    model=settings.agent_model
)

# 4. Orchestrator Agent Configuration
# Primary user assistant that orchestrates sub-agents
orchestrator_config = LocalAgentConfig(
    system_instructions=(
        "You are the GlobePulse AI Financial Assistant. You help users analyze stocks, "
        "understand market sentiments, and correlate news with price movements. "
        "You have access to three specialized sub-agents: "
        "- ResearchAgent: To fetch and scrape news articles. "
        "- SentimentAnalyst: To evaluate structured sentiment scores from raw news. "
        "- MarketCorrelator: To pull historical stock prices and check correlations. "
        "Coordinate their execution based on the user's questions. State what sub-agents "
        "you are delegating tasks to."
    ),
    capabilities=types.CapabilitiesConfig(
        enable_subagents=True
    ),
    model=settings.agent_model
)

# Shared conversation session
# This context can be passed dynamically from WebSockets or HTTP handlers
class AgentSession:
    def __init__(self):
        self.orchestrator_agent = None

    async def get_agent(self) -> Agent:
        if self.orchestrator_agent is None:
            self.orchestrator_agent = Agent(orchestrator_config)
            # Pre-initialize or run within async context manager
            await self.orchestrator_agent.__aenter__()
        return self.orchestrator_agent

    async def close(self):
        if self.orchestrator_agent is not None:
            await self.orchestrator_agent.__aexit__(None, None, None)
            self.orchestrator_agent = None
