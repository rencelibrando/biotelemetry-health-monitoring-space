import { useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { localDate, missionCatalog } from '../services/missions';
import type { Mission, MissionCompletion } from '../types/wellness';
import { EmptyState, MissionProgress, PageHeading } from '../components/AppShell';
import { Disclosure } from '../components/WellnessUI';

export function recommendedActivities(completions: MissionCompletion[], date: string, checkedIn: boolean): Mission[] {
  const ids = checkedIn ? ['patterns', 'recovery', 'reflection'] : ['sleep', 'mood', 'exercise'];
  return ids.flatMap(id => { const activity = missionCatalog.find(item => item.id === id); return activity && !completions.some(item => item.date === date && item.missionId === id) ? [activity] : []; }).slice(0, 3);
}
export function MissionCard({ mission, completed, busy, saving = false, onToggle }: { mission: Mission; completed: boolean; busy: boolean; saving?: boolean; onToggle(): void }) {
  return <article className={`panel mission-card ${completed ? 'completed' : ''}`}><span className="activity-category">{mission.category}</span><h3>{mission.title}</h3><p>{mission.description}</p><div className="activity-action"><span className={completed ? 'success-text' : 'muted'}>{completed ? 'Completed · saved on this device' : 'Not completed yet'}</span><button className={`button ${completed ? 'secondary' : 'primary'}`} aria-label={`${completed ? 'Undo completion' : 'Mark complete'}: ${mission.title}`} aria-pressed={completed} disabled={busy} onClick={onToggle}>{completed ? <RotateCcw size={16} /> : <Check size={16} />}{saving ? 'Saving…' : completed ? 'Undo completion' : 'Mark complete'}</button></div></article>;
}
export function MissionsPage({ astronautId, completions, onToggle, loading = false, loadError = '', activitySaving = false, checkedIn = false }: { astronautId: string; completions: MissionCompletion[]; onToggle(id: string, date: string): Promise<void>; loading?: boolean; loadError?: string; activitySaving?: boolean; checkedIn?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const today = localDate();
  const scoped = completions.filter(item => item.astronautId === astronautId);
  const done = scoped.filter(item => item.date === today);
  const recommended = recommendedActivities(scoped, today, checkedIn);
  const historyDates = [...new Set(scoped.map(item => item.date))].sort().reverse();
  async function toggle(id: string) {
    if (busy || loading || activitySaving || loadError) return;
    setBusy(id); setError('');
    try { await onToggle(id, today); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not confirm saved progress. Please retry loading local records.'); }
    finally { setBusy(null); }
  }
  function card(mission: Mission) { return <MissionCard key={mission.id} mission={mission} busy={busy !== null || activitySaving} saving={busy === mission.id} completed={done.some(item => item.missionId === mission.id)} onToggle={() => void toggle(mission.id)} />; }
  if (loading || loadError) return <><PageHeading eyebrow="YOUR DAILY ROUTINE" title="Daily Activities" description="Your saved progress stays separate for each astronaut." /><p role="status" className="helper">{loading ? 'Loading saved activity progress…' : 'Saved progress could not be loaded. Use Retry local records above before making changes.'}</p></>;
  return <><PageHeading eyebrow="YOUR DAILY ROUTINE" title="Daily Activities" description="Small ways to record and reflect on your day. Follow your approved mission routine." />
    <section className="panel activity-progress"><MissionProgress completed={done.length} /></section>
    <p className="activity-guidance">Use <a href="#checkin">Check-In</a> to record your day or <a href="#analytics">My Health Trends</a> to review it. Mark an activity complete when you’re done.</p>
    {error && <p className="error-box" role="alert">{error}</p>}
    <section className="mission-category"><div className="section-heading"><h2>Recommended for Today</h2></div><p className="section-description">{checkedIn ? 'You’ve checked in today. These optional reviews may be useful next.' : 'Start with these recording activities. They do not replace approved medical or exercise procedures.'}</p>{recommended.length ? <div className="missions-grid">{recommended.map(card)}</div> : <EmptyState title="You’ve completed these activities">You can review more options under All Activities.</EmptyState>}</section>
    <Disclosure title="All Activities">{(['Physical wellness', 'Sleep & recovery', 'Mental & emotional'] as const).map(category => <section key={category} className="mission-category"><h3 className="activity-group-heading">{category}</h3><div className="missions-grid">{missionCatalog.filter(mission => mission.category === category).map(card)}</div></section>)}</Disclosure>
    <Disclosure title="Past activity progress">{historyDates.length ? <div className="history-list">{historyDates.map(date => <div key={date}><strong>{date === today ? 'Today' : date}</strong><span>{scoped.filter(item => item.date === date).length} of 9 completed</span></div>)}</div> : <EmptyState title="No activity history yet">Complete an activity to start your history on this device.</EmptyState>}</Disclosure>
  </>;
}

