from __future__ import annotations

import os
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


os.environ.setdefault("AIS_API_KEY", "test-ais-key")
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("NEWS_API_KEY", "test-news-key")
os.environ.setdefault("OWNER_EMAIL", "owner@example.com")
os.environ.setdefault("OWNER_CLERK_USER_ID", "owner-clerk-id")
os.environ.setdefault("ADMIN_EMAILS", "admin@example.com")
os.environ.setdefault("ADMIN_CLERK_USER_IDS", "admin-clerk-id")
os.environ.setdefault("FRONTEND_ORIGIN", "http://localhost:5174")
