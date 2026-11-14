import math
import time
import random
from datetime import datetime
from typing import List, Dict
from backend.app.schemas.telemetry import VitalSigns

def generate_ecg_sample(phase: float) -> float:
    """
    Synthesizes a realistic single-lead ECG signal (P-Q-R-S-T wave) for a normalized cycle phase [0, 1).
    """
    val = 0.0
    # Baseline wander/noise
    val += 0.05 * math.sin(2 * math.pi * phase)
    val += random.uniform(-0.02, 0.02)
    
    # P wave (at phase 0.15 to 0.25)
    if 0.15 <= phase <= 0.25:
        p_t = (phase - 0.20) / 0.05
        val += 0.15 * math.exp(-0.5 * (p_t * 3)**2)
    
    # Q wave (at phase 0.35)
    if 0.33 <= phase <= 0.37:
        val -= 0.15 * (1 - abs(phase - 0.35) / 0.02)
        
    # R peak (sharp spike at phase 0.40)
    if 0.37 <= phase <= 0.43:
        r_t = (phase - 0.40) / 0.02
        val += 1.25 * math.exp(-0.5 * (r_t * 3.5)**2)
        
    # S wave (dip at phase 0.44)
    if 0.43 <= phase <= 0.47:
        val -= 0.25 * (1 - abs(phase - 0.45) / 0.02)
        
    # T wave (at phase 0.65 to 0.80)
    if 0.65 <= phase <= 0.80:
        t_t = (phase - 0.72) / 0.07
        val += 0.30 * math.exp(-0.5 * (t_t * 2.8)**2)
        
    return round(val, 3)

class BiotelemetrySimulator:
    def __init__(self):
        # Astronaut state baselines
        self.state: Dict[str, Dict] = {
            "ASTRO-01": {"hr": 68.0, "spo2": 98.4, "temp": 36.8, "rad": 14.5, "hrv": 52.0, "eva": True},
            "ASTRO-02": {"hr": 74.0, "spo2": 99.1, "temp": 37.0, "rad": 12.0, "hrv": 61.0, "eva": False},
            "ASTRO-03": {"hr": 82.0, "spo2": 97.8, "temp": 36.9, "rad": 15.2, "hrv": 48.0, "eva": True},
        }

    def generate_vitals(self, astronaut_id: str, anomaly_mode: str = "NONE") -> VitalSigns:
        base = self.state.get(astronaut_id, {"hr": 70.0, "spo2": 98.0, "temp": 36.8, "rad": 13.0, "hrv": 50.0, "eva": False})
        
        # Subtle organic drift
        base["hr"] += random.uniform(-1.0, 1.0)
        base["hr"] = max(55.0, min(100.0, base["hr"]))
        
        base["spo2"] += random.uniform(-0.15, 0.15)
        base["spo2"] = max(95.0, min(100.0, base["spo2"]))
        
        base["temp"] += random.uniform(-0.02, 0.02)
        base["temp"] = max(36.4, min(37.3, base["temp"]))
        
        base["rad"] += random.uniform(-0.3, 0.3)
        base["rad"] = max(5.0, min(25.0, base["rad"]))

        hr = base["hr"]
        spo2 = base["spo2"]
        temp = base["temp"]
        rad = base["rad"]
        hrv = base["hrv"] + random.uniform(-2.0, 2.0)

        # Inject anomalies on demand for demo/testing
        if anomaly_mode == "HYPOXIA":
            spo2 = round(random.uniform(86.0, 89.5), 1)
            hr = round(hr + 25.0, 1)
        elif anomaly_mode == "TACHYCARDIA":
            hr = round(random.uniform(130.0, 155.0), 1)
        elif anomaly_mode == "RADIATION_SPIKE":
            rad = round(random.uniform(65.0, 95.0), 1)

        # Generate a high-frequency ECG window (50 samples representing ~1 second)
        ecg_window: List[float] = []
        now_sec = time.time()
        heart_rate_hz = hr / 60.0
        for i in range(50):
            t = now_sec + (i / 50.0)
            phase = (t * heart_rate_hz) % 1.0
            ecg_window.append(generate_ecg_sample(phase))

        return VitalSigns(
            astronaut_id=astronaut_id,
            timestamp=datetime.utcnow(),
            heart_rate=round(hr, 1),
            spo2=round(spo2, 1),
            core_temp=round(temp, 2),
            radiation_rate=round(rad, 1),
            hrv=round(hrv, 1),
            systolic_bp=round(118 + (hr - 70) * 0.3, 0),
            diastolic_bp=round(78 + (hr - 70) * 0.15, 0),
            respiration_rate=round(14 + (hr - 70) * 0.1, 1),
            battery_level=round(94.5 - random.uniform(0.0, 0.5), 1),
            ecg_samples=ecg_window
        )

simulator = BiotelemetrySimulator()

