import type { AssistantAction, AssistantReply, CheckIn, MissionCompletion, Page } from '../types/wellness';
import type { AlertItem, ImageAssessmentRecord, SelfExamType, VitalSigns } from '../types/telemetry';
import type { SpaceEnvironment } from '../types/spaceWellness';
import type { ReadinessSummary } from './missionRoutines';
import { askFlightAssistantApi } from './api';
import { localDate, missionCatalog, normalizeMissionId } from './missions';
import { durationLabel, sourceLabels } from './environment';

type AssistantRecord = Pick<
  CheckIn,
  'id' | 'astronautId' | 'createdAt' | 'sleepHours' | 'sleepQuality' | 'fatigue' | 'stress' | 'mood' | 'exerciseMinutes'
> & {
  spaceWellness?: {
    version: 1;
    pain?: { intensity?: number };
    mental?: NonNullable<CheckIn['spaceWellness']>['mental'];
    sleep?: NonNullable<CheckIn['spaceWellness']>['sleep'];
    environment?: SpaceEnvironment;
  };
  metabolic?: { bloodGlucoseMgDl?: number; hydrationMl?: number; nutritionQuality?: string };
};

export interface SevenDaySummary {
  checkinCount: number;
  avgSleepHours: number | null;
  avgStress: number | null;
  avgFatigue: number | null;
  totalExerciseMin: number;
  avgHydrationMl: number | null;
}

export interface AssistantAssessmentBrief {
  examType: SelfExamType;
  severity: string;
  recordedAt: string;
  groundConsultRequired: boolean;
}

export interface AssistantContext {
  astronautId: string;
  records: AssistantRecord[];
  alerts: AlertItem[];
  completions: MissionCompletion[];
  environment?: SpaceEnvironment;
  vitals?: VitalSigns;
  focusOrgan?: string;
  assessments?: AssistantAssessmentBrief[];
  readiness?: Pick<ReadinessSummary, 'readinessScore' | 'compliancePct' | 'verifiedCount' | 'totalProtocols'> & {
    pendingProtocols: string[];
  };
  sevenDaySummary?: SevenDaySummary;
}

export type AssistantMode = 'chat' | 'pre_eva_brief' | 'sbar_downlink';

export interface AssistantAskOptions {
  history?: { role: 'user' | 'assistant'; content: string }[];
  mode?: AssistantMode;
}

export interface AssistantService {
  ask(question: string, context: AssistantContext, options?: AssistantAskOptions): Promise<AssistantReply>;
}

function summarizeSevenDays(records: AssistantRecord[]): SevenDaySummary {
  const cutoff = Date.now() - 7 * 86400_000;
  const recent = records.filter(r => {
    const t = new Date(r.createdAt).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
  if (!recent.length) {
    return { checkinCount: 0, avgSleepHours: null, avgStress: null, avgFatigue: null, totalExerciseMin: 0, avgHydrationMl: null };
  }
  const avg = (nums: number[]) => (nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : null);
  const hyd = recent.flatMap(r => (r.metabolic?.hydrationMl !== undefined ? [r.metabolic.hydrationMl] : []));
  return {
    checkinCount: recent.length,
    avgSleepHours: avg(recent.map(r => r.sleepHours)),
    avgStress: avg(recent.map(r => r.stress)),
    avgFatigue: avg(recent.map(r => r.fatigue)),
    totalExerciseMin: recent.reduce((sum, r) => sum + (r.exerciseMinutes || 0), 0),
    avgHydrationMl: avg(hyd),
  };
}

// Explicit projection excludes symptoms, pain location, discomfort notes and all
// free-text reflections from assistant context payloads.
export function buildAssistantContext(
  astronautId: string,
  records: CheckIn[],
  alerts: AlertItem[],
  completions: MissionCompletion[],
  environment?: SpaceEnvironment,
  vitals?: VitalSigns,
  assessments?: ImageAssessmentRecord[],
  readiness?: ReadinessSummary,
  focusOrgan?: string,
): AssistantContext {
  const projectedRecords: AssistantRecord[] = records
    .filter(record => record.astronautId === astronautId)
    .map(record => {
      const { id, createdAt, sleepHours, sleepQuality, fatigue, stress, mood, exerciseMinutes, metabolic } = record;
      const extra = record.spaceWellness;
      const safeMetabolic = metabolic
        ? {
            ...(metabolic.bloodGlucoseMgDl !== undefined ? { bloodGlucoseMgDl: metabolic.bloodGlucoseMgDl } : {}),
            ...(metabolic.hydrationMl !== undefined ? { hydrationMl: metabolic.hydrationMl } : {}),
            ...(metabolic.nutritionQuality ? { nutritionQuality: metabolic.nutritionQuality } : {}),
          }
        : undefined;
      return {
        id,
        astronautId,
        createdAt,
        sleepHours,
        sleepQuality,
        fatigue,
        stress,
        mood,
        exerciseMinutes,
        ...(safeMetabolic && Object.keys(safeMetabolic).length ? { metabolic: safeMetabolic } : {}),
        ...(extra?.version === 1
          ? {
              spaceWellness: {
                version: 1 as const,
                ...(extra.pain?.intensity !== undefined ? { pain: { intensity: extra.pain.intensity } } : {}),
                mental: extra.mental,
                sleep: extra.sleep,
                environment: extra.environment?.astronautId === astronautId ? extra.environment : undefined,
              },
            }
          : {}),
      };
    });

  const projectedExams: AssistantAssessmentBrief[] | undefined = assessments
    ?.filter(item => item.astronautId === astronautId)
    .slice(0, 6)
    .map(item => ({
      examType: item.examType,
      severity: item.severity,
      recordedAt: item.recordedAt,
      groundConsultRequired: item.groundConsultRequired,
    }));

  const projectedReadiness = readiness
    ? {
        readinessScore: readiness.readinessScore,
        compliancePct: readiness.compliancePct,
        verifiedCount: readiness.verifiedCount,
        totalProtocols: readiness.totalProtocols,
        pendingProtocols: readiness.protocolStatuses.filter(p => !p.completed).map(p => p.mission.id),
      }
    : undefined;

  return {
    astronautId,
    records: projectedRecords,
    alerts: alerts.filter(alert => alert.astronaut_id === astronautId),
    completions: completions.filter(item => item.astronautId === astronautId),
    environment: environment?.astronautId === astronautId ? environment : undefined,
    vitals,
    focusOrgan,
    assessments: projectedExams,
    readiness: projectedReadiness,
    sevenDaySummary: summarizeSevenDays(projectedRecords),
  };
}

function buildSuggestedActions(question: string, context: AssistantContext, mode: AssistantMode): AssistantAction[] {
  const q = question.toLowerCase();
  const actions: AssistantAction[] = [];
  if (/eye|vision|sans|ultrasound|headache|neuro/.test(q)) {
    actions.push({ label: 'Start Ocular Ultrasound', targetPage: 'dashboard', targetExam: 'ocular_ultrasound' });
  }
  if (/radiat|storm|solar|kp|skin|rash|dermal|immune/.test(q)) {
    actions.push({ label: 'Open Dermal Exam', targetPage: 'dashboard', targetExam: 'dermal_radiation' });
  }
  if (/glucose|sugar|metabolic|nutrition|hydrat/.test(q)) {
    actions.push({ label: 'Verify Glucometer', targetPage: 'dashboard', targetExam: 'glucometer_nutrition' });
  }
  const hasTodayRecord = context.records.some(r => localDate(new Date(r.createdAt)) === localDate());
  if (!hasTodayRecord || /check.?in|log/.test(q)) {
    actions.push({ label: 'Complete Check-In', targetPage: 'checkin' });
  }
  if (mode === 'pre_eva_brief' || /trend|week|history|sleep|stress/.test(q)) {
    actions.push({ label: 'View Health Trends', targetPage: 'analytics' });
  }
  actions.push({ label: 'Open Countermeasures', targetPage: 'missions' });
  return actions.slice(0, 3);
}

export const demoAssistant: AssistantService = {
  async ask(question, context, options = {}) {
    if (!navigator.onLine) {
      throw new Error('You’re offline. AI assistant is unavailable. Your saved records and countermeasures remain accessible.');
    }
    if (!context.astronautId) throw new Error('Choose an astronaut before asking about saved records.');

    const mode = options.mode ?? 'chat';
    const effectiveQuery =
      options.history?.length && question.trim().split(/\s+/).length <= 5
        ? `${question} ${options.history.slice(-2).map(h => h.content).join(' ')}`
        : question;

    const records = context.records
      .filter(record => record.astronautId === context.astronautId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const latest = records[0];
    const alert = context.alerts
      .filter(item => item.astronaut_id === context.astronautId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
    const activityIds = new Set(missionCatalog.map(item => item.id));
    const completed = context.readiness
      ? context.readiness.verifiedCount
      : new Set(
          context.completions
            .filter(item => item.astronautId === context.astronautId && item.date === localDate())
            .map(item => normalizeMissionId(item.missionId))
            .filter(id => activityIds.has(id)),
        ).size;

    const suggestedActions = buildSuggestedActions(effectiveQuery, context, mode);

    if (mode === 'pre_eva_brief') {
      const v = context.vitals;
      const spo2 = v?.spo2 ?? 98.5;
      const rad = v?.radiation_rate ?? 14.0;
      const glu = latest?.metabolic?.bloodGlucoseMgDl ?? v?.blood_glucose ?? 92;
      const openAlerts = context.alerts.filter(a => !a.acknowledged);
      const holdReasons: string[] = [];
      const cautionReasons: string[] = [];
      if (spo2 < 93) holdReasons.push(`SpO2 ${spo2.toFixed(1)}% (<93%)`);
      if (rad >= 45) holdReasons.push(`Radiation ${rad.toFixed(1)} uSv/h`);
      if (glu < 65 || glu > 220) holdReasons.push(`Glucose ${glu.toFixed(0)} mg/dL`);
      if (openAlerts.some(a => a.severity === 'CRITICAL')) holdReasons.push('Critical alert unacknowledged');
      if (!holdReasons.length) {
        if (latest && latest.sleepHours < 6) cautionReasons.push(`Sleep ${latest.sleepHours}h (<6h)`);
        if (rad >= 25) cautionReasons.push(`Elevated radiation ${rad.toFixed(1)} uSv/h`);
        if (context.readiness && context.readiness.pendingProtocols.length) {
          cautionReasons.push(`${context.readiness.pendingProtocols.length} countermeasure(s) due`);
        }
      }
      const gate = holdReasons.length ? 'HOLD / DEFER EVA' : cautionReasons.length ? 'CAUTION — VERIFY' : 'GO (PRELIMINARY)';
      return {
        facts: `Pre-EVA Readiness Gate: ${gate}. ${[...holdReasons, ...cautionReasons].join(', ') || 'Recorded vitals, hydration, and radiation fall within preliminary pre-EVA envelopes.'}`,
        explanation: 'Evaluated from live/simulated telemetry, open alerts, and saved check-in metrics. This prototype does not replace official Flight Surgeon EVA sign-off.',
        action: 'Verify suit O2 purge, 300-500 mL pre-EVA electrolyte intake, and pending countermeasures before airlock depress.',
        suggestedActions,
      };
    }

    if (mode === 'sbar_downlink') {
      const s7 = context.sevenDaySummary ?? summarizeSevenDays(records);
      const openAlerts = context.alerts.filter(a => !a.acknowledged);
      const v = context.vitals;
      const sbarText = [
        `S (Situation): ${context.astronautId} crew medical status brief (${v?.mission_zone ?? 'LEO_ISS'}, Day ${v?.mission_day ?? 14}).`,
        `B (Background): Live HR ${v?.heart_rate ?? '--'} bpm, SpO2 ${v?.spo2 ?? '--'}%, Temp ${v?.core_temp ?? '--'} C, Rad ${v?.radiation_rate ?? '--'} uSv/h; 7d check-ins: ${s7.checkinCount} (avg sleep ${s7.avgSleepHours ?? '--'}h).`,
        `A (Assessment): Open alerts: ${openAlerts.length ? openAlerts.map(a => `${a.severity}:${a.alert_type}`).join(', ') : 'None'}. Compliance: ${context.readiness?.compliancePct ?? Math.round((completed / missionCatalog.length) * 100)}%.`,
        `R (Recommendation): Continue mission countermeasures; review flagged metrics with Flight Surgeon at next pass.`,
      ].join('\n');
      return {
        facts: `Generated asynchronous Ground Flight Surgeon SBAR downlink for ${context.astronautId} using non-private records only.`,
        explanation: 'Private symptoms, pain locations, and free-text reflections remain excluded from this downlink summary.',
        action: 'Copy the SBAR brief below or attach a guided Self-Exam finding before transmission.',
        suggestedActions,
        sbarText,
      };
    }

    const sleep = /sleep/i.test(effectiveQuery);
    const observation = /flag|observation|notification|alert/i.test(effectiveQuery);
    const activity = /activit|mission|wellness|countermeasure|protocol|complian/i.test(effectiveQuery);
    const pain = /pain|discomfort/i.test(effectiveQuery);
    const mental = /isolat|connect|emotion|mental/i.test(effectiveQuery);
    const timing = /schedule|bedtime|circadian/i.test(effectiveQuery);
    const environmental = /radiat|cabin|microgravity|gravity|space.weather|environment|mission duration/i.test(effectiveQuery);
    const extraRecords = records.filter(record => record.spaceWellness?.version === 1);
    const painRecord = extraRecords.find(record => record.spaceWellness?.pain?.intensity !== undefined);
    const mentalRecord = extraRecords.find(
      record => record.spaceWellness?.mental && Object.values(record.spaceWellness.mental).some(value => value !== undefined),
    );
    const sleepRecord = extraRecords.find(record => record.spaceWellness?.sleep);
    const savedEnvironment = extraRecords.find(
      record => record.spaceWellness?.environment?.astronautId === context.astronautId,
    )?.spaceWellness?.environment;
    const environment = context.environment?.astronautId === context.astronautId ? context.environment : savedEnvironment;

    let facts: string;
    if (environmental) {
      if (!environment) facts = 'No environment context is available for the selected astronaut.';
      else if (/radiat/i.test(effectiveQuery))
        facts =
          environment.radiationRate.value === null
            ? 'No environmental radiation reading is available.'
            : `${sourceLabels[environment.radiationRate.source]}: environmental radiation rate ${environment.radiationRate.value} μSv/h, recorded ${environment.radiationRate.recordedAt ?? environment.capturedAt}. This is not a personal radiation dose.`;
      else if (/cabin/i.test(effectiveQuery))
        facts =
          environment.cabinOxygen.value === null
            ? 'No cabin oxygen information is available. Blood oxygen is a separate measurement.'
            : `${sourceLabels[environment.cabinOxygen.source]}: cabin oxygen ${environment.cabinOxygen.value}%. This is separate from blood oxygen.`;
      else if (/space.weather/i.test(effectiveQuery)) {
        facts =
          environment.spaceWeather.value === null
            ? 'Live space-weather status is unavailable. No live feed is connected.'
            : `${sourceLabels[environment.spaceWeather.source]}: ${environment.spaceWeather.value}${environment.spaceWeather.recordedAt ? ` (updated ${environment.spaceWeather.recordedAt})` : ''}.`;
      } else {
        facts = `${environment.gravity.value ?? 'Gravity scenario is not configured.'} ${environment.microgravityHours.value === null ? 'Time in microgravity is unavailable for this scenario.' : `Scenario-assumed time in microgravity: ${durationLabel(environment.microgravityHours.value)}, derived from a manually entered start.`} Your ${records.length} saved check-in(s) record ${records.reduce((sum, record) => sum + record.exerciseMinutes, 0)} completed exercise minutes.`;
      }
    } else if (pain) {
      facts = painRecord
        ? `On ${new Date(painRecord.createdAt).toLocaleString()}, you recorded pain intensity ${painRecord.spaceWellness!.pain!.intensity}/10${painRecord.spaceWellness!.pain!.intensity === 0 ? ' (no pain)' : ''}. Private location and discomfort notes are not included in assistant context.`
        : 'No pain intensity is recorded for this astronaut. Missing data does not mean no pain.';
    } else if (mental) {
      const value = mentalRecord?.spaceWellness?.mental;
      facts = value
        ? `On ${new Date(mentalRecord!.createdAt).toLocaleString()}, your self-reports were: isolation ${value.isolation === undefined ? 'not recorded' : `${value.isolation}/5 (1 not at all, 5 very much)`}; connection ${value.socialConnection === undefined ? 'not recorded' : `${value.socialConnection}/5 (1 not connected, 5 very connected)`}; emotional well-being ${value.emotionalWellbeing === undefined ? 'not recorded' : `${value.emotionalWellbeing}/5 (1 very low, 5 very good)`}.`
        : 'No optional connection or emotional well-being ratings are recorded for this astronaut.';
    } else if (timing) {
      facts = sleepRecord
        ? `Recorded UTC sleep window: ${sleepRecord.spaceWellness!.sleep!.startUtc} to ${sleepRecord.spaceWellness!.sleep!.wakeUtc}, ${sleepRecord.spaceWellness!.sleep!.windowMinutes} elapsed minutes. This is not a measurement of time asleep.`
        : 'No optional UTC sleep times are recorded for this astronaut.';
    } else if (observation) {
      facts = alert
        ? `The recorded ${alert.severity.toLowerCase()} notification says: “${alert.message}” (${new Date(alert.timestamp).toLocaleString()}).`
        : 'No saved notifications are available for the selected astronaut.';
    } else if (activity) {
      facts = `You have completed ${completed} of ${missionCatalog.length} countermeasures saved on this device today (${Math.round((completed / missionCatalog.length) * 100)}% compliance).`;
    } else if (latest) {
      facts = `You have ${records.length} locally saved check-in(s). On ${new Date(latest.createdAt).toLocaleString()}, you recorded ${latest.sleepHours} hours of sleep, sleep quality ${latest.sleepQuality}/5${sleep ? '.' : `, mood ${latest.mood.toLowerCase()}, tiredness ${latest.fatigue}/5 and stress ${latest.stress}/5.`}`;
    } else {
      facts = 'There are no saved health check-ins for this astronaut yet.';
    }

    return {
      facts,
      explanation: environmental
        ? 'Source labels describe provenance, not safety. An environmental sensor cannot establish personal radiation dose, and this demo does not calculate muscle or bone loss.'
        : pain || mental
          ? 'These are optional self-reports, not a diagnosis or a clinical assessment.'
          : timing || sleep
            ? 'Sleep entries are self-reported. Timing alone cannot diagnose circadian disruption.'
            : observation
              ? 'This demo can quote a saved notification but cannot tell you its medical cause. Measurements are simulated.'
              : 'This demo explains only what you recorded. It cannot diagnose a condition or tell us why something changed.',
      action: observation
        ? 'Review the original notification with your mission medical team using approved procedures.'
        : 'Review My Health Trends, complete Countermeasures, or record an entry in Check-In.',
      suggestedActions,
    };
  },
};

function mapApiAction(raw: { label: string; target_page: string; target_exam?: string | null; protocol_id?: string | null }): AssistantAction {
  const validPages: Page[] = ['dashboard', 'checkin', 'analytics', 'missions', 'ai'];
  const targetPage = validPages.includes(raw.target_page as Page) ? (raw.target_page as Page) : 'missions';
  const validExams: SelfExamType[] = ['ocular_ultrasound', 'dermal_radiation', 'glucometer_nutrition'];
  const targetExam = raw.target_exam && validExams.includes(raw.target_exam as SelfExamType) ? (raw.target_exam as SelfExamType) : undefined;
  return {
    label: raw.label,
    targetPage,
    ...(targetExam ? { targetExam } : {}),
    ...(raw.protocol_id ? { protocolId: raw.protocol_id } : {}),
  };
}

const AI_CLIENT_CACHE_TTL_MS = 30_000;
const AI_CLIENT_CACHE_MAX_ENTRIES = 32;
const aiResponseCache = new Map<string, { expiresAt: number; answer: AssistantReply }>();
const aiInFlightRequests = new Map<string, Promise<AssistantReply>>();

function buildAssistantCacheKey(
  trimmedQuestion: string,
  context: AssistantContext,
  mode: AssistantMode,
  history: { role: string; content: string }[] | undefined,
): string {
  const latest = context.records[0];
  const recentHistory = (history ?? [])
    .slice(-2)
    .map((turn) => `${turn.role}:${turn.content.trim().toLowerCase()}`)
    .join('|');
  return JSON.stringify([
    context.astronautId,
    mode,
    trimmedQuestion.toLowerCase(),
    latest?.id ?? '',
    latest?.createdAt ?? '',
    context.vitals?.heart_rate ?? '',
    context.vitals?.spo2 ?? '',
    context.vitals?.radiation_rate ?? '',
    context.focusOrgan ?? '',
    context.readiness?.readinessScore ?? '',
    context.readiness?.compliancePct ?? '',
    context.alerts.filter((alert) => !alert.acknowledged).length,
    recentHistory,
  ]);
}

function getCachedAssistantAnswer(cacheKey: string): AssistantReply | null {
  const entry = aiResponseCache.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    aiResponseCache.delete(cacheKey);
    return null;
  }
  return entry.answer;
}

function setCachedAssistantAnswer(cacheKey: string, answer: AssistantReply): void {
  const now = Date.now();
  for (const [key, entry] of aiResponseCache.entries()) {
    if (entry.expiresAt <= now) aiResponseCache.delete(key);
  }
  while (aiResponseCache.size >= AI_CLIENT_CACHE_MAX_ENTRIES) {
    const oldestKey = aiResponseCache.keys().next().value;
    if (!oldestKey) break;
    aiResponseCache.delete(oldestKey);
  }
  aiResponseCache.set(cacheKey, { expiresAt: now + AI_CLIENT_CACHE_TTL_MS, answer });
}

export const flightAssistant: AssistantService = {
  async ask(question, context, options = {}) {
    const trimmed = question.trim();
    if (!trimmed) throw new Error('Enter a question first.');
    if (!context.astronautId) throw new Error('Choose an astronaut before asking about saved records.');
    const latest = context.records[0];
    const mode = options.mode ?? 'chat';
    const cacheKey = buildAssistantCacheKey(trimmed, context, mode, options.history);

    const cached = getCachedAssistantAnswer(cacheKey);
    if (cached) return cached;

    const existingFlight = aiInFlightRequests.get(cacheKey);
    if (existingFlight) return existingFlight;

    const run = (async (): Promise<AssistantReply> => {
      try {
        const moodScale = ['Very low', 'Low', 'Okay', 'Good', 'Great'].indexOf(latest?.mood ?? '') + 1;
        const kpMatch = context.environment?.spaceWeather.value?.match(/Kp\s*([\d.]+)/i);
        const s7 = context.sevenDaySummary;
        const res = await askFlightAssistantApi(
          trimmed,
          {
            astronaut_id: context.astronautId,
            mission_zone: context.vitals?.mission_zone,
            mission_day: context.vitals?.mission_day,
            comms_latency_sec: context.vitals?.comms_latency_sec,
            heart_rate: context.vitals?.heart_rate,
            spo2: context.vitals?.spo2,
            core_temp: context.vitals?.core_temp,
            blood_glucose: latest?.metabolic?.bloodGlucoseMgDl ?? context.vitals?.blood_glucose,
            radiation_rate: context.vitals?.radiation_rate,
            kp_index: kpMatch ? Number(kpMatch[1]) : undefined,
            mood: moodScale > 0 ? moodScale : undefined,
            energy: latest ? Math.max(1, 6 - latest.fatigue) : undefined,
            stress: latest?.stress,
            sleep_hours: latest?.sleepHours,
            pain_level: latest?.spaceWellness?.pain?.intensity,
            hydration_ml: latest?.metabolic?.hydrationMl,
            nutrition_quality: latest?.metabolic?.nutritionQuality,
            focus_organ: context.focusOrgan,
            readiness_score: context.readiness?.readinessScore,
            compliance_pct: context.readiness?.compliancePct,
            pending_protocols: context.readiness?.pendingProtocols ?? [],
            active_alerts: context.alerts
              .filter(a => !a.acknowledged)
              .slice(0, 5)
              .map(a => ({ alert_type: a.alert_type, severity: a.severity, trigger_metric: a.trigger_metric ?? '' })),
            recent_exams: (context.assessments ?? []).slice(0, 3).map(e => ({
              exam_type: e.examType,
              severity: e.severity,
              recorded_at: e.recordedAt,
              ground_consult_required: e.groundConsultRequired,
            })),
            seven_day_summary: s7
              ? {
                  checkin_count: s7.checkinCount,
                  avg_sleep_hours: s7.avgSleepHours,
                  avg_stress: s7.avgStress,
                  avg_fatigue: s7.avgFatigue,
                  total_exercise_min: s7.totalExerciseMin,
                  avg_hydration_ml: s7.avgHydrationMl,
                }
              : undefined,
          },
          {
            history: options.history,
            mode,
          },
        );
        const answer: AssistantReply = {
          facts: res.summary,
          explanation: res.actions.join(' '),
          action: `Escalate when: ${res.escalate_when}`,
          sourceLabel: undefined,
          nasaReference: res.nasa_reference,
          escalate: res.escalate_when,
          suggestedActions: res.suggested_actions?.length
            ? res.suggested_actions.map(mapApiAction)
            : buildSuggestedActions(trimmed, context, mode),
          sbarText: res.sbar_text ?? undefined,
        };
        if (res.source === 'gemini') {
          setCachedAssistantAnswer(cacheKey, answer);
        }
        return answer;
      } catch {
        const fallback = await demoAssistant.ask(trimmed, context, options);
        return { ...fallback, sourceLabel: 'Onboard Demo Fallback' };
      }
    })();

    aiInFlightRequests.set(cacheKey, run);
    try {
      return await run;
    } finally {
      aiInFlightRequests.delete(cacheKey);
    }
  },
};
