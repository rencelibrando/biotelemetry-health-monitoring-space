from pydantic import BaseModel, Field
from typing import Optional

class AstronautBase(BaseModel):
    id: str = Field(..., example="ASTRO-01")
    name: str = Field(..., example="Dr. Sarah Chen")
    role: str = Field(..., example="Mission Specialist / EVA Lead")
    age: int = Field(36, example=36)
    resting_hr: float = Field(62.0, example=62.0)
    baseline_spo2: float = Field(98.5, example=98.5)

class AstronautCreate(AstronautBase):
    pass

class Astronaut(AstronautBase):
    status: str = Field("NOMINAL", example="NOMINAL")
    suit_id: Optional[str] = Field("EMU-X4", example="EMU-X4")

