from fastapi import APIRouter
from backend.app.schemas.diagnostic import DiagnosticRequest, DiagnosticResult
from backend.app.services.analyzer import analyzer
from backend.app.routes.telemetry import telemetry_history_buffer

router = APIRouter(prefix="/diagnostics", tags=["Diagnostics"])

@router.post("/analyze", response_model=DiagnosticResult)
async def run_diagnostic(req: DiagnosticRequest):
    buffer = telemetry_history_buffer.get(req.astronaut_id, [])
    recent_vitals = list(buffer)
    return analyzer.run_comprehensive_diagnostic(req.astronaut_id, recent_vitals)

