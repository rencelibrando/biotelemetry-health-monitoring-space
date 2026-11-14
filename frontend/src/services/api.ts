import { Astronaut, VitalSigns, AlertItem, DiagnosticResult } from '../types/telemetry';

const API_BASE = '/api/v1';

export async function fetchAstronauts(): Promise<Astronaut[]> {
  try {
    const res = await fetch(`${API_BASE}/astronauts`);
    if (!res.ok) throw new Error('Network error');
    return await res.json();
  } catch (err) {
    // Fallback baseline crew if offline or API starting
    return [
      { id: 'ASTRO-01', name: 'Dr. Sarah Chen', role: 'Commander / EVA Lead', age: 38, resting_hr: 62.0, baseline_spo2: 98.8, status: 'NOMINAL', suit_id: 'EMU-X4' },
      { id: 'ASTRO-02', name: 'Marcus Vance', role: 'Flight Engineer', age: 34, resting_hr: 65.0, baseline_spo2: 99.1, status: 'NOMINAL', suit_id: 'EMU-X2' },
      { id: 'ASTRO-03', name: 'Elena Rostova', role: 'Science Specialist', age: 41, resting_hr: 58.0, baseline_spo2: 98.4, status: 'NOMINAL', suit_id: 'EMU-X7' },
    ];
  }
}

export async function fetchLatestTelemetry(astronautId: string, anomaly: string = 'NONE'): Promise<VitalSigns> {
  const res = await fetch(`${API_BASE}/telemetry/latest?astronaut_id=${astronautId}&anomaly=${anomaly}`);
  if (!res.ok) throw new Error('Failed to fetch telemetry');
  return await res.json();
}

export async function fetchAlerts(): Promise<AlertItem[]> {
  try {
    const res = await fetch(`${API_BASE}/alerts`);
    if (!res.ok) throw new Error('Failed to fetch alerts');
    return await res.json();
  } catch {
    return [];
  }
}

export async function acknowledgeAlert(alertId: string): Promise<void> {
  await fetch(`${API_BASE}/alerts/${alertId}/ack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acknowledged_by: 'CREW_PWA_USER' })
  });
}

export async function syncOfflineBatch(astronautId: string, records: VitalSigns[]): Promise<any> {
  const res = await fetch(`${API_BASE}/telemetry/sync-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      astronaut_id: astronautId,
      records: records
    })
  });
  return await res.json();
}

export async function runDiagnostics(astronautId: string): Promise<DiagnosticResult> {
  const res = await fetch(`${API_BASE}/diagnostics/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      astronaut_id: astronautId,
      duration_seconds: 60
    })
  });
  return await res.json();
}

