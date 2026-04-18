from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"  # Allow shared .env with backend variables
    )

    # Service auth
    service_key: str = "dev-service-key"

    # AI model
    model_path: str = "engines/model/model.pth"
    model_version: str = "v1.0.0"
    device: str = "cpu" # "cuda" for GPU
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
    openai_api_key: str = ""  # set via OPENAI_API_KEY in .env
    openai_model: str = "gpt-4o-mini"

    # Google Gemini (Fallback provider)
    gemini_api_key: str = ""  # set via GEMINI_API_KEY in .env
    gemini_model: str = "gemini-flash-latest" # Use verified available model alias

    # Database (for any direct AI service DB access)
    database_url: str = "postgresql://ceph_user:ceph_password@localhost:5432/cephanalysis_db"

settings = Settings()
