import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Award,
  CalendarDays,
  Check,
  Circle,
  Flame,
  Orbit,
  Radio,
  ShieldCheck,
  Waves,
} from 'lucide-react';
import { AppShell, EmptyState, MissionProgress, PageHeading, navigation } from './components/AppShell';
import { ECGMonitor } from './components/ECGMonitor';
import { MultiMetricChart } from './components/MultiMetricChart';
import { BodyHealthMap } from './components/BodyHealthMap';
import { SelfExamCapture } from './components/SelfExamCapture';
import { AlertBanner } from './components/AlertBanner';
import { AnomalyDemoBar } from './components/AnomalyDemoBar';
import { DiagnosticsModal } from './components/DiagnosticsModal';
import { CheckInPage } from './pages/CheckInPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { MissionsPage } from './pages/MissionsPage';
import { AIPage } from './pages/AIPage';
import { useTelemetry } from './hooks/useTelemetry';
import { useWellness } from './hooks/useWellness';
import { useEnvironment } from './hooks/useEnvironment';
import { useSpaceWeather } from './hooks/useSpaceWeather';
import { SpaceEnvironmentPanel } from './components/SpaceEnvironment';
import { buildAssistantContext } from './services/ai';
import { localDb } from './db/localDb';
import { evaluateMissionRoutines } from './services/missionRoutines';
import { localDate } from './services/missions';
import { listImageAssessments } from './services/selfExams';
import { resolveSimulationKp } from './services/simulationConfig';
import {
  type AlertEpisodeState,
  buildAlertAnnouncementsByCrew,
  selectAlertsForProfile,
  selectNewlyTriggeredAlerts,
} from './services/alertSpeech';
import {
  speakBackgroundAlert,
  stopAlertSpeaking,
  syncActiveAlertSpeechKeys,
} from './services/voiceAssistant';
import type { ImageAssessmentRecord, SelfExamType } from './types/telemetry';
import type { Page } from './types/wellness';

type Telemetry = ReturnType<typeof useTelemetry>;
type SpaceWeatherState = ReturnType<typeof useSpaceWeather>;

function getPage(): Page {
  const hash = window.location.hash.replace(/^#\/?/, '').trim();
  return ['dashboard', 'checkin', 'analytics', 'missions', 'ai'].includes(hash) ? hash as Page : 'dashboard';
}

function Workspace({ telemetry: t, spaceWeather: sw, page }: { telemetry: Telemetry; spaceWeather: SpaceWeatherState; page: Page }) {
  const wellness = useWellness(t.activeId);
  const environment = useEnvironment(t.activeId, t.vitals, sw.datum);
  const astronaut = t.crew.find(member => member.id === t.activeId);
  const today = localDate();
  const observations = t.alerts.filter(alert => alert.astronaut_id === t.activeId);
  const unacknowledged = observations.filter(a => !a.acknowledged);
  const latest = [...wellness.records].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  const [assessments, setAssessments] = useState<ImageAssessmentRecord[]>([]);
  const [showSelfExam, setShowSelfExam] = useState(false);
  const [activeExamType, setActiveExamType] = useState<SelfExamType>('dermal_radiation');
  const [aiInitialQuestion, setAiInitialQuestion] = useState('');
  const [aiFocusOrgan, setAiFocusOrgan] = useState<string | undefined>(undefined);
  const clearInitialQuestion = useCallback(() => setAiInitialQuestion(''), []);

  const refreshAssessments = useCallback(async () => {
    try {
      setAssessments(await listImageAssessments(t.activeId));
    } catch {
      setAssessments([]);
    }
  }, [t.activeId]);

  useEffect(() => {
    let alive = true;
    void listImageAssessments(t.activeId).then(items => {
      if (alive) setAssessments(items);
    }).catch(() => {
      if (alive) setAssessments([]);
    });
    return () => { alive = false; };
  }, [t.activeId]);

  const reloadWellnessRef = useRef(wellness.reload);
  reloadWellnessRef.current = wellness.reload;
  const refreshAssessmentsRef = useRef(refreshAssessments);
  refreshAssessmentsRef.current = refreshAssessments;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const legacyKey = 'biotelemetry:demo-trends-v1';
    if (!window.localStorage?.getItem(legacyKey)) return;
    void (async () => {
      try {
        const [allCheckins, allExams] = await Promise.all([
          localDb.checkins.toArray(),
          localDb.imagingAssessments.toArray(),
        ]);
        const legacyCheckinIds = allCheckins.filter(r => r.id.startsWith('demo-checkin-')).map(r => r.id);
        const legacyExamIds = allExams.filter(a => a.id.startsWith('demo-exam-')).map(a => a.id);
        if (legacyCheckinIds.length > 0) await localDb.checkins.bulkDelete(legacyCheckinIds);
        if (legacyExamIds.length > 0) await localDb.imagingAssessments.bulkDelete(legacyExamIds);
        window.localStorage.removeItem(legacyKey);
        await reloadWellnessRef.current();
        await refreshAssessmentsRef.current();
      } catch {
        // Non-blocking cleanup when IndexedDB is unavailable.
      }
    })();
  }, []);

  async function toggleMission(id: string) {
    try { await wellness.toggleActivity(id, today); }
    catch { /* The shared activity state exposes the failure and retry action. */ }
  }

  const v = t.vitals;
  const isBleMeasured = v.telemetry_source === 'measured';
  const todayRecord = [...wellness.records]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .find(record => localDate(new Date(record.createdAt)) === today);

  const parsedDatumKp = (() => {
    const m = sw.datum.value?.match(/Kp\s*([\d.]+)/i);
    return m ? Number(m[1]) : undefined;
  })();

  const kpIndex = resolveSimulationKp(t.simConfig, sw.snapshot?.kp_current ?? parsedDatumKp ?? 2.3);

  const readiness = useMemo(
    () => evaluateMissionRoutines({
      vitals: v,
      records: wellness.records,
      completions: wellness.completions,
      assessments,
      kpIndex,
    }),
    [v, wellness.records, wellness.completions, assessments, kpIndex],
  );

  const wbc = v.wbc_k_ul ?? 6.2;

  function openSelfExam(examType: SelfExamType) {
    setActiveExamType(examType);
    setShowSelfExam(true);
  }

  function handleRoutinePrompt() {
    const prompt = readiness.nextPrompt;
    if (prompt.targetExam) {
      openSelfExam(prompt.targetExam);
      return;
    }
    window.location.hash = prompt.targetPage;
  }

  const showAlertsPanel = unacknowledged.length > 0;

  return (
    <>
      {wellness.error && <div className="error-box" role="alert">{wellness.error}<button onClick={() => void wellness.reload()}>Retry local records</button></div>}
      {wellness.loading && <div className="loading-line" role="status">Loading local wellness records…</div>}
      {page === 'dashboard' && (
        <>
          <PageHeading
            eyebrow="YOUR DAY AT A GLANCE"
            title={`Hi, ${astronaut?.name.replace('Dr. ', '').split(' ')[0] ?? 'explorer'}.`}
            description="Monitor mission vitals, inspect body systems, and log daily countermeasures."
            action={<span className="date-label"><CalendarDays size={17} />{new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
          />
          {showAlertsPanel && (
            <section className="panel observation-panel dashboard-alert-top">
              <div className="section-heading compact">
                <h2><ShieldCheck size={17} />Things to review</h2>
                <span className="pill">{unacknowledged.length} active</span>
              </div>
              <AlertBanner alerts={observations} onAcknowledge={t.acknowledge} onAcknowledgeAll={() => void t.acknowledgeAll()} />
            </section>
          )}
          <div className="dashboard-top-row">
            <BodyHealthMap
              vitals={v}
              latestCheckIn={todayRecord ?? latest}
              completions={wellness.completions}
              kpIndex={kpIndex}
              onOpenSelfExam={openSelfExam}
              onAskAi={system => {
                setAiFocusOrgan(system.label);
                setAiInitialQuestion(`Review my ${system.label.toLowerCase()} status (${system.primaryMetric}) under current mission conditions and list countermeasures.`);
                window.location.hash = 'ai';
              }}
            />
            <section className="panel dashboard-hero-telemetry" aria-labelledby="telemetry-trends-heading">
              <div className="section-heading compact">
                <div>
                  <h2 id="telemetry-trends-heading">Live waveform &amp; vital trends</h2>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {isBleMeasured ? 'BLE R-R' : '100 Hz Lead-II'} illustrative rhythm · Multi-vital rolling trends
                  </span>
                </div>
                <span className="pill">{t.telemetryHistory.length} pts · Live</span>
              </div>
              <div className="hero-combined-telemetry">
                <ECGMonitor
                  key={t.activeId}
                  ecgSamples={v.ecg_samples}
                  heartRate={v.heart_rate}
                  telemetrySource={v.telemetry_source}
                  sampleRateHz={v.ecg_sample_rate_hz}
                  orbitalPhase={v.orbital_phase}
                  compact
                />
                <MultiMetricChart samples={t.telemetryHistory} compact extended />
              </div>
              <a href="#analytics" className="text-link">Full health analytics &amp; history<ArrowRight size={16} /></a>
            </section>
          </div>
          {showSelfExam && (
            <SelfExamCapture
              astronautId={t.activeId}
              vitals={v}
              kpIndex={kpIndex}
              offline={t.offline}
              examType={activeExamType}
              onExamTypeChange={setActiveExamType}
              assessments={assessments}
              onAssessmentSaved={record => setAssessments(prev => [record, ...prev])}
              onClose={() => setShowSelfExam(false)}
            />
          )}
          <section className="secondary-metrics-strip" aria-labelledby="secondary-metrics-heading">
            <div className="section-heading compact">
              <h2 id="secondary-metrics-heading">Secondary suit &amp; autonomic metrics</h2>
              <span className="pill">{isBleMeasured ? 'Measured BLE + NASA sim' : 'NASA-calibrated simulation'}</span>
            </div>
            <div className="secondary-vitals">
              <div>
                <Activity size={19} />
                <span>
                  Blood pressure &amp; resp
                  <strong>
                    {v.systolic_bp !== undefined && v.diastolic_bp !== undefined ? `${v.systolic_bp}/${v.diastolic_bp}` : '—'} <small>mmHg · {v.respiration_rate ?? '—'} rpm</small>
                  </strong>
                </span>
              </div>
              <div>
                <Waves size={19} />
                <span>
                  HRV (autonomic)
                  <strong>{v.hrv} <small>ms</small></strong>
                </span>
              </div>
              <div>
                <Activity size={19} />
                <span>
                  Immune leukocyte
                  <strong>
                    {wbc} <small>K/uL</small>
                  </strong>
                  {wbc < 3.8 && <small className="warning-text">Suppressed (OSD-575)</small>}
                </span>
              </div>
              <div>
                <Radio size={19} />
                <span>
                  Suit &amp; comms link
                  <strong>
                    {v.battery_level ?? '—'}% <small>bat · {v.comms_latency_sec !== undefined ? (v.comms_latency_sec < 1 ? `${Math.round(v.comms_latency_sec * 1000)} ms` : v.comms_latency_sec < 60 ? `${v.comms_latency_sec.toFixed(1)} s` : `${(v.comms_latency_sec / 60).toFixed(1)} min`) : '—'} lag</small>
                  </strong>
                </span>
              </div>
            </div>
          </section>
          <section className="panel daily-panel" aria-labelledby="readiness-heading">
            <div className="daily-panel-grid">
              <div className="daily-panel-overview">
                <div className="section-heading">
                  <h2 id="readiness-heading"><Orbit size={20} />Readiness &amp; Routine</h2>
                  <span className="pill">{readiness.readinessScore}% Ready</span>
                </div>
                <div className="readiness-dashboard-meta">
                  <span><Flame size={14} aria-hidden="true" /> {readiness.streakDays}d streak</span>
                  <span><Award size={14} aria-hidden="true" /> {readiness.compliancePct}% compliance · {readiness.badges.filter(b => b.earned).length}/{readiness.badges.length} badges</span>
                </div>
                <div className="readiness-breakdown" aria-label="Readiness score breakdown">
                  <span>Telemetry {readiness.readinessBreakdown.telemetry}</span>
                  <span>Check-In {readiness.readinessBreakdown.checkIn}</span>
                  <span>Protocols {readiness.readinessBreakdown.countermeasures}</span>
                  <span>Ocular {readiness.readinessBreakdown.ocularExam}</span>
                </div>
                <div className={`routine-prompt-card priority-${readiness.nextPrompt.priority}`}>
                  <strong>{readiness.nextPrompt.title}</strong>
                  <p>{readiness.nextPrompt.detail}</p>
                  <button type="button" className="button secondary compact-btn" onClick={handleRoutinePrompt}>
                    {readiness.nextPrompt.actionLabel}
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
              <div className="daily-panel-tasks">
                {wellness.loading ? (
                  <p role="status">Loading saved protocol progress…</p>
                ) : wellness.activitiesError ? (
                  <p className="helper">Saved protocol progress is unavailable. Please retry loading.</p>
                ) : (
                  <MissionProgress completed={readiness.verifiedCount} total={readiness.totalProtocols} />
                )}
                <div className="mini-missions">
                  {readiness.topProtocols.map(item => {
                    const isBusy = wellness.loading || wellness.activitySaving || !!wellness.activitiesError;
                    const isAuto = item.status === 'auto-verified';
                    return (
                      <button
                        key={item.mission.id}
                        type="button"
                        onClick={() => {
                          if (item.canManualToggle) {
                            void toggleMission(item.mission.id);
                          } else if (item.targetExam) {
                            openSelfExam(item.targetExam);
                          } else {
                            window.location.hash = item.targetPage ?? 'checkin';
                          }
                        }}
                        disabled={item.canManualToggle && isBusy}
                        aria-pressed={item.canManualToggle ? item.completed : undefined}
                      >
                        {item.completed ? <Check size={19} className="success-text" /> : <Circle size={19} />}
                        <span>{item.mission.title}</span>
                        <small className="protocol-verified-pill">
                          {isAuto
                            ? 'Auto'
                            : item.completed
                              ? 'Confirmed'
                              : item.actionLabel ?? 'Confirm'}
                        </small>
                      </button>
                    );
                  })}
                </div>
                <a href="#missions" className="text-link">All countermeasures &amp; compliance<ArrowRight size={16} /></a>
              </div>
            </div>
          </section>
          <details className="panel disclosure">
            <summary className="unified-controls-summary">
              <span>Space Environment, Live Weather &amp; Simulation Controls</span>
              <span className="pill">
                {t.simConfig.missionZone.replace('_', ' ')} · Kp {kpIndex.toFixed(1)}{t.anomaly !== 'NONE' ? ` · ${t.anomaly}` : ''}
              </span>
            </summary>
            <div className="disclosure-content stack">
              <SpaceEnvironmentPanel
                context={environment.context}
                records={wellness.records}
                vitals={v}
                spaceWeatherSnapshot={sw.snapshot}
                issFeed={sw.issFeed}
                spaceWeatherLoading={sw.loading}
                realtimeConnected={sw.realtimeConnected}
                offline={t.offline}
                onRefreshSpaceWeather={() => void sw.refresh()}
                onRefreshIss={() => void sw.refreshIss()}
                hideScenarioControls={true}
              />
              <section className="panel" aria-labelledby="mission-sim-heading">
                <div className="section-heading">
                  <h2 id="mission-sim-heading">Mission Simulation &amp; NASA Diagnostic Engine</h2>
                  <span className="pill">{v.orbital_phase?.replace('_', ' ').toUpperCase() ?? 'ORBITAL'}</span>
                </div>
                <p className="helper">
                  {astronaut?.role} · {t.activeId} · Source: {t.gateway ? 'NASA-calibrated API server' : 'local simulation'} · Updated {new Date(v.timestamp).toLocaleTimeString()}
                </p>
                <AnomalyDemoBar
                  currentAnomaly={t.anomaly}
                  simConfig={t.simConfig}
                  vitals={v}
                  onTrigger={t.setAnomaly}
                  onUpdateSimConfig={t.setSimConfig}
                  onRunDiagnostics={t.diagnose}
                  isDiagnosing={t.diagnosing}
                />
              </section>
            </div>
          </details>
        </>
      )}
      {page === 'checkin' && (
        <CheckInPage
          astronautId={t.activeId}
          vitals={v}
          records={wellness.records}
          offline={t.offline}
          gateway={t.gateway}
          onSaved={wellness.acceptCheckIn}
          historyLoading={wellness.loading}
          historyError={wellness.recordsError}
          environment={environment.context}
        />
      )}
      {page === 'analytics' && (
        <AnalyticsPage
          records={wellness.records}
          astronaut={astronaut}
          alerts={observations}
          assessments={assessments}
          vitals={v}
          telemetryHistory={t.telemetryHistory}
          simConfig={t.simConfig}
          kpIndex={kpIndex}
          recordsLoading={wellness.loading}
          recordsError={wellness.recordsError}
        />
      )}
      {page === 'missions' && (
        <MissionsPage
          checkedIn={!!todayRecord}
          astronautId={t.activeId}
          completions={wellness.completions}
          onToggle={wellness.toggleActivity}
          loading={wellness.loading}
          loadError={wellness.activitiesError}
          activitySaving={wellness.activitySaving}
          readiness={readiness}
          onOpenSelfExam={openSelfExam}
          onNavigate={p => { window.location.hash = p; }}
        />
      )}
      {page === 'ai' && (
        <AIPage
          context={buildAssistantContext(t.activeId, wellness.records, observations, wellness.completions, environment.context, v, assessments, readiness, aiFocusOrgan)}
          offline={t.offline}
          gateway={t.gateway}
          recordsLoading={wellness.loading || wellness.activitySaving}
          recordsError={wellness.error}
          initialQuestion={aiInitialQuestion}
          onClearInitialQuestion={clearInitialQuestion}
          onOpenSelfExam={openSelfExam}
          onNavigate={p => { window.location.hash = p; }}
        />
      )}
      {!astronaut && <EmptyState title="No astronaut selected">Choose a crew member from the header.</EmptyState>}
    </>
  );
}

export function App() {
  const telemetry = useTelemetry();
  const spaceWeather = useSpaceWeather(telemetry.offline);
  const [page, setPage] = useState<Page>(getPage);
  const [contrast, setContrast] = useState(false);
  const closeDiagnostic = useCallback(() => telemetry.setDiagnostic(null), [telemetry.setDiagnostic]);
  const announcedAlertsRef = useRef(new Map<string, AlertEpisodeState>());
  const crewNames = useMemo(
    () => Object.fromEntries(telemetry.crew.map(member => [member.id, member.name])),
    [telemetry.crew],
  );

  useEffect(() => {
    telemetry.setLiveKp(spaceWeather.snapshot?.kp_current);
  }, [spaceWeather.snapshot?.kp_current, telemetry.setLiveKp]);

  useEffect(() => () => {
    stopAlertSpeaking();
    announcedAlertsRef.current.clear();
  }, []);

  // Announce alerts only for the selected crew profile while keeping async audio alive across route tabs.
  useEffect(() => {
    const profileAlerts = selectAlertsForProfile(telemetry.alerts, telemetry.activeId);
    const newAlerts = selectNewlyTriggeredAlerts(profileAlerts, announcedAlertsRef.current);
    const activeKeys = new Set(
      profileAlerts
        .filter(alert => !alert.acknowledged)
        .map(alert => `${alert.astronaut_id}:${alert.alert_type}`),
    );
    syncActiveAlertSpeechKeys(activeKeys);
    if (newAlerts.length === 0) return;
    const announcements = buildAlertAnnouncementsByCrew(newAlerts, crewNames, telemetry.activeId);
    for (const item of announcements) {
      speakBackgroundAlert(item.text, { tag: item.astronautId, alertKeys: item.alertKeys });
    }
  }, [telemetry.alerts, telemetry.activeId, crewNames]);

  useEffect(() => {
    const navigate = () => { setPage(getPage()); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', navigate); return () => window.removeEventListener('hashchange', navigate);
  }, []);
  useEffect(() => { document.title = `BioTelemetry · ${navigation.find(item => item.id === page)?.label}`; }, [page]);

  return (
    <AppShell
      page={page}
      crew={telemetry.crew}
      activeId={telemetry.activeId}
      selectCrew={telemetry.setActiveId}
      crewDemo={telemetry.crewDemo}
      offline={telemetry.offline}
      gateway={telemetry.gateway}
      los={telemetry.los}
      toggleLos={() => telemetry.setLos(!telemetry.los)}
      sound={telemetry.sound}
      toggleSound={() => telemetry.setSound(!telemetry.sound)}
      contrast={contrast}
      toggleContrast={() => setContrast(!contrast)}
    >
      {telemetry.error && <div role="alert" className="error-box global-message">{telemetry.error}<button onClick={() => telemetry.setError('')} aria-label="Dismiss error">Dismiss</button></div>}
      {telemetry.notice && <div role="status" className="warning-box">{telemetry.notice}</div>}
      <Workspace key={telemetry.activeId} telemetry={telemetry} spaceWeather={spaceWeather} page={page} />
      <DiagnosticsModal result={telemetry.diagnostic} onClose={closeDiagnostic} />
    </AppShell>
  );
}

export default App;
