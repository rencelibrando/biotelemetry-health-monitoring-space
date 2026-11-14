from typing import List, Optional
import uuid
from datetime import datetime
from backend.app.schemas.telemetry import VitalSigns
from backend.app.schemas.alert import AlertItem
from backend.app.schemas.diagnostic import DiagnosticResult
from backend.app.core.config import settings

class HealthAnalyzer:
    def evaluate_vitals(self, vitals: VitalSigns) -> List[AlertItem]:
        alerts: List[AlertItem] = []

        # 1. Hypoxia Check
        if vitals.spo2 < 90.0:
            alerts.append(AlertItem(
                id=str(uuid.uuid4())[:8],
                astronaut_id=vitals.astronaut_id,
                timestamp=datetime.utcnow(),
                severity="CRITICAL",
                alert_type="HYPOXIA",
                message=f"Critical blood oxygen saturation drop ({vitals.spo2}%). Immediate suit O2 flush required!"
            ))
        elif vitals.spo2 < settings.NORMAL_SPO2_MIN:
            alerts.append(AlertItem(
                id=str(uuid.uuid4())[:8],
                astronaut_id=vitals.astronaut_id,
                timestamp=datetime.utcnow(),
                severity="WARNING",
                alert_type="HYPOXIA",
                message=f"Sub-optimal SpO2 ({vitals.spo2}%). Check breathing regulator."
            ))

        # 2. Cardiovascular Anomaly
        if vitals.heart_rate > 125.0:
            alerts.append(AlertItem(
                id=str(uuid.uuid4())[:8],
                astronaut_id=vitals.astronaut_id,
                timestamp=datetime.utcnow(),
                severity="WARNING",
                alert_type="TACHYCARDIA",
                message=f"Elevated heart rate detected ({vitals.heart_rate} BPM). Heavy physical strain or stress."
            ))
        elif vitals.heart_rate < 45.0:
            alerts.append(AlertItem(
                id=str(uuid.uuid4())[:8],
                astronaut_id=vitals.astronaut_id,
                timestamp=datetime.utcnow(),
                severity="WARNING",
                alert_type="BRADYCARDIA",
                message=f"Low resting pulse ({vitals.heart_rate} BPM). Monitor autonomic response."
            ))

        # 3. Radiation Exposure
        if vitals.radiation_rate >= settings.RADIATION_CRITICAL_THRESHOLD:
            alerts.append(AlertItem(
                id=str(uuid.uuid4())[:8],
                astronaut_id=vitals.astronaut_id,
                timestamp=datetime.utcnow(),
                severity="CRITICAL",
                alert_type="RADIATION_SPIKE",
                message=f"Solar Particle Event / High radiation dosage ({vitals.radiation_rate} uSv/h). Seek storm shelter!"
            ))
        elif vitals.radiation_rate >= settings.RADIATION_WARNING_THRESHOLD:
            alerts.append(AlertItem(
                id=str(uuid.uuid4())[:8],
                astronaut_id=vitals.astronaut_id,
                timestamp=datetime.utcnow(),
                severity="WARNING",
                alert_type="RADIATION_SPIKE",
                message=f"Elevated ambient radiation ({vitals.radiation_rate} uSv/h). Limit EVA duration."
            ))

        return alerts

    def run_comprehensive_diagnostic(self, astronaut_id: str, vitals_history: List[VitalSigns]) -> DiagnosticResult:
        if not vitals_history:
            return DiagnosticResult(
                astronaut_id=astronaut_id,
                overall_health_score=100.0,
                cardiovascular_status="NOMINAL",
                hypoxia_risk="LOW",
                radiation_risk="SAFE",
                recommendations=["Telemetry stream nominal. Maintain regular biometric logging."],
                metrics_summary={"status": "Insufficient historical data for deep trend"}
            )

        avg_hr = sum(v.heart_rate for v in vitals_history) / len(vitals_history)
        avg_spo2 = sum(v.spo2 for v in vitals_history) / len(vitals_history)
        avg_rad = sum(v.radiation_rate for v in vitals_history) / len(vitals_history)
        avg_hrv = sum(v.hrv for v in vitals_history) / len(vitals_history)

        score = 100.0
        recommendations = []

        # Deductions
        if avg_spo2 < 95.0:
            score -= (95.0 - avg_spo2) * 5.0
            recommendations.append("Increase suit oxygen partial pressure.")
        if avg_hr > 100.0:
            score -= (avg_hr - 100.0) * 0.8
            recommendations.append("High workload detected. Schedule 15-minute rest period.")
        if avg_rad > 25.0:
            score -= (avg_rad - 25.0) * 1.2
            recommendations.append("Radiation accumulation elevated. Review shielding integrity.")
        if avg_hrv < 35.0:
            score -= 10.0
            recommendations.append("Autonomic nervous exhaustion / fatigue detected via HRV.")

        score = max(10.0, min(100.0, round(score, 1)))

        return DiagnosticResult(
            astronaut_id=astronaut_id,
            overall_health_score=score,
            cardiovascular_status="NOMINAL" if score > 80 else ("COMPROMISED" if score > 50 else "CRITICAL"),
            hypoxia_risk="LOW" if avg_spo2 >= 95 else ("MODERATE" if avg_spo2 >= 90 else "SEVERE"),
            radiation_risk="SAFE" if avg_rad < 20 else ("ELEVATED" if avg_rad < 50 else "DANGEROUS"),
            recommendations=recommendations or ["All biological telemetry systems within safe operational parameters."],
            metrics_summary={
                "avg_heart_rate": round(avg_hr, 1),
                "avg_spo2": round(avg_spo2, 1),
                "avg_radiation_rate": round(avg_rad, 1),
                "avg_hrv": round(avg_hrv, 1),
                "sample_count": len(vitals_history)
            }
        )

analyzer = HealthAnalyzer()

