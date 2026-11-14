import { useRef, useState } from 'react';
import { browserDraftStore, newDraft, type DraftSnapshot } from '../services/drafts';
import type { CheckInDraft } from '../services/checkInDraft';

// The containing workspace is keyed by astronaut ID, so profile changes create
// a fresh session and restore only that astronaut's draft.
export function useCheckInDraft(astronautId: string) {
  const [initial] = useState(() => {
    try {
      const restored = typeof window === 'undefined' ? null : browserDraftStore().load(astronautId);
      return { snapshot: restored ?? newDraft(astronautId), restored: !!restored, error: '' };
    } catch { return { snapshot: newDraft(astronautId), restored: false, error: 'Draft recovery is unavailable. Any existing saved draft has been retained. Keep this page open until you save your health record.' }; }
  });
  const [snapshot, setSnapshot] = useState(initial.snapshot);
  const current = useRef(snapshot);
  const canWrite = useRef(!initial.error);
  const [draftError, setDraftError] = useState(initial.error);
  const [draftStatus, setDraftStatus] = useState(initial.restored ? 'Your unfinished check-in was restored from this device.' : 'Your answers will be saved as a draft on this device.');
  function persist(next: DraftSnapshot) {
    current.current = next; setSnapshot(next);
    if (!canWrite.current) return;
    try {
      browserDraftStore().save(next); setDraftError('');
      setDraftStatus(`Draft saved on this device at ${new Date(next.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`);
    } catch { setDraftError('Your latest changes could not be saved as a draft. Keep this page open and save your health record. Previously stored draft data has been retained.'); }
  }
  function update<K extends keyof CheckInDraft>(field: K, value: CheckInDraft[K]) {
    persist({ ...current.current, recordId: crypto.randomUUID(), revision: crypto.randomUUID(), updatedAt: new Date().toISOString(), values: { ...current.current.values, [field]: value } });
  }
  function setStep(step: number) { persist({ ...current.current, step, revision: crypto.randomUUID(), updatedAt: new Date().toISOString() }); }
  function submitted(submittedDraft: DraftSnapshot) {
    try {
      if (!browserDraftStore().clearSubmitted(submittedDraft)) throw new Error('A newer draft was retained.');
      const fresh = newDraft(astronautId);
      current.current = fresh; setSnapshot(fresh); setDraftError(''); setDraftStatus('Your record is saved. Enter new answers to begin another draft.');
    } catch {
      canWrite.current = false;
      setDraftError('Your health record was saved, but an unfinished draft remains on this device. Reload to recover it. Newer drafts have not been deleted.');
    }
  }
  return { snapshot, draft: snapshot.values, step: snapshot.step, update, setStep, submitted, draftError, draftStatus };
}
