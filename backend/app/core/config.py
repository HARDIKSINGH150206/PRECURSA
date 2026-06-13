from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    AIS_API_KEY: str = ""
    WEATHER_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    NEWS_API_KEY: str = ""
    OWNER_EMAIL: str = ""
    OWNER_CLERK_USER_ID: str = ""
    ADMIN_EMAILS: str = ""
    ADMIN_CLERK_USER_IDS: str = ""
    SYSTEM_NAME: str = "Precursa"
    CLERK_JWKS_URL: str = "https://api.clerk.com/v1/jwks"
    CLERK_ISSUER: str = ""
    STRUCTURED_LOGS: bool = True
    SETTINGS_WRITE_RATE_LIMIT_MAX: int = 6
    SETTINGS_WRITE_RATE_LIMIT_WINDOW_SECONDS: int = 60
    DATABASE_URL: str = ""
    PRELOAD_ML_MODELS: bool = True
    ENABLE_BACKGROUND_REFRESH: bool = True
    ENABLE_AIS_STREAM: bool = True
    ENABLE_MODEL_SCORING: bool = False

    OPEN_METEO_BASE_URL: str = "https://api.open-meteo.com/v1"
    GEMINI_MODEL: str = "gemini-2.5-flash"
    AIS_STREAM_URL: str = "wss://stream.aisstream.io/v0/stream"
    NEWS_API_BASE_URL: str = "https://newsapi.org/v2"
    GDELT_BASE_URL: str = "https://api.gdeltproject.org/api/v2/doc/doc"

    AIS_MAX_VESSELS: int = 120
    AIS_MIN_LAT: float = Field(default=1.0)
    AIS_MAX_LAT: float = Field(default=1.5)
    AIS_MIN_LON: float = Field(default=103.5)
    AIS_MAX_LON: float = Field(default=104.1)

    FRONTEND_ORIGIN: str = "http://localhost:5174"


settings = Settings()
