import type { AssistantReply, CheckIn, MissionCompletion } from '../types/wellness';
import type { AlertItem } from '../types/telemetry';
import type { SpaceEnvironment } from '../types/spaceWellness';
import { localDate, missionCatalog } from './missions';
import { durationLabel, sourceLabels } from './environment';

type AssistantRecord = Pick<CheckIn, 'id' | 'astronautId' | 'createdAt' | 'sleepHours' | 'sleepQuality' | 'fatigue' | 'stress' | 'mood' | 'exerciseMinutes'> & {
  spaceWellness?: { version: 1; pain?: { intensity?: number }; mental?: NonNullable<CheckIn['spaceWellness']>['mental']; sleep?: NonNullable<CheckIn['spaceWellness']>['sleep']; environment?: SpaceEnvironment };
};
export interface AssistantContext { astronautId: string; records: AssistantRecord[]; alerts: AlertItem[]; completions: MissionCompletion[]; environment?: SpaceEnvironment }
export interface AssistantService { ask(question: string, context: AssistantContext): Promise<AssistantReply> }
// Explicit projection excludes symptoms, pain location, discomfort notes and all
// personal reflections. This demo sends nothing to any AI provider.
export function buildAssistantContext(astronautId: string, records: CheckIn[], alerts: AlertItem[], completions: MissionCompletion[], environment?: SpaceEnvironment): AssistantContext {
  return { astronautId, records: records.filter(record => record.astronautId === astronautId).map(record => {
    const { id, createdAt, sleepHours, sleepQuality, fatigue, stress, mood, exerciseMinutes } = record;
    const extra = record.spaceWellness;
    return { id, astronautId, createdAt, sleepHours, sleepQuality, fatigue, stress, mood, exerciseMinutes, ...(extra?.version === 1 ? { spaceWellness: { version: 1 as const, ...(extra.pain?.intensity !== undefined ? { pain: { intensity: extra.pain.intensity } } : {}), mental: extra.mental, sleep: extra.sleep, environment: extra.environment?.astronautId === astronautId ? extra.environment : undefined } } : {}) };
  }), alerts: alerts.filter(alert => alert.astronaut_id === astronautId), completions: completions.filter(item => item.astronautId === astronautId), environment: environment?.astronautId === astronautId ? environment : undefined };
}
export const demoAssistant: AssistantService = {
  async ask(question, context) {
    if (!navigator.onLine) throw new Error('You’re offline. Gemini is unavailable. Your saved records and activities remain accessible.');
    if (!context.astronautId) throw new Error('Choose an astronaut before asking about saved records.');
    const records = context.records.filter(record => record.astronautId === context.astronautId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const latest = records[0];
    const alert = context.alerts.filter(item => item.astronaut_id === context.astronautId).sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
    const activityIds = new Set(missionCatalog.map(item => item.id));
    const completed = new Set(context.completions.filter(item => item.astronautId === context.astronautId && item.date === localDate() && activityIds.has(item.missionId)).map(item => item.missionId)).size;
    const sleep = /sleep/i.test(question);
    const observation = /flag|observation|notification/i.test(question);
    const activity = /activit|mission|wellness/i.test(question);
    const pain = /pain|discomfort/i.test(question);
    const mental = /isolat|connect|emotion|mental/i.test(question);
    const timing = /schedule|bedtime|circadian/i.test(question);
    const environmental = /radiat|cabin|microgravity|gravity|space.weather|environment|mission duration/i.test(question);
    const extraRecords = records.filter(record => record.spaceWellness?.version === 1);
    const painRecord = extraRecords.find(record => record.spaceWellness?.pain?.intensity !== undefined);
    const mentalRecord = extraRecords.find(record => record.spaceWellness?.mental && Object.values(record.spaceWellness.mental).some(value => value !== undefined));
    const sleepRecord = extraRecords.find(record => record.spaceWellness?.sleep);
    const savedEnvironment = extraRecords.find(record => record.spaceWellness?.environment?.astronautId === context.astronautId)?.spaceWellness?.environment;
    const environment = context.environment?.astronautId === context.astronautId ? context.environment : savedEnvironment;
    let facts: string;
    if (environmental) {
      if (!environment) facts = 'No environment context is available for the selected astronaut.';
      else if (/radiat/i.test(question)) facts = environment.radiationRate.value === null ? 'No environmental radiation reading is available.' : `${sourceLabels[environment.radiationRate.source]}: environmental radiation rate ${environment.radiationRate.value} μSv/h, recorded ${environment.radiationRate.recordedAt ?? environment.capturedAt}. This is not a personal radiation dose.`;
      else if (/cabin/i.test(question)) facts = environment.cabinOxygen.value === null ? 'No cabin oxygen information is available. Blood oxygen is a separate measurement.' : `${sourceLabels[environment.cabinOxygen.source]}: cabin oxygen ${environment.cabinOxygen.value}%. This is separate from blood oxygen.`;
      else if (/space.weather/i.test(question)) facts = 'Live space-weather status is unavailable. No live feed is connected.';
      else facts = `${environment.gravity.value ?? 'Gravity scenario is not configured.'} ${environment.microgravityHours.value === null ? 'Time in microgravity is unavailable for this scenario.' : `Scenario-assumed time in microgravity: ${durationLabel(environment.microgravityHours.value)}, derived from a manually entered start.`} Your ${records.length} saved check-in(s) record ${records.reduce((sum, record) => sum + record.exerciseMinutes, 0)} completed exercise minutes.`;
    } else if (pain) facts = painRecord ? `On ${new Date(painRecord.createdAt).toLocaleString()}, you recorded pain intensity ${painRecord.spaceWellness!.pain!.intensity}/10${painRecord.spaceWellness!.pain!.intensity === 0 ? ' (no pain)' : ''}. Private location and discomfort notes are not included in assistant context.` : 'No pain intensity is recorded for this astronaut. Missing data does not mean no pain.';
    else if (mental) {
      const value = mentalRecord?.spaceWellness?.mental;
      facts = value ? `On ${new Date(mentalRecord!.createdAt).toLocaleString()}, your self-reports were: isolation ${value.isolation === undefined ? 'not recorded' : `${value.isolation}/5 (1 not at all, 5 very much)`}; connection ${value.socialConnection === undefined ? 'not recorded' : `${value.socialConnection}/5 (1 not connected, 5 very connected)`}; emotional well-being ${value.emotionalWellbeing === undefined ? 'not recorded' : `${value.emotionalWellbeing}/5 (1 very low, 5 very good)`}.` : 'No optional connection or emotional well-being ratings are recorded for this astronaut.';
    } else if (timing) facts = sleepRecord ? `Recorded UTC sleep window: ${sleepRecord.spaceWellness!.sleep!.startUtc} to ${sleepRecord.spaceWellness!.sleep!.wakeUtc}, ${sleepRecord.spaceWellness!.sleep!.windowMinutes} elapsed minutes. This is not a measurement of time asleep.` : 'No optional UTC sleep times are recorded for this astronaut.';
    else facts = observation ? (alert ? `The recorded ${alert.severity.toLowerCase()} notification says: “${alert.message}” (${new Date(alert.timestamp).toLocaleString()}).` : 'No saved notifications are available for the selected astronaut.')
      : activity ? `You have completed ${completed} of ${missionCatalog.length} activities saved on this device today.`
      : latest ? `You have ${records.length} locally saved check-in(s). On ${new Date(latest.createdAt).toLocaleString()}, you recorded ${latest.sleepHours} hours of sleep, sleep quality ${latest.sleepQuality}/5${sleep ? '.' : `, mood ${latest.mood.toLowerCase()}, tiredness ${latest.fatigue}/5 and stress ${latest.stress}/5.`}`
      : 'There are no saved health check-ins for this astronaut yet.';
    return { facts, explanation: environmental ? 'Source labels describe provenance, not safety. An environmental sensor cannot establish personal radiation dose, and this demo does not calculate muscle or bone loss.' : pain || mental ? 'These are optional self-reports, not a diagnosis or a clinical assessment.' : timing || sleep ? 'Sleep entries are self-reported. Timing alone cannot diagnose circadian disruption.' : observation ? 'This demo can quote a saved notification but cannot tell you its medical cause. Measurements are simulated.' : 'This demo explains only what you recorded. It cannot diagnose a condition or tell us why something changed.', action: observation ? 'Review the original notification with your mission medical team using approved procedures.' : 'Review My Health Trends or record an entry in Check-In. Follow your mission-approved procedures.' };
  },
};
