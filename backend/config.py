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
        agent_model: str = "gemini-2.5-flash"
        firestore_project_id: str = "globepulse-demo"
        firestore_emulator_host: Optional[str] = None
        allowed_origins: str = "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174,http://localhost:8000,http://127.0.0.1:8000"
        admin_key: Optional[str] = None
        razorpay_key_id: Optional[str] = None
        razorpay_key_secret: Optional[str] = None
        google_client_id: str = ""

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
        agent_model: str = "gemini-2.5-flash"
        firestore_project_id: str = "globepulse-demo"
        firestore_emulator_host: Optional[str] = None
        allowed_origins: str = "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174,http://localhost:8000,http://127.0.0.1:8000"
        admin_key: Optional[str] = None
        razorpay_key_id: Optional[str] = None
        razorpay_key_secret: Optional[str] = None
        google_client_id: str = ""

        class Config:
            env_file = env_path
            env_file_encoding = "utf-8"
            extra = "ignore"

settings = Settings()

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
