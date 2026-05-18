from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Dict, Iterable, List


BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "precursa.sqlite3"
SEED_PORTS_PATH = DATA_DIR / "seed_ports.json"
SEED_SHIPMENTS_PATH = DATA_DIR / "seed_shipments.json"

_LOCK = Lock()
_INITIALIZED = False


def _connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def _read_json(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, list):
        return []
    return [item for item in payload if isinstance(item, dict)]


def initialize_storage() -> None:
    global _INITIALIZED

    if _INITIALIZED:
        return

    with _LOCK:
        if _INITIALIZED:
            return

        with _connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS ports (
                    name TEXT PRIMARY KEY,
                    lat REAL NOT NULL,
                    lon REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS shipments (
                    id TEXT PRIMARY KEY,
                    origin TEXT NOT NULL,
                    destination TEXT NOT NULL,
                    current_location TEXT NOT NULL,
                    lat REAL NOT NULL,
                    lon REAL NOT NULL,
                    cargo TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS app_settings (
                    settings_key TEXT PRIMARY KEY,
                    settings_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """
            )

            port_count = connection.execute("SELECT COUNT(*) AS count FROM ports").fetchone()["count"]
            if port_count == 0:
                ports = _read_json(SEED_PORTS_PATH)
                connection.executemany(
                    "INSERT INTO ports (name, lat, lon) VALUES (?, ?, ?)",
                    [(item["name"], float(item["lat"]), float(item["lon"])) for item in ports],
                )

            shipment_count = connection.execute("SELECT COUNT(*) AS count FROM shipments").fetchone()["count"]
            if shipment_count == 0:
                shipments = _read_json(SEED_SHIPMENTS_PATH)
                connection.executemany(
                    """
                    INSERT INTO shipments (id, origin, destination, current_location, lat, lon, cargo)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        (
                            item["id"],
                            item["origin"],
                            item["destination"],
                            item["current_location"],
                            float(item["lat"]),
                            float(item["lon"]),
                            item["cargo"],
                        )
                        for item in shipments
                    ],
                )

        _INITIALIZED = True


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def list_shipments() -> List[Dict[str, Any]]:
    initialize_storage()

    with _connect() as connection:
        rows = connection.execute(
            "SELECT id, origin, destination, current_location, lat, lon, cargo FROM shipments ORDER BY id ASC"
        ).fetchall()

    return [dict(row) for row in rows]


def list_ports() -> List[Dict[str, Any]]:
    initialize_storage()

    with _connect() as connection:
        rows = connection.execute("SELECT name, lat, lon FROM ports ORDER BY name ASC").fetchall()

    return [dict(row) for row in rows]


def get_port_coordinates(name: str) -> tuple[float, float] | None:
    initialize_storage()

    with _connect() as connection:
        row = connection.execute("SELECT lat, lon FROM ports WHERE name = ?", (name,)).fetchone()
    if row is None:
        return None
    return float(row["lat"]), float(row["lon"])


def get_settings_payload(settings_key: str, default: Dict[str, Any]) -> Dict[str, Any]:
    initialize_storage()

    with _connect() as connection:
        row = connection.execute(
            "SELECT settings_json, updated_at FROM app_settings WHERE settings_key = ?",
            (settings_key,),
        ).fetchone()

    if row is None:
        return dict(default)

    try:
        loaded = json.loads(row["settings_json"])
        if isinstance(loaded, dict):
            merged = dict(default)
            merged.update(loaded)
            merged["updated_at"] = row["updated_at"]
            return merged
    except json.JSONDecodeError:
        pass

    fallback = dict(default)
    fallback["updated_at"] = row["updated_at"]
    return fallback


def save_settings_payload(settings_key: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    initialize_storage()
    serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    updated_at = _now_iso()

    with _connect() as connection:
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
