import { Astronaut, VitalSigns, AlertItem, DiagnosticResult } from '../types/telemetry';

export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${API_BASE}${path}`, { ...init, signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`Request failed (${response.status}). Please try again.`);
    return await response.json() as T;
  } finally { window.clearTimeout(timeout); }
}
const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const demoCrew: Astronaut[] = [
  { id: 'ASTRO-01', name: 'Dr. Sarah Chen', role: 'Commander / EVA Lead', age: 38, resting_hr: 62, baseline_spo2: 98.8, status: 'NOMINAL', suit_id: 'EMU-X4' },
  { id: 'ASTRO-02', name: 'Marcus Vance', role: 'Flight Engineer', age: 34, resting_hr: 65, baseline_spo2: 99.1, status: 'NOMINAL', suit_id: 'EMU-X2' },
  { id: 'ASTRO-03', name: 'Elena Rostova', role: 'Science Specialist', age: 41, resting_hr: 58, baseline_spo2: 98.4, status: 'NOMINAL', suit_id: 'EMU-X7' },
];
export const fetchAstronauts = () => request<Astronaut[]>('/astronauts');
export const fetchLatestTelemetry = (astronautId: string, anomaly = 'NONE') => request<VitalSigns>(`/telemetry/latest?astronaut_id=${encodeURIComponent(astronautId)}&anomaly=${encodeURIComponent(anomaly)}`);
export const fetchAlerts = () => request<AlertItem[]>('/alerts');
export async function acknowledgeAlert(alertId: string): Promise<void> {
  await request(`/alerts/${encodeURIComponent(alertId)}/ack`, post({ acknowledged_by: 'CREW_PWA_USER' }));
}
export interface SyncReceipt { status: string; astronaut_id: string; synced_count: number; persisted?: boolean }
export const syncOfflineBatch = (astronautId: string, records: VitalSigns[]) => request<SyncReceipt>('/telemetry/sync-batch', post({ astronaut_id: astronautId, records }));
export const runDiagnostics = (astronautId: string) => request<DiagnosticResult>('/diagnostics/analyze', post({ astronaut_id: astronautId, duration_seconds: 60 }));
