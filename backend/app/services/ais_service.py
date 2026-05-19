import asyncio
import json
import logging
from datetime import datetime, timezone
from collections import defaultdict, deque
from typing import Deque, DefaultDict, Dict, List

import websockets

from app.core.config import settings
from app.core.storage import list_vessels, upsert_vessels_snapshot


logger = logging.getLogger(__name__)

_VESSELS: Dict[int, Dict[str, object]] = {}
_VESSEL_TRAILS: DefaultDict[int, Deque[Dict[str, object]]] = defaultdict(lambda: deque(maxlen=12))
VESSELS: List[Dict[str, object]] = []


def _in_singapore_strait(lat: float, lon: float) -> bool:
    return (
        settings.AIS_MIN_LAT <= lat <= settings.AIS_MAX_LAT
        and settings.AIS_MIN_LON <= lon <= settings.AIS_MAX_LON
    )


def get_vessels_snapshot(limit: int = 80) -> List[Dict[str, object]]:
    if limit <= 0:
        return []

    source_vessels = list(_VESSELS.values())
    if not source_vessels:
        source_vessels = list_vessels(limit=limit)

    if _VESSELS:
        source_slice = source_vessels[-limit:]
    else:
        source_slice = source_vessels[:limit]

    snapshot: List[Dict[str, object]] = []
    for vessel in source_slice:
        vessel_key = int(vessel.get("mmsi") or 0)
        trail = list(_VESSEL_TRAILS.get(vessel_key, deque())) or list(vessel.get("trail") or [])
        snapshot.append({
            **vessel,
            "trail": trail,
        })

    if _VESSELS:
        snapshot.sort(key=lambda item: float(item.get("timestamp_epoch") or 0), reverse=True)
    return snapshot


def _sync_exported_vessels() -> None:
    VESSELS.clear()
    VESSELS.extend(get_vessels_snapshot())


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def stream_ais() -> None:
    if not settings.AIS_API_KEY:
        logger.warning("AIS_API_KEY missing; AIS stream disabled")
        return

    subscribe_message = {
        "APIKey": settings.AIS_API_KEY,
        "BoundingBoxes": [
            [
                [settings.AIS_MIN_LAT, settings.AIS_MIN_LON],
                [settings.AIS_MAX_LAT, settings.AIS_MAX_LON],
            ]
        ],
    }

    while True:
        try:
            async with websockets.connect(settings.AIS_STREAM_URL, ping_interval=20, ping_timeout=20) as ws:
                await ws.send(json.dumps(subscribe_message))
                logger.info("AIS stream connected")

                async for message in ws:
                    payload = json.loads(message)
                    position = payload.get("Message", {}).get("PositionReport")
                    if not position:
                        continue

                    lat = position.get("Latitude")
                    lon = position.get("Longitude")
                    mmsi = position.get("UserID")
                    sog = position.get("Sog")

                    if lat is None or lon is None:
                        continue

                    lat_f = float(lat)
                    lon_f = float(lon)

                    if not _in_singapore_strait(lat_f, lon_f):
                        continue

                    vessel_key = int(mmsi) if mmsi is not None else 0
                    timestamp_epoch = asyncio.get_event_loop().time()

                    trail = _VESSEL_TRAILS[vessel_key]
                    if not trail or trail[-1]["lat"] != lat_f or trail[-1]["lon"] != lon_f:
                        trail.append({
                            "lat": lat_f,
                            "lon": lon_f,
                            "timestamp_epoch": timestamp_epoch,
                            "timestamp": _now_iso(),
                        })

                    _VESSELS[vessel_key] = {
                        "lat": lat_f,
                        "lon": lon_f,
                        "mmsi": vessel_key,
                        "name": str(position.get("VesselName") or position.get("Name") or ""),
                        "sog": float(sog) if sog is not None else 0.0,
                        "timestamp_epoch": timestamp_epoch,
                        "timestamp": _now_iso(),
                        "trail": list(trail),
                    }

                    upsert_vessels_snapshot([_VESSELS[vessel_key]])
                    _sync_exported_vessels()
        except Exception as exc:
            logger.exception("AIS stream error; reconnecting: %s", exc)
            await asyncio.sleep(3)
