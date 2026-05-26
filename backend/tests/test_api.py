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


def test_reroute_execution_updates_live_shipments_and_history(monkeypatch, tmp_path):
    main = _prepare_app(monkeypatch)
    routes = importlib.import_module("app.api.routes")
    storage = importlib.import_module("app.core.storage")

    monkeypatch.setattr(storage, "DATA_DIR", tmp_path)
    monkeypatch.setattr(storage, "DB_PATH", tmp_path / "precursa.sqlite3")
    monkeypatch.setattr(storage, "_INITIALIZED", False)

    monkeypatch.setattr(
        routes,
        "calculate_dri",
        lambda shipment: {
            "dri": 61,
            "rule_dri": 60,
            "ml_dri": 61,
            "xgb_dri": 61,
            "lstm_dri": 61,
            "trend": "stable",
            "time_aware_prediction": False,
            "confidence": 0.5,
            "prediction_engine": "Rule-based fallback",
            "factors": [],
            "weather": {
                "zone_name": shipment["current_location"],
                "lat": shipment["lat"],
                "lon": shipment["lon"],
                "wind_speed": 0.0,
                "visibility": 10.0,
                "rain": 0.0,
                "temperature": 28.0,
                "weather_severity": 0,
                "timestamp": "2026-05-18T00:00:00+00:00",
                "source": "test",
                "condition": "Clear",
                "risk": 0,
                "temp_c": 28.0,
                "wind_kph": 0.0,
                "humidity": 70,
            },
        },
    )
    monkeypatch.setattr(routes, "get_vessels_snapshot", lambda: [{"timestamp": "2026-05-18T00:00:00+00:00"}])
    monkeypatch.setattr(
        routes,
        "get_weather",
        lambda lat, lon, zone_name=None: {
            "zone_name": zone_name or "Singapore",
            "lat": lat,
            "lon": lon,
            "wind_speed": 0.0,
            "visibility": 10.0,
            "rain": 0.0,
            "temperature": 28.0,
            "weather_severity": 0,
            "timestamp": "2026-05-18T00:00:00+00:00",
            "source": "test",
            "condition": "Clear",
            "risk": 0,
            "temp_c": 28.0,
            "wind_kph": 0.0,
            "humidity": 70,
        },
    )
    monkeypatch.setattr(routes, "get_best_route", lambda origin, destination: [[19.076, 72.8777], [51.9244, 4.4777]])
    monkeypatch.setattr(
        routes,
        "get_alternative_routes",
        lambda origin, destination, count=2: [
            {
                "origin": origin,
                "intermediate_port": "Hamburg",
                "destination": destination,
                "route_coords": [[19.076, 72.8777], [53.5511, 9.9937], [51.9244, 4.4777]],
                "distance_km": 1.0,
                "direct_distance_km": 1.2,
                "distance_saved_km": 0.2,
                "distance_saved_percent": 16.67,
                "estimated_cost_change": -0.01,
                "estimated_days_saved": 0.0,
            }
        ],
    )

    with TestClient(main.app) as client:
        reroute_response = client.post(
            "/shipments/SHP-001/reroute",
            json={
                "shipment_id": "SHP-001",
                "route_index": 0,
                "execution_notes": "pytest reroute",
            },
        )
        assert reroute_response.status_code == 200
        assert reroute_response.json()["data"]["selected_route"]["intermediate_port"] == "Hamburg"

        shipments_response = client.get("/shipments")
        assert shipments_response.status_code == 200
        shipment = next(item for item in shipments_response.json()["data"] if item["id"] == "SHP-001")
        assert shipment["rerouted"] is True
        assert shipment["route_coords"] == [[19.076, 72.8777], [53.5511, 9.9937], [51.9244, 4.4777]]

        history_response = client.get("/shipments/SHP-001/reroute-history")
        assert history_response.status_code == 200
        history_payload = history_response.json()["data"]
        assert history_payload["total_reroutes"] == 1
        assert history_payload["executed_reroutes"] == 1
        assert history_payload["history"][0]["decision_status"] == "executed"
