import type { SpaceDraftFields, SpaceWellnessV1 } from '../types/spaceWellness';
import type { CheckIn } from '../types/wellness';
import { sleepTiming } from './sleepTiming';

export function validateSpaceDraft(draft: SpaceDraftFields, step: number): string | null {
  if (step === 0 && (draft.sleepStartUtc || draft.wakeUtc) && !sleepTiming(draft.sleepStartUtc, draft.wakeUtc)) return 'Enter both sleep dates and UTC times. Wake-up must follow sleep start by at most 24 hours; overnight sleep ends on the next date.';
  if (step === 1 && [draft.isolation, draft.socialConnection, draft.emotionalWellbeing].some(value => value !== '' && (!/^\d$/.test(value) || Number(value) < 1 || Number(value) > 5))) return 'Optional well-being ratings must be from 1 to 5, or left blank.';
  if (step === 2) {
    if (draft.painIntensity !== '' && (!/^\d{1,2}$/.test(draft.painIntensity) || Number(draft.painIntensity) > 10)) return 'Pain intensity must be a whole number from 0 (no pain) to 10, or left blank.';
    if (draft.painLocation.length > 100 || draft.painNotes.length > 500) return 'Keep pain location to 100 characters and discomfort notes to 500 characters.';
  }
  return null;
}
export function extensionFromDraft(draft: SpaceDraftFields): SpaceWellnessV1 | undefined {
  const pain = draft.painIntensity !== '' || draft.painLocation.trim() || draft.painNotes.trim() ? {
    ...(draft.painIntensity !== '' ? { intensity: Number(draft.painIntensity) } : {}),
    ...(draft.painLocation.trim() ? { location: draft.painLocation.trim() } : {}),
    ...(draft.painNotes.trim() ? { notes: draft.painNotes.trim() } : {}),
  } : undefined;
  const mental = draft.isolation || draft.socialConnection || draft.emotionalWellbeing ? {
    ...(draft.isolation ? { isolation: Number(draft.isolation) } : {}),
    ...(draft.socialConnection ? { socialConnection: Number(draft.socialConnection) } : {}),
    ...(draft.emotionalWellbeing ? { emotionalWellbeing: Number(draft.emotionalWellbeing) } : {}),
  } : undefined;
  const sleep = sleepTiming(draft.sleepStartUtc, draft.wakeUtc) ?? undefined;
  return pain || mental || sleep ? { version: 1, mode: 'local-demo', ...(pain ? { pain } : {}), ...(mental ? { mental } : {}), ...(sleep ? { sleep } : {}) } : undefined;
}
// Explicit allowlist for a future legacy backend adapter. New extension fields
// and private reflections are never appended to existing REST telemetry calls.
export function toLegacyCheckIn(record: CheckIn): Omit<CheckIn, 'spaceWellness'> {
  const { id, astronautId, createdAt, sleepHours, sleepQuality, fatigue, stress, mood, exerciseMinutes, symptoms, notes, biometrics, syncStatus } = record;
  return { id, astronautId, createdAt, sleepHours, sleepQuality, fatigue, stress, mood, exerciseMinutes, symptoms, notes, biometrics, syncStatus };
}
export function validateSpaceRecord(extension: SpaceWellnessV1 | undefined): string | null {
  if (!extension) return null;
  if (extension.version !== 1 || extension.mode !== 'local-demo') return 'Unsupported optional wellness version.';
  const pain = extension.pain;
  if (pain?.intensity !== undefined && (!Number.isInteger(pain.intensity) || pain.intensity < 0 || pain.intensity > 10)) return 'Pain intensity must be from 0 to 10.';
  if ((pain?.location?.length ?? 0) > 100 || (pain?.notes?.length ?? 0) > 500) return 'Optional discomfort text is too long.';
  if (Object.values(extension.mental ?? {}).some(value => !Number.isInteger(value) || value < 1 || value > 5)) return 'Optional well-being ratings must be from 1 to 5.';
  if (extension.sleep) {
    const timing = sleepTiming(extension.sleep.startUtc.slice(0, 16), extension.sleep.wakeUtc.slice(0, 16));
    if (extension.sleep.timeBasis !== 'UTC' || !timing || timing.startUtc !== extension.sleep.startUtc || timing.wakeUtc !== extension.sleep.wakeUtc || timing.windowMinutes !== extension.sleep.windowMinutes) return 'Invalid optional sleep timing.';
  }
  return null;
}
