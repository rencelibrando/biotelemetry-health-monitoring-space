import { Astronaut, VitalSigns, AlertItem, DiagnosticResult } from '../types/telemetry';
import type { SimulationConfig } from './simulationConfig';

export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (typeof window === 'undefined' && API_BASE.startsWith('/')) {
    throw new Error('Relative API requests require a browser origin.');
  }
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${API_BASE}${path}`, { ...init, signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`Request failed (${response.status}). Please try again.`);
    return await response.json() as T;
  } finally { globalThis.clearTimeout(timeout); }
}
const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const demoCrew: Astronaut[] = [
  { id: 'ASTRO-01', name: 'Dr. Sarah Chen', role: 'Commander / EVA Lead', age: 38, resting_hr: 62, baseline_spo2: 98.8, status: 'NOMINAL', suit_id: 'EMU-X4' },
  { id: 'ASTRO-02', name: 'Marcus Vance', role: 'Flight Engineer', age: 34, resting_hr: 65, baseline_spo2: 99.1, status: 'NOMINAL', suit_id: 'EMU-X2' },
  { id: 'ASTRO-03', name: 'Elena Rostova', role: 'Science Specialist', age: 41, resting_hr: 58, baseline_spo2: 98.4, status: 'NOMINAL', suit_id: 'EMU-X7' },
];
export const fetchAstronauts = () => request<Astronaut[]>('/astronauts');
export const fetchLatestTelemetry = (astronautId: string, anomaly = 'NONE', sim?: Partial<SimulationConfig>) => {
  const params = new URLSearchParams({ astronaut_id: astronautId, anomaly });
  if (sim?.missionZone) params.set('mission_zone', sim.missionZone);
  if (sim?.missionDay !== undefined) params.set('mission_day', String(sim.missionDay));
  if (sim?.evaActive !== undefined && sim.evaActive !== null) params.set('eva_active', String(sim.evaActive));
  if (sim?.shielding) params.set('shielding', sim.shielding);
  if (sim?.solarStorm) params.set('solar_storm', sim.solarStorm);
  return request<VitalSigns>(`/telemetry/latest?${params.toString()}`);
};
export const fetchAlerts = () => request<AlertItem[]>('/alerts');
export async function acknowledgeAlert(
  alertId: string,
  meta?: { astronaut_id?: string; alert_type?: string },
): Promise<void> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${API_BASE}/alerts/${encodeURIComponent(alertId)}/ack`, {
      ...post({ acknowledged_by: 'CREW_PWA_USER', ...meta }),
      signal: controller.signal,
      cache: 'no-store',
    });
    // 404 means the server cleared that hazard/session already; treat as acknowledged cleanly.
    if (!response.ok && response.status !== 404) {
      throw new Error(`Request failed (${response.status}). Please try again.`);
    }
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
export async function acknowledgeAllAlerts(astronautId: string): Promise<void> {
  await request(`/alerts/ack-all?astronaut_id=${encodeURIComponent(astronautId)}`, post({}));
}
export interface SyncReceipt { status: string; astronaut_id: string; synced_count: number; persisted?: boolean }
export const syncOfflineBatch = (astronautId: string, records: VitalSigns[]) => request<SyncReceipt>('/telemetry/sync-batch', post({ astronaut_id: astronautId, records }));
export const runDiagnostics = (astronautId: string, sim?: Partial<SimulationConfig>) =>
  request<DiagnosticResult>(
    '/diagnostics/analyze',
    post({
      astronaut_id: astronautId,
      duration_seconds: 60,
      mission_zone: sim?.missionZone ?? 'LEO_ISS',
      mission_day: sim?.missionDay ?? 14,
      eva_active: sim?.evaActive ?? null,
      shielding: sim?.shielding ?? 'NOMINAL',
      solar_storm: sim?.solarStorm ?? 'LIVE_DONKI',
      anomaly: sim?.anomaly ?? 'NONE',
    }),
  );

export const fetchTelemetryHistory = (astronautId: string, limit = 30) =>
  request<VitalSigns[]>(`/telemetry/history?astronaut_id=${encodeURIComponent(astronautId)}&limit=${limit}`);

export interface AssistantApiResponse {
  summary: string;
  actions: string[];
  escalate_when: string;
  nasa_reference: string;
  source: string;
  model: string;
}

export const askFlightAssistantApi = (question: string, context: Record<string, unknown>) =>
  request<AssistantApiResponse>('/assistant/ask', post({ question, context }));

export interface ImageAnalysisApiResponse {
  exam_type: string;
  severity: 'nominal' | 'warning' | 'critical' | string;
  findings: string;
  recommended_actions: string[];
  ground_consult_required: boolean;
  analysis_source: string;
  image_quality: string;
}

export const analyzeSelfExamImageApi = (payload: Record<string, unknown>) =>
  request<ImageAnalysisApiResponse>('/diagnostics/analyze-image', post(payload));

export const syncCheckInRemote = (payload: Record<string, unknown>) =>
  request<{ persisted: boolean; client_id: string }>('/wellness/checkins', post(payload));

export const syncAssessmentRemote = (payload: Record<string, unknown>) =>
  request<{ persisted: boolean; client_id: string }>('/wellness/assessments', post(payload));
