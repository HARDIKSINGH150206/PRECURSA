from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Dict, List
from threading import Lock
import time

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.schemas.shipment_schema import ApiResponse, DashboardOverview, ExplainRequest, ExplainRiskResponse, ShipmentOut
from app.schemas.settings_schema import OperatorSettings
from app.core.identity import SystemPrincipal, SystemRole, ownership_status
from app.core.storage import get_settings_payload, list_shipments, save_settings_payload
from app.core.startup import observability_snapshot
from app.api.deps import get_system_principal
from app.services.ais_service import get_vessels_snapshot
from app.services.global_risk_service import build_global_risk_intelligence
from app.services.dri_service import calculate_dri
from app.services.reroute_service import get_best_route
from app.services.explain_service import explain_risk
from app.core.config import settings
from app.services.weather_service import get_primary_zone, get_weather, get_weather_zones


router = APIRouter(prefix="", tags=["precursa"])


DEFAULT_WEATHER_ZONE = get_primary_zone()
SETTINGS_KEY = "operator-settings"
_WRITE_RATE_LIMIT_LOCK = Lock()
_WRITE_RATE_LIMIT_BUCKETS: dict[str, deque[float]] = defaultdict(deque)


def _default_settings() -> dict[str, object]:
    return OperatorSettings().model_dump()


def _load_settings() -> OperatorSettings:
    return OperatorSettings(**get_settings_payload(SETTINGS_KEY, _default_settings()))


def _store_settings(payload: dict[str, object]) -> OperatorSettings:
    saved = save_settings_payload(SETTINGS_KEY, payload)
    return OperatorSettings(**saved)


def _require_write_access(principal: SystemPrincipal) -> None:
    if principal.role not in {SystemRole.owner, SystemRole.admin}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Owner or admin access required to update settings.",
        )


def _enforce_settings_rate_limit(client_ip: str | None) -> None:
    key = client_ip or "unknown"
    now = time.monotonic()
    window = float(settings.SETTINGS_WRITE_RATE_LIMIT_WINDOW_SECONDS)
    limit = int(settings.SETTINGS_WRITE_RATE_LIMIT_MAX)

    with _WRITE_RATE_LIMIT_LOCK:
        bucket = _WRITE_RATE_LIMIT_BUCKETS[key]
        while bucket and now - bucket[0] > window:
            bucket.popleft()

        if len(bucket) >= limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many settings updates. Please try again later.",
            )

        bucket.append(now)


def _build_shipments() -> List[ShipmentOut]:
    shipments: List[ShipmentOut] = []

    for raw in list_shipments():
        dri_data = calculate_dri(raw)
        weather = dri_data["weather"]

        enriched: Dict[str, object] = {
            **raw,
            "dri": int(dri_data["dri"]),
            "rule_dri": int(dri_data.get("rule_dri", dri_data["dri"])),
            "ml_dri": int(dri_data.get("ml_dri", dri_data["dri"])),
            "xgb_dri": int(dri_data.get("xgb_dri", dri_data.get("ml_dri", dri_data["dri"]))),
            "lstm_dri": int(dri_data.get("lstm_dri", dri_data["dri"])),
            "trend": str(dri_data.get("trend", "stable")),
            "time_aware_prediction": bool(dri_data.get("time_aware_prediction", False)),
            "confidence": float(dri_data.get("confidence", 0.0)),
            "prediction_engine": dri_data.get("prediction_engine", "Rule-based fallback"),
            "factors": dri_data["factors"],
            "weather_risk": int(weather["risk"]),
            "weather": weather,
            "route_coords": get_best_route(raw["origin"], raw["destination"]),
            "rerouted": int(dri_data["dri"]) >= 75,
        }
        shipments.append(ShipmentOut(**enriched))

    return shipments


@router.get("/health", response_model=ApiResponse)
def health() -> ApiResponse:
    return ApiResponse(data={"service": "precursa-api", "healthy": True})


@router.get("/health/live", response_model=ApiResponse)
def health_live() -> ApiResponse:
    return ApiResponse(data={"service": "precursa-api", "healthy": True})


@router.get("/health/ready", response_model=ApiResponse)
def health_ready() -> ApiResponse:
    return ApiResponse(data={
        "service": "precursa-api",
        "ready": True,
        "observability": observability_snapshot(),
    })


@router.get("/health/system", response_model=ApiResponse)
def system_health() -> ApiResponse:
    weather_snapshot = get_weather(DEFAULT_WEATHER_ZONE["lat"], DEFAULT_WEATHER_ZONE["lon"], zone_name=DEFAULT_WEATHER_ZONE["name"])
    vessels = get_vessels_snapshot()
    now = datetime.now(timezone.utc).isoformat()

    data = {
        "generated_at": now,
        "observability": observability_snapshot(),
        "services": {
            "weather": {
                "status": "online" if weather_snapshot else "degraded",
                "source": weather_snapshot.get("source", "unknown"),
                "last_sync": weather_snapshot.get("timestamp", now),
            },
            "ais": {
                "status": "streaming" if len(vessels) > 0 else "awaiting-stream",
                "vessels": len(vessels),
                "last_sync": vessels[0].get("timestamp") if vessels and isinstance(vessels[0], dict) else now,
            },
            "gemini": {
                "status": "ready" if settings.GEMINI_API_KEY else "disabled",
                "model": settings.GEMINI_MODEL,
                "last_sync": now,
            },
            "ownership": ownership_status(),
        },
    }

    return ApiResponse(data=data)


@router.get("/system/ownership", response_model=ApiResponse)
def system_ownership() -> ApiResponse:
    return ApiResponse(data=ownership_status())


@router.get("/settings", response_model=ApiResponse)
def get_settings() -> ApiResponse:
    settings_payload = _load_settings()
    return ApiResponse(data=settings_payload.model_dump())


@router.put("/settings", response_model=ApiResponse)
def update_settings(
    payload: OperatorSettings,
    request: Request,
    principal: SystemPrincipal = Depends(get_system_principal),
) -> ApiResponse:
    _enforce_settings_rate_limit(request.client.host if request.client else None)
    _require_write_access(principal)
    updated = _store_settings(payload.model_dump())
    return ApiResponse(data=updated.model_dump())


@router.get("/shipments", response_model=ApiResponse)
def get_shipments() -> ApiResponse:
    shipments = _build_shipments()
    return ApiResponse(data=[item.model_dump() for item in shipments])


@router.get("/vessels", response_model=ApiResponse)
def get_vessels() -> ApiResponse:
    return ApiResponse(data=get_vessels_snapshot())


@router.get("/weather", response_model=ApiResponse)
def get_weather_endpoint(lat: float = DEFAULT_WEATHER_ZONE["lat"], lon: float = DEFAULT_WEATHER_ZONE["lon"]) -> ApiResponse:
    return ApiResponse(data=get_weather(lat, lon))


@router.get("/weather/zones", response_model=ApiResponse)
def get_weather_zones_endpoint() -> ApiResponse:
    return ApiResponse(data=get_weather_zones())


@router.get("/global-risk", response_model=ApiResponse)
def global_risk_endpoint(window: str = "24h") -> ApiResponse:
    return ApiResponse(data=build_global_risk_intelligence(window=window))


@router.get("/dashboard/overview", response_model=ApiResponse)
def dashboard_overview() -> ApiResponse:
    shipments = _build_shipments()
    active_vessels = get_vessels_snapshot()

    total_shipments = len(shipments)
    high_risk_shipments = sum(1 for shipment in shipments if shipment.dri >= 65)
    average_risk = round(sum(shipment.dri for shipment in shipments) / total_shipments) if total_shipments else 0

    weather_snapshot = get_weather(DEFAULT_WEATHER_ZONE["lat"], DEFAULT_WEATHER_ZONE["lon"], zone_name=DEFAULT_WEATHER_ZONE["name"])

    risk_totals = {
        "Weather": 0,
        "Congestion": 0,
        "Tariff": 0,
        "Carrier": 0,
        "Others": 0,
    }

    for shipment in shipments:
        for factor in shipment.factors:
            if factor.name == "Weather Severity":
                risk_totals["Weather"] += factor.value
            elif factor.name == "Port Congestion":
                risk_totals["Congestion"] += factor.value
            elif factor.name == "Tariff Risk":
                risk_totals["Tariff"] += factor.value
            elif factor.name == "Carrier Risk":
                risk_totals["Carrier"] += factor.value
            else:
                risk_totals["Others"] += factor.value

    total_factor = sum(risk_totals.values()) or 1
    risk_breakdown = [
        {"name": key, "value": round(value / total_factor * 100)}
        for key, value in risk_totals.items()
    ]

    top_shipments = sorted(shipments, key=lambda shipment: shipment.dri, reverse=True)[:7]

    overview = DashboardOverview(
        total_shipments=total_shipments,
        high_risk_shipments=high_risk_shipments,
        active_vessels=len(active_vessels),
        average_risk=average_risk,
        current_weather=weather_snapshot,
        risk_breakdown=risk_breakdown,
        top_shipments=top_shipments,
    )

    return ApiResponse(data=overview.model_dump())


@router.post("/explain-risk", response_model=ApiResponse)
def explain_risk_endpoint(payload: ExplainRequest) -> ApiResponse:
    analysis = explain_risk(payload.model_dump())
    return ApiResponse(data=ExplainRiskResponse(**analysis).model_dump())


@router.post("/explain", response_model=ApiResponse)
def explain(payload: ExplainRequest) -> ApiResponse:
    analysis = explain_risk(payload.model_dump())
    return ApiResponse(data=ExplainRiskResponse(**analysis).model_dump())
