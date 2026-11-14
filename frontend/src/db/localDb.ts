import Dexie, { type Table } from 'dexie';
import { VitalSigns, AlertItem } from '../types/telemetry';

export interface OfflineVitalRecord extends VitalSigns {
  localId?: number;
  syncedToCloud: boolean;
}

export class SpaceTelemetryDB extends Dexie {
  vitalsQueue!: Table<OfflineVitalRecord, number>;
  alertsStore!: Table<AlertItem, string>;

  constructor() {
    super('SpaceBiotelemetryDB');
    this.version(1).stores({
      vitalsQueue: '++localId, astronaut_id, timestamp, syncedToCloud',
      alertsStore: 'id, astronaut_id, timestamp, severity, acknowledged'
    });
  }
}

export const localDb = new SpaceTelemetryDB();

