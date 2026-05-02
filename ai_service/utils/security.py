import secrets
from fastapi import Header, HTTPException
from config.settings import settings


def verify_service_key(x_service_key: str = Header(...)) -> bool:
    """
    Validate the inter-service authentication key using a timing-safe comparison
    to prevent timing-based side-channel attacks.
    """
    if not x_service_key or not secrets.compare_digest(x_service_key, settings.service_key):
        raise HTTPException(status_code=401, detail="Invalid service key")
    return True
