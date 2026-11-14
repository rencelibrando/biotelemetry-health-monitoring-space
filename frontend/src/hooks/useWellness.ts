import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createWellnessStore } from '../services/wellnessState';

export function useWellness(astronautId: string) {
  const store = useMemo(() => createWellnessStore(astronautId), [astronautId]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { void store.reload(); return () => store.cancel(); }, [store]);
  return { ...state, error: [state.recordsError, state.activitiesError].filter(Boolean).join(' '), reload: store.reload, acceptCheckIn: store.acceptCheckIn, toggleActivity: store.toggleActivity };
}
