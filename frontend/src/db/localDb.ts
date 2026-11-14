import Dexie, { type Table } from 'dexie';
import { VitalSigns, AlertItem } from '../types/telemetry';
import type { CheckIn, MissionCompletion } from '../types/wellness';

export interface OfflineVitalRecord extends VitalSigns {
  localId?: number;
  syncedToCloud: boolean;
}

export class SpaceTelemetryDB extends Dexie {
  vitalsQueue!: Table<OfflineVitalRecord, number>;
  alertsStore!: Table<AlertItem, string>;
  checkins!: Table<CheckIn, string>;
  missionCompletions!: Table<MissionCompletion, string>;

  constructor() {
    super('SpaceBiotelemetryDB');
    this.version(1).stores({
      vitalsQueue: '++localId, astronaut_id, timestamp, syncedToCloud',
      alertsStore: 'id, astronaut_id, timestamp, severity, acknowledged'
    });
    this.version(2).stores({
      checkins: 'id, astronautId, createdAt, syncStatus',
      missionCompletions: 'key, astronautId, date',
    });
  }
}

export const localDb = new SpaceTelemetryDB();

