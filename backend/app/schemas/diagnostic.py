from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

class DiagnosticRequest(BaseModel):
    astronaut_id: str
    duration_seconds: int = Field(60, ge=10, le=3600)
    include_ecg_fft: bool = True

class DiagnosticResult(BaseModel):
    astronaut_id: str
    overall_health_score: float = Field(..., ge=0.0, le=100.0) # 0 to 100
    cardiovascular_status: str  # NOMINAL | COMPROMISED | CRITICAL
    hypoxia_risk: str           # LOW | MODERATE | SEVERE
    radiation_risk: str         # SAFE | ELEVATED | DANGEROUS
    recommendations: List[str]
    metrics_summary: Dict[str, Any]

