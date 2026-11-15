import type { ImageAssessmentRecord, SelfExamType, VitalSigns } from '../types/telemetry';
import type { CheckIn, MissionCompletion, Page } from '../types/wellness';
import { localDate } from './missions';

export interface ScheduledPrompt {
  id: string;
  priority: 'high' | 'routine';
  title: string;
  detail: string;
  actionLabel: string;
  targetPage: Page;
  targetExam?: SelfExamType;
}

export interface CrewBadge {
  id: string;
  label: string;
  earned: boolean;
  requirement: string;
}

export interface ReadinessSummary {
  readinessScore: number;
  streakDays: number;
  xp: number;
  badges: CrewBadge[];
  nextPrompt: ScheduledPrompt;
  prompts: ScheduledPrompt[];
}

export function computeCheckInStreak(records: CheckIn[], now = new Date()): number {
  if (!records.length) return 0;
  const days = new Set(records.map(r => localDate(new Date(r.createdAt))));
  let streak = 0;
  const cursor = new Date(now);
  // Allow streak starting today OR yesterday so morning check-in before logging doesn't wipe streak.
  if (!days.has(localDate(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (days.has(localDate(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function evaluateMissionRoutines(params: {
  vitals: VitalSigns;
  records: CheckIn[];
  completions: MissionCompletion[];
  assessments: ImageAssessmentRecord[];
  kpIndex: number;
  now?: Date;
}): ReadinessSummary {
  const { vitals, records, completions, assessments, kpIndex, now = new Date() } = params;
  const today = localDate(now);
  const hasTodayCheckIn = records.some(r => localDate(new Date(r.createdAt)) === today);
  const todayCompleted = new Set(completions.filter(c => c.date === today).map(c => c.missionId));
  const streakDays = computeCheckInStreak(records, now);

  const recentOcular = assessments.find(
    a => a.examType === 'ocular_ultrasound' && Date.now() - new Date(a.recordedAt).getTime() <= 7 * 86400_000,
  );
  const missionDay = vitals.mission_day ?? 14;
  const glucose = vitals.blood_glucose ?? 92;

  const prompts: ScheduledPrompt[] = [];

  if (kpIndex >= 5.5 || vitals.radiation_rate >= 30) {
    prompts.push({
      id: 'storm-shelter-check',
      priority: 'high',
      title: 'Solar Event Dermal & Shelter Check',
      detail: `Elevated radiation (${vitals.radiation_rate.toFixed(1)} uSv/h · Kp ${kpIndex.toFixed(1)}). Verify shelter quarters & inspect skin.`,
      actionLabel: 'Open Dermal Exam',
      targetPage: 'dashboard',
      targetExam: 'dermal_radiation',
    });
  }

  if (!hasTodayCheckIn) {
    prompts.push({
      id: 'daily-checkin',
      priority: 'high',
      title: 'Daily Health & Blood Sugar Check-In',
      detail: 'Log sleep, fatigue, mood, hydration, and capillary blood glucose for today.',
      actionLabel: 'Begin Check-In',
      targetPage: 'checkin',
    });
  }

  if (missionDay >= 15 && !recentOcular) {
    prompts.push({
      id: 'sans-ultrasound',
      priority: 'high',
      title: `Day ${missionDay} SANS Ocular Ultrasound Due`,
      detail: 'Capture closed-eyelid optic nerve sheath scan to monitor fluid-shift pressure.',
      actionLabel: 'Start Ocular Exam',
      targetPage: 'dashboard',
      targetExam: 'ocular_ultrasound',
    });
  }

  if ((vitals.gravity_g ?? 0) < 0.5 && !todayCompleted.has('physical-ared')) {
    prompts.push({
      id: 'ared-countermeasure',
      priority: 'routine',
      title: 'ARED Bone & Muscle Loading',
      detail: 'Counteract reduced gravity bone demineralization with daily resistive exercise.',
      actionLabel: 'Open Activities',
      targetPage: 'missions',
    });
  }

  if (glucose < 70 || glucose > 180) {
    prompts.push({
      id: 'glucometer-verify',
      priority: 'high',
      title: 'Capillary Glucose Verification',
      detail: `Live glucose ${glucose.toFixed(0)} mg/dL outside 70-180 mg/dL target band.`,
      actionLabel: 'Verify Glucometer',
      targetPage: 'dashboard',
      targetExam: 'glucometer_nutrition',
    });
  }

  if (!prompts.length) {
    prompts.push({
      id: 'pre-eva-review',
      priority: 'routine',
      title: 'Nominal Preventive Wellness Review',
      detail: 'Daily check-in & key protocols current. Review 7-day biometric & wellness trends.',
      actionLabel: 'View Trends',
      targetPage: 'analytics',
    });
  }

  const telemetryScore = vitals.overall_health_score ?? 88;
  const habitBonus = (hasTodayCheckIn ? 6 : 0) + Math.min(6, todayCompleted.size * 2) + (recentOcular ? 3 : 0);
  const readinessScore = Math.max(0, Math.min(100, Math.round(telemetryScore * 0.85 + habitBonus)));
  const xp = records.length * 40 + completions.length * 20 + assessments.length * 50 + streakDays * 15;

  const badges: CrewBadge[] = [
    { id: 'streak-3', label: 'Orbital Streak', earned: streakDays >= 2, requirement: '2+ consecutive check-in days' },
    { id: 'ared-pro', label: 'Bone Guardian', earned: todayCompleted.has('physical-ared'), requirement: 'Complete ARED workout today' },
    { id: 'sans-watch', label: 'SANS Vigilance', earned: Boolean(recentOcular), requirement: 'Log ocular ultrasound within 7d' },
    { id: 'hydrated', label: 'Metabolic Balance', earned: glucose >= 70 && glucose <= 160 && (vitals.hydration_pct ?? 96) >= 88, requirement: 'Maintain euglycemia & hydration' },
  ];

  return {
    readinessScore,
    streakDays,
    xp,
    badges,
    nextPrompt: prompts[0],
    prompts,
  };
}
