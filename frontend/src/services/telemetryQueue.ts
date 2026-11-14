import { localDb } from '../db/localDb';
import type { VitalSigns } from '../types/telemetry';
import type { SyncReceipt } from './api';

export type BatchSender = (astronautId: string, records: VitalSigns[]) => Promise<SyncReceipt>;
export async function sendQueuedTelemetry(astronautId: string, send: BatchSender): Promise<string> {
  const records = await localDb.vitalsQueue.filter(item => !item.syncedToCloud && item.astronaut_id === astronautId).toArray();
  if (!records.length) return 'No queued telemetry for the selected astronaut.';
  const receipt = await send(astronautId, records);
  if (receipt.status !== 'SUCCESS' || receipt.synced_count !== records.length || receipt.astronaut_id !== astronautId) {
    throw new Error('Incomplete server receipt. All local records were retained.');
  }
  // The existing API also returns SUCCESS after failed durable writes. Its
  // receipt is insufficient for deletion until the backend contract is extended.
  if (receipt.persisted !== true) return 'Server received this batch; durable persistence is unconfirmed. Local records remain pending. Avoid repeated uploads.';
  await localDb.vitalsQueue.bulkDelete(records.flatMap(record => record.localId === undefined ? [] : [record.localId]));
  return 'The server confirmed persistence of this telemetry batch.';
}
