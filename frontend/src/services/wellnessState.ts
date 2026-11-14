import type { CheckIn, MissionCompletion } from '../types/wellness';
import { checkins, type CheckInService } from './checkins';
import { missions, type MissionService } from './missions';
import { notifyWellnessChange, observeWellnessChanges } from './wellnessEvents';

export interface WellnessState {
  records: CheckIn[]; completions: MissionCompletion[]; loading: boolean;
  recordsError: string; activitiesError: string; activitySaving: boolean;
}
export function mergeCheckIns(astronautId: string, ...groups: CheckIn[][]): CheckIn[] {
  return [...new Map(groups.flat().filter(record => record.astronautId === astronautId).map(record => [record.id, record])).values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function createWellnessStore(astronautId: string, recordsService: CheckInService = checkins, activityService: MissionService = missions) {
  let state: WellnessState = { records: [], completions: [], loading: true, recordsError: '', activitiesError: '', activitySaving: false };
  let generation = 0;
  let recordVersion = 0;
  let activityVersion = 0;
  let stopObserving: (() => void) | undefined;
  const recentlyAccepted = new Map<string, { record: CheckIn; version: number }>();
  const listeners = new Set<() => void>();
  function set(update: Partial<WellnessState>) { state = { ...state, ...update }; listeners.forEach(listener => listener()); }
  function acceptCheckIn(record: CheckIn) {
    if (record.astronautId !== astronautId) return;
    recentlyAccepted.set(record.id, { record, version: ++recordVersion });
    set({ records: mergeCheckIns(astronautId, state.records, [record]) });
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      if (!listeners.size) stopObserving = observeWellnessChanges(change => {
        if (change.kind === 'checkin') acceptCheckIn(change.record);
        else if (change.astronautId === astronautId) {
          activityVersion++;
          set({ completions: change.completions.filter(item => item.astronautId === astronautId), activitiesError: '' });
        }
      });
      listeners.add(listener);
      return () => { listeners.delete(listener); if (!listeners.size) { stopObserving?.(); stopObserving = undefined; } };
    },
    cancel() { generation++; },
    async reload() {
      if (state.activitySaving) return;
      const ticket = ++generation;
      const versionAtStart = recordVersion;
      const activitiesAtStart = activityVersion;
      set({ loading: true });
      const [records, activities] = await Promise.allSettled([
        Promise.resolve().then(() => recordsService.list(astronautId)),
        Promise.resolve().then(() => activityService.list(astronautId)),
      ]);
      if (ticket !== generation) return;
      const committedDuringRead = [...recentlyAccepted.values()].filter(item => item.version > versionAtStart).map(item => item.record);
      if (records.status === 'fulfilled') recentlyAccepted.clear();
      set({
        loading: false,
        records: records.status === 'fulfilled' ? mergeCheckIns(astronautId, records.value, committedDuringRead) : state.records,
        completions: activities.status === 'fulfilled' && activityVersion === activitiesAtStart ? activities.value.filter(item => item.astronautId === astronautId) : state.completions,
        recordsError: records.status === 'rejected' ? 'Saved check-ins could not be loaded. Existing records have not been deleted.' : '',
        activitiesError: activities.status === 'rejected' ? 'Saved activity progress could not be loaded. Existing progress has not been deleted.' : '',
      });
    },
    acceptCheckIn,
    async toggleActivity(missionId: string, date: string) {
      if (state.loading || state.activitySaving || state.activitiesError) throw new Error('Wait for saved activity progress to load before changing it.');
      const ticket = ++generation;
      set({ activitySaving: true });
      try {
        await activityService.toggle(astronautId, missionId, date);
        const completions = await activityService.list(astronautId);
        notifyWellnessChange({ kind: 'activities', astronautId, completions });
        if (ticket === generation) set({ completions: completions.filter(item => item.astronautId === astronautId), activitiesError: '' });
      } catch {
        const message = 'Could not confirm activity progress. Retry loading local records before changing it again.';
        if (ticket === generation) set({ activitiesError: message });
        throw new Error(message);
      } finally { if (ticket === generation) set({ activitySaving: false }); }
    },
  };
}
