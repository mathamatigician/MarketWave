import os
import sys
import json
import logging
import re
import asyncio
from typing import List, Dict, Optional, Any

try:
    from config import settings
except ImportError:
    try:
        from backend.config import settings
    except ImportError:
        settings = None

logger = logging.getLogger("GemmaService")


def get_token() -> str:
    token = os.environ.get("HF_TOKEN")
    if not token and settings:
        token = getattr(settings, "hf_token", None)
    return token or ""


def get_model_name() -> str:
    model = os.environ.get("GEMMA_MODEL")
    if not model and settings:
        model = getattr(settings, "gemma_model", None)
    # Default to fast, active Google Gemma model on HF router
    if not model or "featherless-ai" in model:
        return "google/gemma-3-12b-it"
    return model


def get_hf_client():
    """Initializes the AsyncOpenAI client pointing to Hugging Face router with bounded timeout."""
    token = get_token()
    if not token:
        return None
    try:
        from openai import AsyncOpenAI
        return AsyncOpenAI(
            base_url="https://router.huggingface.co/v1",
            api_key=token,
            timeout=8.0,
            max_retries=1
        )
    except Exception as e:
        logger.warning(f"Could not initialize Hugging Face router AsyncOpenAI client: {e}")
        return None


def _extract_json(content: str):
    """Extracts and parses JSON from raw LLM output, handling markdown blocks and trailing text."""
    if not content:
        return None
    cleaned = content.strip()
    if "```json" in cleaned:
        cleaned = cleaned.split("```json", 1)[1].split("```", 1)[0].strip()
    elif "```" in cleaned:
        cleaned = cleaned.split("```", 1)[1].split("```", 1)[0].strip()
    
    try:
        return json.loads(cleaned)
    except Exception:
        pass

    obj_match = re.search(r'(\{.*\}|\[.*\])', cleaned, re.DOTALL)
    if obj_match:
        try:
            return json.loads(obj_match.group(1))
        except Exception:
            pass
    return None


async def gemma_triage_news(title: str, summary: str = "", ticker: str = "") -> Dict[str, Any]:
    """Uses Google Gemma to rapidly classify whether an incoming news item
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
        model_id = get_model_name()
        messages = [{"role": "user", "content": prompt}]
        res = client.chat.completions.create(
            model=model_id,
            messages=messages,
            max_tokens=250,
            temperature=0.1
        )
        response = await res if asyncio.iscoroutine(res) else res
        content = response.choices[0].message.content.strip()
        parsed = _extract_json(content)
        if isinstance(parsed, dict):
            raw_score = parsed.get("relevance_score", 0.5)
            try:
                score = float(raw_score)
                if score > 1.0:
                    score = score / 100.0
            except Exception:
                score = 0.5

            return {
                "market_impact": parsed.get("market_impact", "MEDIUM").upper(),
                "relevance_score": round(score, 2),
                "reason": str(parsed.get("reason", "Gemma triage classification"))
            }
        return default_result
    except Exception as e:
        logger.warning(f"Gemma triage request failed, using default: {e}")
        return default_result


async def gemma_analyze_sentiment(text: str, ticker: str) -> Optional[Dict[str, Any]]:
    """Analyzes financial news sentiment across standardized market topics using Google Gemma.
    Returns structured sentiment dict with overall_sentiment and topic scores between -1.0 and 1.0.
    """
    client = get_hf_client()
    if not client or not text:
        return None

    prompt = f"""
You are an institutional financial sentiment analyst.
Analyze this news article about {ticker}.
Evaluate the sentiment for the company and its shareholders on a scale from -1.0 (most negative/bearish) to 1.0 (most positive/bullish), with 0.0 for neutral.
If a specific topic is NOT mentioned in the text, set its value to null.

Return ONLY a valid JSON object matching this exact schema:
{{
  "layoffs": float or null,
  "restructuring": float or null,
  "board_changes": float or null,
  "mergers": float or null,
  "investor_activity": float or null,
  "esg": float or null,
  "revenue_growth": float or null,
  "product_launches": float or null,
  "expansion": float or null,
  "disputes": float or null,
  "geo_political": float or null,
  "macro_economic": float or null,
  "partnerships": float or null,
  "cyber_security": float or null,
  "supply_chain": float or null,
  "labor_issues": float or null,
  "product_recalls": float or null,
  "overall_sentiment": float between -1.0 and 1.0
}}

Article text:
\"\"\"
{text[:3000]}
\"\"\"
"""

    try:
        model_id = get_model_name()
        messages = [{"role": "user", "content": prompt}]
        res = client.chat.completions.create(
            model=model_id,
            messages=messages,
            max_tokens=450,
            temperature=0.1
        )
        response = await res if asyncio.iscoroutine(res) else res
        content = response.choices[0].message.content.strip()
        parsed = _extract_json(content)
        if isinstance(parsed, dict) and "overall_sentiment" in parsed:
            # Validate and clamp numeric fields
            cleaned_dict = {}
            for k in [
                "layoffs", "restructuring", "board_changes", "mergers", "investor_activity",
                "esg", "revenue_growth", "product_launches", "expansion", "disputes",
                "geo_political", "macro_economic", "partnerships", "cyber_security",
                "supply_chain", "labor_issues", "product_recalls", "overall_sentiment"
            ]:
                val = parsed.get(k)
                if val is not None:
                    try:
                        f_val = float(val)
                        cleaned_dict[k] = max(-1.0, min(1.0, round(f_val, 2)))
                    except (ValueError, TypeError):
                        cleaned_dict[k] = None
                else:
                    cleaned_dict[k] = None
            if cleaned_dict.get("overall_sentiment") is None:
                cleaned_dict["overall_sentiment"] = 0.0
            return cleaned_dict
        return None
    except Exception as e:
        logger.warning(f"Gemma sentiment analysis failed: {e}")
        return None


async def gemma_generate_catalyst_bullet(ticker: str, recent_headlines: List[str]) -> str:
    """Generates an instant 1-sentence Breaking Catalyst summary for Watchdog alerts
    using Google Gemma.
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
        model_id = get_model_name()
        messages = [{"role": "user", "content": prompt}]
        res = client.chat.completions.create(
            model=model_id,
            messages=messages,
            max_tokens=100,
            temperature=0.2
        )
        response = await res if asyncio.iscoroutine(res) else res
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.warning(f"Gemma catalyst summary failed: {e}")
        return f"Severe negative sentiment drop detected on {ticker} based on recent news."


async def gemma_generate_flash_briefing(tickers: List[str], headlines_by_ticker: Dict[str, List[str]]) -> Optional[List[Dict[str, str]]]:
    """Generates a 60-Second Executive Flash Briefing across the user's active watchlist.
    Returns:
      - List of {ticker, bullet} items on successful synthesis
      - [] (empty list) when no relevant headlines exist for the tickers
      - None when the model request fails (allowing caller to preserve previous valid briefing)
    """
    context_lines = []
    for ticker in tickers[:5]:
        headlines = headlines_by_ticker.get(ticker, [])
        if not headlines:
            for k, v in headlines_by_ticker.items():
                if k.lower() == ticker.lower():
                    headlines = v
                    break
        if headlines:
            context_lines.append(f"[{ticker}]: " + " | ".join(headlines[:2]))

    # If there is no relevant information for the tickers, return empty list without hallucinating
    if not context_lines:
        logger.info("No relevant news headlines available for requested watchlist tickers.")
        return []

    client = get_hf_client()
    if not client:
        logger.warning("Hugging Face client is not configured for Gemma flash briefing.")
        return None

    prompt = f"""
You are an executive market intelligence synthesizer.
Based on these latest news headlines across the portfolio:
{chr(10).join(context_lines)}

Generate a bulleted executive flash briefing.
Return a valid JSON array of objects with keys:
- "ticker": company or ticker name matching the items provided (e.g. {tickers[:3]})
- "bullet": 1 concise, actionable takeaway sentence on that ticker's current catalyst.
"""

    try:
        model_id = get_model_name()
        messages = [{"role": "user", "content": prompt}]
        res = client.chat.completions.create(
            model=model_id,
            messages=messages,
            max_tokens=400,
            temperature=0.2
        )
        response = await res if asyncio.iscoroutine(res) else res
        content = response.choices[0].message.content.strip()
        parsed = _extract_json(content)
        if isinstance(parsed, list) and len(parsed) > 0:
            return parsed
        elif isinstance(parsed, dict):
            if "briefing" in parsed and isinstance(parsed["briefing"], list):
                return parsed["briefing"]
            return [{"ticker": k, "bullet": str(v)} for k, v in parsed.items()]
        return None
    except Exception as e:
        logger.warning(f"Gemma flash briefing generation failed: {e}")
        return None
