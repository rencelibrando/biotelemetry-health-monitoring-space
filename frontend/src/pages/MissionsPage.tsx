import { useState } from 'react';
import { Award, Check, Flame, RotateCcw } from 'lucide-react';
import { localDate, missionCatalog } from '../services/missions';
import type { ReadinessSummary } from '../services/missionRoutines';
import type { Mission, MissionCompletion } from '../types/wellness';
import { EmptyState, MissionProgress, PageHeading } from '../components/AppShell';

export function recommendedActivities(completions: MissionCompletion[], date: string, checkedIn: boolean): Mission[] {
  const ids = checkedIn ? ['patterns', 'recovery', 'reflection'] : ['sleep', 'mood', 'exercise'];
  return ids.flatMap(id => { const activity = missionCatalog.find(item => item.id === id); return activity && !completions.some(item => item.date === date && item.missionId === id) ? [activity] : []; }).slice(0, 3);
}
export function MissionCard({ mission, completed, busy, saving = false, onToggle }: { mission: Mission; completed: boolean; busy: boolean; saving?: boolean; onToggle(): void }) {
  return <article className={`panel mission-card ${completed ? 'completed' : ''}`}><span className="activity-category">{mission.category}</span><h3>{mission.title}</h3><p>{mission.description}</p><div className="activity-action"><span className={completed ? 'success-text' : 'muted'}>{completed ? 'Completed · saved on this device' : 'Not completed yet'}</span><button className={`button ${completed ? 'secondary' : 'primary'}`} aria-label={`${completed ? 'Undo completion' : 'Mark complete'}: ${mission.title}`} aria-pressed={completed} disabled={busy} onClick={onToggle}>{completed ? <RotateCcw size={16} /> : <Check size={16} />}{saving ? 'Saving…' : completed ? 'Undo completion' : 'Mark complete'}</button></div></article>;
}

type CategoryFilter = 'All' | 'Physical wellness' | 'Sleep & recovery' | 'Mental & emotional';

export function MissionsPage({ astronautId, completions, onToggle, loading = false, loadError = '', activitySaving = false, checkedIn = false, readiness }: { astronautId: string; completions: MissionCompletion[]; onToggle(id: string, date: string): Promise<void>; loading?: boolean; loadError?: string; activitySaving?: boolean; checkedIn?: boolean; readiness?: ReadinessSummary }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('All');
  const today = localDate();
  const scoped = completions.filter(item => item.astronautId === astronautId);
  const done = scoped.filter(item => item.date === today);
  const recommended = recommendedActivities(scoped, today, checkedIn);
  const historyDates = [...new Set(scoped.map(item => item.date))].sort().reverse();
  const filteredCatalog = categoryFilter === 'All' ? missionCatalog : missionCatalog.filter(m => m.category === categoryFilter);

  async function toggle(id: string) {
    if (busy || loading || activitySaving || loadError) return;
    setBusy(id); setError('');
    try { await onToggle(id, today); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not confirm saved progress. Please retry loading local records.'); }
    finally { setBusy(null); }
  }
  function card(mission: Mission) { return <MissionCard key={mission.id} mission={mission} busy={busy !== null || activitySaving} saving={busy === mission.id} completed={done.some(item => item.missionId === mission.id)} onToggle={() => void toggle(mission.id)} />; }
  if (loading || loadError) return <><PageHeading eyebrow="YOUR DAILY ROUTINE" title="Daily Activities" description="Your saved progress stays separate for each astronaut." /><p role="status" className="helper">{loading ? 'Loading saved activity progress…' : 'Saved progress could not be loaded. Use Retry local records above before making changes.'}</p></>;
  return <><PageHeading eyebrow="YOUR DAILY ROUTINE" title="Daily Activities" description="Small ways to record and reflect on your day. Live recommendations adapt to telemetry and mission hazards." />
    <section className="panel activity-progress">
      <MissionProgress completed={done.length} />
      {readiness ? (
        <div className="readiness-gamification" aria-label="Mission readiness and crew achievements">
          <div className="readiness-stats">
            <span className="pill"><Flame size={13} aria-hidden="true" /> {readiness.streakDays}d Check-In Streak</span>
            <span className="pill">Readiness {readiness.readinessScore}% · {readiness.xp} XP</span>
          </div>
          <div className={`routine-prompt-card priority-${readiness.nextPrompt.priority}`} style={{ marginBottom: 0 }}>
            <strong>Live recommendation: {readiness.nextPrompt.title}</strong>
            <p>{readiness.nextPrompt.detail}</p>
          </div>
          <div className="badge-row">
            {readiness.badges.map(b => (
              <span key={b.id} className={`badge-chip ${b.earned ? 'earned' : ''}`} title={b.requirement}>
                <Award size={12} aria-hidden="true" />
                {b.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
    <p className="activity-guidance">Use <a href="#checkin">Check-In</a> to record your day or <a href="#analytics">My Health Trends</a> to review live and saved trends.</p>
    {error && <p className="error-box" role="alert">{error}</p>}
    <section className="mission-category">
      <div className="section-heading"><h2>Recommended for Today</h2><span className="pill">{recommended.length} remaining</span></div>
      <p className="section-description">{checkedIn ? 'You’ve checked in today. These optional reviews may be useful next.' : 'Start with these recording activities. They do not replace approved medical or exercise procedures.'}</p>
      {recommended.length ? <div className="missions-grid">{recommended.map(card)}</div> : <EmptyState title="You’ve completed today’s top priorities">Review full catalog below or check your mission streak.</EmptyState>}
    </section>

    <section className="mission-category">
      <div className="section-heading">
        <h2>All Activities</h2>
        <div className="segmented" role="tablist" aria-label="Filter activities by category">
          {(['All', 'Physical wellness', 'Sleep & recovery', 'Mental & emotional'] as const).map(cat => (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={categoryFilter === cat}
              onClick={() => setCategoryFilter(cat)}
            >
              {cat === 'All' ? `All (${missionCatalog.length})` : cat}
            </button>
          ))}
        </div>
      </div>
      <div className="missions-grid">{filteredCatalog.map(card)}</div>
    </section>

    <section className="panel" aria-label="Past activity progress">
      <div className="section-heading compact">
        <h2>Past activity progress</h2>
        <span className="pill">{historyDates.length} days logged</span>
      </div>
      {historyDates.length ? (
        <div className="history-list">
          {historyDates.map(date => (
            <div key={date}>
              <strong>{date === today ? 'Today' : date}</strong>
              <span>{scoped.filter(item => item.date === date).length} of 9 completed</span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No activity history yet">Complete an activity to start your history on this device.</EmptyState>
      )}
    </section>
  </>;
}

