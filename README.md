# 🚢 Precursa — AI-Powered Logistics Monitoring System

---

## 📌 What is Precursa?

Precursa is a real-time logistics monitoring platform that tracks ship movements, analyzes disruption risks, and explains those risks using AI.

It combines live vessel data, weather conditions, and intelligent scoring to help understand:

> **Which shipments are at risk — and why**

---

## ⚙️ How It Works

1. **AIS Data (Ships)**
   - Live vessel positions are streamed using AIS API
   - Used to estimate port congestion

2. **Weather Data**
   - Open-Meteo provides wind, rain, visibility, and condition data
   - Converted into a risk score

3. **Risk Calculation (DRI)**
   - Combines multiple factors:
     - Congestion
     - Weather
     - Tariff (simulated)
     - Carrier reliability (simulated)

4. **AI Copilot (Gemini)**
   - Explains why a shipment is risky
   - Converts data into simple insights

5. **Frontend Dashboard**
   - Shows everything on a live map
   - Updates every few seconds

---

## 📊 Key Features

- 🌍 Live ship tracking (AIS)
- 🌦 Weather-based risk analysis
- 📈 Disruption Risk Index (DRI)
- 🧠 AI-powered explanations (Gemini)
- 🖥 Interactive map dashboard

---

## 🧱 Tech Stack

### Backend
- FastAPI
- AIS Stream API
- Open-Meteo API
- Google Gemini API

### Frontend
- React (Vite)
- Leaflet (maps)
- Axios

---

## 🌐 API Endpoints

- `GET /shipments` → Shipment data with risk scores  
- `GET /vessels` → Live ship locations  
- `GET /settings` / `PUT /settings` → Persisted operator settings  
- `GET /health/system` → Service status and ownership snapshot  
- `POST /explain` → AI explanation for a shipment  

---

## 🚀 How to Run

### 1. Clone the repo

```bash
git clone https://github.com/absksync/precursa.git
cd precursa
```

### 2. Set environment variables

Create:
- `backend/.env`
- `frontend/.env`

For strict Clerk session verification, set:
- `CLERK_JWKS_URL`
- `CLERK_ISSUER`

For production monitoring and write throttling, you can also tune:
- `STRUCTURED_LOGS`
- `SETTINGS_WRITE_RATE_LIMIT_MAX`
- `SETTINGS_WRITE_RATE_LIMIT_WINDOW_SECONDS`

### 3. Run the backend

```bash
cd backend
./venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

### 4. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

### 5. Run tests

```bash
cd backend
./venv/bin/python -m pytest
```

### 6. Build production containers

```bash
docker build -f backend/Dockerfile -t precursa-backend .
docker build -f frontend/Dockerfile -t precursa-frontend \
  --build-arg VITE_CLERK_PUBLISHABLE_KEY=your_clerk_key \
  --build-arg VITE_API_BASE_URL=http://127.0.0.1:8001 .
```

### 7. Run with Docker Compose

```bash
docker compose up --build
```
