import asyncio
import logging
from datetime import datetime, timezone

from app.core.identity import ownership_status
from app.services.ais_service import stream_ais
from app.services.global_risk_service import build_global_risk_intelligence
from app.services.lstm_service import load_model as load_lstm_model
from app.services.ml_service import load_model
from app.services.weather_service import get_weather_zones
from app.services.news_service import fetch_recent_articles


logger = logging.getLogger(__name__)
_BACKGROUND_TASK = None
_STARTED_AT = datetime.now(timezone.utc)
_AIS_STREAM_STARTED_AT: datetime | None = None
_LAST_BACKGROUND_REFRESH_AT: datetime | None = None
_LAST_BACKGROUND_REFRESH_STATUS = "idle"
_LAST_BACKGROUND_REFRESH_ERROR: str | None = None


async def start_ais_stream():
    global _AIS_STREAM_STARTED_AT
    if not settings.ENABLE_AIS_STREAM:
        logger.info("AIS stream startup disabled")
        return

    logger.info("Starting AIS background stream task")
    _AIS_STREAM_STARTED_AT = datetime.now(timezone.utc)
    asyncio.create_task(stream_ais())


async def _refresh_operational_snapshots() -> None:
    global _LAST_BACKGROUND_REFRESH_AT, _LAST_BACKGROUND_REFRESH_STATUS, _LAST_BACKGROUND_REFRESH_ERROR
    while True:
        try:
            await asyncio.to_thread(get_weather_zones)
            await asyncio.to_thread(fetch_recent_articles, "24h")
            await asyncio.to_thread(build_global_risk_intelligence, "24h", 6)
            _LAST_BACKGROUND_REFRESH_AT = datetime.now(timezone.utc)
            _LAST_BACKGROUND_REFRESH_STATUS = "healthy"
            _LAST_BACKGROUND_REFRESH_ERROR = None
            await asyncio.sleep(300)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            _LAST_BACKGROUND_REFRESH_STATUS = "degraded"
            _LAST_BACKGROUND_REFRESH_ERROR = str(exc)
            logger.warning("Background snapshot refresh failed: %s", exc)
            await asyncio.sleep(30)


async def start_background_refresh() -> None:
    global _BACKGROUND_TASK
    if not settings.ENABLE_BACKGROUND_REFRESH:
        logger.info("Operational refresh background task disabled")
        return

    if _BACKGROUND_TASK is None or _BACKGROUND_TASK.done():
        logger.info("Starting operational refresh background task")
        _BACKGROUND_TASK = asyncio.create_task(_refresh_operational_snapshots())


def preload_ml_model() -> None:
    if not settings.PRELOAD_ML_MODELS:
        logger.info("Model preloading disabled")
        return

    logger.info("Preloading ML DRI model")
    load_model()
    logger.info("Preloading LSTM DRI model")
    load_lstm_model()
    owner = ownership_status()
    if owner["owner_configured"]:
        logger.info(
            "System owner configured: email=%s clerk_user_id=%s",
            owner["owner_email"],
            owner["owner_clerk_user_id"],
        )
    else:
        logger.warning("No system owner configured yet; backend is running without an owner identity")


def observability_snapshot() -> dict[str, object]:
    return {
        "started_at": _STARTED_AT.isoformat(),
        "uptime_seconds": max(0.0, (datetime.now(timezone.utc) - _STARTED_AT).total_seconds()),
        "ais_stream_started_at": _AIS_STREAM_STARTED_AT.isoformat() if _AIS_STREAM_STARTED_AT else None,
        "background_refresh": {
            "status": _LAST_BACKGROUND_REFRESH_STATUS,
            "last_success_at": _LAST_BACKGROUND_REFRESH_AT.isoformat() if _LAST_BACKGROUND_REFRESH_AT else None,
            "last_error": _LAST_BACKGROUND_REFRESH_ERROR,
        },
    }
