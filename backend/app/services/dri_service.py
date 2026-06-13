import hashlib
import logging
import random
from typing import Dict

from app.services.ais_service import get_vessels_snapshot
from app.core.config import settings
from app.services.lstm_service import predict_dri as predict_lstm_dri
from app.services.ml_service import predict_dri
from app.services.reroute_service import get_best_route
from app.services.weather_service import get_weather


logger = logging.getLogger(__name__)


def _bounded(value: float, low: int = 0, high: int = 100) -> int:
    return int(max(low, min(high, round(value))))


def _seeded_random(shipment_id: str, origin: str, destination: str) -> random.Random:
    seed_input = f"{shipment_id}:{origin}:{destination}"
    seed = int(hashlib.sha256(seed_input.encode("utf-8")).hexdigest()[:12], 16)
    return random.Random(seed)


def _congestion_score(vessel_count: int) -> int:
    # Logistic-style ramp translated into simple bounded curve.
    score = 100 * (1 - (2.718281828 ** (-vessel_count / 28)))
    return _bounded(score)


def _route_length_km(route_points: list[list[float]]) -> float:
    if len(route_points) < 2:
        return 1000.0

    from math import atan2, cos, radians, sin, sqrt

    def distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        radius = 6371.0
        lat1_r, lon1_r, lat2_r, lon2_r = map(radians, [lat1, lon1, lat2, lon2])
        delta_lat = lat2_r - lat1_r
        delta_lon = lon2_r - lon1_r
        a = sin(delta_lat / 2) ** 2 + cos(lat1_r) * cos(lat2_r) * sin(delta_lon / 2) ** 2
        return 2 * radius * atan2(sqrt(a), sqrt(1 - a))

    return sum(
        distance(route_points[index][0], route_points[index][1], route_points[index + 1][0], route_points[index + 1][1])
        for index in range(len(route_points) - 1)
    )


def _build_sequence(shipment_id: str, weather_severity: int, congestion: int, vessel_density: int, visibility: float) -> list[list[float]]:
    rng = _seeded_random(shipment_id, "sequence", "dri")
    weather_trend = rng.uniform(-2.0, 2.4)
    congestion_trend = rng.uniform(-1.8, 2.2)
    density_trend = rng.uniform(-1.2, 1.6)
    visibility_trend = rng.uniform(-0.18, 0.14)

    sequence = []
    for index in range(10):
        sequence.append([
            _bounded(weather_severity + weather_trend * (index - 9) + rng.uniform(-3.2, 3.2)),
            _bounded(congestion + congestion_trend * (index - 9) + rng.uniform(-3.0, 3.0)),
            _bounded(vessel_density + density_trend * (index - 9) + rng.uniform(-2.3, 2.3)),
            max(1.0, min(10.0, visibility + visibility_trend * (index - 9) + rng.uniform(-0.35, 0.35))),
        ])
    return sequence


def calculate_dri(shipment: Dict[str, object]) -> Dict[str, object]:
    lat = float(shipment.get("lat", 0.0))
    lon = float(shipment.get("lon", 0.0))

    shipment_id = str(shipment.get("id", "UNKNOWN"))
    origin = str(shipment.get("origin", ""))
    destination = str(shipment.get("destination", ""))
    cargo = str(shipment.get("cargo", "general")).lower()
    weather = get_weather(lat, lon, live=False)
    vessel_count = len(get_vessels_snapshot())
    route_length = float(shipment.get("route_length") or _route_length_km(get_best_route(origin, destination)))

    rng = _seeded_random(shipment_id=shipment_id, origin=origin, destination=destination)

    cargo_tariff_bias = {
        "electronics": 6,
        "pharma": 8,
        "automotive": 10,
        "apparel": 4,
    }.get(cargo, 5)

    tariff_risk = _bounded(rng.uniform(20, 45) + cargo_tariff_bias + random.uniform(-4, 7))
    carrier_risk = _bounded(rng.uniform(18, 40) + random.uniform(-6, 9))
    congestion = _congestion_score(vessel_count)
    weather_severity = int(weather["weather_severity"])
    base_risk = _bounded(congestion * 0.42 + tariff_risk * 0.33 + carrier_risk * 0.25)

    rule_dri = _bounded(base_risk + (weather_severity * 0.25))

    xgb_dri = rule_dri
    ml_confidence = 0.0
    lstm_dri = rule_dri
    trend = "stable"
    xgb_available = False
    lstm_available = False
    prediction_engine = "Rule-based fallback"

    if settings.ENABLE_MODEL_SCORING:
        try:
            ml_result = predict_dri({
                "weather_severity": weather_severity,
                "congestion_score": congestion,
                "vessel_density": vessel_count,
                "route_length": route_length,
                "visibility": float(weather.get("visibility", 10.0)),
            })
            xgb_dri = _bounded(float(ml_result.get("predicted_dri", rule_dri)))
            ml_confidence = float(ml_result.get("confidence", 0.0))
            xgb_available = True
        except Exception as exc:
            logger.warning("ML DRI prediction failed; using rule-based score: %s", exc)

        try:
            lstm_result = predict_lstm_dri(
                _build_sequence(
                    shipment_id=shipment_id,
                    weather_severity=weather_severity,
                    congestion=congestion,
                    vessel_density=vessel_count,
                    visibility=float(weather.get("visibility", 10.0)),
                )
            )
            lstm_dri = _bounded(float(lstm_result.get("lstm_dri", rule_dri)))
            trend = str(lstm_result.get("trend", "stable"))
            lstm_available = True
        except Exception as exc:
            logger.warning("LSTM DRI prediction failed; skipping time-series component: %s", exc)

    if xgb_available and lstm_available:
        prediction_engine = "Hybrid (Rule + ML + LSTM)"
        dri = _bounded((0.5 * rule_dri) + (0.3 * xgb_dri) + (0.2 * lstm_dri))
    elif xgb_available:
        prediction_engine = "Hybrid (Rule + ML)"
        dri = _bounded((0.7 * rule_dri) + (0.3 * xgb_dri))
    elif lstm_available:
        prediction_engine = "Hybrid (Rule + LSTM)"
        dri = _bounded((0.8 * rule_dri) + (0.2 * lstm_dri))
    else:
        dri = rule_dri

    factors = [
        {"name": "Port Congestion", "value": congestion},
        {"name": "Weather Severity", "value": weather_severity},
        {"name": "Tariff Risk", "value": tariff_risk},
        {"name": "Carrier Risk", "value": carrier_risk},
        {"name": "Base Risk", "value": base_risk},
        {"name": "Live Vessel Count", "value": vessel_count},
    ]

    logger.debug(
        "DRI calculation shipment=%s dri=%s vessel_count=%s weather=%s tariff=%s carrier=%s",
        shipment_id,
        dri,
        vessel_count,
        weather_severity,
        tariff_risk,
        carrier_risk,
    )

    return {
        "dri": dri,
        "rule_dri": rule_dri,
        "ml_dri": xgb_dri,
        "xgb_dri": xgb_dri,
        "lstm_dri": lstm_dri,
        "trend": trend,
        "time_aware_prediction": lstm_available,
        "confidence": ml_confidence,
        "prediction_engine": prediction_engine,
        "base_risk": base_risk,
        "weather_severity": weather_severity,
        "factors": factors,
        "weather": weather,
    }