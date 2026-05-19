import logging
import random
import time
from datetime import datetime, timezone
from math import atan2, cos, radians, sin, sqrt
from typing import Dict, Iterable, List

import requests

from app.core.config import settings
from app.core.storage import record_weather_snapshot


logger = logging.getLogger(__name__)

_CACHE_TTL_SECONDS = 15
_WARN_COOLDOWN_SECONDS = 60
_weather_cache: dict[tuple[float, float], tuple[float, Dict[str, object]]] = {}
_last_warn_at = 0.0

MARITIME_ZONES = [
    {"name": "Singapore Strait", "lat": 1.264, "lon": 103.819},
    {"name": "Malacca Strait", "lat": 2.8, "lon": 100.0},
    {"name": "South China Sea", "lat": 7.5, "lon": 114.0},
    {"name": "Lombok Strait", "lat": -8.5, "lon": 115.5},
    {"name": "Java Sea", "lat": -4.5, "lon": 110.5},
]

PRIMARY_WEATHER_ZONE = {"name": "Singapore", "lat": 1.3521, "lon": 103.8198}

_OPEN_METEO_WEATHER_CODES = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
}


def _now() -> float:
    return time.time()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _cache_key(lat: float, lon: float) -> tuple[float, float]:
    return (round(lat, 2), round(lon, 2))


def _get_cached(lat: float, lon: float) -> Dict[str, object] | None:
    key = _cache_key(lat, lon)
    cached = _weather_cache.get(key)
    if not cached:
        return None

    expires_at, value = cached
    if _now() > expires_at:
        _weather_cache.pop(key, None)
        return None

    return value


def _set_cached(lat: float, lon: float, value: Dict[str, object]) -> None:
    _weather_cache[_cache_key(lat, lon)] = (_now() + _CACHE_TTL_SECONDS, value)


def _warn_once_per_window(message: str) -> None:
    global _last_warn_at
    now = _now()
    if now - _last_warn_at >= _WARN_COOLDOWN_SECONDS:
        logger.warning(message)
        _last_warn_at = now


def _clamp(value: float, low: int = 0, high: int = 100) -> int:
    return int(max(low, min(high, round(value))))


def _visibility_km(visibility_m: float) -> float:
    return max(0.1, round(float(visibility_m or 0.0) / 1000.0, 2))


def _rain_mm(payload: Dict[str, object]) -> float:
    rain = payload.get("rain") or {}
    if isinstance(rain, dict):
        return float(rain.get("1h") or rain.get("3h") or 0.0)
    return 0.0


def _condition(payload: Dict[str, object]) -> str:
    weather = payload.get("weather") or []
    if isinstance(weather, list) and weather:
        entry = weather[0] or {}
        if isinstance(entry, dict):
            main = str(entry.get("main") or "").strip()
            description = str(entry.get("description") or "").strip()
            if main and description:
                return f"{main} - {description}"
            return main or description or "Unknown"
    return "Unknown"


def _condition_from_open_meteo(code: int | None) -> str:
    if code is None:
        return "Unknown"
    return _OPEN_METEO_WEATHER_CODES.get(int(code), f"Weather code {int(code)}")


def _weather_severity(wind_speed: float, rain: float, visibility: float) -> int:
    value = (wind_speed * 0.3 + rain * 0.4 + (1 / max(visibility, 0.1)) * 0.3) * 10
    return _clamp(value)


def _visibility_from_open_meteo(value: object, unit: object = None) -> float:
    visibility = float(value or 0.0)
    unit_text = str(unit or "").lower()
    if visibility <= 0:
        return 10.0
    if unit_text in {"m", "meter", "meters"} or visibility > 100:
        return max(0.1, round(visibility / 1000.0, 2))
    return max(0.1, round(visibility, 2))


def _make_record(
    *,
    lat: float,
    lon: float,
    zone_name: str,
    wind_speed: float,
    visibility: float,
    rain: float,
    temperature: float,
    humidity: int,
    condition: str,
    source: str,
) -> Dict[str, object]:
    severity = _weather_severity(wind_speed=wind_speed, rain=rain, visibility=visibility)
    timestamp = _now_iso()

    return {
        "zone_name": zone_name,
        "lat": lat,
        "lon": lon,
        "wind_speed": round(wind_speed, 1),
        "visibility": round(visibility, 2),
        "rain": round(rain, 2),
        "temperature": round(temperature, 1),
        "weather_severity": severity,
        "risk": severity,
        "timestamp": timestamp,
        "source": source,
        "condition": condition,
        "temp_c": round(temperature, 1),
        "wind_kph": round(wind_speed, 1),
        "humidity": int(humidity),
    }


def _zone_name_for_coordinates(lat: float, lon: float) -> str:
    nearest = min(
        MARITIME_ZONES,
        key=lambda zone: _distance_km(lat, lon, zone["lat"], zone["lon"]),
    )
    return str(nearest["name"])


def _distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius = 6371.0
    lat1_r, lon1_r, lat2_r, lon2_r = map(radians, [lat1, lon1, lat2, lon2])
    delta_lat = lat2_r - lat1_r
    delta_lon = lon2_r - lon1_r
    a = sin(delta_lat / 2) ** 2 + cos(lat1_r) * cos(lat2_r) * sin(delta_lon / 2) ** 2
    return 2 * earth_radius * atan2(sqrt(a), sqrt(1 - a))


def _synthetic_weather(lat: float, lon: float, zone_name: str, source: str) -> Dict[str, object]:
    minute_bucket = int(_now() // 60)
    seed = int(abs(lat * 1000) + abs(lon * 1000) + minute_bucket)
    rng = random.Random(seed)

    wind_speed = 12 + rng.uniform(0, 18)
    visibility = max(0.3, 8.0 - rng.uniform(0, 5.8))
    rain = max(0.0, rng.uniform(0, 14))
    temperature = 27 + rng.uniform(-2, 4)
    humidity = int(62 + rng.uniform(0, 26))
    condition = rng.choice(["Partly cloudy", "Light rain", "Mist", "Overcast"])

    return _make_record(
        lat=lat,
        lon=lon,
        zone_name=zone_name,
        wind_speed=wind_speed,
        visibility=visibility,
        rain=rain,
        temperature=temperature,
        humidity=humidity,
        condition=condition,
        source=source,
    )


def _fetch_open_meteo_weather(lat: float, lon: float, zone_name: str) -> Dict[str, object] | None:
    url = f"{settings.OPEN_METEO_BASE_URL.rstrip('/')}/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,visibility,weather_code",
        "timezone": "auto",
        "forecast_days": 1,
        "wind_speed_unit": "kmh",
        "temperature_unit": "celsius",
    }

    try:
        response = requests.get(url, params=params, timeout=8)
        response.raise_for_status()
        payload = response.json()

        current = payload.get("current") or {}
        current_units = payload.get("current_units") or {}

        wind_speed = float(current.get("wind_speed_10m", 0.0) or 0.0)
        visibility = _visibility_from_open_meteo(current.get("visibility", 0.0), current_units.get("visibility"))
        rain = float(current.get("precipitation", 0.0) or 0.0)
        temperature = float(current.get("temperature_2m", 0.0) or 0.0)
        humidity = int(current.get("relative_humidity_2m", 0) or 0)
        condition = _condition_from_open_meteo(current.get("weather_code"))

        return _make_record(
            lat=lat,
            lon=lon,
            zone_name=zone_name,
            wind_speed=wind_speed,
            visibility=visibility,
            rain=rain,
            temperature=temperature,
            humidity=humidity,
            condition=condition,
            source="open-meteo",
        )
    except requests.RequestException as exc:
        _warn_once_per_window(f"Open-Meteo request failed: {exc}")
    except Exception as exc:
        _warn_once_per_window(f"Open-Meteo parse failure: {exc}")

    return None


def get_weather(lat: float, lon: float, zone_name: str | None = None) -> Dict[str, object]:
    cached = _get_cached(lat, lon)
    if cached:
        return cached

    resolved_zone = zone_name or _zone_name_for_coordinates(lat, lon)
    live_weather = _fetch_open_meteo_weather(lat, lon, resolved_zone)
    if live_weather:
        _set_cached(lat, lon, live_weather)
        record_weather_snapshot(live_weather, zone_name=resolved_zone)
        return live_weather

    _warn_once_per_window("Open-Meteo unavailable; using synthetic maritime weather fallback")
    synthetic = _synthetic_weather(lat, lon, resolved_zone, source="fallback:open-meteo-unavailable")
    _set_cached(lat, lon, synthetic)
    record_weather_snapshot(synthetic, zone_name=resolved_zone)
    return synthetic


def get_weather_zones() -> List[Dict[str, object]]:
    zones: List[Dict[str, object]] = []
    for zone in MARITIME_ZONES:
        weather = get_weather(zone["lat"], zone["lon"], zone_name=str(zone["name"]))
        zones.append(
            {
                "name": zone["name"],
                "lat": zone["lat"],
                "lon": zone["lon"],
                "severity": int(weather["weather_severity"]),
                "timestamp": weather["timestamp"],
            }
        )

    return zones


def get_primary_zone() -> Dict[str, object]:
    return PRIMARY_WEATHER_ZONE.copy()
