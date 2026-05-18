from fastapi import Header, HTTPException, status

from app.core.clerk_auth import extract_bearer_token, verify_clerk_session
from app.core.identity import SystemPrincipal, build_system_principal


def get_system_principal(
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> SystemPrincipal:
    token = extract_bearer_token(authorization)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Clerk bearer token.",
        )
    claims = verify_clerk_session(token or "")
    return build_system_principal(user_id=str(claims.get("sub") or ""), email=str(claims.get("email") or ""))
