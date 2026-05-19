from __future__ import annotations

import importlib
from pathlib import Path


def _storage_module():
    return importlib.import_module("app.core.storage")


def _seed_paths() -> tuple[Path, Path]:
    backend_dir = Path(__file__).resolve().parents[1]
    return backend_dir / "data" / "seed_ports.json", backend_dir / "data" / "seed_shipments.json"


def test_storage_initializes_and_persists_settings(monkeypatch, tmp_path):
    storage = _storage_module()
    ports_seed, shipments_seed = _seed_paths()

    monkeypatch.setattr(storage, "DATA_DIR", tmp_path)
    monkeypatch.setattr(storage, "DB_PATH", tmp_path / "precursa.sqlite3")
    monkeypatch.setattr(storage, "SEED_PORTS_PATH", ports_seed)
    monkeypatch.setattr(storage, "SEED_SHIPMENTS_PATH", shipments_seed)
    monkeypatch.setattr(storage, "_INITIALIZED", False)

    storage.initialize_storage()

    assert len(storage.list_ports()) >= 1
    assert len(storage.list_shipments()) == 4
    assert storage.get_port_coordinates("Singapore") == (1.264, 103.819)

    default_payload = {"risk_weights": {"weather": 42}}
    initial = storage.get_settings_payload("operator-settings", default_payload)
    assert initial["risk_weights"]["weather"] == 42

    saved = storage.save_settings_payload(
        "operator-settings",
        {"risk_weights": {"weather": 55}, "auto_weighting": False},
    )
    assert saved["risk_weights"]["weather"] == 55
    assert saved["auto_weighting"] is False
    assert saved["updated_at"]

    loaded = storage.get_settings_payload("operator-settings", default_payload)
    assert loaded["risk_weights"]["weather"] == 55
    assert loaded["auto_weighting"] is False
    assert loaded["updated_at"] == saved["updated_at"]


def test_route_service_uses_persisted_port_coordinates(monkeypatch, tmp_path):
    storage = _storage_module()
    ports_seed, shipments_seed = _seed_paths()

    monkeypatch.setattr(storage, "DATA_DIR", tmp_path)
    monkeypatch.setattr(storage, "DB_PATH", tmp_path / "precursa.sqlite3")
    monkeypatch.setattr(storage, "SEED_PORTS_PATH", ports_seed)
    monkeypatch.setattr(storage, "SEED_SHIPMENTS_PATH", shipments_seed)
    monkeypatch.setattr(storage, "_INITIALIZED", False)
    storage.initialize_storage()

    reroute_service = importlib.import_module("app.services.reroute_service")
    route = reroute_service.get_best_route("Mumbai", "Rotterdam")

    assert route == [[19.076, 72.8777], [51.9244, 4.4777]]


def test_vessel_and_weather_snapshots_persist(monkeypatch, tmp_path):
    storage = _storage_module()
    ports_seed, shipments_seed = _seed_paths()

    monkeypatch.setattr(storage, "DATA_DIR", tmp_path)
    monkeypatch.setattr(storage, "DB_PATH", tmp_path / "precursa.sqlite3")
    monkeypatch.setattr(storage, "SEED_PORTS_PATH", ports_seed)
    monkeypatch.setattr(storage, "SEED_SHIPMENTS_PATH", shipments_seed)
    monkeypatch.setattr(storage, "_INITIALIZED", False)

    storage.initialize_storage()
    storage.upsert_vessels_snapshot(
        [
            {
                "mmsi": 123456789,
                "name": "Test Vessel",
                "lat": 1.23,
                "lon": 4.56,
                "sog": 12.4,
                "timestamp": "2026-05-18T00:00:00+00:00",
                "trail": [{"lat": 1.0, "lon": 2.0, "timestamp": "2026-05-17T00:00:00+00:00"}],
            }
        ]
    )
    vessels = storage.list_vessels()
    assert vessels
    assert vessels[0]["mmsi"] == "123456789"
    assert vessels[0]["trail"]

    storage.record_weather_snapshot(
        {
            "zone_name": "Singapore Strait",
            "temperature": 28.2,
            "wind_speed": 14.0,
            "rain": 1.4,
            "visibility": 7.8,
            "weather_severity": 41,
            "source": "test",
            "timestamp": "2026-05-18T01:00:00+00:00",
        },
        zone_name="Singapore Strait",
    )
    weather_rows = storage.list_weather_snapshots()
    assert weather_rows
    assert weather_rows[0]["zone_name"] == "Singapore Strait"
    assert weather_rows[0]["severity"] == 41
