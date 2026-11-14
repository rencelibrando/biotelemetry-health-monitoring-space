from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class ECGPoint(BaseModel):
    time_offset_ms: int
    voltage_mv: float

class VitalSigns(BaseModel):
    astronaut_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    heart_rate: float = Field(..., ge=20.0, le=250.0, description="Beats per minute")
    spo2: float = Field(..., ge=50.0, le=100.0, description="Blood oxygen percentage")
    core_temp: float = Field(..., ge=30.0, le=45.0, description="Degrees Celsius")
    radiation_rate: float = Field(..., ge=0.0, description="Micro-Sieverts per hour (uSv/h)")
    hrv: float = Field(..., ge=0.0, description="Heart Rate Variability in ms")
    systolic_bp: Optional[float] = Field(120.0, description="Systolic Blood Pressure (mmHg)")
    diastolic_bp: Optional[float] = Field(80.0, description="Diastolic Blood Pressure (mmHg)")
    respiration_rate: Optional[float] = Field(14.0, description="Breaths per minute")
    battery_level: Optional[float] = Field(98.0, description="Suit telemetry unit battery percentage")
    ecg_samples: Optional[List[float]] = Field(default=[], description="Instantaneous raw ECG voltage window (mV)")

class TelemetryBatchSync(BaseModel):
    astronaut_id: str
    client_synced_at: datetime = Field(default_factory=datetime.utcnow)
    records: List[VitalSigns]

