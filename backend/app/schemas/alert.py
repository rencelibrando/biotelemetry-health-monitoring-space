from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class AlertItem(BaseModel):
    id: str
    astronaut_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    severity: str = Field(..., example="CRITICAL")  # INFO | WARNING | CRITICAL
    alert_type: str = Field(..., example="HYPOXIA") # HYPOXIA | TACHYCARDIA | BRADYCARDIA | RADIATION_SPIKE | HEAT_STRESS
    message: str
    acknowledged: bool = False

class AlertAcknowledge(BaseModel):
    acknowledged_by: Optional[str] = "FLIGHT_SURGEON"

