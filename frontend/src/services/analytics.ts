import type { CheckIn, TimeRange } from '../types/wellness';

export function recordsInRange(records: CheckIn[], range: TimeRange, now = new Date()): CheckIn[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (range === 'week') start.setDate(start.getDate() - 6);
  if (range === 'month') start.setDate(start.getDate() - 29);
  return records.filter(record => new Date(record.createdAt) >= start && new Date(record.createdAt) <= now)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
