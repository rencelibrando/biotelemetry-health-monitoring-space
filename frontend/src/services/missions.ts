import { localDb } from '../db/localDb';
import type { Mission, MissionCompletion } from '../types/wellness';

export const missionCatalog: Mission[] = [
  {
    id: 'daily-checkin',
    category: 'Medical & exams',
    title: 'Daily Crew Health Check-In',
    description: 'Log sleep, fatigue, mood, hydration, exercise, and capillary glucose in Check-In.',
    kind: 'Recommended',
    verificationMode: 'auto-checkin',
    estimatedMinutes: 2,
    targetPage: 'checkin',
  },
  {
    id: 'physical-ared',
    category: 'Physical countermeasures',
    title: 'ARED Resistive Loading',
    description: 'Complete axial squats, deadlifts, or heel raises (>=30 min) to counter microgravity bone loss.',
    kind: 'Recommended',
    verificationMode: 'auto-or-manual',
    estimatedMinutes: 45,
  },
  {
    id: 'cardio-aerobic',
    category: 'Physical countermeasures',
    title: 'T2 / CEVIS Aerobic Session',
    description: 'Maintain VO2 capacity and orthostatic tolerance via treadmill or cycle ergometer.',
    kind: 'Routine',
    verificationMode: 'auto-or-manual',
    estimatedMinutes: 30,
  },
  {
    id: 'hydration-target',
    category: 'Metabolic & hydration',
    title: 'Hydration & Electrolyte Target',
    description: 'Reach 2,200+ mL daily fluids to reduce renal stone risk and orthostatic drops.',
    kind: 'Recommended',
    verificationMode: 'auto-or-manual',
    estimatedMinutes: 1,
    targetPage: 'checkin',
  },
  {
    id: 'glucose-nutrition',
    category: 'Metabolic & hydration',
    title: 'Capillary Glucose & Ration Check',
    description: 'Verify blood glucose (70-140 mg/dL target) and nutrition adequacy in Check-In or Glucometer Exam.',
    kind: 'Routine',
    verificationMode: 'auto-or-manual',
    estimatedMinutes: 3,
    targetExam: 'glucometer_nutrition',
  },
  {
    id: 'sans-ultrasound',
    category: 'Medical & exams',
    title: 'SANS Ocular Ultrasound Check',
    description: 'Capture bilateral closed-eyelid optic nerve sheath scan to monitor fluid-shift pressure.',
    kind: 'Recommended',
    verificationMode: 'auto-exam',
    estimatedMinutes: 5,
    targetExam: 'ocular_ultrasound',
  },
  {
    id: 'dermal-shielding',
    category: 'Medical & exams',
    title: 'Radiation Shelter & Dermal Check',
    description: 'Verify shielded quarters during solar events and inspect skin for rash or suit irritation.',
    kind: 'Routine',
    verificationMode: 'auto-or-manual',
    estimatedMinutes: 3,
    targetExam: 'dermal_radiation',
  },
  {
    id: 'circadian-sleep',
    category: 'Sleep & behavioral',
    title: 'Circadian Light & 7h Sleep',
    description: 'Protect >=7 hours rest with dim amber cabin lighting 60 minutes prior to sleep.',
    kind: 'Routine',
    verificationMode: 'auto-or-manual',
    estimatedMinutes: 1,
    targetPage: 'checkin',
  },
  {
    id: 'behavioral-sync',
    category: 'Sleep & behavioral',
    title: 'Behavioral Decompression & Crew Sync',
    description: 'Run 5 min paced breathing or scheduled private crew/family communication block.',
    kind: 'Routine',
    verificationMode: 'manual',
    estimatedMinutes: 10,
  },
];

export const LEGACY_MISSION_ALIASES: Record<string, string> = {
  exercise: 'physical-ared',
  activity: 'cardio-aerobic',
  recovery: 'hydration-target',
  sleep: 'circadian-sleep',
  patterns: 'sans-ultrasound',
  rest: 'circadian-sleep',
  mood: 'daily-checkin',
  stress: 'daily-checkin',
  reflection: 'behavioral-sync',
};

export function normalizeMissionId(id: string): string {
  return LEGACY_MISSION_ALIASES[id] ?? id;
}

export const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export interface MissionService {
  list(astronautId: string): Promise<MissionCompletion[]>;
  toggle(astronautId: string, missionId: string, date: string): Promise<void>;
}

export const missions: MissionService = {
  list: astronautId => localDb.missionCompletions.where('astronautId').equals(astronautId).toArray(),
  async toggle(astronautId, missionId, date) {
    const key = `${astronautId}:${date}:${missionId}`;
    await localDb.transaction('rw', localDb.missionCompletions, async () => {
      if (await localDb.missionCompletions.get(key)) await localDb.missionCompletions.delete(key);
      else await localDb.missionCompletions.add({ key, astronautId, missionId, date, completedAt: new Date().toISOString() });
    });
  },
};
