# Precursa

Precursa is a logistics intelligence platform for monitoring shipment risk, vessel activity, and operational disruptions in near real time. The system combines live AIS vessel data, weather signals, heuristic risk scoring, optional machine learning models, and AI-generated explanations to help operators understand which shipments are at risk and why.

## Overview

The application is split into a FastAPI backend and a React/Vite frontend.

The backend provides shipment scoring, vessel snapshots, weather enrichment, rerouting utilities, settings persistence, and health endpoints. The frontend provides the operator dashboard, analytics views, risk summaries, and supporting UI for reviewing shipment state.

## Features

- Shipment risk scoring and enrichment
- Live vessel snapshot handling with AIS support
- Weather-based operational context
- Route analysis and rerouting history
- Global risk intelligence summaries
- AI-generated risk explanations
- Operator settings storage and access control
- Health and observability endpoints for deployment monitoring

## Architecture

### Backend

- FastAPI application
- SQLite for local persistence
- PostgreSQL support through `DATABASE_URL`
- Optional model-backed DRI scoring with XGBoost and TensorFlow
- External integrations for AIS, weather, news, and Gemini-based insights

### Frontend

- React 18 with Vite
- Map and dashboard components
- API client layer for backend communication

## Repository Layout

```text
precursa/
├── backend/
│   ├── app/
│   ├── data/
│   ├── db/
│   └── tests/
├── frontend/
└── render.yaml
```

## Prerequisites

- Python 3.13 or compatible Python 3.12+ environment
- Node.js 18+ and npm
- Access to any external services you plan to use, such as AIS, Gemini, News API, or PostgreSQL

## Configuration

Create environment files as needed:

- `backend/.env`
- `frontend/.env`

Common backend variables include:

- `DATABASE_URL`
- `FRONTEND_ORIGIN`
- `STRUCTURED_LOGS`
- `CLERK_JWKS_URL`
- `CLERK_ISSUER`
- `GEMINI_API_KEY`
- `NEWS_API_KEY`
- `AIS_API_KEY`
- `PRELOAD_ML_MODELS`
- `ENABLE_BACKGROUND_REFRESH`
- `ENABLE_AIS_STREAM`

The deployment configuration in `render.yaml` disables model preloading and background tasks by default on Render free-tier instances to keep startup memory usage low.

## Local Development

### 1. Clone the repository

```bash
git clone https://github.com/HARDIKSINGH150206/precursa.git
cd precursa
```

### 2. Start the backend

From the backend directory, run:

```bash
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

If you are using a virtual environment, activate it first and then run the same command.

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

## Testing

Run the backend test suite with:

```bash
cd backend
pytest
```

If you are using the repository virtual environment directly, you can also run:

```bash
./.venv/bin/python -m pytest
```

## Deployment

### Render

The repository includes `render.yaml` for Render deployment. The backend service is configured to start with Uvicorn and uses environment variables for runtime configuration.

Important runtime settings for constrained instances:

- `PRELOAD_ML_MODELS=false`
- `ENABLE_BACKGROUND_REFRESH=false`
- `ENABLE_AIS_STREAM=false`

These settings keep the backend lightweight at boot and avoid loading large optional workloads into memory on startup.

### Docker

Build the backend image:

```bash
docker build -f backend/Dockerfile -t precursa-backend .
```

Build the frontend image:

```bash
docker build -f frontend/Dockerfile -t precursa-frontend \
  --build-arg VITE_CLERK_PUBLISHABLE_KEY=your_clerk_key \
  --build-arg VITE_API_BASE_URL=http://127.0.0.1:8001 .
```

Run both services with Docker Compose:

```bash
docker compose up --build
```

## API Endpoints

Core backend endpoints include:

- `GET /` - Service status
- `GET /health` - Basic liveness check
- `GET /health/live` - Liveness endpoint
- `GET /health/ready` - Readiness and observability snapshot
- `GET /health/system` - System health and service state
- `GET /shipments` - Shipment list with risk enrichment
- `GET /vessels` - Current vessel snapshot
- `GET /weather` - Weather lookup by coordinates
- `GET /weather/zones` - Weather zone summary
- `GET /global-risk` - Global risk intelligence report
- `GET /dashboard/overview` - Aggregated dashboard metrics
- `POST /explain` - Risk explanation for a shipment
- `POST /explain-risk` - Alias for the explanation endpoint
- `GET /shipments/{shipment_id}/routes` - Available route options
- `POST /shipments/{shipment_id}/reroute` - Execute a reroute decision
- `GET /shipments/{shipment_id}/reroute-history` - Reroute history

## Operational Notes

- The backend can run without AIS, Gemini, News API, or model files present; those features degrade gracefully when their dependencies are unavailable.
- The optional DRI model loaders are intentionally lazy and should only be enabled on instances with enough memory headroom.
- If the backend is hosted on a small plan, prefer keeping the startup flags disabled unless you explicitly need the background jobs.

## Troubleshooting

If the service fails to boot on Render or another constrained environment, check for these common causes:

- Missing or incorrect environment variables
- Large model preloading consuming available memory
- Background tasks trying to run before external services are configured
- Database connectivity problems

If you need to diagnose a deployment issue, start with the `health/ready` and `health/system` endpoints, then inspect the application logs for startup warnings.