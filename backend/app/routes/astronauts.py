from fastapi import APIRouter, HTTPException
from typing import List
from backend.app.schemas.astronaut import Astronaut, AstronautCreate
from backend.app.core.supabase_client import get_supabase

router = APIRouter(prefix="/astronauts", tags=["Astronauts"])

# Default seeded crew members
DEFAULT_CREW = [
    Astronaut(
        id="ASTRO-01",
        name="Dr. Sarah Chen",
        role="Commander / EVA Lead",
        age=38,
        resting_hr=62.0,
        baseline_spo2=98.8,
        status="NOMINAL",
        suit_id="EMU-X4"
    ),
    Astronaut(
        id="ASTRO-02",
        name="Marcus Vance",
        role="Flight Engineer",
        age=34,
        resting_hr=65.0,
        baseline_spo2=99.1,
        status="NOMINAL",
        suit_id="EMU-X2"
    ),
    Astronaut(
        id="ASTRO-03",
        name="Elena Rostova",
        role="Science Specialist / Biologist",
        age=41,
        resting_hr=58.0,
        baseline_spo2=98.4,
        status="NOMINAL",
        suit_id="EMU-X7"
    )
]

in_memory_crew = {c.id: c for c in DEFAULT_CREW}

@router.get("", response_model=List[Astronaut])
async def get_astronauts():
    supabase = get_supabase()
    if supabase:
        try:
            res = supabase.table("astronauts").select("*").execute()
            if res.data and len(res.data) > 0:
                return [Astronaut(**item) for item in res.data]
        except Exception as e:
            pass  # Fall back to in_memory
    return list(in_memory_crew.values())

@router.get("/{astronaut_id}", response_model=Astronaut)
async def get_astronaut(astronaut_id: str):
    supabase = get_supabase()
    if supabase:
        try:
            res = supabase.table("astronauts").select("*").eq("id", astronaut_id).single().execute()
            if res.data:
                return Astronaut(**res.data)
        except Exception:
            pass
    if astronaut_id in in_memory_crew:
        return in_memory_crew[astronaut_id]
    raise HTTPException(status_code=404, detail=f"Astronaut {astronaut_id} not found")

@router.post("", response_model=Astronaut)
async def create_astronaut(crew_in: AstronautCreate):
    new_astro = Astronaut(**crew_in.dict())
    in_memory_crew[new_astro.id] = new_astro
    supabase = get_supabase()
    if supabase:
        try:
            supabase.table("astronauts").upsert(new_astro.dict()).execute()
        except Exception:
            pass
    return new_astro

