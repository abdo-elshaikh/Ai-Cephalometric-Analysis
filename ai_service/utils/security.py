from fastapi import Header, HTTPException
from config.settings import settings

def verify_service_key(x_service_key: str = Header(...)):
    if x_service_key != settings.service_key:
        raise HTTPException(status_code=401, detail="Invalid service key")
