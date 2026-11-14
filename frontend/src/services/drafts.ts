import { createCheckInDraft, type CheckInDraft } from './checkInDraft';

import { emptySpaceDraft } from '../types/spaceWellness';

export interface DraftSnapshot {
  version: 2; astronautId: string; recordId: string; revision: string;
  updatedAt: string; step: number; values: CheckInDraft;
}
type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const key = (astronautId: string) => `biotelemetry:checkin-draft:v1:${encodeURIComponent(astronautId)}`;
export function newDraft(astronautId: string): DraftSnapshot {
  return { version: 2, astronautId, recordId: crypto.randomUUID(), revision: crypto.randomUUID(), updatedAt: new Date().toISOString(), step: 0, values: createCheckInDraft() };
}
function isSnapshot(value: unknown, astronautId: string): value is DraftSnapshot {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<DraftSnapshot>;
  const draft = item.values;
  return item.version === 2 && item.astronautId === astronautId && typeof item.recordId === 'string' && !!item.recordId && typeof item.revision === 'string' && !!item.revision
    && typeof item.updatedAt === 'string' && Number.isFinite(Date.parse(item.updatedAt)) && Number.isInteger(item.step) && item.step! >= 0 && item.step! <= 2
    && !!draft && ['sleepHours', 'mood', 'exerciseMinutes', 'symptoms', 'notes'].every(field => typeof draft[field as keyof CheckInDraft] === 'string')
    && ['sleepQuality', 'fatigue', 'stress'].every(field => typeof draft[field as keyof CheckInDraft] === 'number' && Number.isFinite(draft[field as keyof CheckInDraft] as number))
    && ['', 'yes', 'no'].includes(draft.exercise)
    && Object.keys(emptySpaceDraft()).every(field => typeof draft[field as keyof CheckInDraft] === 'string');
}
export function createDraftStore(storage: DraftStorage) {
  return {
    load(astronautId: string): DraftSnapshot | null {
      const raw = storage.getItem(key(astronautId));
      if (raw === null) return null;
      let value: unknown = JSON.parse(raw);
      // Upgrade v1 in memory without rewriting or deleting the stored payload.
      if (value && typeof value === 'object' && (value as { version?: number }).version === 1) {
        const legacy = value as Record<string, unknown>;
        if (legacy.values && typeof legacy.values === 'object') value = { ...legacy, version: 2, values: { ...emptySpaceDraft(), ...legacy.values } };
      }
      if (!isSnapshot(value, astronautId)) throw new Error('The saved draft could not be read. It has been retained.');
      return value;
    },
    save(snapshot: DraftSnapshot): void {
      if (!isSnapshot(snapshot, snapshot.astronautId)) throw new Error('Invalid draft.');
      storage.setItem(key(snapshot.astronautId), JSON.stringify(snapshot));
    },
    clearSubmitted(snapshot: DraftSnapshot): boolean {
      const current = this.load(snapshot.astronautId);
      if (current === null) return true;
      // Never delete a newer draft written in another tab while a save was pending.
      if (current.revision !== snapshot.revision) return false;
      storage.removeItem(key(snapshot.astronautId));
      return true;
    },
  };
}
export const browserDraftStore = () => createDraftStore(window.localStorage);
