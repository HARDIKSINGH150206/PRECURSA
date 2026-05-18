from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Iterable

from app.core.config import settings


class SystemRole(StrEnum):
    owner = "owner"
    admin = "admin"
    member = "member"
    guest = "guest"


@dataclass(frozen=True)
class SystemPrincipal:
    user_id: str | None
    email: str | None
    role: SystemRole


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def _normalize(value: str | None) -> str:
    return str(value or "").strip().lower()


def _matches_any(value: str | None, candidates: Iterable[str]) -> bool:
    normalized = _normalize(value)
    if not normalized:
        return False
    return normalized in {_normalize(candidate) for candidate in candidates}


def resolve_system_role(*, user_id: str | None = None, email: str | None = None) -> SystemRole:
    if settings.OWNER_CLERK_USER_ID.strip() and _normalize(user_id) == _normalize(settings.OWNER_CLERK_USER_ID):
        return SystemRole.owner

    if settings.OWNER_EMAIL.strip() and _normalize(email) == _normalize(settings.OWNER_EMAIL):
        return SystemRole.owner

    if _matches_any(user_id, _split_csv(settings.ADMIN_CLERK_USER_IDS)) or _matches_any(email, _split_csv(settings.ADMIN_EMAILS)):
        return SystemRole.admin

    if user_id or email:
        return SystemRole.member

    return SystemRole.guest


def build_system_principal(*, user_id: str | None = None, email: str | None = None) -> SystemPrincipal:
    return SystemPrincipal(user_id=user_id, email=email, role=resolve_system_role(user_id=user_id, email=email))


def ownership_status() -> dict[str, object]:
    owner_configured = bool(settings.OWNER_EMAIL.strip() or settings.OWNER_CLERK_USER_ID.strip())
    return {
        "system_name": settings.SYSTEM_NAME,
        "owner_configured": owner_configured,
        "owner_email": settings.OWNER_EMAIL.strip() or None,
        "owner_clerk_user_id": settings.OWNER_CLERK_USER_ID.strip() or None,
        "admin_emails": _split_csv(settings.ADMIN_EMAILS),
        "admin_clerk_user_ids": _split_csv(settings.ADMIN_CLERK_USER_IDS),
        "default_role": SystemRole.member.value if owner_configured else SystemRole.guest.value,
    }
