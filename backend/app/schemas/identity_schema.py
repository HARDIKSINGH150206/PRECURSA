from pydantic import BaseModel


class OwnershipStatus(BaseModel):
    system_name: str
    owner_configured: bool
    owner_email: str | None = None
    owner_clerk_user_id: str | None = None
    admin_emails: list[str]
    admin_clerk_user_ids: list[str]
    default_role: str
