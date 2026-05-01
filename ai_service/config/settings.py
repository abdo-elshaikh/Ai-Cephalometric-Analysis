from pydantic import Field, AliasChoices
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # Service auth
    service_key: str = Field("dev-service-key", validation_alias=AliasChoices("AI_SERVICE_KEY", "SERVICE_KEY"))

    # CORS
    allowed_origins: List[str] = Field(
        default=["*"],
        validation_alias=AliasChoices("AI_ALLOWED_ORIGINS"),
    )

    # AI model
    model_path: str = Field("models/model.pth", validation_alias=AliasChoices("AI_MODEL_PATH", "MODEL_PATH"))
    model_version: str = Field("v2.0.0", validation_alias=AliasChoices("AI_MODEL_VERSION", "MODEL_VERSION"))
    device: str = Field("cpu", validation_alias=AliasChoices("AI_DEVICE", "DEVICE"))

    # 80-landmark configuration (CephAI v2)
    num_landmarks: int = 80
    input_size_h: int = 512
    input_size_w: int = 512

    # Ensemble size (3 for speed, 5 for accuracy)
    ensemble_size: int = 3

    # Test-Time Augmentation
    tta_enabled: bool = True

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

    # MP-H airway threshold (mm) — >15mm suggests hyoid displacement risk
    mph_airway_threshold: float = 15.0

    # OpenAI
    openai_api_key: str = Field("", validation_alias=AliasChoices("AI_OPENAI_API_KEY", "OPENAI_API_KEY"))
    openai_model: str = "gpt-4o-mini"

    # Google Gemini (fallback)
    gemini_api_key: str = Field("", validation_alias=AliasChoices("AI_GEMINI_API_KEY", "GEMINI_API_KEY"))
    gemini_model: str = "gemini-flash-latest"

    # Database
    database_url: str = "postgresql://ceph_user:ceph_password@localhost:5432/cephanalysis_db"

settings = Settings()
