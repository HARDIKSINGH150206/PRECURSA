from __future__ import annotations

import importlib

from fastapi.testclient import TestClient


async def _noop_async() -> None:
    return None


def _prepare_app(monkeypatch):
    main = importlib.import_module("app.main")
    monkeypatch.setattr(main, "preload_ml_model", lambda: None)
    monkeypatch.setattr(main, "start_ais_stream", _noop_async)
    monkeypatch.setattr(main, "start_background_refresh", _noop_async)
    deps = importlib.import_module("app.api.deps")
    monkeypatch.setattr(
        deps,
        "verify_clerk_session",
        lambda token: {
            "sub": "owner-clerk-id",
            "email": "owner@example.com",
        },
    )
    return main


def test_health_and_ownership_endpoints(monkeypatch):
    main = _prepare_app(monkeypatch)
    routes = importlib.import_module("app.api.routes")

    monkeypatch.setattr(
        routes,
        "get_weather",
        lambda lat, lon, zone_name=None: {
            "zone_name": zone_name or "Singapore",
            "lat": lat,
            "lon": lon,
            "wind_speed": 14.5,
            "visibility": 7.2,
            "rain": 1.5,
            "temperature": 28.1,
            "weather_severity": 44,
            "timestamp": "2026-05-18T00:00:00+00:00",
            "source": "test",
            "condition": "Overcast",
            "risk": 44,
            "temp_c": 28.1,
            "wind_kph": 14.5,
            "humidity": 72,
        },
    )
    monkeypatch.setattr(
        routes,
        "get_vessels_snapshot",
        lambda: [{"timestamp": "2026-05-18T00:00:00+00:00"}],
    )

    with TestClient(main.app) as client:
        live_response = client.get("/health/live")
        assert live_response.status_code == 200
        assert live_response.json()["data"]["healthy"] is True

        ready_response = client.get("/health/ready")
        assert ready_response.status_code == 200
        assert "observability" in ready_response.json()["data"]

        response = client.get("/health/system")
        assert response.status_code == 200
        payload = response.json()["data"]
        assert "observability" in payload
        assert payload["services"]["weather"]["status"] == "online"
        assert payload["services"]["ais"]["status"] == "streaming"
        assert payload["services"]["ownership"]["owner_configured"] is True

        ownership = client.get("/system/ownership")
        assert ownership.status_code == 200
        assert ownership.json()["data"]["owner_configured"] is True


def test_settings_and_shipments_round_trip(monkeypatch, tmp_path):
    main = _prepare_app(monkeypatch)
    routes = importlib.import_module("app.api.routes")
    storage = importlib.import_module("app.core.storage")

    monkeypatch.setattr(storage, "DATA_DIR", tmp_path)
    monkeypatch.setattr(storage, "DB_PATH", tmp_path / "precursa.sqlite3")
    monkeypatch.setattr(storage, "_INITIALIZED", False)

    monkeypatch.setattr(
        routes,
        "get_weather",
        lambda lat, lon, zone_name=None: {
            "zone_name": zone_name or "Singapore",
            "lat": lat,
            "lon": lon,
            "wind_speed": 12.0,
            "visibility": 8.0,
            "rain": 0.0,
            "temperature": 28.0,
            "weather_severity": 35,
            "timestamp": "2026-05-18T00:00:00+00:00",
            "source": "test",
            "condition": "Partly cloudy",
            "risk": 35,
            "temp_c": 28.0,
            "wind_kph": 12.0,
            "humidity": 65,
        },
    )
    monkeypatch.setattr(routes, "get_vessels_snapshot", lambda: [{"timestamp": "2026-05-18T00:00:00+00:00"}])
    monkeypatch.setattr(
        routes,
        "calculate_dri",
        lambda shipment: {
            "dri": 72 if shipment["id"] == "SHP-001" else 48,
            "rule_dri": 70,
            "ml_dri": 71,
            "xgb_dri": 71,
            "lstm_dri": 69,
            "trend": "stable",
            "time_aware_prediction": True,
            "confidence": 0.84,
            "prediction_engine": "Hybrid (Rule + ML + LSTM)",
            "factors": [
                {"name": "Port Congestion", "value": 30},
                {"name": "Weather Severity", "value": 35},
                {"name": "Tariff Risk", "value": 12},
                {"name": "Carrier Risk", "value": 10},
                {"name": "Base Risk", "value": 28},
                {"name": "Live Vessel Count", "value": 1},
            ],
            "weather": routes.get_weather(shipment["lat"], shipment["lon"], zone_name=shipment["current_location"]),
        },
    )
    monkeypatch.setattr(routes, "get_best_route", lambda origin, destination: [[1.0, 2.0], [3.0, 4.0]])

    with TestClient(main.app) as client:
        settings_response = client.get("/settings")
        assert settings_response.status_code == 200
        settings_payload = settings_response.json()["data"]
        settings_payload["alerts"]["threshold"] = 77

        update_response = client.put(
            "/settings",
            json=settings_payload,
            headers={"Authorization": "Bearer test-token"},
        )
        assert update_response.status_code == 200
        updated_payload = update_response.json()["data"]
        assert updated_payload["alerts"]["threshold"] == 77
        assert updated_payload["updated_at"]

        shipments_response = client.get("/shipments")
        assert shipments_response.status_code == 200
        shipments = shipments_response.json()["data"]
        assert len(shipments) == 4
        assert shipments[0]["route_coords"] == [[1.0, 2.0], [3.0, 4.0]]
        assert shipments[0]["weather"]["source"] == "test"

        overview_response = client.get("/dashboard/overview")
        assert overview_response.status_code == 200
        overview = overview_response.json()["data"]
        assert overview["total_shipments"] == 4
        assert overview["high_risk_shipments"] == 1
        assert overview["active_vessels"] == 1


def test_settings_update_rejects_non_owner(monkeypatch, tmp_path):
    main = _prepare_app(monkeypatch)
    routes = importlib.import_module("app.api.routes")
    storage = importlib.import_module("app.core.storage")
    deps = importlib.import_module("app.api.deps")

    monkeypatch.setattr(storage, "DATA_DIR", tmp_path)
    monkeypatch.setattr(storage, "DB_PATH", tmp_path / "precursa.sqlite3")
    monkeypatch.setattr(storage, "_INITIALIZED", False)
    monkeypatch.setattr(
        deps,
        "verify_clerk_session",
        lambda token: {
            "sub": "member-clerk-id",
            "email": "member@example.com",
        },
    )

    with TestClient(main.app) as client:
        response = client.put("/settings", json=routes._default_settings(), headers={"Authorization": "Bearer test-token"})
        assert response.status_code == 403


def test_settings_update_requires_bearer_token(monkeypatch):
    main = _prepare_app(monkeypatch)

    with TestClient(main.app) as client:
        response = client.put("/settings", json={"risk_weights": {"weather": 42}})
        assert response.status_code == 401


def test_settings_update_rate_limits_by_ip(monkeypatch, tmp_path):
    main = _prepare_app(monkeypatch)
    routes = importlib.import_module("app.api.routes")
    storage = importlib.import_module("app.core.storage")

    monkeypatch.setattr(storage, "DATA_DIR", tmp_path)
    monkeypatch.setattr(storage, "DB_PATH", tmp_path / "precursa.sqlite3")
    monkeypatch.setattr(storage, "_INITIALIZED", False)
    monkeypatch.setattr(routes.settings, "SETTINGS_WRITE_RATE_LIMIT_MAX", 1)
    monkeypatch.setattr(routes.settings, "SETTINGS_WRITE_RATE_LIMIT_WINDOW_SECONDS", 60)
    routes._WRITE_RATE_LIMIT_BUCKETS.clear()

    payload = routes._default_settings()

    with TestClient(main.app) as client:
        first = client.put("/settings", json=payload, headers={"Authorization": "Bearer test-token"})
        second = client.put("/settings", json=payload, headers={"Authorization": "Bearer test-token"})

        assert first.status_code == 200
        assert second.status_code == 429
