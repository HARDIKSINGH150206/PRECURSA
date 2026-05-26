# Deployment Guide: Render + Vercel

This guide covers deploying the Precursa backend to Render and frontend to Vercel.

## Table of Contents
- [Backend Deployment (Render)](#backend-deployment-render)
- [Frontend Deployment (Vercel)](#frontend-deployment-vercel)
- [Environment Variables](#environment-variables)

---

## Backend Deployment (Render)

### Prerequisites
- Render account (https://render.com)
- GitHub repository with your code
- PostgreSQL database (Render provides one, or use external DB)

### Step 1: Create a PostgreSQL Database on Render
1. Go to Render Dashboard → New → PostgreSQL
2. Enter database name: `precursa-db`
3. Choose region closest to you
4. Choose plan (Free tier available)
5. Click "Create Database"
6. Note the connection string - you'll need this for the backend

### Step 2: Create a Web Service on Render
1. Go to Render Dashboard → New → Web Service
2. Connect your GitHub repository
3. Select the repository containing Precursa
4. Fill in deployment settings:
   - **Name:** `precursa-backend`
   - **Region:** Same as your database
   - **Branch:** `main` (or your default branch)
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r backend/requirements.txt`
   - **Start Command:** `uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT`
5. Click "Advanced" and add these **Environment Variables**:

   ```
   FRONTEND_ORIGIN=https://your-frontend-domain.vercel.app
   DATABASE_URL=postgresql://user:password@host/database (from Step 1)
   AIS_API_KEY=your_ais_api_key
   WEATHER_API_KEY=your_weather_api_key
   GEMINI_API_KEY=your_gemini_api_key
   NEWS_API_KEY=your_news_api_key
   CLERK_ISSUER=your_clerk_issuer
   OWNER_EMAIL=your_email
   OWNER_CLERK_USER_ID=your_clerk_id
   ADMIN_EMAILS=admin1@example.com,admin2@example.com
   ADMIN_CLERK_USER_IDS=clerk_id_1,clerk_id_2
   STRUCTURED_LOGS=true
   ```

6. Click "Create Web Service"
7. Once deployed, note the URL (e.g., `https://precursa-backend.onrender.com`)

### Step 3: Update Backend Dockerfile (if needed)
The current Dockerfile expects the backend at `/app/backend`. Update it for Render:

Replace in `backend/Dockerfile`:
```dockerfile
COPY backend/requirements.txt /app/backend/requirements.txt
```
With:
```dockerfile
COPY requirements.txt /app/requirements.txt
```

And:
```dockerfile
RUN pip install --no-cache-dir -r /app/backend/requirements.txt
COPY backend /app/backend
```
With:
```dockerfile
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY . /app
```

---

## Frontend Deployment (Vercel)

### Prerequisites
- Vercel account (https://vercel.com)
- GitHub repository with your code

### Step 1: Deploy to Vercel
1. Go to Vercel Dashboard → Add New → Project
2. Import GitHub repository (Precursa)
3. Fill in project settings:
   - **Framework Preset:** `Vite`
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`

### Step 2: Add Environment Variables
In Vercel project settings, go to Settings → Environment Variables and add:

```
VITE_API_BASE_URL=https://precursa-backend.onrender.com
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
```

### Step 3: Deploy
1. Click "Deploy"
2. Wait for build to complete
3. Note your Vercel URL (e.g., `https://precursa.vercel.app`)

### Step 4: Update Backend FRONTEND_ORIGIN
Go back to Render backend settings and update:
```
FRONTEND_ORIGIN=https://precursa.vercel.app
```

---

## Environment Variables Reference

### Backend Environment Variables (Render)
| Variable | Source | Example |
|----------|--------|---------|
| `DATABASE_URL` | Render PostgreSQL | `postgresql://user:pass@host/db` |
| `FRONTEND_ORIGIN` | Your Vercel URL | `https://precursa.vercel.app` |
| `AIS_API_KEY` | AIS Stream API | Get from https://www.aisstream.io |
| `WEATHER_API_KEY` | Open-Meteo (free) | Leave empty for free tier |
| `GEMINI_API_KEY` | Google AI | Get from https://aistudio.google.com |
| `NEWS_API_KEY` | NewsAPI | Get from https://newsapi.org |
| `CLERK_ISSUER` | Clerk Dashboard | `https://your-instance.clerk.accounts.com` |
| `OWNER_EMAIL` | Your email | `you@example.com` |
| `OWNER_CLERK_USER_ID` | Clerk Dashboard | Clerk user ID |
| `ADMIN_EMAILS` | Comma-separated | `admin1@example.com,admin2@example.com` |
| `ADMIN_CLERK_USER_IDS` | Clerk IDs | `id1,id2,id3` |

### Frontend Environment Variables (Vercel)
| Variable | Source | Example |
|----------|--------|---------|
| `VITE_API_BASE_URL` | Your Render URL | `https://precursa-backend.onrender.com` |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk Dashboard | Your publishable key |

---

## Post-Deployment Checklist

- [ ] Backend deployed on Render
- [ ] Frontend deployed on Vercel
- [ ] CORS configured correctly (FRONTEND_ORIGIN set)
- [ ] All environment variables added
- [ ] Database connected and initialized
- [ ] Clerk authentication working
- [ ] API endpoints accessible from frontend
- [ ] Test a complete user flow
- [ ] Monitor logs for errors

---

## Troubleshooting

### Backend won't start
- Check logs on Render: Dashboard → Service → Logs
- Verify all required environment variables are set
- Ensure database connection string is valid

### CORS errors
- Verify `FRONTEND_ORIGIN` matches your Vercel domain
- Check that Clerk issuer is configured correctly

### API calls failing from frontend
- Ensure `VITE_API_BASE_URL` points to correct Render backend
- Check network tab in browser dev tools
- Verify authentication tokens are being sent

### Database connection issues
- Test connection string locally first
- Verify PostgreSQL server is running on Render
- Check firewall/security groups allow connections

