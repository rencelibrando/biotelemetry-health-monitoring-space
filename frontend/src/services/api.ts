import { Astronaut, VitalSigns, AlertItem, DiagnosticResult } from '../types/telemetry';
import type { SimulationConfig } from './simulationConfig';

export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
async function request<T>(path: string, init?: RequestInit, timeoutMs = 8000): Promise<T> {
  if (typeof window === 'undefined' && API_BASE.startsWith('/')) {
    throw new Error('Relative API requests require a browser origin.');
  }
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
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

export interface AssistantApiAction {
  label: string;
  target_page: string;
  target_exam?: string | null;
  protocol_id?: string | null;
}

export interface AssistantApiResponse {
  summary: string;
  actions: string[];
  escalate_when: string;
  nasa_reference: string;
  source: string;
  model: string;
  suggested_actions?: AssistantApiAction[];
  sbar_text?: string | null;
}

export const askFlightAssistantApi = (
  question: string,
  context: Record<string, unknown>,
  options?: { history?: { role: string; content: string }[]; mode?: string },
) => request<AssistantApiResponse>('/assistant/ask', post({ question, context, ...options }), 12000);

async function fetchWithSignal(
  path: string,
  init: RequestInit,
  signal?: AbortSignal,
  timeoutMs = 12000,
): Promise<Response> {
  if (typeof window === 'undefined' && API_BASE.startsWith('/')) {
    throw new Error('Relative API requests require a browser origin.');
  }
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (cause) {
    if (timedOut && !signal?.aborted) {
      throw new Error('Request timed out before audio synthesis completed.');
    }
    throw cause;
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

export async function synthesizeAssistantSpeechApi(
  text: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await fetchWithSignal('/assistant/tts', post({ text }), signal, 25000);
  if (!response.ok) {
    throw new Error(`Speech synthesis failed (${response.status}).`);
  }
  return await response.blob();
}

export async function transcribeSpeechAudioApi(
  audioBase64: string,
  mimeType: string,
  signal?: AbortSignal,
): Promise<{ transcript: string; source: string; model: string }> {
  const response = await fetchWithSignal(
    '/assistant/transcribe',
    post({ audio_base64: audioBase64, mime_type: mimeType }),
    signal,
  );
  if (!response.ok) {
    throw new Error(`Speech transcription failed (${response.status}).`);
  }
  return await response.json() as { transcript: string; source: string; model: string };
}

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
  request<ImageAnalysisApiResponse>('/diagnostics/analyze-image', post(payload), 12000);

export const syncCheckInRemote = (payload: Record<string, unknown>) =>
  request<{ persisted: boolean; client_id: string }>('/wellness/checkins', post(payload));

export const syncAssessmentRemote = (payload: Record<string, unknown>) =>
  request<{ persisted: boolean; client_id: string }>('/wellness/assessments', post(payload));

export interface RemoteCheckInRow {
  id?: string;
  client_id?: string | null;
  astronaut_id: string;
  recorded_at: string;
  mood?: number | null;
  energy?: number | null;
  stress?: number | null;
  sleep_hours?: number | null;
  pain_level?: number | null;
  blood_glucose_mg_dl?: number | null;
  hydration_ml?: number | null;
  nutrition_quality?: string | null;
  immune_symptoms?: string[] | null;
  metrics?: Record<string, unknown> | null;
}

export interface RemoteAssessmentRow {
  id?: string;
  client_id?: string | null;
  astronaut_id: string;
  exam_type: string;
  recorded_at: string;
  severity: string;
  findings: string;
  recommended_actions?: string[] | null;
  ground_consult_required?: boolean | null;
  analysis_source?: string | null;
  thumbnail_data_url?: string | null;
}

export function isOnlineHttpBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const origin = window.location?.origin;
  if (typeof origin !== 'string' || !/^https?:/.test(origin)) return false;
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

export const fetchCheckInsRemote = (astronautId: string, limit = 60) =>
  request<{ records: RemoteCheckInRow[] }>(`/wellness/checkins/${encodeURIComponent(astronautId)}?limit=${limit}`);

export const fetchAssessmentsRemote = (astronautId: string, limit = 40) =>
  request<{ records: RemoteAssessmentRow[] }>(`/wellness/assessments/${encodeURIComponent(astronautId)}?limit=${limit}`);
