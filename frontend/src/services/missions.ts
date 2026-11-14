import { localDb } from '../db/localDb';
import type { Mission, MissionCompletion } from '../types/wellness';

export const missionCatalog: Mission[] = [
  { id: 'exercise', category: 'Physical wellness', title: 'Record your exercise', description: 'In Check-In, record exercise already completed under your approved schedule.', kind: 'Routine' },
  { id: 'activity', category: 'Physical wellness', title: 'Review your activity', description: 'Reflect on today’s physical activity and make a note for your crew team.', kind: 'Routine' },
  { id: 'recovery', category: 'Physical wellness', title: 'Record your recovery', description: 'Record how you feel after your scheduled activity.', kind: 'Recommended' },
  { id: 'sleep', category: 'Sleep & recovery', title: 'Record your sleep', description: 'In Check-In, note how long and how well you slept.', kind: 'Routine' },
  { id: 'patterns', category: 'Sleep & recovery', title: 'Review your sleep trends', description: 'Open My Health Trends to look at your saved sleep entries.', kind: 'Recommended' },
  { id: 'rest', category: 'Sleep & recovery', title: 'Record how rested you feel', description: 'In Check-In, note how tired or rested you feel.', kind: 'Routine' },
  { id: 'mood', category: 'Mental & emotional', title: 'Record your mood', description: 'Record how you’re feeling in today’s health check-in.', kind: 'Routine' },
  { id: 'stress', category: 'Mental & emotional', title: 'Record your stress level', description: 'In Check-In, choose how stressed you feel from 1 to 5.', kind: 'Routine' },
  { id: 'reflection', category: 'Mental & emotional', title: 'Write a short reflection', description: 'Use your personal notes to capture a thought from today.', kind: 'Recommended' },
];
export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export interface MissionService {
  list(astronautId: string): Promise<MissionCompletion[]>;
  toggle(astronautId: string, missionId: string, date: string): Promise<void>;
}
export const missions: MissionService = {
  list: (astronautId) => localDb.missionCompletions.where('astronautId').equals(astronautId).toArray(),
  async toggle(astronautId, missionId, date) {
    const key = `${astronautId}:${date}:${missionId}`;
    await localDb.transaction('rw', localDb.missionCompletions, async () => {
      if (await localDb.missionCompletions.get(key)) await localDb.missionCompletions.delete(key);
      else await localDb.missionCompletions.add({ key, astronautId, missionId, date, completedAt: new Date().toISOString() });
    });
  },
};

