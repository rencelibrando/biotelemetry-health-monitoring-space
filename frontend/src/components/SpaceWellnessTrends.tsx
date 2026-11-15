import type { CheckIn } from '../types/wellness';
import { averageBedtimeShift, utcClockMinutes, type SleepTiming } from '../services/sleepTiming';
import { EmptyState } from './AppShell';
import { TrendChart } from './TrendChart';
import { EnvironmentReadings } from './SpaceEnvironment';

const clock = (value: string) =>
  new Date(value).toLocaleTimeString(undefined, { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false });

export function SleepScheduleChart({ timings }: { timings: SleepTiming[] }) {
  const shift = averageBedtimeShift(timings);
  if (!timings.length) {
    return (
      <EmptyState title="No sleep times recorded">
        Optional UTC sleep and wake times will appear here after you save a check-in.
      </EmptyState>
    );
  }
  return (
    <section aria-label="Recorded UTC sleep schedules">
      <p className="helper">
        {shift === null
          ? 'Save a second timed entry to compare bedtimes.'
          : `Average difference between consecutive recorded bedtimes: ${shift.toFixed(0)} minutes (shortest clock difference). This describes the records, not a diagnosis.`}
      </p>
      <div className="sleep-axis">
        <span>00:00 UTC</span>
        <span>12:00</span>
        <span>24:00</span>
      </div>
      {[...timings]
        .sort((a, b) => a.startUtc.localeCompare(b.startUtc))
        .map((timing, index) => {
          const start = utcClockMinutes(timing.startUtc);
          const end = start + timing.windowMinutes;
          const nextDay = timing.wakeUtc.slice(0, 10) !== timing.startUtc.slice(0, 10);
          return (
            <div className="sleep-schedule-row" key={index}>
              <p>
                <strong>{timing.startUtc.slice(0, 10)}</strong>
                <span>
                  {clock(timing.startUtc)} → {clock(timing.wakeUtc)}
                  {nextDay ? ' (next day)' : ''} · {(timing.windowMinutes / 60).toFixed(2)} h window
                </span>
              </p>
              <div
                className="sleep-track"
                role="img"
                aria-label={`UTC sleep window from ${timing.startUtc} to ${timing.wakeUtc}, ${timing.windowMinutes} minutes`}
              >
                <span
                  style={{
                    left: `${(start / 1440) * 100}%`,
                    width: `${(Math.min(timing.windowMinutes, 1440 - start) / 1440) * 100}%`,
                  }}
                />
                {end > 1440 && <span style={{ left: 0, width: `${((end - 1440) / 1440) * 100}%` }} />}
              </div>
            </div>
          );
        })}
    </section>
  );
}

export function SpaceRecordDetails({ record }: { record: CheckIn }) {
  const extra = record.spaceWellness;
  if (!extra || extra.version !== 1) return null;
  return (
    <div className="optional-record-details">
      <dl className="review-grid">
        <div>
          <dt>Pain intensity</dt>
          <dd>{extra.pain?.intensity !== undefined ? `${extra.pain.intensity}/10${extra.pain.intensity === 0 ? ' · no pain' : ''}` : 'Not recorded'}</dd>
        </div>
        <div>
          <dt>Feeling isolated</dt>
          <dd>{extra.mental?.isolation !== undefined ? `${extra.mental.isolation}/5` : 'Not recorded'}</dd>
        </div>
        <div>
          <dt>Social connection</dt>
          <dd>{extra.mental?.socialConnection !== undefined ? `${extra.mental.socialConnection}/5` : 'Not recorded'}</dd>
        </div>
        <div>
          <dt>Emotional well-being</dt>
          <dd>{extra.mental?.emotionalWellbeing !== undefined ? `${extra.mental.emotionalWellbeing}/5` : 'Not recorded'}</dd>
        </div>
      </dl>
      {extra.pain?.location && (
        <p>
          <strong>Pain location:</strong> {extra.pain.location}
        </p>
      )}
      {extra.pain?.notes && (
        <p>
          <strong>Discomfort notes:</strong> {extra.pain.notes}
        </p>
      )}
      {extra.sleep && (
        <p>
          Sleep window: {extra.sleep.startUtc} → {extra.sleep.wakeUtc} (UTC), {(extra.sleep.windowMinutes / 60).toFixed(2)}{' '}
          hours. This is separate from reported time asleep.
        </p>
      )}
      {extra.environment?.astronautId === record.astronautId && <EnvironmentReadings context={extra.environment} />}
      <p className="helper">Version 1 optional entries · local demo only · not sent to the server.</p>
    </div>
  );
}

export function SpaceWellnessTrends({ records, astronautId }: { records: CheckIn[]; astronautId: string }) {
  const scoped = records.filter(record => record.astronautId === astronautId);
  const extras = scoped.filter(record => record.spaceWellness?.version === 1);
  const pain = extras.flatMap(record =>
    record.spaceWellness?.pain?.intensity === undefined
      ? []
      : [{ time: record.createdAt, value: record.spaceWellness.pain.intensity }],
  );
  const mental = (field: 'isolation' | 'socialConnection' | 'emotionalWellbeing') =>
    extras.flatMap(record => {
      const value = record.spaceWellness?.mental?.[field];
      return value === undefined ? [] : [{ time: record.createdAt, value }];
    });
  const timings = extras.flatMap(record => (record.spaceWellness?.sleep ? [record.spaceWellness.sleep] : []));
  const snapshots = extras.flatMap(record =>
    record.spaceWellness?.environment?.astronautId === astronautId ? [record.spaceWellness.environment] : [],
  );
  const radiation = snapshots.flatMap(context =>
    context.radiationRate.value === null ? [] : [{ time: context.capturedAt, value: context.radiationRate.value }],
  );
  const latestEnvironment = [...snapshots].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];

  return (
    <div className="space-trends-grid">
      <section className="panel space-trend-card">
        <div className="section-heading">
          <h3>Pain self-reports (optional)</h3>
          <span className="pill">{pain.length} saved</span>
        </div>
        <p className="helper">0 means no pain; 10 is the most intense pain you can imagine. A missing entry is not zero.</p>
        <TrendChart title="Pain intensity" unit="0–10 · self-report" domain={[0, 10]} points={pain} />
      </section>

      <section className="panel space-trend-card">
        <div className="section-heading">
          <h3>Sleep schedule (UTC, optional)</h3>
          <span className="pill">{timings.length} windows</span>
        </div>
        <SleepScheduleChart timings={timings} />
        <p className="helper">Dates and clock positions use UTC. Bars show the elapsed recorded window, not measured sleep.</p>
        <a
          className="text-link"
          href="https://www.nasa.gov/reference/risk-from-inadequate-sleep-and-irregular-schedules/"
          target="_blank"
          rel="noreferrer"
        >
          NASA: sleep and irregular schedules
        </a>
      </section>

      <section className="panel space-trend-card space-trend-wide">
        <div className="section-heading">
          <h3>Isolation &amp; psychosocial connection</h3>
          <span className="pill">{scoped.length} check-ins</span>
        </div>
        <p className="helper">
          Personal ratings (1–5). Isolation: 1 not at all → 5 very much. Connection and well-being: 1 low → 5 good.
        </p>
        <div className="chart-grid-layout">
          <TrendChart title="Feeling isolated" unit="1–5" domain={[1, 5]} points={mental('isolation')} />
          <TrendChart title="Social connection" unit="1–5" domain={[1, 5]} points={mental('socialConnection')} color="var(--success)" />
          <TrendChart title="Emotional well-being" unit="1–5" domain={[1, 5]} points={mental('emotionalWellbeing')} />
        </div>
      </section>

      <section className="panel space-trend-card space-trend-wide">
        <div className="section-heading">
          <h3>Saved radiation snapshots (optional)</h3>
          <span className="pill">{snapshots.length} snapshots</span>
        </div>
        {latestEnvironment ? (
          <>
            <p className="helper">
              Latest check-in snapshot: {new Date(latestEnvironment.capturedAt).toLocaleString()} ·{' '}
              {latestEnvironment.gravity.value ?? 'Scenario unconfigured'}. Full environment snapshots stay attached to each Past Check-In card above.
            </p>
            <TrendChart title="Environmental radiation rate snapshots" unit="μSv/h" points={radiation} />
            <p className="helper">
              Existing radiation snapshots are simulated environmental rates, not personal accumulated doses.
            </p>
          </>
        ) : (
          <EmptyState title="No environment snapshots saved">
            New local check-ins can include the available source-labeled environment context.
          </EmptyState>
        )}
      </section>
    </div>
  );
}
