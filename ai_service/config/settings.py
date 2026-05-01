from pydantic import Field, AliasChoices
from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path
from typing import List

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"  # Allow shared .env with backend variables
    )

    # Service auth
    service_key: str = Field("dev-service-key", validation_alias=AliasChoices("AI_SERVICE_KEY", "SERVICE_KEY"))

    # CORS — set AI_ALLOWED_ORIGINS=http://localhost:3000,https://app.example.com in .env
    # Wildcard "*" is retained as default only for local development.
    allowed_origins: List[str] = Field(
        default=["*"],
        validation_alias=AliasChoices("AI_ALLOWED_ORIGINS"),
    )

    # AI model
    model_path: str = Field("models/model.pth", validation_alias=AliasChoices("AI_MODEL_PATH", "MODEL_PATH"))
    model_version: str = Field("v1.0.0", validation_alias=AliasChoices("AI_MODEL_VERSION", "MODEL_VERSION"))
    device: str = Field("cpu", validation_alias=AliasChoices("AI_DEVICE", "DEVICE")) # "cuda" for GPU
    # 
    num_landmarks: int = 38
    input_size_h: int = 800
    input_size_w: int = 640

    # Path to analysis norms JSON file
    analysis_norms_path: str = "config/analysis_norms.json"

    # Advanced Analysis Norms (Evidence-Based)
    apdi_mean: float = 81.4
    apdi_sd: float = 3.5
    odi_mean: float = 74.5
    odi_sd: float = 4.0
    h_angle_mean: float = 10.0
    h_angle_sd: float = 2.0
    sn_pp_mean: float = 8.0
    ui_na_min: float = 2.0
    ui_na_max: float = 4.0
    li_na_min: float = -2.0
    li_na_max: float = 0.0
    li_nb_min: float = -1.0
    li_nb_max: float = 1.0
    ui_nb_min: float = 1.0
    ui_nb_max: float = 3.0
    overjet_min: float = 1.0
    overjet_max: float = 3.0
    overbite_min: float = 1.0
    overbite_max: float = 3.0

    # OpenAI (for LLM treatment justification)
    # Use validation_alias to support both AI-specific and generic env variable names for flexibility
    openai_api_key: str = Field("", validation_alias=AliasChoices("AI_OPENAI_API_KEY", "OPENAI_API_KEY"))
    openai_model: str = "gpt-4o-mini"

    # Google Gemini (Fallback provider)
    # Use validation_alias to support both AI-specific and generic env variable names for flexibility
    gemini_api_key: str = Field("", validation_alias=AliasChoices("AI_GEMINI_API_KEY", "GEMINI_API_KEY"))
    gemini_model: str = "gemini-flash-latest" # Use verified available model alias

    # Database (for any direct AI service DB access)
    database_url: str = "postgresql://ceph_user:ceph_password@localhost:5432/cephanalysis_db"

settings = Settings()
