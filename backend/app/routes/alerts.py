from fastapi import APIRouter, HTTPException
from typing import List, Dict
from backend.app.schemas.alert import AlertItem, AlertAcknowledge
from backend.app.core.supabase_client import get_supabase

router = APIRouter(prefix="/alerts", tags=["Alerts"])

in_memory_alerts: Dict[str, AlertItem] = {}

@router.get("", response_model=List[AlertItem])
async def get_alerts():
    supabase = get_supabase()
    if supabase:
        try:
            res = supabase.table("alerts").select("*").order("timestamp", desc=True).limit(20).execute()
            if res.data and len(res.data) > 0:
                return [AlertItem(**item) for item in res.data]
        except Exception:
            pass
    return list(in_memory_alerts.values())

@router.post("/{alert_id}/ack", response_model=AlertItem)
async def acknowledge_alert(alert_id: str, ack: AlertAcknowledge):
    supabase = get_supabase()
    if alert_id in in_memory_alerts:
        in_memory_alerts[alert_id].acknowledged = True
        alert = in_memory_alerts[alert_id]
        if supabase:
            try:
                supabase.table("alerts").update({"acknowledged": True}).eq("id", alert_id).execute()
            except Exception:
                pass
        return alert

    if supabase:
        try:
            res = supabase.table("alerts").update({"acknowledged": True}).eq("id", alert_id).execute()
            if res.data:
                return AlertItem(**res.data[0])
        except Exception:
            pass

    raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")

@router.delete("/clear")
async def clear_all_alerts():
    in_memory_alerts.clear()
    return {"status": "CLEARED"}

