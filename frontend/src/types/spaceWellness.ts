import type { VitalSigns } from './telemetry';

export type EnvironmentSource = 'measured' | 'simulated' | 'manual' | 'unavailable';
export interface EnvironmentDatum<T> { value: T | null; source: EnvironmentSource; detail: string; recordedAt?: string }
export type MissionScenario = 'unconfigured' | 'orbital-demo' | 'surface-demo' | 'ground-demo';
export interface EnvironmentSettings { version: 1; scenario: MissionScenario; missionStartUtc: string; cabinOxygenPercent: string }
export interface SpaceEnvironment {
  version: 1; astronautId: string; capturedAt: string;
  cabinOxygen: EnvironmentDatum<number>; radiationRate: EnvironmentDatum<number>;
  missionDurationHours: EnvironmentDatum<number>; gravity: EnvironmentDatum<string>;
  microgravityHours: EnvironmentDatum<number>; spaceWeather: EnvironmentDatum<string>;
  scenario: MissionScenario;
}
export interface SpaceWellnessV1 {
  version: 1; mode: 'local-demo';
  pain?: { intensity?: number; location?: string; notes?: string };
  mental?: { isolation?: number; socialConnection?: number; emotionalWellbeing?: number };
  sleep?: { startUtc: string; wakeUtc: string; timeBasis: 'UTC'; windowMinutes: number };
  environment?: SpaceEnvironment;
}
export interface SpaceDraftFields {
  painIntensity: string; painLocation: string; painNotes: string;
  isolation: string; socialConnection: string; emotionalWellbeing: string;
  sleepStartUtc: string; wakeUtc: string;
}
export const emptySpaceDraft = (): SpaceDraftFields => ({ painIntensity: '', painLocation: '', painNotes: '', isolation: '', socialConnection: '', emotionalWellbeing: '', sleepStartUtc: '', wakeUtc: '' });
export type EnvironmentTelemetry = Pick<VitalSigns, 'astronaut_id' | 'timestamp' | 'radiation_rate'>;
