from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Dict, Iterator, List

import psycopg
from psycopg.rows import dict_row

from app.core.config import settings


BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "precursa.sqlite3"
SEED_PORTS_PATH = DATA_DIR / "seed_ports.json"
SEED_SHIPMENTS_PATH = DATA_DIR / "seed_shipments.json"

_LOCK = Lock()
_INITIALIZED = False


def _database_url() -> str:
    return (os.getenv("DATABASE_URL") or settings.DATABASE_URL or "").strip()


def _use_postgres() -> bool:
    database_url = _database_url()
    return database_url.startswith("postgresql://") or database_url.startswith("postgres://")


def _read_json(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, list):
        return []
    return [item for item in payload if isinstance(item, dict)]


def _seed_ports() -> list[dict[str, Any]]:
    ports = _read_json(SEED_PORTS_PATH)
    enriched: list[dict[str, Any]] = []
    for item in ports:
        enriched.append(
            {
                "name": item["name"],
                "country": item.get("country", ""),
                "lat": float(item["lat"]),
                "lon": float(item["lon"]),
            }
        )
    return enriched


def _seed_shipments() -> list[dict[str, Any]]:
    shipments = _read_json(SEED_SHIPMENTS_PATH)
    enriched: list[dict[str, Any]] = []
    for item in shipments:
        enriched.append(
            {
                "id": item["id"],
                "origin": item["origin"],
                "destination": item["destination"],
                "current_location": item["current_location"],
                "lat": float(item["lat"]),
                "lon": float(item["lon"]),
                "cargo": item["cargo"],
            }
        )
    return enriched


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def _sqlite_connection() -> Iterator[sqlite3.Connection]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
    finally:
        connection.close()


@contextmanager
def _postgres_connection() -> Iterator[psycopg.Connection[Any]]:
    connection = psycopg.connect(_database_url(), row_factory=dict_row)
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def _connect():
    return _postgres_connection() if _use_postgres() else _sqlite_connection()


def _initialize_sqlite_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            clerk_user_id TEXT UNIQUE,
            email TEXT UNIQUE NOT NULL,
            full_name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'member',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ports (
            name TEXT PRIMARY KEY,
            country TEXT NOT NULL DEFAULT '',
            lat REAL NOT NULL,
            lon REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS vessels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mmsi TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL DEFAULT '',
            current_speed REAL NOT NULL DEFAULT 0,
            lat REAL NOT NULL,
            lon REAL NOT NULL,
            trail_json TEXT NOT NULL DEFAULT '[]',
            last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS shipments (
            id TEXT PRIMARY KEY,
            origin_port_id INTEGER,
            destination_port_id INTEGER,
            origin TEXT NOT NULL,
            destination TEXT NOT NULL,
            current_location TEXT NOT NULL,
            lat REAL NOT NULL,
            lon REAL NOT NULL,
            cargo TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            dri INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS weather_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            port_id INTEGER,
            shipment_id TEXT,
            zone_name TEXT NOT NULL DEFAULT '',
            temperature REAL NOT NULL DEFAULT 0,
            wind_speed REAL NOT NULL DEFAULT 0,
            rain REAL NOT NULL DEFAULT 0,
            visibility REAL NOT NULL DEFAULT 0,
            severity INTEGER NOT NULL DEFAULT 0,
            source TEXT NOT NULL DEFAULT 'seed',
            captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS app_settings (
            settings_key TEXT PRIMARY KEY,
            settings_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """
    )


def _initialize_postgres_schema(connection: psycopg.Connection[Any]) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY,
            clerk_user_id TEXT UNIQUE,
            email TEXT UNIQUE NOT NULL,
            full_name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'member',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS ports (
            id BIGSERIAL PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            country TEXT NOT NULL DEFAULT '',
            lat DOUBLE PRECISION NOT NULL,
            lon DOUBLE PRECISION NOT NULL
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS vessels (
            id BIGSERIAL PRIMARY KEY,
            mmsi TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL DEFAULT '',
            current_speed DOUBLE PRECISION NOT NULL DEFAULT 0,
            lat DOUBLE PRECISION NOT NULL,
            lon DOUBLE PRECISION NOT NULL,
            trail_json JSONB NOT NULL DEFAULT '[]'::jsonb,
            last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS shipments (
            id TEXT PRIMARY KEY,
            origin_port_id BIGINT REFERENCES ports(id) ON DELETE SET NULL,
            destination_port_id BIGINT REFERENCES ports(id) ON DELETE SET NULL,
            origin TEXT NOT NULL,
            destination TEXT NOT NULL,
            current_location TEXT NOT NULL,
            lat DOUBLE PRECISION NOT NULL,
            lon DOUBLE PRECISION NOT NULL,
            cargo TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            dri INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS weather_snapshots (
            id BIGSERIAL PRIMARY KEY,
            port_id BIGINT REFERENCES ports(id) ON DELETE CASCADE,
            shipment_id TEXT REFERENCES shipments(id) ON DELETE CASCADE,
            zone_name TEXT NOT NULL DEFAULT '',
            temperature DOUBLE PRECISION NOT NULL DEFAULT 0,
            wind_speed DOUBLE PRECISION NOT NULL DEFAULT 0,
            rain DOUBLE PRECISION NOT NULL DEFAULT 0,
            visibility DOUBLE PRECISION NOT NULL DEFAULT 0,
            severity INTEGER NOT NULL DEFAULT 0,
            source TEXT NOT NULL DEFAULT 'seed',
            captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS app_settings (
            settings_key TEXT PRIMARY KEY,
            settings_json JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )


def _seed_sqlite_data(connection: sqlite3.Connection) -> None:
    port_count = connection.execute("SELECT COUNT(*) AS count FROM ports").fetchone()["count"]
    if port_count == 0:
        ports = _seed_ports()
        connection.executemany(
            "INSERT INTO ports (name, lat, lon) VALUES (?, ?, ?)",
            [(item["name"], item["lat"], item["lon"]) for item in ports],
        )

    shipment_count = connection.execute("SELECT COUNT(*) AS count FROM shipments").fetchone()["count"]
    if shipment_count == 0:
        shipments = _seed_shipments()
        connection.executemany(
            """
            INSERT INTO shipments (
                id, origin_port_id, destination_port_id, origin, destination, current_location, lat, lon, cargo
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    item["id"],
                    None,
                    None,
                    item["origin"],
                    item["destination"],
                    item["current_location"],
                    item["lat"],
                    item["lon"],
                    item["cargo"],
                )
                for item in shipments
            ],
        )


def _seed_postgres_data(connection: psycopg.Connection[Any]) -> None:
    port_count = connection.execute("SELECT COUNT(*) AS count FROM ports").fetchone()["count"]
    if port_count == 0:
        ports = _seed_ports()
        connection.executemany(
            "INSERT INTO ports (name, country, lat, lon) VALUES (%(name)s, %(country)s, %(lat)s, %(lon)s)",
            ports,
        )

    shipment_count = connection.execute("SELECT COUNT(*) AS count FROM shipments").fetchone()["count"]
    if shipment_count == 0:
        ports_by_name = {
            row["name"]: row["id"]
            for row in connection.execute("SELECT id, name FROM ports").fetchall()
        }
        shipments = []
        for item in _seed_shipments():
            shipments.append(
                {
                    "id": item["id"],
                    "origin_port_id": ports_by_name.get(item["origin"]),
                    "destination_port_id": ports_by_name.get(item["destination"]),
                    "origin": item["origin"],
                    "destination": item["destination"],
                    "current_location": item["current_location"],
                    "lat": item["lat"],
                    "lon": item["lon"],
                    "cargo": item["cargo"],
                }
            )
        connection.executemany(
            """
            INSERT INTO shipments (
                id, origin_port_id, destination_port_id, origin, destination, current_location, lat, lon, cargo
            )
            VALUES (
                %(id)s, %(origin_port_id)s, %(destination_port_id)s, %(origin)s, %(destination)s,
                %(current_location)s, %(lat)s, %(lon)s, %(cargo)s
            )
            """,
            shipments,
        )


def _parse_json_value(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


def _prepare_vessel_payload(vessel: Dict[str, Any]) -> Dict[str, Any]:
    trail = vessel.get("trail")
    if not isinstance(trail, list):
        trail = []
    return {
        "mmsi": str(vessel.get("mmsi") or 0),
        "name": str(vessel.get("name") or vessel.get("ship_name") or ""),
        "current_speed": float(vessel.get("sog") or vessel.get("current_speed") or 0.0),
        "lat": float(vessel.get("lat") or 0.0),
        "lon": float(vessel.get("lon") or 0.0),
        "trail_json": json.dumps(trail, ensure_ascii=False, separators=(",", ":")),
        "last_seen_at": str(vessel.get("timestamp") or _now_iso()),
    }


def upsert_vessels_snapshot(vessels: List[Dict[str, Any]]) -> None:
    initialize_storage()

    if not vessels:
        return

    with _connect() as connection:
        if _use_postgres():
            payloads = [_prepare_vessel_payload(vessel) for vessel in vessels]
            connection.executemany(
                """
                INSERT INTO vessels (mmsi, name, current_speed, lat, lon, trail_json, last_seen_at)
                VALUES (%(mmsi)s, %(name)s, %(current_speed)s, %(lat)s, %(lon)s, %(trail_json)s::jsonb, %(last_seen_at)s)
                ON CONFLICT (mmsi) DO UPDATE SET
                    name = EXCLUDED.name,
                    current_speed = EXCLUDED.current_speed,
                    lat = EXCLUDED.lat,
                    lon = EXCLUDED.lon,
                    trail_json = EXCLUDED.trail_json,
                    last_seen_at = EXCLUDED.last_seen_at
                """,
                payloads,
            )
            return

        payloads = [_prepare_vessel_payload(vessel) for vessel in vessels]
        for payload in payloads:
            connection.execute(
                """
                INSERT INTO vessels (mmsi, name, current_speed, lat, lon, trail_json, last_seen_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(mmsi) DO UPDATE SET
                    name = excluded.name,
                    current_speed = excluded.current_speed,
                    lat = excluded.lat,
                    lon = excluded.lon,
                    trail_json = excluded.trail_json,
                    last_seen_at = excluded.last_seen_at
                """,
                (
                    payload["mmsi"],
                    payload["name"],
                    payload["current_speed"],
                    payload["lat"],
                    payload["lon"],
                    payload["trail_json"],
                    payload["last_seen_at"],
                ),
            )
        connection.commit()


def list_vessels(limit: int = 80) -> List[Dict[str, Any]]:
    initialize_storage()

    if limit <= 0:
        return []

    with _connect() as connection:
        if _use_postgres():
            rows = connection.execute(
                """
                SELECT mmsi, name, current_speed, lat, lon, trail_json, last_seen_at
                FROM vessels
                ORDER BY last_seen_at DESC
                LIMIT %s
                """,
                (limit,),
            ).fetchall()
        else:
            rows = connection.execute(
                """
                SELECT mmsi, name, current_speed, lat, lon, trail_json, last_seen_at
                FROM vessels
                ORDER BY last_seen_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()

    results: List[Dict[str, Any]] = []
    for row in rows:
        payload = dict(row)
        payload["trail"] = _parse_json_value(payload.pop("trail_json", [])) or []
        payload["timestamp"] = payload.get("last_seen_at")
        results.append(payload)

    return results


def record_weather_snapshot(
    weather: Dict[str, Any],
    *,
    zone_name: str | None = None,
    port_name: str | None = None,
    shipment_id: str | None = None,
) -> None:
    initialize_storage()

    payload = {
        "zone_name": zone_name or str(weather.get("zone_name") or ""),
        "temperature": float(weather.get("temperature") or weather.get("temp_c") or 0.0),
        "wind_speed": float(weather.get("wind_speed") or weather.get("wind_kph") or 0.0),
        "rain": float(weather.get("rain") or 0.0),
        "visibility": float(weather.get("visibility") or 0.0),
        "severity": int(weather.get("weather_severity") or weather.get("risk") or 0),
        "source": str(weather.get("source") or "unknown"),
        "captured_at": str(weather.get("timestamp") or _now_iso()),
    }

    with _connect() as connection:
        if _use_postgres():
            port_id = None
            if port_name:
                row = connection.execute("SELECT id FROM ports WHERE name = %s", (port_name,)).fetchone()
                if row:
                    port_id = row["id"]

            connection.execute(
                """
                INSERT INTO weather_snapshots (
                    port_id, shipment_id, zone_name, temperature, wind_speed, rain, visibility, severity, source, captured_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    port_id,
                    shipment_id,
                    payload["zone_name"],
                    payload["temperature"],
                    payload["wind_speed"],
                    payload["rain"],
                    payload["visibility"],
                    payload["severity"],
                    payload["source"],
                    payload["captured_at"],
                ),
            )
            return

        connection.execute(
            """
            INSERT INTO weather_snapshots (
                port_id, shipment_id, zone_name, temperature, wind_speed, rain, visibility, severity, source, captured_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                None,
                shipment_id,
                payload["zone_name"],
                payload["temperature"],
                payload["wind_speed"],
                payload["rain"],
                payload["visibility"],
                payload["severity"],
                payload["source"],
                payload["captured_at"],
            ),
        )
        connection.commit()


def list_weather_snapshots(limit: int = 20) -> List[Dict[str, Any]]:
    initialize_storage()

    if limit <= 0:
        return []

    with _connect() as connection:
        if _use_postgres():
            rows = connection.execute(
                """
                SELECT zone_name, temperature, wind_speed, rain, visibility, severity, source, captured_at
                FROM weather_snapshots
                ORDER BY captured_at DESC
                LIMIT %s
                """,
                (limit,),
            ).fetchall()
        else:
            rows = connection.execute(
                """
                SELECT zone_name, temperature, wind_speed, rain, visibility, severity, source, captured_at
                FROM weather_snapshots
                ORDER BY captured_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()

    return [dict(row) for row in rows]


def initialize_storage() -> None:
    global _INITIALIZED

    if _INITIALIZED:
        return

    with _LOCK:
        if _INITIALIZED:
            return

        with _connect() as connection:
            if _use_postgres():
                _initialize_postgres_schema(connection)
                _seed_postgres_data(connection)
            else:
                _initialize_sqlite_schema(connection)
                _seed_sqlite_data(connection)
                connection.commit()

        _INITIALIZED = True


def list_shipments() -> List[Dict[str, Any]]:
    initialize_storage()

    with _connect() as connection:
        if _use_postgres():
            rows = connection.execute(
                """
                SELECT id, origin, destination, current_location, lat, lon, cargo
                FROM shipments
                ORDER BY id ASC
                """
            ).fetchall()
            return [dict(row) for row in rows]

        rows = connection.execute(
            "SELECT id, origin, destination, current_location, lat, lon, cargo FROM shipments ORDER BY id ASC"
        ).fetchall()
        return [dict(row) for row in rows]


def list_ports() -> List[Dict[str, Any]]:
    initialize_storage()

    with _connect() as connection:
        if _use_postgres():
            rows = connection.execute("SELECT name, lat, lon FROM ports ORDER BY name ASC").fetchall()
            return [dict(row) for row in rows]

        rows = connection.execute("SELECT name, lat, lon FROM ports ORDER BY name ASC").fetchall()
        return [dict(row) for row in rows]


def get_port_coordinates(name: str) -> tuple[float, float] | None:
    initialize_storage()

    with _connect() as connection:
        if _use_postgres():
            row = connection.execute("SELECT lat, lon FROM ports WHERE name = %s", (name,)).fetchone()
        else:
            row = connection.execute("SELECT lat, lon FROM ports WHERE name = ?", (name,)).fetchone()

    if row is None:
        return None
    return float(row["lat"]), float(row["lon"])


def get_settings_payload(settings_key: str, default: Dict[str, Any]) -> Dict[str, Any]:
    initialize_storage()

    with _connect() as connection:
        if _use_postgres():
            row = connection.execute(
                "SELECT settings_json, updated_at FROM app_settings WHERE settings_key = %s",
                (settings_key,),
            ).fetchone()
        else:
            row = connection.execute(
                "SELECT settings_json, updated_at FROM app_settings WHERE settings_key = ?",
                (settings_key,),
            ).fetchone()

    if row is None:
        return dict(default)

    settings_json = row["settings_json"]
    if isinstance(settings_json, str):
        try:
            loaded = json.loads(settings_json)
        except json.JSONDecodeError:
            loaded = None
    else:
        loaded = settings_json

    if isinstance(loaded, dict):
        merged = dict(default)
        merged.update(loaded)
        merged["updated_at"] = row["updated_at"]
        return merged

    fallback = dict(default)
    fallback["updated_at"] = row["updated_at"]
    return fallback


def save_settings_payload(settings_key: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    initialize_storage()
    updated_at = _now_iso()

    with _connect() as connection:
        if _use_postgres():
            connection.execute(
                """
                INSERT INTO app_settings (settings_key, settings_json, updated_at)
                VALUES (%s, %s::jsonb, %s)
                ON CONFLICT(settings_key) DO UPDATE SET
                    settings_json = EXCLUDED.settings_json,
                    updated_at = EXCLUDED.updated_at
                """,
                (settings_key, json.dumps(payload, ensure_ascii=False, separators=(",", ":")), updated_at),
            )
        else:
            serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
            connection.execute(
                """
                INSERT INTO app_settings (settings_key, settings_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(settings_key) DO UPDATE SET
                    settings_json = excluded.settings_json,
                    updated_at = excluded.updated_at
                """,
                (settings_key, serialized, updated_at),
            )
            connection.commit()

    result = dict(payload)
    result["updated_at"] = updated_at
    return result
