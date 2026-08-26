import os
import json
import logging
from typing import List, Dict, Optional, Any

logger = logging.getLogger("GemmaService")

HF_TOKEN = os.environ.get("HF_TOKEN") or ""
GEMMA_MODEL = os.environ.get("GEMMA_MODEL", "google/gemma-2-9b-it")


def get_hf_client():
    """Initializes the Hugging Face InferenceClient if HF_TOKEN is configured."""
    token = os.environ.get("HF_TOKEN") or HF_TOKEN
    if not token:
        return None
    try:
        from huggingface_hub import InferenceClient
        return InferenceClient(api_key=token)
    except Exception as e:
        logger.warning(f"Could not initialize Hugging Face InferenceClient: {e}")
        return None


async def gemma_triage_news(title: str, summary: str = "", ticker: str = "") -> Dict[str, Any]:
    """Uses Google Gemma 2 to rapidly classify whether an incoming news item
    is market-moving (HIGH), moderate (MEDIUM), or non-material noise (NOISE).
    """
    client = get_hf_client()
    default_result = {
        "market_impact": "MEDIUM",
        "relevance_score": 0.5,
        "reason": "Default triage evaluation"
    }

    if not client:
        return default_result

    prompt = f"""
You are a high-speed financial news triage analyst.
Evaluate this headline and brief summary about {ticker or 'a public company'}.
Classify its market impact as 'HIGH', 'MEDIUM', or 'NOISE'.
Return ONLY a valid JSON object with keys:
- "market_impact": "HIGH" | "MEDIUM" | "NOISE"
- "relevance_score": float between 0.0 and 1.0
- "reason": brief 1-sentence explanation

Headline: {title}
Summary: {summary[:300]}
"""

    try:
        model_id = os.environ.get("GEMMA_MODEL", GEMMA_MODEL)
        messages = [{"role": "user", "content": prompt}]
        response = client.chat.completions.create(
            model=model_id,
            messages=messages,
            max_tokens=150,
            temperature=0.1
        )
        content = response.choices[0].message.content.strip()

        # Clean JSON markdown if wrapped in ```json ... ```
        if content.startswith("```"):
            lines = content.splitlines()
            content = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])
        
        parsed = json.loads(content)
        return {
            "market_impact": parsed.get("market_impact", "MEDIUM"),
            "relevance_score": float(parsed.get("relevance_score", 0.5)),
            "reason": parsed.get("reason", "Gemma triage classification")
        }
    except Exception as e:
        logger.warning(f"Gemma triage request failed, using default: {e}")
        return default_result


async def gemma_generate_catalyst_bullet(ticker: str, recent_headlines: List[str]) -> str:
    """Generates an instant 1-sentence Breaking Catalyst summary for Watchdog alerts
    using Google Gemma 2.
    """
    client = get_hf_client()
    if not client or not recent_headlines:
        return f"Significant negative sentiment shift detected on {ticker} watchlist."

    prompt = f"""
You are an institutional trading catalyst summarizer.
The stock '{ticker}' has triggered a severe negative sentiment alert based on the following breaking news:
{chr(10).join(f"- {h}" for h in recent_headlines[:3])}

Write a punchy, professional 1-sentence Breaking Catalyst summary explaining why {ticker} is moving.
Do not include fluff or intros. Return only the 1-sentence summary.
"""

    try:
        model_id = os.environ.get("GEMMA_MODEL", GEMMA_MODEL)
        messages = [{"role": "user", "content": prompt}]
        response = client.chat.completions.create(
            model=model_id,
            messages=messages,
            max_tokens=100,
            temperature=0.2
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.warning(f"Gemma catalyst summary failed: {e}")
        return f"Severe negative sentiment drop detected on {ticker} based on recent news."


async def gemma_generate_flash_briefing(tickers: List[str], headlines_by_ticker: Dict[str, List[str]]) -> List[Dict[str, str]]:
    """Generates a 60-Second Executive Morning Briefing across the user's active watchlist."""
    client = get_hf_client()
    default_briefing = [
        {"ticker": t, "bullet": f"Continuous sentiment tracking active for {t}."}
        for t in tickers[:5]
    ]

    if not client:
        return default_briefing

    context_lines = []
    for ticker in tickers[:5]:
        headlines = headlines_by_ticker.get(ticker, [])
        if headlines:
            context_lines.append(f"[{ticker}]: " + " | ".join(headlines[:2]))

    if not context_lines:
        return default_briefing

    prompt = f"""
You are an executive market intelligence synthesizer.
Based on these latest news headlines across the portfolio:
{chr(10).join(context_lines)}

Generate a bulleted executive flash briefing.
Return a valid JSON array of objects with keys:
- "ticker": ticker symbol (e.g. "TSLA")
- "bullet": 1 concise, actionable takeaway sentence on that ticker's current catalyst.
"""

    try:
        model_id = os.environ.get("GEMMA_MODEL", GEMMA_MODEL)
        messages = [{"role": "user", "content": prompt}]
        response = client.chat.completions.create(
            model=model_id,
            messages=messages,
            max_tokens=300,
            temperature=0.2
        )
        content = response.choices[0].message.content.strip()
        if content.startswith("```"):
            lines = content.splitlines()
            content = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])
        
        parsed = json.loads(content)
        if isinstance(parsed, list):
            return parsed
        return default_briefing
    except Exception as e:
        logger.warning(f"Gemma flash briefing generation failed: {e}")
        return default_briefing
