from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Dict, List
from threading import Lock
import time

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.schemas.shipment_schema import ApiResponse, DashboardOverview, ExplainRequest, ExplainRiskResponse, ShipmentOut
from app.schemas.reroute_schema import AvailableRoutesResponse, RerouteExecutionRequest, RerouteHistoryResponse, RouteOption, RerouteHistory
from app.schemas.settings_schema import OperatorSettings
from app.core.identity import SystemPrincipal, SystemRole, ownership_status
from app.core.storage import (
    get_latest_executed_reroute,
    get_settings_payload,
    list_shipments,
    save_settings_payload,
    _connect,
    _use_postgres,
)
from app.core.startup import observability_snapshot
from app.api.deps import get_system_principal
from app.services.ais_service import get_vessels_snapshot
from app.services.global_risk_service import build_global_risk_intelligence
from app.services.dri_service import calculate_dri
from app.services.reroute_service import get_best_route, get_alternative_routes, _haversine_distance
from app.services.explain_service import explain_risk
from app.core.config import settings
from app.services.weather_service import get_primary_zone, get_weather, get_weather_zones


router = APIRouter(prefix="", tags=["precursa"])


DEFAULT_WEATHER_ZONE = get_primary_zone()
SETTINGS_KEY = "operator-settings"
_WRITE_RATE_LIMIT_LOCK = Lock()
_WRITE_RATE_LIMIT_BUCKETS: dict[str, deque[float]] = defaultdict(deque)
_SHIPMENTS_CACHE_LOCK = Lock()
_SHIPMENTS_CACHE: list[ShipmentOut] | None = None
_SHIPMENTS_CACHE_AT = 0.0
_SHIPMENTS_CACHE_TTL_SECONDS = 20.0

_OVERVIEW_CACHE_LOCK = Lock()
_OVERVIEW_CACHE: dict[str, object] | None = None
_OVERVIEW_CACHE_AT = 0.0
_OVERVIEW_CACHE_TTL_SECONDS = 20.0

_WEATHER_ZONES_CACHE_LOCK = Lock()
_WEATHER_ZONES_CACHE: list[dict[str, object]] | None = None
_WEATHER_ZONES_CACHE_AT = 0.0
_WEATHER_ZONES_CACHE_TTL_SECONDS = 60.0


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
        latest_reroute = get_latest_executed_reroute(raw["id"])
        route_coords = get_best_route(raw["origin"], raw["destination"])
        rerouted = False

        if latest_reroute:
            route_index = int(latest_reroute.get("route_index", 0))
            alternative_routes = get_alternative_routes(raw["origin"], raw["destination"], count=max(2, route_index + 1))
            if 0 <= route_index < len(alternative_routes):
                route_coords = alternative_routes[route_index]["route_coords"]
                rerouted = True

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
            "route_coords": route_coords,
            "rerouted": rerouted,
        }
        shipments.append(ShipmentOut(**enriched))

    return shipments


def _get_cached_shipments() -> List[ShipmentOut]:
    global _SHIPMENTS_CACHE, _SHIPMENTS_CACHE_AT

    now = time.monotonic()
    with _SHIPMENTS_CACHE_LOCK:
        if _SHIPMENTS_CACHE is not None and now - _SHIPMENTS_CACHE_AT < _SHIPMENTS_CACHE_TTL_SECONDS:
            return list(_SHIPMENTS_CACHE)

    shipments = _build_shipments()

    with _SHIPMENTS_CACHE_LOCK:
        _SHIPMENTS_CACHE = list(shipments)
        _SHIPMENTS_CACHE_AT = now

    return shipments


def _build_overview_payload() -> dict[str, object]:
    shipments = _get_cached_shipments()
    active_vessels = get_vessels_snapshot()

    total_shipments = len(shipments)
    high_risk_shipments = sum(1 for shipment in shipments if shipment.dri >= 65)
    average_risk = round(sum(shipment.dri for shipment in shipments) / total_shipments) if total_shipments else 0

    weather_snapshot = get_weather(DEFAULT_WEATHER_ZONE["lat"], DEFAULT_WEATHER_ZONE["lon"], zone_name=DEFAULT_WEATHER_ZONE["name"], live=False)

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

    return overview.model_dump()


def _get_cached_overview() -> dict[str, object]:
    global _OVERVIEW_CACHE, _OVERVIEW_CACHE_AT

    now = time.monotonic()
    with _OVERVIEW_CACHE_LOCK:
        if _OVERVIEW_CACHE is not None and now - _OVERVIEW_CACHE_AT < _OVERVIEW_CACHE_TTL_SECONDS:
            return dict(_OVERVIEW_CACHE)

    overview = _build_overview_payload()

    with _OVERVIEW_CACHE_LOCK:
        _OVERVIEW_CACHE = dict(overview)
        _OVERVIEW_CACHE_AT = now

    return overview


def _get_cached_weather_zones() -> list[dict[str, object]]:
    global _WEATHER_ZONES_CACHE, _WEATHER_ZONES_CACHE_AT

    now = time.monotonic()
    with _WEATHER_ZONES_CACHE_LOCK:
        if _WEATHER_ZONES_CACHE is not None and now - _WEATHER_ZONES_CACHE_AT < _WEATHER_ZONES_CACHE_TTL_SECONDS:
            return list(_WEATHER_ZONES_CACHE)

    zones = get_weather_zones()

    with _WEATHER_ZONES_CACHE_LOCK:
        _WEATHER_ZONES_CACHE = list(zones)
        _WEATHER_ZONES_CACHE_AT = now

    return zones


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
    shipments = _get_cached_shipments()
    return ApiResponse(data=[item.model_dump() for item in shipments])


@router.get("/vessels", response_model=ApiResponse)
def get_vessels() -> ApiResponse:
    return ApiResponse(data=get_vessels_snapshot())


@router.get("/weather", response_model=ApiResponse)
def get_weather_endpoint(lat: float = DEFAULT_WEATHER_ZONE["lat"], lon: float = DEFAULT_WEATHER_ZONE["lon"]) -> ApiResponse:
    return ApiResponse(data=get_weather(lat, lon))


@router.get("/weather/zones", response_model=ApiResponse)
def get_weather_zones_endpoint() -> ApiResponse:
    return ApiResponse(data=_get_cached_weather_zones())


@router.get("/global-risk", response_model=ApiResponse)
def global_risk_endpoint(window: str = "24h") -> ApiResponse:
    return ApiResponse(data=build_global_risk_intelligence(window=window))


@router.get("/dashboard/overview", response_model=ApiResponse)
def dashboard_overview() -> ApiResponse:
    return ApiResponse(data=_get_cached_overview())


@router.post("/explain-risk", response_model=ApiResponse)
def explain_risk_endpoint(payload: ExplainRequest) -> ApiResponse:
    analysis = explain_risk(payload.model_dump())
    return ApiResponse(data=ExplainRiskResponse(**analysis).model_dump())



@router.post("/explain", response_model=ApiResponse)
def explain(payload: ExplainRequest) -> ApiResponse:
    analysis = explain_risk(payload.model_dump())
    return ApiResponse(data=ExplainRiskResponse(**analysis).model_dump())


@router.get("/shipments/{shipment_id}/routes", response_model=ApiResponse)
def get_shipment_routes(shipment_id: str) -> ApiResponse:
    """Get available alternative routes for a shipment."""
    shipments = _build_shipments()
    shipment = next((s for s in shipments if s.id == shipment_id), None)
    
    if not shipment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Shipment {shipment_id} not found"
        )
    
    current_route = shipment.route_coords
    current_distance = 0
    if len(current_route) >= 2:
        current_distance = _haversine_distance(
            current_route[0][0], current_route[0][1],
            current_route[-1][0], current_route[-1][1]
        )
    
    alternative_routes = get_alternative_routes(shipment.origin, shipment.destination, count=2)
    
    response = AvailableRoutesResponse(
        shipment_id=shipment_id,
        current_route=current_route,
        current_distance_km=round(current_distance, 2),
        alternative_routes=[RouteOption(**route) for route in alternative_routes]
    )
    
    return ApiResponse(data=response.model_dump())


@router.post("/shipments/{shipment_id}/reroute", response_model=ApiResponse)
def execute_reroute(shipment_id: str, payload: RerouteExecutionRequest) -> ApiResponse:
    """Execute a reroute decision for a shipment."""
    shipments = _build_shipments()
    shipment = next((s for s in shipments if s.id == shipment_id), None)
    
    if not shipment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Shipment {shipment_id} not found"
        )
    
    alternative_routes = get_alternative_routes(shipment.origin, shipment.destination, count=2)
    
    if payload.route_index >= len(alternative_routes):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Route index {payload.route_index} is out of range"
        )
    
    selected_route = alternative_routes[payload.route_index]
    
    # Save reroute decision to database
    with _connect() as connection:
        if _use_postgres():
            connection.execute(
                """
                INSERT INTO shipment_reroutes 
                (shipment_id, original_origin, original_destination, intermediate_port, 
                 route_index, distance_saved_percent, estimated_cost_change, estimated_days_saved, 
                 decision_status, execution_notes, executed_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    shipment_id,
                    shipment.origin,
                    shipment.destination,
                    selected_route.get("intermediate_port"),
                    payload.route_index,
                    selected_route.get("distance_saved_percent", 0),
                    selected_route.get("estimated_cost_change", 0),
                    selected_route.get("estimated_days_saved", 0),
                    "executed",
                    payload.execution_notes or "",
                    datetime.now(timezone.utc)
                )
            )
        else:
            connection.execute(
                """
                INSERT INTO shipment_reroutes 
                (shipment_id, original_origin, original_destination, intermediate_port, 
                 route_index, distance_saved_percent, estimated_cost_change, estimated_days_saved, 
                 decision_status, execution_notes, executed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    shipment_id,
                    shipment.origin,
                    shipment.destination,
                    selected_route.get("intermediate_port"),
                    payload.route_index,
                    selected_route.get("distance_saved_percent", 0),
                    selected_route.get("estimated_cost_change", 0),
                    selected_route.get("estimated_days_saved", 0),
                    "executed",
                    payload.execution_notes or "",
                    datetime.now(timezone.utc)
                )
            )
            connection.commit()
    
    return ApiResponse(data={
        "success": True,
        "message": f"Reroute executed for shipment {shipment_id}",
        "selected_route": selected_route
    })


@router.get("/shipments/{shipment_id}/reroute-history", response_model=ApiResponse)
def get_reroute_history(shipment_id: str) -> ApiResponse:
    """Get reroute history for a shipment."""
    shipments = _build_shipments()
    shipment = next((s for s in shipments if s.id == shipment_id), None)
    
    if not shipment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Shipment {shipment_id} not found"
        )
    
    with _connect() as connection:
        if _use_postgres():
            rows = connection.execute(
                """
                SELECT id, shipment_id, original_origin, original_destination, intermediate_port,
                       route_index, distance_saved_percent, estimated_cost_change, estimated_days_saved,
                       decision_status, created_at, executed_at, execution_notes
                FROM shipment_reroutes
                WHERE shipment_id = %s
                ORDER BY created_at DESC
                """,
                (shipment_id,)
            ).fetchall()
        else:
            rows = connection.execute(
                """
                SELECT id, shipment_id, original_origin, original_destination, intermediate_port,
                       route_index, distance_saved_percent, estimated_cost_change, estimated_days_saved,
                       decision_status, created_at, executed_at, execution_notes
                FROM shipment_reroutes
                WHERE shipment_id = ?
                ORDER BY created_at DESC
                """,
                (shipment_id,)
            ).fetchall()
    
    history = [RerouteHistory(**dict(row)) for row in rows]
    
    total = len(history)
    pending = sum(1 for h in history if h.decision_status == "pending")
    executed = sum(1 for h in history if h.decision_status == "executed")
    
    response = RerouteHistoryResponse(
        shipment_id=shipment_id,
        total_reroutes=total,
        pending_reroutes=pending,
        executed_reroutes=executed,
        history=history
    )
    
    return ApiResponse(data=response.model_dump())
