import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Award,
  CalendarDays,
  Check,
  Circle,
  Droplets,
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
import { evaluateMissionRoutines } from './services/missionRoutines';
import { localDate, missionCatalog } from './services/missions';
import { listImageAssessments } from './services/selfExams';
import type { ImageAssessmentRecord, SelfExamType } from './types/telemetry';
import type { Page } from './types/wellness';

type Telemetry = ReturnType<typeof useTelemetry>;
type SpaceWeatherState = ReturnType<typeof useSpaceWeather>;

function getPage(): Page {
  const hash = window.location.hash.slice(1);
  return ['dashboard', 'checkin', 'analytics', 'missions', 'ai'].includes(hash) ? hash as Page : 'dashboard';
}

function Workspace({ telemetry: t, spaceWeather: sw, page }: { telemetry: Telemetry; spaceWeather: SpaceWeatherState; page: Page }) {
  const wellness = useWellness(t.activeId);
  const environment = useEnvironment(t.activeId, t.vitals, sw.datum);
  const astronaut = t.crew.find(member => member.id === t.activeId);
  const today = localDate();
  const observations = t.alerts.filter(alert => alert.astronaut_id === t.activeId);
  const unacknowledged = observations.filter(a => !a.acknowledged);
  const completed = wellness.completions.filter(item => item.date === today);
  const latest = [...wellness.records].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  const [assessments, setAssessments] = useState<ImageAssessmentRecord[]>([]);
  const [showSelfExam, setShowSelfExam] = useState(false);
  const [activeExamType, setActiveExamType] = useState<SelfExamType>('dermal_radiation');
  const [aiInitialQuestion, setAiInitialQuestion] = useState('');
  const clearInitialQuestion = useCallback(() => setAiInitialQuestion(''), []);

  useEffect(() => {
    let alive = true;
    void listImageAssessments(t.activeId).then(items => {
      if (alive) setAssessments(items);
    }).catch(() => {
      if (alive) setAssessments([]);
    });
    return () => { alive = false; };
  }, [t.activeId]);

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

  const stormOverrideKp = ({ LIVE_DONKI: 0, M_FLARE_CME: 5.7, X_CLASS_SPE: 8.3, EXTREME_G5: 9.0 } as const)[t.simConfig.solarStorm] ?? 0;
  const kpIndex = Math.max(sw.snapshot?.kp_current ?? parsedDatumKp ?? 2.3, stormOverrideKp);

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

  const hydration = v.hydration_pct ?? 92;
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
                <Droplets size={19} />
                <span>
                  Hydration &amp; immune
                  <strong>
                    {hydration}% <small>· WBC {wbc} K/uL</small>
                  </strong>
                </span>
              </div>
              <div>
                <Radio size={19} />
                <span>
                  Radiation &amp; suit
                  <strong>
                    {v.radiation_rate} <small>μSv/h · {v.battery_level ?? '—'}% bat</small>
                  </strong>
                  {v.radiation_rate >= 30 && <small className="warning-text">{v.radiation_rate >= 60 ? 'Critical flux' : 'Elevated flux'}</small>}
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
                  <span><Award size={14} aria-hidden="true" /> {readiness.xp} XP · {readiness.badges.filter(b => b.earned).length}/{readiness.badges.length} badges</span>
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
                  <p role="status">Loading saved activity progress…</p>
                ) : wellness.activitiesError ? (
                  <p className="helper">Saved activity progress is unavailable. Please retry loading.</p>
                ) : (
                  <MissionProgress completed={completed.length} />
                )}
                <div className="mini-missions">
                  {[missionCatalog[0], missionCatalog[3], missionCatalog[6]].map(mission => {
                    const done = completed.some(item => item.missionId === mission.id);
                    return (
                      <button
                        key={mission.id}
                        onClick={() => void toggleMission(mission.id)}
                        disabled={wellness.loading || wellness.activitySaving || !!wellness.activitiesError}
                        aria-pressed={done}
                      >
                        {done ? <Check size={19} className="success-text" /> : <Circle size={19} />}
                        <span>{mission.title}</span>
                      </button>
                    );
                  })}
                </div>
                <a href="#missions" className="text-link">All activities &amp; badges<ArrowRight size={16} /></a>
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
      <div hidden={page !== 'checkin'}><CheckInPage astronautId={t.activeId} vitals={v} records={wellness.records} offline={t.offline} gateway={t.gateway} onSaved={wellness.acceptCheckIn} historyLoading={wellness.loading} historyError={wellness.recordsError} environment={environment.context} /></div>
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
      {page === 'missions' && <MissionsPage checkedIn={!!todayRecord} astronautId={t.activeId} completions={wellness.completions} onToggle={wellness.toggleActivity} loading={wellness.loading} loadError={wellness.activitiesError} activitySaving={wellness.activitySaving} readiness={readiness} />}
      <div hidden={page !== 'ai'}><AIPage context={buildAssistantContext(t.activeId, wellness.records, observations, wellness.completions, environment.context, v)} offline={t.offline} gateway={t.gateway} recordsLoading={wellness.loading || wellness.activitySaving} recordsError={wellness.error} initialQuestion={aiInitialQuestion} onClearInitialQuestion={clearInitialQuestion} /></div>
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
      pending={telemetry.pending}
      syncing={telemetry.syncing}
      sync={telemetry.sync}
      sound={telemetry.sound}
      toggleSound={() => telemetry.setSound(!telemetry.sound)}
      contrast={contrast}
      toggleContrast={() => setContrast(!contrast)}
      bleStatus={telemetry.bleStatus}
      bleDeviceName={telemetry.bleDeviceName}
      bleError={telemetry.bleError}
      connectBle={() => void telemetry.connectBle()}
      disconnectBle={telemetry.disconnectBle}
    >
      {telemetry.error && <div role="alert" className="error-box global-message">{telemetry.error}<button onClick={() => telemetry.setError('')} aria-label="Dismiss error">Dismiss</button></div>}
      {telemetry.notice && <div role="status" className="warning-box">{telemetry.notice}</div>}
      <Workspace key={telemetry.activeId} telemetry={telemetry} spaceWeather={spaceWeather} page={page} />
      <DiagnosticsModal result={telemetry.diagnostic} onClose={closeDiagnostic} />
    </AppShell>
  );
}

export default App;
