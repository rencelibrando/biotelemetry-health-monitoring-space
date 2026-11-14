export interface SleepTiming { startUtc: string; wakeUtc: string; timeBasis: 'UTC'; windowMinutes: number }
// datetime-local fields are explicitly UTC wall time in this prototype. Do not
// let Date.parse interpret them using the browser's local zone or DST rules.
export function parseUtcInput(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const result = Date.UTC(year, month - 1, day, hour, minute);
  const date = new Date(result);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? result : null;
}
export function sleepTiming(start: string, wake: string): SleepTiming | null {
  const first = parseUtcInput(start), last = parseUtcInput(wake);
  if (first === null || last === null || last <= first || last - first > 24 * 60 * 60 * 1000) return null;
  return { startUtc: new Date(first).toISOString(), wakeUtc: new Date(last).toISOString(), timeBasis: 'UTC', windowMinutes: (last - first) / 60000 };
}
export const utcClockMinutes = (iso: string) => { const date = new Date(iso); return date.getUTCHours() * 60 + date.getUTCMinutes(); };
export function averageBedtimeShift(timings: SleepTiming[]): number | null {
  if (timings.length < 2) return null;
  const sorted = [...timings].sort((a, b) => a.startUtc.localeCompare(b.startUtc));
  const differences = sorted.slice(1).map((entry, index) => { const delta = Math.abs(utcClockMinutes(entry.startUtc) - utcClockMinutes(sorted[index].startUtc)); return Math.min(delta, 1440 - delta); });
  return differences.reduce((sum, value) => sum + value, 0) / differences.length;
}
