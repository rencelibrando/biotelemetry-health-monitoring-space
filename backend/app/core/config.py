import os
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseModel):
    PROJECT_NAME: str = "Space Biotelemetry Health Monitoring API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Supabase Configuration
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")
    
    # Operational parameters
    NORMAL_HEART_RATE_MIN: float = 50.0
    NORMAL_HEART_RATE_MAX: float = 100.0
    NORMAL_SPO2_MIN: float = 94.0
    NORMAL_CORE_TEMP_MIN: float = 36.1
    NORMAL_CORE_TEMP_MAX: float = 37.8
    RADIATION_WARNING_THRESHOLD: float = 30.0  # uSv/hour
    RADIATION_CRITICAL_THRESHOLD: float = 60.0  # uSv/hour

settings = Settings()

