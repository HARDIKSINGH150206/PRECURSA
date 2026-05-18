import json
import logging
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Request

from app.api.routes import router
from app.core.config import settings
from app.core.logging import JsonLogFormatter
from app.core.storage import initialize_storage
from app.core.startup import preload_ml_model, start_ais_stream, start_background_refresh


root_logger = logging.getLogger()
root_logger.setLevel(logging.INFO)
if not root_logger.handlers:
    handler = logging.StreamHandler()
    root_logger.addHandler(handler)

for handler in root_logger.handlers:
    if settings.STRUCTURED_LOGS:
        handler.setFormatter(JsonLogFormatter())
    else:
        handler.setFormatter(logging.Formatter("%(asctime)s | %(levelname)s | %(name)s | %(message)s"))

app = FastAPI(title="Precursa API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_ORIGIN,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    started_at = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
    logging.getLogger("precursa.http").info(
        json.dumps(
            {
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
                "client": request.client.host if request.client else None,
            },
            ensure_ascii=False,
        )
    )
    response.headers["X-Process-Time-Ms"] = str(duration_ms)
    return response


@app.get("/")
def root() -> dict:
    return {"status": "ok", "message": "Precursa backend running"}


@app.on_event("startup")
async def startup_event() -> None:
    initialize_storage()
    preload_ml_model()
    await start_ais_stream()
    await start_background_refresh()
