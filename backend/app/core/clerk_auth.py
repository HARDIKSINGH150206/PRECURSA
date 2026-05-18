from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

import jwt
from fastapi import HTTPException, status
from jwt import PyJWKClient

from app.core.config import settings


logger = logging.getLogger(__name__)


def extract_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None

    return token.strip()


@lru_cache(maxsize=4)
def _jwks_client(url: str) -> PyJWKClient:
    return PyJWKClient(url)


def verify_clerk_session(token: str) -> dict[str, Any]:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Clerk session token.",
        )

    try:
        signing_key = _jwks_client(settings.CLERK_JWKS_URL).get_signing_key_from_jwt(token)
        options = {
            "verify_signature": True,
            "verify_exp": True,
            "verify_aud": False,
        }
        decode_kwargs: dict[str, Any] = {
            "algorithms": ["RS256"],
            "options": options,
        }

        if settings.CLERK_ISSUER.strip():
            decode_kwargs["issuer"] = settings.CLERK_ISSUER.strip()

        return jwt.decode(token, signing_key.key, **decode_kwargs)
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Clerk session token has expired.",
        ) from exc
    except jwt.InvalidTokenError as exc:
        logger.warning("Clerk session verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Clerk session token.",
        ) from exc
    except Exception as exc:
        logger.warning("Unable to verify Clerk session token: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to verify Clerk session token right now.",
        ) from exc
