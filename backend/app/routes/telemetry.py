from fastapi import APIRouter, Query
from typing import List, Optional
from collections import deque
from backend.app.schemas.telemetry import VitalSigns, TelemetryBatchSync
from backend.app.services.simulator import simulator
from backend.app.services.analyzer import analyzer
from backend.app.routes.alerts import in_memory_alerts
from backend.app.core.supabase_client import get_supabase

router = APIRouter(prefix="/telemetry", tags=["Telemetry"])

# Ring buffer for recent history per astronaut
telemetry_history_buffer = {
    "ASTRO-01": deque(maxlen=200),
    "ASTRO-02": deque(maxlen=200),
    "ASTRO-03": deque(maxlen=200),
}

@router.get("/latest", response_model=VitalSigns)
async def get_latest_telemetry(
    astronaut_id: str = Query("ASTRO-01", description="Astronaut ID"),
    anomaly: str = Query("NONE", description="Simulate specific anomaly: NONE, HYPOXIA, TACHYCARDIA, RADIATION_SPIKE")
):
    vitals = simulator.generate_vitals(astronaut_id, anomaly_mode=anomaly)
    
    # Store in ring buffer
    if astronaut_id not in telemetry_history_buffer:
        telemetry_history_buffer[astronaut_id] = deque(maxlen=200)
    telemetry_history_buffer[astronaut_id].append(vitals)

    # Check for alerts
    new_alerts = analyzer.evaluate_vitals(vitals)
    for alert in new_alerts:
        in_memory_alerts[alert.id] = alert
        
    supabase = get_supabase()
    if supabase:
        try:
            # Asynchronously write summary to Supabase
            supabase.table("telemetry_logs").insert({
                "astronaut_id": vitals.astronaut_id,
                "timestamp": vitals.timestamp.isoformat(),
                "heart_rate": vitals.heart_rate,
                "spo2": vitals.spo2,
                "core_temp": vitals.core_temp,
                "radiation_rate": vitals.radiation_rate,
                "hrv": vitals.hrv,
                "is_synced": True
            }).execute()
        except Exception:
            pass

    return vitals

@router.get("/history", response_model=List[VitalSigns])
async def get_telemetry_history(
    astronaut_id: str = Query("ASTRO-01", description="Astronaut ID"),
    limit: int = Query(50, ge=1, le=200)
):
    supabase = get_supabase()
    if supabase:
        try:
            res = (
                supabase.table("telemetry_logs")
                .select("*")
                .eq("astronaut_id", astronaut_id)
                .order("timestamp", desc=True)
                .limit(limit)
                .execute()
            )
            if res.data and len(res.data) > 0:
                # Convert back to VitalSigns objects
                return [VitalSigns(**item) for item in reversed(res.data)]
        except Exception:
            pass

    buffer = telemetry_history_buffer.get(astronaut_id, deque())
    items = list(buffer)
    return items[-limit:]

@router.post("/sync-batch")
async def sync_offline_batch(batch: TelemetryBatchSync):
    """
    Receives batch of vital sign records recorded offline by the PWA during Loss of Signal (LOS).
    """
    count = len(batch.records)
    supabase = get_supabase()
    
    # Ingest into memory buffer
    if batch.astronaut_id not in telemetry_history_buffer:
        telemetry_history_buffer[batch.astronaut_id] = deque(maxlen=200)
    for rec in batch.records:
        telemetry_history_buffer[batch.astronaut_id].append(rec)
        
    if supabase and count > 0:
        try:
            records_to_insert = [
                {
                    "astronaut_id": rec.astronaut_id,
                    "timestamp": rec.timestamp.isoformat(),
                    "heart_rate": rec.heart_rate,
                    "spo2": rec.spo2,
                    "core_temp": rec.core_temp,
                    "radiation_rate": rec.radiation_rate,
                    "hrv": rec.hrv,
                    "is_synced": True
                }
                for rec in batch.records
            ]
            supabase.table("telemetry_logs").insert(records_to_insert).execute()
        except Exception as e:
            pass

    return {
        "status": "SUCCESS",
        "astronaut_id": batch.astronaut_id,
        "synced_count": count,
        "message": f"Successfully synchronized {count} offline records with Mission Control."
    }

