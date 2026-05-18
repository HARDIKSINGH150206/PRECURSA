from __future__ import annotations

import importlib


def test_resolve_system_role_prioritizes_owner_over_admin(monkeypatch):
    identity = importlib.import_module("app.core.identity")

    monkeypatch.setattr(identity.settings, "OWNER_EMAIL", "owner@example.com")
    monkeypatch.setattr(identity.settings, "OWNER_CLERK_USER_ID", "owner-clerk-id")
    monkeypatch.setattr(identity.settings, "ADMIN_EMAILS", "admin@example.com")
    monkeypatch.setattr(identity.settings, "ADMIN_CLERK_USER_IDS", "admin-clerk-id")

    assert identity.resolve_system_role(email="owner@example.com") == identity.SystemRole.owner
    assert identity.resolve_system_role(user_id="owner-clerk-id") == identity.SystemRole.owner
    assert identity.resolve_system_role(email="admin@example.com") == identity.SystemRole.admin
    assert identity.resolve_system_role(user_id="admin-clerk-id") == identity.SystemRole.admin
    assert identity.resolve_system_role(email="member@example.com") == identity.SystemRole.member
    assert identity.resolve_system_role() == identity.SystemRole.guest


def test_ownership_status_exposes_configured_owner(monkeypatch):
    identity = importlib.import_module("app.core.identity")

    monkeypatch.setattr(identity.settings, "SYSTEM_NAME", "Precursa")
    monkeypatch.setattr(identity.settings, "OWNER_EMAIL", "owner@example.com")
    monkeypatch.setattr(identity.settings, "OWNER_CLERK_USER_ID", "owner-clerk-id")
    monkeypatch.setattr(identity.settings, "ADMIN_EMAILS", "admin@example.com,ops@example.com")
    monkeypatch.setattr(identity.settings, "ADMIN_CLERK_USER_IDS", "admin-clerk-id")

    status = identity.ownership_status()

    assert status["system_name"] == "Precursa"
    assert status["owner_configured"] is True
    assert status["owner_email"] == "owner@example.com"
    assert status["owner_clerk_user_id"] == "owner-clerk-id"
    assert status["admin_emails"] == ["admin@example.com", "ops@example.com"]
    assert status["admin_clerk_user_ids"] == ["admin-clerk-id"]
