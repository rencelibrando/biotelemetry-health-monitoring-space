import type { CheckIn, MissionCompletion } from '../types/wellness';

type WellnessChange = { kind: 'checkin'; record: CheckIn } | { kind: 'activities'; astronautId: string; completions: MissionCompletion[] };
const listeners = new Set<(change: WellnessChange) => void>();
// In-page notifications keep a newly mounted profile in sync with a local write
// that started on a different screen. Storage remains the source of truth.
export function notifyWellnessChange(change: WellnessChange) { listeners.forEach(listener => listener(change)); }
export function observeWellnessChanges(listener: (change: WellnessChange) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
