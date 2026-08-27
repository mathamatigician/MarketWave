import os
from typing import List, Optional

# Dynamically resolve root directory and configuration paths
backend_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.dirname(backend_dir)
env_path = os.path.join(root_dir, ".env")
if not os.path.exists(env_path):
    env_path = os.path.join(backend_dir, ".env")

try:
    from pydantic_settings import BaseSettings, SettingsConfigDict
    
    class Settings(BaseSettings):
        gemini_api_key: Optional[str] = None
        google_api_key: Optional[str] = None
        finhub_api_key: Optional[str] = None
        agent_model: str = "gemini-2.5-flash"
        firestore_project_id: str = "globepulse-demo"
        firestore_emulator_host: Optional[str] = None
        allowed_origins: str = "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174,http://localhost:8000,http://127.0.0.1:8000"
        admin_key: Optional[str] = None
        razorpay_key_id: Optional[str] = None
        razorpay_key_secret: Optional[str] = None
        google_client_id: str = ""
        hf_token: Optional[str] = None
        gemma_model: str = "google/gemma-2-9b-it"
        market_news_poll_seconds: int = 60
        gemma_briefing_debounce_seconds: int = 10
        # Hackathon demo guardrail: total registered users (existing + new
        # signups) allowed before /api/signup and first-time Google sign-in
        # both start rejecting new accounts. 14 = 9 already registered as of
        # 2026-08-18 + 5 new signups. Bump via MAX_TOTAL_USERS env var if
        # ever needed -- no code change required.
        max_total_users: int = 14

        model_config = SettingsConfigDict(
            env_file=env_path,
            env_file_encoding="utf-8",
            extra="ignore"
        )
except ImportError:
    from pydantic import BaseSettings

    class Settings(BaseSettings):
        gemini_api_key: Optional[str] = None
        google_api_key: Optional[str] = None
        finhub_api_key: Optional[str] = None
        agent_model: str = "gemini-3.5-flash"
        firestore_project_id: str = "globepulse-demo"
        firestore_emulator_host: Optional[str] = None
        allowed_origins: str = "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174,http://localhost:8000,http://127.0.0.1:8000"
        admin_key: Optional[str] = None
        razorpay_key_id: Optional[str] = None
        razorpay_key_secret: Optional[str] = None
        google_client_id: str = ""
        hf_token: Optional[str] = None
        gemma_model: str = "google/gemma-2-9b-it"
        market_news_poll_seconds: int = 60
        gemma_briefing_debounce_seconds: int = 10
        max_total_users: int = 14

        class Config:
            env_file = env_path
            env_file_encoding = "utf-8"
            extra = "ignore"

settings = Settings()

# Shared rejection message so /api/signup and /api/auth/google (google_auth.py)
# return identical wording when settings.max_total_users is reached.
SIGNUP_CLOSED_MESSAGE = "Signups are currently closed for this demo — thanks for your interest!"

# Post-processing: Expose credentials as environment variables for downstream SDK integrations
exposed_key = settings.gemini_api_key or settings.google_api_key or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
if exposed_key:
    os.environ["GEMINI_API_KEY"] = exposed_key
    os.environ["GOOGLE_API_KEY"] = exposed_key

# Configure local Firestore emulator if active and not in cloud production
if settings.firestore_emulator_host and "GOOGLE_APPLICATION_CREDENTIALS" not in os.environ and "K_SERVICE" not in os.environ:
    os.environ["FIRESTORE_EMULATOR_HOST"] = settings.firestore_emulator_host


def get_allowed_origins() -> List[str]:
    """Parses the comma-separated ALLOWED_ORIGINS setting into a clean list.

    Kept here rather than inline in main.py so it's unit-testable without
    importing main.py's heavier dependencies.
    """
    return [origin.strip() for origin in settings.allowed_origins.split(",") if origin.strip()]


# CORS regex for local-network dev convenience only (e.g. testing the app
# from a phone on the same WiFi as the dev machine). Never applied on Cloud
# Run -- see get_lan_origin_regex()'s "K_SERVICE" gate -- so it can never
# widen the production CORS boundary, which is governed solely by
# get_allowed_origins() above.
#
# The 172.x branch is scoped to the actual RFC1918 private range
# (172.16.0.0 - 172.31.255.255, i.e. second octet 16-31) rather than all of
# 172.x.x.x, most of which is public internet space (matching a real,
# previously-shipped bug where the unscoped version accepted public IPs
# like Google's or Cloudflare's as valid CORS origins).
_LAN_ORIGIN_REGEX = (
    r"^https?://(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
    r"|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$"
)


def get_lan_origin_regex() -> Optional[str]:
    """Returns the LAN-dev CORS regex, or None when running on Cloud Run.

    Kept here (rather than inline in main.py) for the same reason as
    get_allowed_origins(): unit-testable without importing main.py.
    """
    return _LAN_ORIGIN_REGEX if "K_SERVICE" not in os.environ else None
