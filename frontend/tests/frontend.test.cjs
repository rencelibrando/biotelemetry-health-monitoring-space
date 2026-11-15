/* Run with: node --test tests/frontend.test.cjs
 * TypeScript is compiled in memory. Storage-boundary tests use a strict table
 * adapter; actual IndexedDB migration and service-worker lifecycle need a browser.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8').replace(/\bimport\.meta\.env\b/g, '({})');
    const result = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
      }, fileName: filename
    });
    module._compile(result.outputText, filename);
  };
}
class TableAdapter {
  constructor(key) { this.key = key; this.data = new Map(); this.failure = false; }
  async add(record) { if (this.failure) throw new Error('Storage unavailable'); if (this.data.has(record[this.key])) throw new Error('Duplicate'); this.data.set(record[this.key], structuredClone(record)); }
  async put(record) { if (this.failure) throw new Error('Storage unavailable'); this.data.set(record[this.key], structuredClone(record)); }
  async bulkPut(records) { if (this.failure) throw new Error('Storage unavailable'); for (const record of records) this.data.set(record[this.key], structuredClone(record)); }
  async get(key) { return structuredClone(this.data.get(key)); }
  async delete(key) { this.data.delete(key); }
  async bulkDelete(keys) { keys.forEach(key => this.data.delete(key)); }
  async toArray() { return structuredClone([...this.data.values()]); }
  filter(predicate) { const rows = [...this.data.values()].filter(predicate); return { toArray: async () => structuredClone(rows), count: async () => rows.length }; }
  where(field) {
    return {
      equals: value => {
        let reverse = false;
        const rows = () => [...this.data.values()].filter(row => row[field] === value);
        const collection = { toArray: async () => structuredClone(rows()), reverse() { reverse = !reverse; return collection; }, async sortBy(key) { const sorted = rows().sort((a, b) => a[key].localeCompare(b[key])); return structuredClone(reverse ? sorted.reverse() : sorted); } };
        return collection;
      }
    };
  }
}
const db = { checkins: new TableAdapter('id'), missionCompletions: new TableAdapter('key'), vitalsQueue: new TableAdapter('localId'), imagingAssessments: new TableAdapter('id'), transaction: async (_mode, _table, work) => work() };
const loadOriginal = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '../db/localDb') return { localDb: db };
  return loadOriginal.call(this, request, parent, isMain);
};
const { checkins, validateCheckIn, saveCheckInOnce, toRemoteCheckInPayload, remoteRowToCheckIn } = require('../src/services/checkins.ts');
const { missions, localDate } = require('../src/services/missions.ts');
const { recordsInRange, average } = require('../src/services/analytics.ts');
const { demoAssistant } = require('../src/services/ai.ts');
const { sendQueuedTelemetry } = require('../src/services/telemetryQueue.ts');
const { AppShell } = require('../src/components/AppShell.tsx');
const { checkInStepError, createCheckInDraft, recordFromDraft } = require('../src/services/checkInDraft.ts');
const { CheckInPage } = require('../src/pages/CheckInPage.tsx');
const { createDraftStore, newDraft } = require('../src/services/drafts.ts');
const { createWellnessStore } = require('../src/services/wellnessState.ts');
const { validateSpaceDraft, extensionFromDraft, toLegacyCheckIn } = require('../src/services/spaceWellness.ts');
const { sleepTiming, parseUtcInput, averageBedtimeShift } = require('../src/services/sleepTiming.ts');
const { buildEnvironment, defaultEnvironmentSettings, environmentKey, loadEnvironmentSettings, sourceLabels, validateEnvironmentSettings } = require('../src/services/environment.ts');
const { EnvironmentReadings, EnvironmentValue } = require('../src/components/SpaceEnvironment.tsx');
const { SpaceWellnessTrends, SleepScheduleChart } = require('../src/components/SpaceWellnessTrends.tsx');
const { buildAssistantContext } = require('../src/services/ai.ts');
const { AIPage } = require('../src/pages/AIPage.tsx');
const { recommendedActivities } = require('../src/pages/MissionsPage.tsx');
const { parseHeartRateMeasurement } = require('../src/services/bluetoothHr.ts');
const { parseSolarLocation, toSpaceWeatherDatum, saveSpaceWeatherCache, loadSpaceWeatherCache, mergeRealtimeSpaceWeatherEvent } = require('../src/services/spaceWeather.ts');
const { SpaceWeatherVisualizer, formatEtaCountdown } = require('../src/components/SpaceWeatherVisualizer.tsx');
const { AlertBanner } = require('../src/components/AlertBanner.tsx');
const {
  buildAlertAnnouncementText,
  buildAlertAnnouncementsByCrew,
  formatSingleAlertSpeech,
  selectNewlyTriggeredAlerts,
} = require('../src/services/alertSpeech.ts');
const { AnomalyDemoBar } = require('../src/components/AnomalyDemoBar.tsx');
const { DiagnosticsModal } = require('../src/components/DiagnosticsModal.tsx');
const {
  computeSpaceEnvironmentRisks,
  defaultSimulationConfig,
  evaluateLocalAlerts,
  isSimulationConfigEqual,
} = require('../src/services/simulationConfig.ts');
const { buildPropagatedIssFeed, parseEnlilFrameLabel } = require('../src/services/spaceWeather.ts');
const { remoteRowToAssessment } = require('../src/services/selfExams.ts');
const {
  seedSimulatedHistory,
  reconcileCrewAlerts,
  simulatedVitals,
  syncActiveProfileAlerts,
} = require('../src/hooks/useTelemetry.ts');
const { AnalyticsPage } = require('../src/pages/AnalyticsPage.tsx');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const sample = (overrides = {}) => ({ id: 'record-1', astronautId: 'A', createdAt: '2026-11-14T09:00:00Z', sleepHours: 7.5, sleepQuality: 4, fatigue: 2, stress: 3, mood: 'Good', exerciseMinutes: 30, symptoms: '', notes: '', biometrics: null, syncStatus: 'pending', ...overrides });
beforeEach(() => { delete globalThis.window; for (const table of [db.checkins, db.missionCompletions, db.vitalsQueue, db.imagingAssessments]) { table.data.clear(); table.failure = false; } Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } }); });

test('check-in validation rejects invalid values, mood, and excessive text', () => {
  assert.equal(validateCheckIn(sample()), null);
  for (const invalid of [{ sleepHours: -1 }, { sleepHours: 25 }, { sleepHours: NaN }, { stress: 6 }, { fatigue: 0 }, { sleepQuality: Infinity }, { exerciseMinutes: -5 }, { mood: '' }, { notes: 'x'.repeat(2001) }, { symptoms: 'x'.repeat(501) }]) assert.ok(validateCheckIn(sample(invalid)));
});
test('saved check-ins stay pending, retain snapshots, and are isolated by astronaut', async () => {
  await checkins.save(sample()); await checkins.save(sample({ id: 'record-2', astronautId: 'B' }));
  const firstRead = await checkins.list('A'); firstRead[0].notes = 'altered in UI';
  const reread = await checkins.list('A');
  assert.equal(reread.length, 1); assert.equal(reread[0].notes, ''); assert.equal(reread[0].syncStatus, 'pending');
  assert.equal(reread[0].biometrics, null);
});
test('failed check-in writes propagate errors without deleting saved records', async () => {
  await checkins.save(sample()); db.checkins.failure = true;
  await assert.rejects(checkins.save(sample({ id: 'record-2' })), /Storage unavailable/);
  assert.equal((await checkins.list('A')).length, 1);
});
test('mission toggles keep independent astronaut and date histories', async () => {
  await missions.toggle('A', 'sleep', '2026-11-14'); await missions.toggle('B', 'sleep', '2026-11-14'); await missions.toggle('A', 'sleep', '2026-11-13');
  await missions.toggle('A', 'sleep', '2026-11-14');
  assert.deepEqual((await missions.list('A')).map(item => item.date), ['2026-11-13']); assert.equal((await missions.list('B')).length, 1);
  assert.equal(localDate(new Date(2026, 10, 14, 23, 59)), '2026-11-14');
});
test('daily, weekly and monthly filters include boundaries and exclude future records', () => {
  const now = new Date(2026, 10, 14, 12); const recordAt = (day, hour = 0) => sample({ createdAt: new Date(2026, 10, day, hour).toISOString() });
  const entries = [recordAt(14), recordAt(8), recordAt(7), recordAt(1), recordAt(14, 13)];
  assert.equal(recordsInRange(entries, 'day', now).length, 1); assert.equal(recordsInRange(entries, 'week', now).length, 2); assert.equal(recordsInRange(entries, 'month', now).length, 4);
  assert.equal(average([]), null); assert.equal(average([60, 70]), 65);
});
test('assistant is deterministic, record grounded, and explicitly unavailable offline', async () => {
  const context = { astronautId: 'A', records: [sample()], alerts: [], completions: ['sleep', 'mood'].map(missionId => ({ astronautId: 'A', date: localDate(), missionId })) };
  const first = await demoAssistant.ask('What does my sleep history show?', context);
  assert.deepEqual(first, await demoAssistant.ask('What does my sleep history show?', context)); assert.match(first.facts, /7.5 hours/); assert.match(first.explanation, /self-reported/);
  const empty = await demoAssistant.ask('Health changes?', { ...context, records: [] }); assert.match(empty.facts, /no saved health check-ins/);
  const mission = await demoAssistant.ask('Wellness activities?', context); assert.match(mission.facts, /2 of 9/);
  navigator.onLine = false; await assert.rejects(demoAssistant.ask('Sleep?', context), /offline/);
});
test('unconfirmed server persistence never deletes queued telemetry', async () => {
  await db.vitalsQueue.add({ localId: 1, astronaut_id: 'A', syncedToCloud: false });
  const result = await sendQueuedTelemetry('A', async () => ({ status: 'SUCCESS', astronaut_id: 'A', synced_count: 1 }));
  assert.match(result, /remain pending/); assert.equal(db.vitalsQueue.data.size, 1);
});
test('failed and partial sync receipts retain the whole queue', async () => {
  await db.vitalsQueue.add({ localId: 1, astronaut_id: 'A', syncedToCloud: false });
  await assert.rejects(sendQueuedTelemetry('A', async () => { throw new Error('Network error'); })); assert.equal(db.vitalsQueue.data.size, 1);
  await assert.rejects(sendQueuedTelemetry('A', async () => ({ status: 'SUCCESS', astronaut_id: 'A', synced_count: 0, persisted: true }))); assert.equal(db.vitalsQueue.data.size, 1);
});
test('confirmed sync deletes only sent astronaut records and retains newly buffered data', async () => {
  await db.vitalsQueue.add({ localId: 1, astronaut_id: 'A', syncedToCloud: false }); await db.vitalsQueue.add({ localId: 2, astronaut_id: 'B', syncedToCloud: false });
  await sendQueuedTelemetry('A', async (id, records) => { assert.equal(id, 'A'); assert.equal(records.length, 1); await db.vitalsQueue.add({ localId: 3, astronaut_id: 'A', syncedToCloud: false }); return { status: 'SUCCESS', astronaut_id: 'A', synced_count: 1, persisted: true }; });
  assert.deepEqual([...db.vitalsQueue.data.keys()], [2, 3]);
});
test('responsive shell exposes all five routes, selected route, and accessible controls', () => {
  const noop = () => { };
  for (const page of ['dashboard', 'checkin', 'analytics', 'missions', 'ai']) {
    const html = renderToStaticMarkup(React.createElement(AppShell, { page, crew: [{ id: 'A', name: 'Demo Crew' }], activeId: 'A', selectCrew: noop, crewDemo: true, offline: true, gateway: false, los: true, toggleLos: noop, sound: false, toggleSound: noop, contrast: false, toggleContrast: noop }, 'Content'));
    for (const route of ['dashboard', 'checkin', 'analytics', 'missions', 'ai']) assert.ok(html.includes(`href="#${route}"`));
    assert.equal((html.match(/aria-current="page"/g) || []).length, 2); assert.match(html, /Skip to content/); assert.match(html, /Offline · saved on this device/); assert.match(html, /Select astronaut/);
    assert.doesNotMatch(html, /CREW WORKSPACE/i);
    assert.doesNotMatch(html, /breadcrumb/);
    for (const label of ['Home', 'Check-In', 'My Health Trends', 'Countermeasures', 'AI Assistant', 'Protocols']) assert.ok(html.includes(label));
  }
});

test('wizard validates required answers and ranges at the relevant step', () => {
  const draft = createCheckInDraft();
  assert.match(checkInStepError(draft, 0), /sleep duration/);
  draft.sleepHours = '7.5'; assert.equal(checkInStepError(draft, 0), null);
  assert.match(checkInStepError(draft, 1), /mood/);
  draft.mood = 'Good'; assert.equal(checkInStepError(draft, 1), null);
  assert.match(checkInStepError(draft, 2), /whether you exercised/);
  draft.exercise = 'yes'; assert.match(checkInStepError(draft, 2), /exercise time/);
  draft.exerciseMinutes = '30'; assert.equal(checkInStepError(draft, 2), null);
  for (const value of ['', '-1', '25', '7.1', 'NaN']) assert.ok(checkInStepError({ ...draft, sleepHours: value }, 0));
  assert.ok(checkInStepError({ ...draft, symptoms: 'x'.repeat(501) }, 1));
  assert.ok(checkInStepError({ ...draft, stress: 6 }, 1));
  for (const value of ['', '0', '1.5', '1441']) assert.ok(checkInStepError({ ...draft, exerciseMinutes: value }, 2));
  assert.ok(checkInStepError({ ...draft, notes: 'x'.repeat(2001) }, 2));
});
test('wizard preserves answers and maps exercise completion to the unchanged saved contract', async () => {
  const draft = { ...createCheckInDraft(), sleepHours: '8.25', sleepQuality: 4, fatigue: 2, stress: 3, mood: 'Good', exercise: 'no', exerciseMinutes: '30', symptoms: '  a note  ', notes: '  personal note  ' };
  const before = structuredClone(draft);
  for (const step of [0, 1, 2, 1, 0, 2]) assert.equal(checkInStepError(draft, step), null);
  const record = recordFromDraft(draft, 'A', null, 'wizard-record', new Date('2026-11-14T10:00:00Z'));
  await checkins.save(record);
  const saved = (await checkins.list('A'))[0];
  assert.deepEqual(Object.keys(saved).sort(), Object.keys(sample()).sort());
  assert.equal(saved.exerciseMinutes, 0); assert.equal(saved.sleepHours, 8.25); assert.equal(saved.symptoms, 'a note'); assert.equal(saved.notes, 'personal note'); assert.equal(saved.syncStatus, 'pending');
  assert.deepEqual(draft, before, 'Validation and conversion must not mutate partially entered answers');
  const resumed = recordFromDraft({ ...draft, exercise: 'yes' }, 'A', { heart_rate: 70 }, 'resumed-record');
  assert.equal(resumed.exerciseMinutes, 30); assert.equal(resumed.biometrics.heart_rate, 70);
});
test('wizard renders all step fields but only exposes the current fieldset', () => {
  const html = renderToStaticMarkup(React.createElement(CheckInPage, { astronautId: 'A', vitals: { astronaut_id: 'A' }, records: [], offline: true, gateway: false, onSaved: async () => { } }));
  assert.equal((html.match(/<fieldset/g) || []).length, 3);
  assert.equal((html.match(/<fieldset hidden=""/g) || []).length, 2);
  for (const field of ['sleepHours', 'sleepQuality', 'fatigue', 'stress', 'mood', 'symptoms', 'exerciseCompletion', 'notes']) assert.ok(html.includes(`name="${field}"`));
  assert.match(html, /Step 1 of 3/); assert.match(html, /Continue/); assert.match(html, /Before you save/);
});
test('activity suggestions use saved progress and check-in state, with at most three choices', () => {
  const date = '2026-11-14';
  assert.deepEqual(recommendedActivities([], date, false).map(item => item.id), ['daily-checkin', 'physical-ared', 'hydration-target']);
  assert.deepEqual(recommendedActivities([], date, true).map(item => item.id), ['physical-ared', 'hydration-target', 'sans-ultrasound']);
  assert.deepEqual(recommendedActivities([{ date, missionId: 'daily-checkin' }, { date: '2026-11-13', missionId: 'hydration-target' }], date, false).map(item => item.id), ['physical-ared', 'hydration-target']);
  assert.deepEqual(recommendedActivities([{ date, missionId: 'exercise' }], date, false).map(item => item.id), ['daily-checkin', 'hydration-target']);
  assert.equal(recommendedActivities(['daily-checkin', 'physical-ared', 'hydration-target'].map(missionId => ({ date, missionId })), date, false).length, 0);
});
test('production PWA references valid icons and keeps API reads out of cache', () => {
  const dist = path.join(__dirname, '../dist'); const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.webmanifest')));
  assert.equal(manifest.name, 'BioTelemetry');
  for (const icon of manifest.icons) {
    assert.doesNotMatch(icon.src, /placeholder/);
    const png = fs.readFileSync(path.join(dist, icon.src));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes, 'Declared icon size must match its real PNG dimensions');
  }
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  assert.match(html, /branding\/biotelemetry-logo\.png/); assert.doesNotMatch(html, /placeholder/);
  const sw = fs.readFileSync(path.join(dist, 'sw.js'), 'utf8'); assert.match(sw, /NetworkOnly/); assert.match(sw, /index.html/); assert.doesNotMatch(sw, /NetworkFirst/);
  assert.match(sw, /branding\/biotelemetry-logo\.png/); assert.doesNotMatch(sw, /placeholder/);
});


function memoryStorage() {
  const data = new Map();
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

test('drafts restore every answer and current step after a new session, isolated by astronaut', () => {
  const storage = memoryStorage(); const firstSession = createDraftStore(storage);
  const a = { ...newDraft('A'), step: 2, values: { ...createCheckInDraft(), sleepHours: '7.5', sleepQuality: 4, fatigue: 2, stress: 4, mood: 'Good', exercise: 'yes', exerciseMinutes: '35', symptoms: 'A symptoms', notes: 'A notes' } };
  const b = { ...newDraft('B'), step: 1, values: { ...createCheckInDraft(), sleepHours: '6', mood: 'Low' } };
  firstSession.save(a); firstSession.save(b);
  const afterReload = createDraftStore(storage);
  assert.deepEqual(afterReload.load('A'), a); assert.deepEqual(afterReload.load('B'), b); assert.equal(afterReload.load('C'), null);
  globalThis.window = { localStorage: storage };
  const html = renderToStaticMarkup(React.createElement(CheckInPage, { astronautId: 'A', vitals: { astronaut_id: 'A' }, records: [], offline: true, gateway: false, onSaved: () => { } }));
  assert.match(html, /Step 3 of 3/); assert.match(html, /A notes/); assert.match(html, /A symptoms/); assert.match(html, /value="35"/); assert.match(html, /unfinished check-in was restored/); assert.doesNotMatch(html, /value="6"/);
});
test('failed record writes retain drafts; successful submissions clear only that astronaut draft', async () => {
  const storage = memoryStorage(); const drafts = createDraftStore(storage);
  const a = newDraft('A'), b = newDraft('B'); drafts.save(a); drafts.save(b);
  const record = sample({ id: a.recordId });
  db.checkins.failure = true;
  await assert.rejects(saveCheckInOnce(record), /Storage unavailable/);
  assert.deepEqual(drafts.load('A'), a); assert.deepEqual(drafts.load('B'), b);
  db.checkins.failure = false;
  await saveCheckInOnce(record); assert.equal(drafts.clearSubmitted(a), true);
  assert.equal(drafts.load('A'), null); assert.deepEqual(drafts.load('B'), b);
});
test('submission replay and concurrent submissions do not duplicate a locally committed check-in', async () => {
  const record = sample();
  await Promise.all([saveCheckInOnce(record), saveCheckInOnce(record)]);
  const replay = await saveCheckInOnce({ ...record, createdAt: new Date().toISOString() });
  assert.equal((await checkins.list('A')).length, 1); assert.equal(replay.createdAt, record.createdAt);
  await assert.rejects(saveCheckInOnce({ ...record, astronautId: 'B' }), /different astronaut/);
});
test('corrupt, unavailable and quota-limited draft storage retains existing data and reports failure', () => {
  const storage = memoryStorage(); const drafts = createDraftStore(storage); const a = newDraft('A'); drafts.save(a);
  const storedKey = [...storage.data.keys()][0];
  const failing = createDraftStore({ ...storage, setItem() { throw new Error('Quota'); } });
  assert.throws(() => failing.save({ ...a, step: 1 }), /Quota/); assert.deepEqual(drafts.load('A'), a);
  storage.data.set(storedKey, '{invalid'); assert.throws(() => drafts.load('A')); assert.equal(storage.data.get(storedKey), '{invalid');
  storage.data.set(storedKey, JSON.stringify({ ...a, version: 99 })); assert.throws(() => drafts.load('A')); assert.equal(JSON.parse(storage.data.get(storedKey)).version, 99);
  assert.throws(() => createDraftStore({ ...storage, getItem() { throw new Error('Denied'); } }).load('A'), /Denied/);
});
test('successful submission cleanup never deletes a newer draft from another tab', () => {
  const storage = memoryStorage(); const drafts = createDraftStore(storage); const submitted = newDraft('A'); drafts.save(submitted);
  const newer = { ...submitted, revision: 'newer-revision', values: { ...submitted.values, notes: 'Newer answers' } }; drafts.save(newer);
  assert.equal(drafts.clearSubmitted(submitted), false); assert.deepEqual(drafts.load('A'), newer);
});
test('a confirmed check-in immediately notifies shared history and cannot be overwritten by an older in-flight read', async () => {
  const read = deferred();
  const store = createWellnessStore('A', { list: () => read.promise, save: checkins.save }, missions);
  let updates = 0; const unsubscribe = store.subscribe(() => updates++);
  const pending = store.reload(); await Promise.resolve();
  const record = await saveCheckInOnce(sample()); store.acceptCheckIn(record);
  assert.equal(store.getSnapshot().records[0].id, record.id); assert.ok(updates >= 2);
  store.acceptCheckIn(sample({ id: 'foreign', astronautId: 'B' }));
  read.resolve([]); await pending;
  assert.deepEqual(store.getSnapshot().records.map(item => item.id), [record.id]);
  assert.equal(store.getSnapshot().loading, false); unsubscribe();
});
test('wellness stores preserve profile isolation and report partial read failures without erasing known records', async () => {
  await checkins.save(sample()); await missions.toggle('A', 'sleep', localDate()); await missions.toggle('B', 'mood', localDate());
  const a = createWellnessStore('A'), b = createWellnessStore('B'); await Promise.all([a.reload(), b.reload()]);
  assert.equal(a.getSnapshot().records.length, 1); assert.equal(b.getSnapshot().records.length, 0);
  assert.deepEqual(a.getSnapshot().completions.map(item => item.missionId), ['sleep']); assert.deepEqual(b.getSnapshot().completions.map(item => item.missionId), ['mood']);
  const failure = createWellnessStore('A', { list() { throw new Error('Unavailable'); }, save: checkins.save }, missions);
  failure.acceptCheckIn(sample()); await failure.reload();
  assert.equal(failure.getSnapshot().records.length, 1); assert.match(failure.getSnapshot().recordsError, /could not be loaded/); assert.equal(failure.getSnapshot().completions.length, 1); assert.equal(failure.getSnapshot().activitiesError, '');
});
test('activity mutations update shared progress and reload consistently after navigation or profile changes', async () => {
  const a = createWellnessStore('A'); await a.reload(); await a.toggleActivity('sleep', localDate());
  assert.equal(a.getSnapshot().completions.length, 1);
  const afterReturn = createWellnessStore('A'), other = createWellnessStore('B'); await Promise.all([afterReturn.reload(), other.reload()]);
  assert.equal(afterReturn.getSnapshot().completions.length, 1); assert.equal(other.getSnapshot().completions.length, 0);
  await afterReturn.toggleActivity('sleep', localDate()); await a.reload(); assert.equal(a.getSnapshot().completions.length, 0);
});
test('activity changes block duplicate actions while pending and require recovery after unconfirmed persistence', async () => {
  const write = deferred(); let calls = 0;
  const service = { list: async () => [], toggle: async () => { calls++; await write.promise; } };
  const store = createWellnessStore('A', checkins, service); await store.reload();
  const pending = store.toggleActivity('sleep', localDate());
  await assert.rejects(store.toggleActivity('sleep', localDate()), /Wait for/); assert.equal(calls, 1); write.resolve(); await pending;
  let reads = 0;
  const unreliable = createWellnessStore('A', checkins, { list: async () => { if (reads++) throw new Error('Read failed'); return []; }, toggle: async () => { } });
  await unreliable.reload(); await assert.rejects(unreliable.toggleActivity('sleep', localDate()), /Could not confirm/);
  assert.match(unreliable.getSnapshot().activitiesError, /Retry loading/); assert.equal(unreliable.getSnapshot().activitySaving, false);
  await assert.rejects(unreliable.toggleActivity('sleep', localDate()), /Wait for/);
});
test('cancelled reads cannot update an abandoned profile store', async () => {
  const read = deferred(); const store = createWellnessStore('A', { list: () => read.promise, save: checkins.save }, missions);
  const pending = store.reload(); store.cancel(); read.resolve([sample()]); await pending;
  assert.equal(store.getSnapshot().records.length, 0);
});
test('AI scopes actual records, latest observations and today activity counts to the selected astronaut', async () => {
  const context = { astronautId: 'A', records: [sample({ astronautId: 'B', id: 'b', sleepHours: 1, mood: 'Very low', createdAt: '2099-01-01T00:00:00Z' }), sample()], alerts: [{ astronaut_id: 'B', message: 'B-only observation', timestamp: '2099-01-01T00:00:00Z', severity: 'CRITICAL' }, { astronaut_id: 'A', message: 'A recorded notification', timestamp: '2026-11-14T09:00:00Z', severity: 'INFO' }], completions: [{ astronautId: 'A', missionId: 'sleep', date: localDate() }, { astronautId: 'A', missionId: 'sleep', date: localDate() }, { astronautId: 'B', missionId: 'mood', date: localDate() }, { astronautId: 'A', missionId: 'stress', date: '2000-01-01' }, { astronautId: 'A', missionId: 'unknown', date: localDate() }] };
  const health = await demoAssistant.ask('How have I been feeling?', context); assert.match(health.facts, /7.5 hours/); assert.match(health.facts, /mood good/); assert.doesNotMatch(health.facts, /very low/);
  const observation = await demoAssistant.ask('Why was a notification flagged?', context); assert.match(observation.facts, /A recorded notification/); assert.doesNotMatch(observation.facts, /B-only/);
  assert.match((await demoAssistant.ask('Activities?', context)).facts, /1 of 9/);
  assert.match((await demoAssistant.ask('Sleep?', { ...context, astronautId: 'B' })).facts, /1 hours/);
  assert.match((await demoAssistant.ask('Sleep?', { ...context, astronautId: 'C' })).facts, /no saved health check-ins/);
  assert.match((await demoAssistant.ask('Notifications?', { ...context, astronautId: 'C' })).facts, /No saved notifications/);
});
test('assistant cannot submit while saved context is loading or unavailable', () => {
  for (const status of [{ recordsLoading: true }, { recordsError: 'Read failed' }]) {
    const html = renderToStaticMarkup(React.createElement(AIPage, { context: { astronautId: 'A', records: [], alerts: [], completions: [] }, offline: false, ...status }));
    assert.match(html, /Onboard clinical rules/); assert.doesNotMatch(html, /Flight AI · Connected/); assert.match(html, /Pre-EVA Readiness Brief/); assert.match(html, /disabled=""/); assert.match(html, status.recordsLoading ? /Loading saved records/ : /Saved context could not be loaded/);
  }
});

test('confirmed local writes notify the current profile view even when submission began on an abandoned screen', async () => {
  const current = createWellnessStore('A'), other = createWellnessStore('B');
  const stopCurrent = current.subscribe(() => { }), stopOther = other.subscribe(() => { });
  await Promise.all([current.reload(), other.reload()]);
  await saveCheckInOnce(sample()); // No explicit acceptCheckIn callback from the original screen.
  assert.equal(current.getSnapshot().records.length, 1); assert.equal(other.getSnapshot().records.length, 0);
  stopCurrent(); stopOther();
});
test('a completed activity write updates a returned profile after the original screen unmounted', async () => {
  const write = deferred(); let rows = [];
  const service = { list: async () => rows, toggle: async () => { await write.promise; rows = [{ key: 'A:sleep', astronautId: 'A', missionId: 'sleep', date: localDate() }]; } };
  const abandoned = createWellnessStore('A', checkins, service); await abandoned.reload();
  const pending = abandoned.toggleActivity('sleep', localDate()); abandoned.cancel();
  const returned = createWellnessStore('A', checkins, service); const stop = returned.subscribe(() => { }); await returned.reload();
  assert.equal(returned.getSnapshot().completions.length, 0);
  write.resolve(); await pending;
  assert.equal(returned.getSnapshot().completions.length, 1); assert.equal(returned.getSnapshot().activitySaving, false); stop();
});


test('optional pain intensity accepts blank and 0–10 integers, with 0 distinct from missing', () => {
  for (const intensity of ['', '0', '1', '10']) assert.equal(validateSpaceDraft({ ...createCheckInDraft(), painIntensity: intensity }, 2), null);
  for (const intensity of ['-1', '11', '1.5', 'NaN', 'Infinity']) assert.match(validateSpaceDraft({ ...createCheckInDraft(), painIntensity: intensity }, 2), /Pain intensity/);
  assert.equal(extensionFromDraft(createCheckInDraft()), undefined);
  assert.equal(extensionFromDraft({ ...createCheckInDraft(), painIntensity: '0' }).pain.intensity, 0);
});
test('optional discomfort and mental fields validate limits without changing required symptom fields', () => {
  assert.equal(validateSpaceDraft({ ...createCheckInDraft(), painLocation: 'Back', painNotes: 'A short note' }, 2), null);
  assert.ok(validateSpaceDraft({ ...createCheckInDraft(), painLocation: 'x'.repeat(101) }, 2));
  assert.ok(validateSpaceDraft({ ...createCheckInDraft(), painNotes: 'x'.repeat(501) }, 2));
  for (const field of ['isolation', 'socialConnection', 'emotionalWellbeing']) {
    assert.equal(validateSpaceDraft({ ...createCheckInDraft(), [field]: '' }, 1), null);
    assert.equal(validateSpaceDraft({ ...createCheckInDraft(), [field]: '5' }, 1), null);
    assert.ok(validateSpaceDraft({ ...createCheckInDraft(), [field]: '0' }, 1));
    assert.ok(validateSpaceDraft({ ...createCheckInDraft(), [field]: '2.5' }, 1));
  }
  assert.ok(validateCheckIn(sample({ spaceWellness: { version: 1, mode: 'local-demo', pain: { intensity: 11 } } })));
  assert.ok(validateCheckIn(sample({ symptoms: 'x'.repeat(501) })));
});
test('extended drafts restore optional fields per astronaut and migrate version-1 drafts without rewriting them', () => {
  const storage = memoryStorage(); const drafts = createDraftStore(storage);
  const a = { ...newDraft('A'), step: 2, values: { ...createCheckInDraft(), painIntensity: '0', painLocation: 'Back', painNotes: 'Private discomfort', isolation: '2', socialConnection: '4', emotionalWellbeing: '3', sleepStartUtc: '2026-11-13T23:00', wakeUtc: '2026-11-14T07:00' } };
  drafts.save(a); drafts.save(newDraft('B'));
  assert.deepEqual(createDraftStore(storage).load('A'), a); assert.equal(drafts.load('B').values.painIntensity, '');
  const legacyValues = { sleepHours: '6.5', sleepQuality: 4, fatigue: 2, stress: 3, mood: 'Good', exercise: 'no', exerciseMinutes: '', symptoms: 'Legacy symptom', notes: 'Legacy note' };
  const legacyKey = [...storage.data.keys()].find(key => key.endsWith(':B'));
  const legacy = { ...newDraft('B'), version: 1, values: legacyValues }; storage.setItem(legacyKey, JSON.stringify(legacy));
  const raw = storage.getItem(legacyKey); const restored = drafts.load('B');
  assert.equal(restored.version, 2); assert.equal(restored.values.notes, 'Legacy note'); assert.equal(restored.values.painIntensity, ''); assert.equal(restored.revision, legacy.revision); assert.equal(storage.getItem(legacyKey), raw);
});
test('sleep windows handle overnight dates, leap days and UTC independently of local DST', () => {
  const overnight = sleepTiming('2026-11-13T23:00', '2026-11-14T07:00');
  assert.equal(overnight.windowMinutes, 480); assert.equal(overnight.startUtc, '2026-11-13T23:00:00.000Z');
  assert.equal(sleepTiming('2026-03-08T01:30', '2026-03-08T03:30').windowMinutes, 120);
  assert.equal(sleepTiming('2028-02-28T23:00', '2028-02-29T07:00').windowMinutes, 480);
  assert.equal(parseUtcInput('2026-02-29T23:00'), null); assert.equal(parseUtcInput('2026-11-14T24:00'), null);
  for (const [start, wake] of [['', '2026-11-14T07:00'], ['2026-11-14T23:00', '2026-11-14T07:00'], ['2026-11-14T07:00', '2026-11-14T07:00'], ['2026-11-13T00:00', '2026-11-14T00:01']]) assert.equal(sleepTiming(start, wake), null);
  assert.ok(validateSpaceDraft({ ...createCheckInDraft(), sleepStartUtc: '2026-11-14T23:00' }, 0));
});
test('sleep schedule comparison uses the shortest clock difference across midnight', () => {
  const first = sleepTiming('2026-11-12T23:45', '2026-11-13T07:45');
  const second = sleepTiming('2026-11-14T00:15', '2026-11-14T08:15');
  assert.equal(averageBedtimeShift([]), null); assert.equal(averageBedtimeShift([first]), null); assert.equal(averageBedtimeShift([second, first]), 30);
  const html = renderToStaticMarkup(React.createElement(SleepScheduleChart, { timings: [first, second] }));
  assert.match(html, /30 minutes/); assert.match(html, /next day/); assert.match(html, /UTC/);
});
test('environment reuses only same-astronaut radiation and never treats blood oxygen as cabin oxygen', () => {
  const context = buildEnvironment('A', defaultEnvironmentSettings(), { astronaut_id: 'A', timestamp: '2026-11-14T12:00:00Z', radiation_rate: 14.5, spo2: 98.4 }, new Date('2026-11-14T12:00:00Z'));
  assert.equal(context.radiationRate.source, 'simulated'); assert.equal(context.radiationRate.value, 14.5);
  assert.equal(context.cabinOxygen.source, 'unavailable'); assert.equal(context.cabinOxygen.value, null); assert.equal(context.spaceWeather.value, null); assert.equal(context.microgravityHours.value, null);
  const other = buildEnvironment('B', defaultEnvironmentSettings(), { astronaut_id: 'A', radiation_rate: 14.5 }); assert.equal(other.radiationRate.source, 'unavailable');
  const html = renderToStaticMarkup(React.createElement(EnvironmentReadings, { context }));
  assert.match(html, /Simulated reading/); assert.match(html, /Unavailable/); assert.match(html, /not a personal dose/); assert.doesNotMatch(html, /98.4/);
  const measured = renderToStaticMarkup(React.createElement(EnvironmentValue, { label: 'Future sensor', datum: { value: 1, source: 'measured', detail: 'Test source label' } })); assert.ok(measured.includes(sourceLabels.measured));
});
test('manual mission context persists by astronaut and microgravity time exists only for a supported scenario', () => {
  const now = new Date('2026-11-14T12:00:00Z');
  const settings = { version: 1, scenario: 'orbital-demo', missionStartUtc: '2026-11-12T00:00', cabinOxygenPercent: '21' };
  assert.equal(validateEnvironmentSettings(settings, now), null);
  const storage = memoryStorage(); storage.setItem(environmentKey('A'), JSON.stringify(settings));
  assert.deepEqual(loadEnvironmentSettings('A', storage), settings); assert.equal(loadEnvironmentSettings('B', storage).scenario, 'unconfigured');
  const context = buildEnvironment('A', settings, undefined, now);
  assert.equal(context.missionDurationHours.value, 60); assert.equal(context.microgravityHours.value, 60); assert.equal(context.microgravityHours.source, 'manual'); assert.equal(context.cabinOxygen.source, 'manual'); assert.equal(context.gravity.source, 'simulated');
  assert.equal(buildEnvironment('A', { ...settings, scenario: 'surface-demo' }, undefined, now).microgravityHours.value, null);
  assert.ok(validateEnvironmentSettings({ ...settings, cabinOxygenPercent: '101' }, now)); assert.ok(validateEnvironmentSettings({ ...settings, missionStartUtc: '2026-11-15T00:00' }, now));
});
test('optional analytics show empty states and preserve no-pain zero as a real entry', () => {
  const html = renderToStaticMarkup(React.createElement(SpaceWellnessTrends, { records: [], astronautId: 'A' }));
  assert.match(html, /No recorded data yet/); assert.match(html, /No sleep times recorded/); assert.match(html, /Isolation &amp; psychosocial connection/); assert.doesNotMatch(html, /Mood &amp; Stress/); assert.match(html, /No environment snapshots saved/);
  const zero = renderToStaticMarkup(React.createElement(SpaceWellnessTrends, { records: [sample({ spaceWellness: { version: 1, mode: 'local-demo', pain: { intensity: 0 } } })], astronautId: 'A' }));
  assert.match(zero, /0.0/); assert.match(zero, /1 saved reading/);
  const foreign = renderToStaticMarkup(React.createElement(SpaceWellnessTrends, { records: [sample({ astronautId: 'B', spaceWellness: { version: 1, mode: 'local-demo', pain: { intensity: 7 } } })], astronautId: 'A' })); assert.doesNotMatch(foreign, /1 saved reading/);
});
test('versioned optional data persists with local records and is excluded by the legacy backend adapter', async () => {
  const draft = { ...createCheckInDraft(), sleepHours: '7.5', mood: 'Good', exercise: 'no', painIntensity: '0', painNotes: 'Private discomfort', isolation: '2', socialConnection: '4', emotionalWellbeing: '3', sleepStartUtc: '2026-11-13T23:00', wakeUtc: '2026-11-14T07:00' };
  const record = recordFromDraft(draft, 'A', null, 'extended-record');
  assert.equal(validateCheckIn(record), null); await saveCheckInOnce(record);
  const saved = (await checkins.list('A'))[0]; assert.equal(saved.spaceWellness.version, 1); assert.equal(saved.spaceWellness.pain.intensity, 0); assert.equal(saved.spaceWellness.sleep.windowMinutes, 480); assert.equal(saved.syncStatus, 'pending');
  assert.equal((await checkins.list('B')).length, 0);
  const legacy = toLegacyCheckIn(saved); assert.equal(legacy.spaceWellness, undefined); assert.deepEqual(Object.keys(legacy).sort(), Object.keys(sample()).sort());
});
test('assistant projects numeric optional facts while excluding all private free-text notes', async () => {
  const record = sample({ symptoms: 'SECRET SYMPTOMS', notes: 'SECRET REFLECTION', spaceWellness: { version: 1, mode: 'local-demo', pain: { intensity: 0, location: 'SECRET LOCATION', notes: 'SECRET DISCOMFORT' }, mental: { isolation: 2, socialConnection: 4, emotionalWellbeing: 3 }, sleep: sleepTiming('2026-11-13T23:00', '2026-11-14T07:00') } });
  const context = buildAssistantContext('A', [record], [], []);
  assert.doesNotMatch(JSON.stringify(context), /SECRET/);
  assert.match((await demoAssistant.ask('Pain?', context)).facts, /0\/10 \(no pain\)/);
  assert.match((await demoAssistant.ask('Feeling isolated?', context)).facts, /isolation 2\/5/);
  assert.match((await demoAssistant.ask('My sleep schedule?', context)).facts, /480 elapsed minutes/);
  const other = buildAssistantContext('B', [record], [], []); assert.match((await demoAssistant.ask('Pain?', other)).facts, /No pain intensity/);
});
test('assistant never infers personal dose or live space weather from environment context', async () => {
  const environment = buildEnvironment('A', defaultEnvironmentSettings(), { astronaut_id: 'A', radiation_rate: 14.5, timestamp: '2026-11-14T12:00:00Z' });
  const context = buildAssistantContext('A', [], [], [], environment);
  const reply = await demoAssistant.ask('Radiation exposure?', context); assert.match(reply.facts, /Simulated reading/); assert.match(reply.facts, /not a personal radiation dose/); assert.match(reply.explanation, /not safety/);
  assert.match((await demoAssistant.ask('Space weather?', context)).facts, /unavailable/);
  assert.match((await demoAssistant.ask('Cabin oxygen?', context)).facts, /No cabin oxygen/);
  assert.match((await demoAssistant.ask('Radiation?', buildAssistantContext('B', [], [], [], environment))).facts, /No environment context/);
});
test('bluetooth heart-rate parser decodes 8-bit/16-bit HR, RR-intervals, and rejects malformed packets', () => {
  const buf8 = new DataView(new Uint8Array([0x10, 72, 0x00, 0x04, 0x20, 0x04]).buffer);
  const parsed8 = parseHeartRateMeasurement(buf8);
  assert.equal(parsed8.heartRate, 72);
  assert.equal(parsed8.rrIntervalsMs.length, 2);
  assert.ok(parsed8.rmssdMs > 0);

  const buf16 = new DataView(new Uint8Array([0x09, 0x84, 0x00, 0x0a, 0x00]).buffer);
  const parsed16 = parseHeartRateMeasurement(buf16);
  assert.equal(parsed16.heartRate, 132);

  assert.equal(parseHeartRateMeasurement(new DataView(new Uint8Array([0x00]).buffer)), null);
  assert.equal(parseHeartRateMeasurement(new DataView(new Uint8Array([0x00, 12]).buffer)), null);
});
test('space weather service parses heliographic coordinates, caches offline snapshots, and preserves provenance', async () => {
  const pt = parseSolarLocation('N32E90');
  assert.ok(pt && pt.x < 0 && pt.y < 0);
  assert.equal(parseSolarLocation('INVALID'), null);
  assert.equal(parseSolarLocation(''), null);

  const sampleSnapshot = {
    kp_current: 5.0,
    storm_level: 'G1_MINOR',
    radiation_storm: 'S0_NONE',
    latest_flare_class: 'M2.1',
    latest_flare_location: 'N32E90',
    active_sep: false,
    earth_impact_eta: '2099-01-01T12:00:00Z',
    summary: 'Geomagnetic G1 MINOR (Kp 5.0); latest flare M2.1',
    source_mode: 'live_nasa',
    fetched_at: '2026-11-14T18:00:00Z',
    events: [{
      event_id: 'FLR-1', event_type: 'FLR', event_time: '2026-11-14T17:30:00Z',
      severity: 'MODERATE', summary: 'Solar flare M2.1', flare_class: 'M2.1', source_location: 'N32E90',
    }],
  };

  const storage = memoryStorage();
  saveSpaceWeatherCache(sampleSnapshot, storage);
  const cached = loadSpaceWeatherCache(storage);
  assert.equal(cached.source_mode, 'local_cache');
  assert.equal(toSpaceWeatherDatum(sampleSnapshot, false).source, 'measured');
  assert.equal(toSpaceWeatherDatum({ ...sampleSnapshot, source_mode: 'historical_fallback' }, false).source, 'simulated');

  const merged = mergeRealtimeSpaceWeatherEvent(sampleSnapshot, {
    event_id: 'FLR-1', event_type: 'FLR', event_time: '2026-11-14T17:35:00Z',
    severity: 'MODERATE', summary: 'Updated M2.1', flare_class: 'M2.1', source_location: 'N32E90',
  });
  assert.equal(merged.events.length, 1);
  assert.equal(merged.events[0].summary, 'Updated M2.1');

  const envWithWeather = buildEnvironment('A', defaultEnvironmentSettings(), undefined, new Date('2026-11-14T18:05:00Z'), toSpaceWeatherDatum(sampleSnapshot, false));
  const aiContext = buildAssistantContext('A', [], [], [], envWithWeather);
  const reply = await demoAssistant.ask('Space weather?', aiContext);
  assert.match(reply.facts, /G1 MINOR/);
});
test('space weather visualizer renders solar flares, ENLIL, NOAA online feed, ISS coords, and suppresses NOAA offline', () => {
  const htmlOnline = renderToStaticMarkup(React.createElement(SpaceWeatherVisualizer, {
    snapshot: {
      kp_current: 5.5, storm_level: 'G1_MINOR', radiation_storm: 'S1_MINOR',
      latest_flare_class: 'X1.0', latest_flare_location: 'S15W30', active_sep: true,
      earth_impact_eta: '2099-01-01T12:00:00Z',
      summary: 'Active flare watch', source_mode: 'live_nasa', fetched_at: '2026-11-14T18:00:00Z',
      events: [
        { event_id: 'F1', event_type: 'FLR', event_time: '2026-11-14T17:00:00Z', severity: 'SEVERE', summary: 'X1.0 flare', flare_class: 'X1.0', source_location: 'S15W30' },
        { event_id: 'CME-1', event_type: 'CME', event_time: '2026-11-14T17:10:00Z', severity: 'MODERATE', summary: 'Halo CME 1120 km/s', cme_speed_kms: 1120, cme_half_angle: 35, cme_longitude: 12 },
      ],
    },
    vitals: { iss_latitude: -24.5, iss_longitude: -42.1, iss_altitude_km: 421.3, orbital_phase: 'saa_transit', iss_coord_source: 'live_iss', radiation_rate: 31.2 },
    offline: false,
    realtimeConnected: true,
    loading: false,
  }));
  assert.match(htmlOnline, /X1\.0/);
  assert.match(htmlOnline, /Supabase Realtime/);
  assert.match(htmlOnline, /CME &amp; WSA-ENLIL geometry/);
  assert.match(htmlOnline, /services\.swpc\.noaa\.gov\/images\/animations\/enlil\/latest\.jpg/);
  assert.match(htmlOnline, /Pause prediction video/);
  assert.doesNotMatch(htmlOnline, /Previous prediction frame/);
  assert.doesNotMatch(htmlOnline, /Next prediction frame/);
  assert.doesNotMatch(htmlOnline, /Prediction playback speed/);
  assert.doesNotMatch(htmlOnline, />Expand</);
  const visualizerSource = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'components', 'SpaceWeatherVisualizer.tsx'), 'utf8');
  assert.doesNotMatch(visualizerSource, /noaa-scrubber|Scrub WSA-ENLIL prediction timeline|enlilSpeed|noaaExpanded/);
  assert.match(htmlOnline, /Kp 5\.5/);
  assert.match(htmlOnline, /SAA TRANSIT/);
  assert.match(htmlOnline, /Lat -24\.50 deg, Lon -42\.10 deg/);
  assert.match(htmlOnline, /saa-flux-grad/);
  assert.match(htmlOnline, /SAA PEAK/);
  assert.match(htmlOnline, /iss-map-legend/);
  assert.match(htmlOnline, /Inside SAA/);
  assert.doesNotMatch(htmlOnline, /width="90" height="40"/);

  const { isInSaa, saaFluxProfile, generateSaaSamplePoints } = require('../src/services/spaceWeather.ts');
  assert.equal(isInSaa(-25.0, -48.0), true);
  assert.equal(saaFluxProfile(-25.0, -48.0).tier, 'CORE');
  assert.equal(isInSaa(-6.0, 4.0), false);
  assert.ok(generateSaaSamplePoints().length >= 30);

  const { ECGMonitor } = require('../src/components/ECGMonitor.tsx');
  const ecgSim = renderToStaticMarkup(React.createElement(ECGMonitor, { heartRate: 68, ecgSamples: [0.1, 0.2], telemetrySource: 'simulated', sampleRateHz: 100, orbitalPhase: 'daylight' }));
  assert.match(ecgSim, /NASA-CALIBRATED SIM/);
  assert.match(ecgSim, /ORBITAL LEAD-II TRACE · DAYLIGHT/);
  const ecgBle = renderToStaticMarkup(React.createElement(ECGMonitor, { heartRate: 74, telemetrySource: 'measured', sampleRateHz: 100 }));
  assert.match(ecgBle, /MEASURED · BLE R-R/);
  assert.match(ecgBle, /SYNTHESIZED FROM LIVE BLE R-R/);

  const htmlOffline = renderToStaticMarkup(React.createElement(SpaceWeatherVisualizer, {
    snapshot: null, offline: true, realtimeConnected: false, loading: false,
  }));
  assert.match(htmlOffline, /Offline cache/);
  assert.doesNotMatch(htmlOffline, /services\.swpc\.noaa\.gov/);
  assert.match(formatEtaCountdown('2099-01-01T12:00:00Z', new Date('2099-01-01T10:30:00Z')), /T-1h 30m/);
});
test('app shell places sound, high contrast, and offline mode in topbar dropdown without pending or Bluetooth buttons', () => {
  const html = renderToStaticMarkup(React.createElement(AppShell, {
    page: 'dashboard',
    crew: [{ id: 'ASTRO-01', name: 'Dr. Sarah Chen', role: 'Commander', age: 38, resting_hr: 62, baseline_spo2: 98.8, status: 'NOMINAL' }],
    activeId: 'ASTRO-01',
    selectCrew: () => { },
    crewDemo: true,
    offline: false,
    gateway: true,
    los: false,
    toggleLos: () => { },
    sound: false,
    toggleSound: () => { },
    contrast: false,
    toggleContrast: () => { },
  }, React.createElement('div', null, 'Body')));
  assert.doesNotMatch(html, /measurements not yet sent/);
  assert.doesNotMatch(html, /Add Bluetooth heart sensor/);
  assert.doesNotMatch(html, /Bluetooth HR unavailable/);
  assert.match(html, /aria-controls="topbar-controls-menu"/);
  assert.match(html, /Sound off/);
  assert.match(html, /High contrast off/);
  assert.match(html, /Test offline mode/);
});

test('live ISS feed, multi-alert triage, simulation distance/duration scenarios, and diagnostics render cleanly', () => {
  const issFeed = buildPropagatedIssFeed(new Date('2026-11-14T18:00:00Z'));
  assert.ok(issFeed.predicted_track.length > 10);
  const vizHtml = renderToStaticMarkup(React.createElement(SpaceWeatherVisualizer, {
    snapshot: {
      kp_current: 4.5, storm_level: 'G0_QUIET', radiation_storm: 'S0_NONE',
      latest_flare_class: 'M1.7', latest_flare_location: 'S07W46', active_sep: false,
      summary: 'Active M1.7 flare', source_mode: 'live_nasa', fetched_at: '2026-11-14T18:00:00Z',
      events: [
        { event_id: 'F1', event_type: 'FLR', event_time: '2026-11-14T17:00:00Z', severity: 'MODERATE', summary: 'M1.7', flare_class: 'M1.7', source_location: 'S07W46' },
        { event_id: 'F2', event_type: 'FLR', event_time: '2026-11-14T16:30:00Z', severity: 'MODERATE', summary: 'M1.4', flare_class: 'M1.4', source_location: 'S08W45' },
      ],
    },
    issFeed,
    offline: false,
    realtimeConnected: false,
    loading: false,
  }));
  assert.match(vizHtml, /LIVE ISS LOCATION FEED/);
  assert.match(vizHtml, /SAA PEAK/);
  assert.match(vizHtml, /10\+ p\/cm2\/s/);
  assert.match(vizHtml, /M1\.7/);
  assert.match(vizHtml, /M1\.4/);
  assert.doesNotMatch(vizHtml, /Recent DONKI events/);

  const simConfig = { ...defaultSimulationConfig(), missionZone: 'MARS_TRANSIT', missionDay: 240, shielding: 'UNSHIELDED_EVA', solarStorm: 'X_CLASS_SPE', anomaly: 'COMPOUND_CRISIS' };
  const sampleVitals = {
    astronaut_id: 'ASTRO-01', timestamp: '2026-11-14T18:00:00Z', heart_rate: 140, spo2: 88.4,
    core_temp: 38.75, radiation_rate: 98.4, hrv: 18.5, systolic_bp: 112, diastolic_bp: 74,
    respiration_rate: 26, orbital_phase: 'mars_transit', mission_zone: 'MARS_TRANSIT', mission_day: 240,
    distance_km: 225000000, comms_latency_sec: 750.5, cumulative_dose_msv: 737.3, overall_health_score: 36.2, health_status: 'CRITICAL',
  };
  const alerts = evaluateLocalAlerts(sampleVitals, 7);
  assert.ok(alerts.length >= 4);
  const alertHtml = renderToStaticMarkup(React.createElement(AlertBanner, {
    alerts, onAcknowledge: () => { }, onAcknowledgeAll: () => { },
  }));
  assert.match(alertHtml, /Mark all/);
  assert.match(alertHtml, /Recommended action:/);

  const risks = computeSpaceEnvironmentRisks(sampleVitals, simConfig);
  assert.equal(risks.length, 6);
  const simHtml = renderToStaticMarkup(React.createElement(AnomalyDemoBar, {
    currentAnomaly: 'COMPOUND_CRISIS', simConfig, vitals: sampleVitals,
    onTrigger: () => { }, onUpdateSimConfig: () => { }, onRunDiagnostics: () => { }, isDiagnosing: false,
  }));
  assert.match(simHtml, /36\.2 \/ 100/);
  assert.match(simHtml, /Mars Transfer Cruise/);
  assert.match(simHtml, /SANS &amp; Cephalad Fluid Shift/);

  const diagHtml = renderToStaticMarkup(React.createElement(DiagnosticsModal, {
    result: {
      astronaut_id: 'ASTRO-01', overall_health_score: 36.2, cardiovascular_status: 'CRITICAL',
      hypoxia_risk: 'SEVERE', radiation_risk: 'DANGEROUS',
      recommendations: ['Relocate to storm shelter'], metrics_summary: { mission_zone: 'MARS_TRANSIT', mission_day: 240, cumulative_dose_msv: 737.3 },
      environment_risks: risks,
    },
    onClose: () => { },
  }));
  assert.match(diagHtml, /36\.2 \/ 100/);
  assert.match(diagHtml, /737\.3 mSv/);

  const dupAlerts = [
    { id: 'h-old', astronaut_id: 'ASTRO-01', timestamp: '2026-11-14T18:00:00Z', severity: 'CRITICAL', alert_type: 'HYPOXIA', message: 'SpO2 88.2%', trigger_metric: 'SpO2 88.2%', acknowledged: false },
    { id: 'h-new', astronaut_id: 'ASTRO-01', timestamp: '2026-11-14T18:01:00Z', severity: 'CRITICAL', alert_type: 'HYPOXIA', message: 'SpO2 86.4%', trigger_metric: 'SpO2 86.4%', acknowledged: false },
    { id: 'r-1', astronaut_id: 'ASTRO-01', timestamp: '2026-11-14T18:01:05Z', severity: 'WARNING', alert_type: 'RADIATION_SPIKE', message: 'Rad 35 uSv/h', trigger_metric: 'Rad 35 uSv/h', acknowledged: false },
  ];
  const dedupedAlertHtml = renderToStaticMarkup(React.createElement(AlertBanner, {
    alerts: dupAlerts, onAcknowledge: () => { }, onAcknowledgeAll: () => { },
  }));
  assert.match(dedupedAlertHtml, /Latest of 2 updates/);
  assert.match(dedupedAlertHtml, /SpO2 86\.4%/);
  assert.match(dedupedAlertHtml, /Mark as seen/);
  assert.match(dedupedAlertHtml, /Mark all 2 seen/);
  assert.doesNotMatch(dedupedAlertHtml, /SpO2 88\.2%/);
  assert.doesNotMatch(dedupedAlertHtml, /Filter alerts by hazard category/);
  assert.doesNotMatch(dedupedAlertHtml, /Atmosphere &amp; Suit/);
  assert.doesNotMatch(dedupedAlertHtml, /Space Radiation/);
  assert.match(vizHtml, /VIDEO PREDICTION LOOP/);
  assert.match(vizHtml, /STATIC LATEST SNAPSHOT/);
  assert.equal(parseEnlilFrameLabel('/images/animations/enlil/enlil_com2_58611_20261112T030000.jpg'), '2026-11-12 03:00 UTC');
});

test('interactive body map, metabolic/immune alerts, and planetary rover scenarios evaluate accurately', () => {
  const { evaluateBodySystems } = require('../src/services/bodyHealthModel.ts');
  const { BodyHealthMap } = require('../src/components/BodyHealthMap.tsx');
  const { MultiMetricChart } = require('../src/components/MultiMetricChart.tsx');

  const stressVitals = {
    astronaut_id: 'ASTRO-01',
    timestamp: '2026-11-14T18:00:00Z',
    heart_rate: 76,
    spo2: 98.2,
    core_temp: 36.8,
    radiation_rate: 28.0,
    hrv: 44,
    blood_glucose: 49,
    hydration_pct: 79,
    wbc_k_ul: 3.1,
    mission_zone: 'PLANETARY_ROVER',
    mission_day: 60,
  };

  const alerts = evaluateLocalAlerts(stressVitals, 6);
  const types = new Set(alerts.map(a => a.alert_type));
  assert.ok(types.has('HYPOGLYCEMIA'));
  assert.ok(types.has('DEHYDRATION'));
  assert.ok(types.has('IMMUNE_SUPPRESSION'));
  const hypoAlert = alerts.find(a => a.alert_type === 'HYPOGLYCEMIA');
  assert.equal(hypoAlert.severity, 'CRITICAL');

  const roverRisks = computeSpaceEnvironmentRisks(stressVitals, { ...defaultSimulationConfig(), missionZone: 'PLANETARY_ROVER' });
  assert.equal(roverRisks.length, 6);

  const regions = evaluateBodySystems({
    vitals: stressVitals,
    latestCheckIn: sample({ metabolic: { bloodGlucoseMgDl: 49, hydrationMl: 1200, nutritionQuality: 'poor' } }),
    completions: [],
    kpIndex: 6.2,
  });
  assert.equal(regions.length, 6);
  const metabolic = regions.find(r => r.id === 'metabolic');
  const immune = regions.find(r => r.id === 'dermal_immune');
  assert.equal(metabolic.status, 'critical');
  assert.ok(['warning', 'critical'].includes(immune.status));

  const mapHtml = renderToStaticMarkup(React.createElement(BodyHealthMap, {
    vitals: stressVitals,
    latestCheckIn: null,
    completions: [],
    kpIndex: 6.2,
    onOpenSelfExam: () => { },
    onAskAi: () => { },
  }));
  assert.match(mapHtml, /Interactive Crew Body Map/);
  assert.match(mapHtml, /\/branding\/human-anatomy\.jpg/);
  assert.match(mapHtml, /body-pin status-/);
  assert.doesNotMatch(mapHtml, /M88 55/);
  assert.match(mapHtml, /Metabolic/);
  assert.match(mapHtml, /COUNTERMEASURES/);
  assert.doesNotMatch(mapHtml, /body-3d-controls/);
  assert.doesNotMatch(mapHtml, /body-3d-mode-switch/);
  assert.doesNotMatch(mapHtml, /body-3d-center-btn/);
  assert.doesNotMatch(mapHtml, /Zoom in 3D body view/);

  const body3dSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'BodyAnatomy3D.tsx'), 'utf8');
  assert.match(body3dSource, /createMultidimensionalBackdrop/);
  assert.match(body3dSource, /addFloorSegments/);
  assert.doesNotMatch(body3dSource, /rxBox/);
  assert.doesNotMatch(body3dSource, /railGeom/);
  assert.doesNotMatch(body3dSource, /outerR/);
  assert.match(body3dSource, /chestPect/);
  assert.match(body3dSource, /spineGroove/);
  assert.match(body3dSource, /faceSculpt/);
  assert.match(body3dSource, /FogExp2/);
  assert.match(body3dSource, /zoomToCursor\s*=\s*false/);
  assert.match(body3dSource, /setViewOffset/);
  assert.match(body3dSource, /applyCanvasPan/);
  assert.match(body3dSource, /recenterView/);
  assert.match(body3dSource, /touchCoords/);
  assert.match(body3dSource, /spaceHeld/);
  assert.match(body3dSource, /ArrowLeft/);

  const multiHtml = renderToStaticMarkup(React.createElement(MultiMetricChart, {
    samples: [stressVitals, { ...stressVitals, heart_rate: 84, blood_glucose: 88, timestamp: '2026-11-14T18:01:00Z' }],
  }));
  assert.match(multiHtml, /Blood Sugar/);
  assert.match(multiHtml, /Heart Rate/);
});

test('self-exam local storage, check-in metabolic fields, readiness routines, and flightAssistant fallback work end to end', async () => {
  const { runAndSaveSelfExam, listImageAssessments } = require('../src/services/selfExams.ts');
  const { SelfExamCapture } = require('../src/components/SelfExamCapture.tsx');
  const { evaluateMissionRoutines } = require('../src/services/missionRoutines.ts');
  const { MissionsPage } = require('../src/pages/MissionsPage.tsx');
  const { flightAssistant } = require('../src/services/ai.ts');

  const vitals = {
    astronaut_id: 'ASTRO-01',
    timestamp: '2026-11-14T18:00:00Z',
    heart_rate: 70,
    spo2: 98.5,
    core_temp: 36.7,
    radiation_rate: 12.0,
    hrv: 52,
    blood_glucose: 94,
    hydration_pct: 94,
    wbc_k_ul: 6.2,
    mission_day: 22,
  };

  const savedExam = await runAndSaveSelfExam({
    astronautId: 'ASTRO-01',
    examType: 'ocular_ultrasound',
    dataUrl: '',
    mimeType: 'image/png',
    notes: 'Routine SANS ultrasound check',
    vitals,
    kpIndex: 2.3,
    offline: true,
  });
  assert.equal(savedExam.examType, 'ocular_ultrasound');
  assert.equal(savedExam.analysisSource, 'device-offline');

  const astro1List = await listImageAssessments('ASTRO-01');
  const astro2List = await listImageAssessments('ASTRO-02');
  assert.equal(astro1List.length, 1);
  assert.equal(astro2List.length, 0);

  const examHtml = renderToStaticMarkup(React.createElement(SelfExamCapture, {
    astronautId: 'ASTRO-01',
    vitals,
    kpIndex: 2.3,
    offline: true,
    examType: 'ocular_ultrasound',
    onExamTypeChange: () => { },
    assessments: astro1List,
    onAssessmentSaved: () => { },
  }));
  assert.match(examHtml, /Ocular Ultrasound \(SANS\)/);
  assert.match(examHtml, /Optic nerve sheath diameter/);

  const draft = createCheckInDraft();
  draft.sleepHours = '7.5';
  draft.mood = 'Good';
  draft.exercise = 'yes';
  draft.exerciseMinutes = '35';
  draft.bloodGlucoseMgDl = '98';
  draft.hydrationMl = '2400';
  draft.nutritionQuality = 'optimal';
  draft.immuneSymptoms = 'none';
  const rec = recordFromDraft(draft, 'ASTRO-01', vitals);
  assert.equal(rec.metabolic.bloodGlucoseMgDl, 98);
  assert.equal(rec.metabolic.hydrationMl, 2400);
  assert.equal(rec.metabolic.nutritionQuality, 'optimal');
  assert.deepEqual(rec.metabolic.immuneSymptoms, ['none']);

  const readiness = evaluateMissionRoutines({
    vitals,
    records: [
      sample({ createdAt: `${localDate()}T08:00:00` }),
      sample({ id: 'record-prev', createdAt: `${localDate(new Date(Date.now() - 86400000))}T08:00:00` }),
    ],
    completions: [
      { astronautId: 'ASTRO-01', date: localDate(), missionId: 'sleep' },
      { astronautId: 'ASTRO-01', date: localDate(), missionId: 'physical-ared' },
    ],
    assessments: astro1List,
    kpIndex: 2.3,
  });
  assert.ok(readiness.streakDays >= 2);
  assert.ok(readiness.compliancePct > 0);
  assert.ok(readiness.verifiedCount >= 2);
  assert.ok(readiness.badges.some(b => b.id === 'ared-pro' && b.earned));
  assert.ok(readiness.badges.some(b => b.id === 'sans-watch' && b.earned));
  assert.ok(readiness.badges.some(b => b.id === 'hydrated' && b.earned));

  const missionsHtml = renderToStaticMarkup(React.createElement(MissionsPage, {
    checkedIn: true,
    astronautId: 'ASTRO-01',
    completions: [],
    onToggle: async () => { },
    loading: false,
    loadError: '',
    activitySaving: false,
    readiness,
  }));
  assert.match(missionsHtml, /Check-In Streak/);
  assert.match(missionsHtml, /Today Compliance/);
  assert.match(missionsHtml, /7d Compliance/);
  assert.match(missionsHtml, /All Spaceflight Protocols/);
  assert.doesNotMatch(missionsHtml, /Priority for This Shift/);
  assert.doesNotMatch(missionsHtml, /Filter countermeasures by category/);
  assert.doesNotMatch(missionsHtml, /Past countermeasure compliance/);
  assert.doesNotMatch(missionsHtml, /manual protocols/);
  assert.ok(
    missionsHtml.indexOf('All Spaceflight Protocols') < missionsHtml.indexOf('Today’s protocol compliance'),
    'All Spaceflight Protocols should render on top before compliance summary',
  );
  assert.match(missionsHtml, /mission-card completed protocol-done/);
  assert.match(missionsHtml, /mission-card protocol-pending/);
  assert.match(missionsHtml, /protocol-status-pill done/);
  assert.match(missionsHtml, /protocol-status-pill pending/);
  assert.match(missionsHtml, /Done<\/span>/);
  assert.match(missionsHtml, /To be completed<\/span>/);

  const safeCtx = buildAssistantContext('ASTRO-01', [sample({ astronautId: 'ASTRO-01', symptoms: 'SECRET_SYMPTOM', notes: 'SECRET_NOTE', metabolic: { bloodGlucoseMgDl: 98 } })], [], [], undefined, vitals);
  assert.equal(JSON.stringify(safeCtx).includes('SECRET_SYMPTOM'), false);
  assert.equal(JSON.stringify(safeCtx).includes('SECRET_NOTE'), false);
  const aiReply = await flightAssistant.ask('How is my sleep history?', safeCtx);
  assert.match(aiReply.sourceLabel, /Onboard Demo Fallback/);
  assert.match(aiReply.facts, /7\.5 hours/);

  const { SpaceEnvironmentPanel } = require('../src/components/SpaceEnvironment.tsx');
  const envHtml = renderToStaticMarkup(React.createElement(SpaceEnvironmentPanel, {
    vitals,
    offline: false,
    hideScenarioControls: true,
  }));
  assert.doesNotMatch(envHtml, /Scenario and manual observations/);
  assert.doesNotMatch(envHtml, /Save local context/);
  assert.doesNotMatch(envHtml, /Demo mission type/);

  const { AnalyticsPage } = require('../src/pages/AnalyticsPage.tsx');
  const { CheckInPage: LiveCheckInPage } = require('../src/pages/CheckInPage.tsx');
  const { AIPage: LiveAIPage } = require('../src/pages/AIPage.tsx');

  const liveAnalyticsHtml = renderToStaticMarkup(React.createElement(AnalyticsPage, {
    records: [sample({ astronautId: 'ASTRO-01' })],
    astronaut: { id: 'ASTRO-01', name: 'Cmdr. Vance', resting_hr: 62, role: 'Commander' },
    alerts: [],
    assessments: astro1List,
    vitals: { ...vitals, overall_health_score: 94.2, health_status: 'NOMINAL', mission_day: 22 },
    telemetryHistory: [vitals, { ...vitals, heart_rate: 76, spo2: 97.8, blood_glucose: 102, timestamp: '2026-11-14T18:01:00Z' }],
    kpIndex: 3.1,
  }));
  assert.match(liveAnalyticsHtml, /Open Live Telemetry stream/);
  assert.match(liveAnalyticsHtml, /94\.2 \/ 100/);
  assert.doesNotMatch(liveAnalyticsHtml, /Live Biometric Stream &amp; Rolling Trends/);
  assert.doesNotMatch(liveAnalyticsHtml, /<details/);

  const liveCheckinHtml = renderToStaticMarkup(React.createElement(LiveCheckInPage, {
    astronautId: 'ASTRO-01',
    vitals,
    records: [],
    offline: false,
    gateway: true,
    onSaved: () => { },
  }));
  assert.match(liveCheckinHtml, /Live Telemetry Context/);
  assert.match(liveCheckinHtml, /94 mg\/dL/);
  assert.doesNotMatch(liveCheckinHtml, /<details/);
  assert.doesNotMatch(liveCheckinHtml, /<select/);

  assert.match(missionsHtml, /Live recommendation:/);
  assert.doesNotMatch(missionsHtml, /<details/);

  const liveAiHtml = renderToStaticMarkup(React.createElement(LiveAIPage, {
    context: safeCtx,
    offline: false,
    gateway: true,
  }));
  assert.equal(safeCtx.vitals.heart_rate, 70);
  assert.equal(safeCtx.vitals.blood_glucose, 94);
  assert.doesNotMatch(liveAiHtml, /HR 70 BPM/);
  assert.doesNotMatch(liveAiHtml, /SpO2 /);
  assert.doesNotMatch(liveAiHtml, /Glucose 94 mg\/dL/);
  assert.doesNotMatch(liveAiHtml, /Comms Lag /);
  assert.doesNotMatch(liveAiHtml, /7d Avg Sleep /);
  assert.doesNotMatch(liveAiHtml, /ai-live-strip/);
  assert.match(liveAiHtml, /Medical Consultation/);
  assert.match(liveAiHtml, /assistant-page/);
  assert.match(liveAiHtml, /rows="1"/);
  assert.doesNotMatch(liveAiHtml, /Flight AI/);
  assert.doesNotMatch(liveAiHtml, /Onboard fallback/);
  assert.doesNotMatch(liveAiHtml, /<details/);

  const cssSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.css'), 'utf8');
  assert.match(cssSource, /\.assistant-page \.page-heading h1\s*\{[^}]*font-size:\s*clamp\(18px,\s*1\.55vw,\s*21px\)/);
  assert.match(cssSource, /\.assistant-layout\.assistant-focused\s*\{[^}]*max-width:\s*none/);
  assert.match(cssSource, /\.assistant-focused \.chat-panel\s*\{[^}]*height:\s*clamp\(320px,\s*calc\(100dvh - 265px\),\s*820px\)/);
  assert.match(cssSource, /\.main-shell:has\(\.assistant-page\)\s*\{[^}]*height:\s*100dvh/);
  assert.match(cssSource, /\.assistant-focused \.chat-panel\s*\{[^}]*height:\s*100%;\s*min-height:\s*0/);
  assert.match(cssSource, /\.assistant-focused \.chat-header h2\s*\{[^}]*font-size:\s*13\.5px/);
  assert.match(cssSource, /\.assistant-focused \.suggested-questions\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(cssSource, /\.chat-header>div\s*\{[^}]*flex:\s*1/);
  assert.match(cssSource, /\.chat-composer textarea:focus-visible\s*\{[^}]*outline:\s*none/);
  assert.match(cssSource, /\.ai-command-bar\s*\{[^}]*padding:\s*12px 20px/);
  assert.match(cssSource, /\.main-shell\s*\{[^}]*min-height:\s*100dvh/);
  assert.match(cssSource, /\.page-footer\s*\{[^}]*padding:\s*8px 18px[^}]*font-size:\s*8\.5px/);

  const aiPageSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'AIPage.tsx'), 'utf8');
  assert.match(aiPageSrc, /const \[autoRead,\s*setAutoRead\] = useState\(true\)/);

  const { ECGMonitor } = require('../src/components/ECGMonitor.tsx');
  const { MultiMetricChart: CompactMultiMetric } = require('../src/components/MultiMetricChart.tsx');
  const compactEcgHtml = renderToStaticMarkup(React.createElement(ECGMonitor, {
    heartRate: 72,
    ecgSamples: [0.1, 0.2],
    telemetrySource: 'simulated',
    compact: true,
  }));
  const compactMultiHtml = renderToStaticMarkup(React.createElement(CompactMultiMetric, {
    samples: [vitals, { ...vitals, heart_rate: 76, core_temp: 37.04, timestamp: '2026-11-14T18:01:00Z' }],
    compact: true,
    extended: true,
  }));
  assert.match(compactEcgHtml, /ecg-panel compact/);
  assert.match(compactEcgHtml, /Lead-II ECG Waveform/);
  assert.match(compactMultiHtml, /multi-trend-grid\s+extended\s+compact/);
  assert.match(compactMultiHtml, /Body Temperature/);
  assert.match(compactMultiHtml, /37\.04/);
  assert.match(compactMultiHtml, /viewBox="0 0 280 46"/);

  const appSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.tsx'), 'utf8');
  assert.match(appSource, /secondary-metrics-strip/);
  assert.match(appSource, /daily-panel-grid/);
  assert.doesNotMatch(appSource, /dashboard-grid/);
  assert.doesNotMatch(appSource, /dashboard-aside/);
});

test('countermeasures auto-verify from check-ins/exams, fix physical-ared parity, streamline check-in, and support multi-turn/voice AI safely', async () => {
  const { evaluateMissionRoutines } = require('../src/services/missionRoutines.ts');
  const { missionCatalog, normalizeMissionId } = require('../src/services/missions.ts');
  const { evaluateBodySystems } = require('../src/services/bodyHealthModel.ts');
  const {
    isSpeechRecognitionSupported,
    isMediaRecorderSupported,
    isVoiceDictationSupported,
    isSpeechSynthesisSupported,
    primeAudioPlayback,
    startVoiceDictation,
    speakAssistantReply,
    stopSpeaking,
  } = require('../src/services/voiceAssistant.ts');

  assert.equal(missionCatalog.length, 9);
  assert.equal(normalizeMissionId('exercise'), 'physical-ared');
  assert.equal(normalizeMissionId('sleep'), 'circadian-sleep');
  assert.equal(normalizeMissionId('mood'), 'daily-checkin');

  const todayIso = new Date().toISOString();
  const baseVitals = {
    astronaut_id: 'ASTRO-01',
    timestamp: todayIso,
    heart_rate: 72,
    spo2: 98,
    core_temp: 36.8,
    radiation_rate: 14,
    hrv: 52,
    mission_day: 35,
    gravity_g: 0,
    comms_latency_sec: 1.28,
    blood_glucose: 94,
    hydration_pct: 95,
  };

  // Without manual toggles, Check-In + Self-Exam auto-verify matching protocols.
  const autoCheckIn = sample({
    id: 'today-rec',
    astronautId: 'ASTRO-01',
    createdAt: todayIso,
    sleepHours: 7.5,
    exerciseMinutes: 45,
    symptoms: 'SECRET SYMPTOMS',
    notes: 'SECRET NOTES',
    metabolic: { hydrationMl: 2300, bloodGlucoseMgDl: 94, nutritionQuality: 'optimal' },
  });
  const ocularExam = {
    id: 'exam-ocular-1',
    astronautId: 'ASTRO-01',
    examType: 'ocular_ultrasound',
    recordedAt: todayIso,
    severity: 'nominal',
    findings: 'ONSD symmetric and crisp',
    recommendedActions: [],
    groundConsultRequired: false,
    analysisSource: 'local-demo',
  };
  const readiness = evaluateMissionRoutines({
    vitals: baseVitals,
    records: [autoCheckIn],
    completions: [],
    assessments: [ocularExam],
    kpIndex: 2.3,
  });

  const byId = new Map(readiness.protocolStatuses.map(s => [s.mission.id, s]));
  for (const id of ['daily-checkin', 'physical-ared', 'cardio-aerobic', 'hydration-target', 'glucose-nutrition', 'sans-ultrasound', 'circadian-sleep']) {
    assert.equal(byId.get(id)?.status, 'auto-verified', `expected ${id} auto-verified`);
    assert.equal(byId.get(id)?.completed, true);
  }
  assert.equal(byId.get('dermal-shielding')?.completed, false);
  assert.equal(byId.get('behavioral-sync')?.completed, false);
  assert.equal(readiness.verifiedCount, 7);
  assert.equal(readiness.compliancePct, 78);

  // Confirming legacy 'exercise' or today's Check-In exercise resolves Day-35 bone/muscle warning.
  const withoutAred = evaluateBodySystems({ vitals: baseVitals, latestCheckIn: null, completions: [], kpIndex: 2.3 });
  assert.equal(withoutAred.find(s => s.id === 'musculoskeletal')?.status, 'warning');
  const withLegacyCompletion = evaluateBodySystems({
    vitals: baseVitals,
    latestCheckIn: null,
    completions: [{ key: 'k', astronautId: 'ASTRO-01', missionId: 'exercise', date: localDate(), completedAt: todayIso }],
    kpIndex: 2.3,
  });
  assert.equal(withLegacyCompletion.find(s => s.id === 'musculoskeletal')?.status, 'nominal');
  const withCheckInAred = evaluateBodySystems({
    vitals: baseVitals,
    latestCheckIn: sample({ astronautId: 'ASTRO-01', createdAt: todayIso, exerciseMinutes: 35 }),
    completions: [],
    kpIndex: 2.3,
  });
  assert.equal(withCheckInAred.find(s => s.id === 'musculoskeletal')?.status, 'nominal');

  // Streamlined Check-In renders nominal pre-fill & auto-verify preview cleanly.
  const checkInHtml = renderToStaticMarkup(
    React.createElement(CheckInPage, {
      astronautId: 'ASTRO-01',
      vitals: baseVitals,
      records: [autoCheckIn],
      offline: false,
      gateway: true,
      onSaved: async () => { },
    }),
  );
  assert.match(checkInHtml, /Pre-fill nominal crew shift/);
  assert.match(checkInHtml, /Daily fluid intake \(mL\)/);
  assert.match(checkInHtml, /2200 mL/);
  assert.match(checkInHtml, /Use live sensor/);
  assert.match(checkInHtml, /Auto-verifies on save:/);

  // Assistant supports multi-turn history, pre_eva_brief, sbar_downlink, and excludes private notes.
  const aiContext = buildAssistantContext('ASTRO-01', [autoCheckIn], [], [], undefined, baseVitals, [ocularExam], readiness, 'Metabolic & Nutrition');
  assert.doesNotMatch(JSON.stringify(aiContext), /SECRET/);
  const evaReply = await demoAssistant.ask('Generate Pre-EVA Readiness Brief for this shift.', aiContext, {
    mode: 'pre_eva_brief',
    history: [{ role: 'user', content: 'How is my blood sugar?' }],
  });
  assert.match(evaReply.facts, /Pre-EVA Readiness/i);
  assert.ok(Array.isArray(evaReply.suggestedActions) && evaReply.suggestedActions.length >= 1);

  const sbarReply = await demoAssistant.ask('Generate Ground Downlink SBAR', aiContext, { mode: 'sbar_downlink' });
  assert.ok(sbarReply.sbarText);
  assert.match(sbarReply.sbarText, /S \(Situation\):/);
  assert.match(sbarReply.sbarText, /B \(Background\):/);
  assert.match(sbarReply.sbarText, /A \(Assessment\):/);
  assert.match(sbarReply.sbarText, /R \(Recommendation\):/);
  assert.doesNotMatch(sbarReply.sbarText, /SECRET/);

  // Web Speech & MediaRecorder helpers degrade gracefully in SSR / headless environments without window.
  assert.equal(isSpeechRecognitionSupported(), false);
  assert.equal(isMediaRecorderSupported(), false);
  assert.equal(isVoiceDictationSupported(), false);
  assert.equal(isSpeechSynthesisSupported(), false);
  assert.doesNotThrow(() => primeAudioPlayback());
  assert.equal(startVoiceDictation({ onFinal: () => { } }), null);
  assert.equal(speakAssistantReply('Status nominal'), false);
  assert.doesNotThrow(() => stopSpeaking());
});

test('UTC sleep timing dropdown helpers handle overnight rollovers, presets, current UTC, and accessible markup without native select', () => {
  const {
    UTC_TIME_SLOTS,
    applyUtcTimeSelection,
    formatUtcDateTime,
    utcPresetWindow,
  } = require('../src/services/sleepTiming.ts');
  const { SpaceCheckInFields } = require('../src/components/SpaceCheckInFields.tsx');

  assert.equal(UTC_TIME_SLOTS.length, 48);
  assert.equal(UTC_TIME_SLOTS[0], '00:00');
  assert.equal(UTC_TIME_SLOTS[47], '23:30');

  // Evening start defaults to Yesterday UTC and overnight wake rolls forward cleanly.
  const refNow = new Date('2026-11-15T03:55:00Z');
  assert.equal(formatUtcDateTime(refNow), '2026-11-15T03:55');
  const start = applyUtcTimeSelection({ role: 'start', timePart: '22:00', currentValue: '', otherValue: '', now: refNow });
  assert.equal(start, '2026-11-14T22:00');
  const wake = applyUtcTimeSelection({ role: 'wake', timePart: '06:00', currentValue: '', otherValue: start, now: refNow });
  assert.equal(wake, '2026-11-15T06:00');

  // Leap-day overnight rollover from 2024-02-29T23:00 -> 2024-03-01T07:00.
  const leapWake = applyUtcTimeSelection({
    role: 'wake',
    timePart: '07:00',
    currentValue: '',
    otherValue: '2024-02-29T23:00',
    now: new Date('2024-03-01T07:30:00Z'),
  });
  assert.equal(leapWake, '2024-03-01T07:00');

  // Quick 8h wake-now preset computes exact UTC timestamps.
  const preset = utcPresetWindow(8, refNow);
  assert.deepEqual(preset, { sleepStartUtc: '2026-11-14T19:55', wakeUtc: '2026-11-15T03:55' });

  // Custom listbox renders accessible controls with zero native <select> or datetime-local inputs.
  const sleepUiHtml = renderToStaticMarkup(
    React.createElement(SpaceCheckInFields, {
      step: 0,
      draft: { ...createCheckInDraft(), ...preset },
      update: () => { },
      error: '',
    }),
  );
  assert.doesNotMatch(sleepUiHtml, /<select/);
  assert.doesNotMatch(sleepUiHtml, /datetime-local/);
  assert.match(sleepUiHtml, /aria-haspopup="listbox"/);
  assert.match(sleepUiHtml, /Woke now · 8h sleep/);
  assert.match(sleepUiHtml, /Current time/);
  assert.match(sleepUiHtml, /Apply 8h to sleep duration/);
});

test('SelfExamCapture camera preview CSS bounds video inside panel without overflowing controls or grid', () => {
  const { SelfExamCapture } = require('../src/components/SelfExamCapture.tsx');
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.css'), 'utf8');
  assert.match(css, /\.self-exam-preview\s*\{[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /\.self-exam-preview video[\s\S]*object-fit:\s*cover;/);
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*0\.9fr\)\s*minmax\(0,\s*1\.1fr\);/);

  const html = renderToStaticMarkup(
    React.createElement(SelfExamCapture, {
      astronautId: 'ASTRO-01',
      vitals: {
        astronaut_id: 'ASTRO-01',
        timestamp: '2026-11-15T12:00:00Z',
        heart_rate: 72,
        spo2: 98,
        core_temp: 36.8,
        radiation_rate: 14,
        hrv: 52,
      },
      kpIndex: 2.3,
      offline: false,
      examType: 'dermal_radiation',
      onExamTypeChange: () => { },
      assessments: [],
      onAssessmentSaved: () => { },
    }),
  );
  assert.match(html, /Skin &amp; Radiation Erythema/);
  assert.match(html, /Left forearm cuff check/);
  assert.doesNotMatch(html, /capture="environment"/);
  const captureSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'SelfExamCapture.tsx'), 'utf8');
  assert.doesNotMatch(captureSrc, /capture="environment"/);
  assert.match(captureSrc, /function triggerImageUpload\(\)[\s\S]*?stopCamera\(\);[\s\S]*?fileRef\.current\?\.click\(\)/);
  assert.match(captureSrc, /async function handleFileChange[\s\S]*?stopCamera\(\);/);
});

test('Web Speech TTS prioritizes low-latency local voices and retries alternate local voice cleanly', async () => {
  const {
    splitSpeechChunks,
    pickSpeechVoice,
    speakAssistantReply,
    stopSpeaking,
    resetVoiceAssistantState,
  } = require('../src/services/voiceAssistant.ts');

  const longText = [
    '**Summary**: Metabolic markers stay nominal at **94 mg/dL**.',
    'Hydration reached 2300 mL today with no acute SANS symptoms.',
    'Continue ARED resistance blocks and evening circadian dim-light schedule before sleep.',
    'Escalate to Ground Flight Surgeon immediately if resting heart rate exceeds 115 BPM or dizziness occurs.',
  ].join(' ');
  const chunks = splitSpeechChunks(longText, 140);
  assert.ok(chunks.length >= 2, `Expected multi-chunk split, got ${chunks.length}`);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 140, `Chunk exceeded 140 chars: ${chunk.length}`);
    assert.doesNotMatch(chunk, /[*_`#]/);
  }

  const remoteVoice = { name: 'Google US English', lang: 'en-US', localService: false, default: true, voiceURI: 'remote-us' };
  const localVoice = { name: 'English (America)', lang: 'en-US', localService: true, default: false, voiceURI: 'local-us' };
  const localVoiceAlt = { name: 'English (UK)', lang: 'en-GB', localService: true, default: false, voiceURI: 'local-gb' };
  const espeakVoice = { name: 'English (America)+eSpeak', lang: 'en-US', localService: true, default: true, voiceURI: 'espeak-us' };
  const davidVoice = { name: 'Microsoft David Desktop - English (United States)', lang: 'en-US', localService: true, default: true, voiceURI: 'ms-david' };
  const ariaNatural = { name: 'Microsoft Aria Online (Natural) - English (United States)', lang: 'en-US', localService: false, default: false, voiceURI: 'ms-aria' };

  assert.equal(pickSpeechVoice([remoteVoice, localVoice])?.voiceURI, 'local-us');
  assert.equal(pickSpeechVoice([remoteVoice, localVoice], { preferLocal: false })?.voiceURI, 'remote-us');
  assert.equal(pickSpeechVoice([davidVoice, ariaNatural])?.voiceURI, 'ms-aria');
  assert.equal(pickSpeechVoice([espeakVoice, remoteVoice])?.voiceURI, 'remote-us');
  assert.equal(
    pickSpeechVoice([remoteVoice, localVoice, localVoiceAlt], { preferLocal: true, excludeVoiceUri: 'local-us' })?.voiceURI,
    'local-gb',
  );

  const prevWindow = global.window;
  let cancelCount = 0;
  const spokenUtterances = [];

  class MockUtterance {
    constructor(text) {
      this.text = text;
      this.lang = '';
      this.voice = null;
      this.rate = 1;
      this.pitch = 1;
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
    }
  }

  const mockSynth = {
    speaking: false,
    pending: false,
    paused: false,
    getVoices: () => [remoteVoice, localVoice, localVoiceAlt],
    cancel() {
      cancelCount++;
      this.speaking = false;
      this.pending = false;
    },
    resume() {
      this.paused = false;
    },
    speak(utterance) {
      spokenUtterances.push(utterance);
      this.speaking = true;
    },
  };

  resetVoiceAssistantState();
  global.window = {
    speechSynthesis: mockSynth,
    SpeechSynthesisUtterance: MockUtterance,
  };

  try {
    let startCount = 0;
    let endCount = 0;
    const errors = [];

    // Idle call should NOT trigger cancel() before speak() and picks localService voice immediately.
    const started = speakAssistantReply(longText, {
      onStart: () => startCount++,
      onEnd: () => endCount++,
      onError: msg => errors.push(msg),
    });
    assert.equal(started, true);
    assert.equal(cancelCount, 0);
    assert.equal(spokenUtterances.length, 1);
    assert.equal(spokenUtterances[0].voice.voiceURI, 'local-us');

    const defaultChunks = splitSpeechChunks(longText);
    assert.ok(defaultChunks.length >= 2);
    for (let i = 0; i < defaultChunks.length; i++) {
      const current = spokenUtterances[i];
      current.onstart?.();
      mockSynth.speaking = false;
      current.onend?.();
    }
    assert.equal(startCount, 1);
    assert.equal(endCount, 1);
    assert.equal(errors.length, 0);

    // Local voice failure automatically retries once on alternate localService voice after cancel settles.
    spokenUtterances.length = 0;
    let fallbackEnds = 0;
    let fallbackStarts = 0;
    const fallbackErrors = [];
    speakAssistantReply('Short hydration reminder. Check water log.', {
      onStart: () => fallbackStarts++,
      onEnd: () => fallbackEnds++,
      onError: msg => fallbackErrors.push(msg),
    });
    assert.equal(spokenUtterances.length, 1);
    assert.equal(spokenUtterances[0].voice.voiceURI, 'local-us');
    spokenUtterances[0].onerror?.({ error: 'synthesis-failed' });

    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(spokenUtterances.length, 2, 'Expected automatic retry on alternate local voice');
    assert.equal(spokenUtterances[1].voice.voiceURI, 'local-gb');
    spokenUtterances[1].onstart?.();
    spokenUtterances[1].onend?.();
    assert.equal(fallbackStarts, 1);
    assert.equal(fallbackEnds, 1);
    assert.equal(fallbackErrors.length, 0);

    stopSpeaking();
  } finally {
    resetVoiceAssistantState();
    global.window = prevWindow;
  }
});

test('Web Speech TTS falls back without repeat delay when voices probe settled and reuses primed audio element', async () => {
  const {
    preloadSpeechVoices,
    primeAudioPlayback,
    speakAssistantReply,
    resetVoiceAssistantState,
  } = require('../src/services/voiceAssistant.ts');

  const prevWindow = global.window;
  const prevCreateUrl = URL.createObjectURL;
  const prevRevokeUrl = URL.revokeObjectURL;

  const createdAudio = [];
  let fetchCalls = 0;
  let revokedCount = 0;

  class MockAudio {
    constructor(src = '') {
      this.src = src;
      this.muted = false;
      this.preload = '';
      this.onplay = null;
      this.onended = null;
      this.onerror = null;
      this.paused = true;
      createdAudio.push(this);
    }
    async play() {
      this.paused = false;
      this.onplay?.();
    }
    pause() {
      this.paused = true;
    }
  }

  class MockUtterance {
    constructor(text) {
      this.text = text;
    }
  }

  URL.createObjectURL = () => 'blob:mock-wav-1';
  URL.revokeObjectURL = () => {
    revokedCount++;
  };

  resetVoiceAssistantState();
  global.window = {
    Audio: MockAudio,
    SpeechSynthesisUtterance: MockUtterance,
    speechSynthesis: {
      speaking: false,
      pending: false,
      paused: false,
      getVoices: () => [],
      cancel() { },
      resume() { },
      speak() {
        throw new Error('Should not speak via Web Speech when zero voices exist');
      },
    },
  };

  try {
    preloadSpeechVoices();
    primeAudioPlayback();
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(createdAudio.length, 1, 'Expected one persistent primed audio element');

    let starts = 0;
    let ends = 0;
    const errors = [];
    const text = 'Astronaut telemetry nominal across all systems.';
    const started = speakAssistantReply(text, {
      onStart: () => starts++,
      onEnd: () => ends++,
      onError: msg => errors.push(msg),
      fetchAudio: async () => {
        fetchCalls++;
        return new Blob(['RIFF'], { type: 'audio/wav' });
      },
    });
    assert.equal(started, true);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(fetchCalls, 1);
    assert.equal(createdAudio.length, 1, 'Expected Tier 2 playback to reuse primed HTMLAudioElement for Safari/mobile');
    assert.equal(createdAudio[0].src, 'blob:mock-wav-1');
    assert.equal(starts, 1);
    assert.equal(errors.length, 0);

    createdAudio[0].onended?.();
    assert.equal(ends, 1);
    assert.ok(revokedCount >= 1);

    // Repeat play reuses cached Blob with 0 additional fetches and still reuses primedAudio.
    speakAssistantReply(text, {
      onStart: () => starts++,
      onEnd: () => ends++,
      onError: msg => errors.push(msg),
      fetchAudio: async () => {
        fetchCalls++;
        return new Blob(['RIFF'], { type: 'audio/wav' });
      },
    });
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(fetchCalls, 1, 'Expected cached audio Blob reuse without second fetch');
    assert.equal(createdAudio.length, 1);
    createdAudio[0].onended?.();
    assert.equal(ends, 2);
  } finally {
    resetVoiceAssistantState();
    global.window = prevWindow;
    URL.createObjectURL = prevCreateUrl;
    URL.revokeObjectURL = prevRevokeUrl;
  }
});

test('Voice dictation automatically falls back from Web Speech network error to MediaRecorder STT and supports browsers without SpeechRecognition', async () => {
  const {
    isVoiceDictationSupported,
    pickRecorderMimeType,
    startVoiceDictation,
    resetVoiceAssistantState,
  } = require('../src/services/voiceAssistant.ts');

  const prevWindow = global.window;
  const prevNavigatorDesc = Object.getOwnPropertyDescriptor(global, 'navigator');

  let trackStops = 0;
  let speechStartCount = 0;
  let recorderInstances = 0;
  let lastRecorder = null;
  let abortedSpeech = false;

  class MockSpeechRecognition {
    constructor() {
      this.lang = '';
      this.continuous = false;
      this.interimResults = false;
      this.onresult = null;
      this.onerror = null;
      this.onend = null;
    }
    start() {
      speechStartCount++;
      setTimeout(() => {
        this.onerror?.({ error: 'network' });
        this.onend?.();
      }, 5);
    }
    stop() { }
    abort() {
      abortedSpeech = true;
    }
  }

  class MockMediaRecorder {
    static isTypeSupported(mime) {
      return mime === 'audio/mp4';
    }
    constructor(stream, opts = {}) {
      recorderInstances++;
      this.stream = stream;
      this.mimeType = opts.mimeType || 'audio/mp4';
      this.state = 'inactive';
      this.ondataavailable = null;
      this.onerror = null;
      this.onstop = null;
      lastRecorder = this;
    }
    start() {
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob(['mock-audio-data'], { type: this.mimeType }) });
      this.onstop?.();
    }
  }

  assert.equal(pickRecorderMimeType(mime => mime === 'audio/webm;codecs=opus'), 'audio/webm;codecs=opus');
  assert.equal(pickRecorderMimeType(mime => mime === 'audio/mp4'), 'audio/mp4');

  resetVoiceAssistantState();
  Object.defineProperty(global, 'navigator', {
    configurable: true,
    writable: true,
    value: {
      onLine: true,
      mediaDevices: {
        async getUserMedia() {
          return {
            getTracks: () => [
              {
                stop() {
                  trackStops++;
                },
              },
            ],
          };
        },
      },
    },
  });
  global.window = {
    SpeechRecognition: MockSpeechRecognition,
    MediaRecorder: MockMediaRecorder,
  };

  try {
    assert.equal(isVoiceDictationSupported(), true);

    const finals = [];
    const errors = [];
    const processingStates = [];
    let endCount = 0;
    let sentMime = '';
    let sentB64 = '';

    const handle1 = startVoiceDictation({
      onFinal: text => finals.push(text),
      onError: err => errors.push(err),
      onProcessing: busy => processingStates.push(busy),
      onEnd: () => endCount++,
      transcribeAudio: async (b64, mime) => {
        sentB64 = b64;
        sentMime = mime;
        return 'Check my blood sugar trend';
      },
    });
    assert.ok(handle1);

    // Wait for async SpeechRecognition 'network' error -> automatic MediaRecorder startup.
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(speechStartCount, 1);
    assert.equal(abortedSpeech, true);
    assert.equal(recorderInstances, 1);
    assert.equal(errors.length, 0, 'Network error should trigger seamless MediaRecorder fallback without surfacing error');

    handle1.stop();
    await new Promise(resolve => setTimeout(resolve, 40));

    assert.equal(trackStops, 1, 'Expected microphone track to stop cleanly after recording');
    assert.equal(sentMime, 'audio/mp4');
    assert.equal(Buffer.from(sentB64, 'base64').toString('utf8'), 'mock-audio-data');
    assert.deepEqual(processingStates, [true, false]);
    assert.deepEqual(finals, ['Check my blood sugar trend']);
    assert.equal(endCount, 1);

    // Next click in same session (or Firefox with no SpeechRecognition) skips blocked SpeechRecognition directly.
    delete global.window.SpeechRecognition;
    const handle2 = startVoiceDictation({
      onFinal: text => finals.push(text),
      onError: err => errors.push(err),
      transcribeAudio: async () => 'Pre-EVA readiness check',
    });
    assert.ok(handle2);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(speechStartCount, 1, 'Should not invoke Web Speech again once skipped/unsupported');
    assert.equal(recorderInstances, 2);
    assert.equal(lastRecorder?.mimeType, 'audio/mp4');
    handle2.stop();
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(trackStops, 2);
    assert.deepEqual(finals, ['Check my blood sugar trend', 'Pre-EVA readiness check']);
  } finally {
    resetVoiceAssistantState();
    global.window = prevWindow;
    if (prevNavigatorDesc) {
      Object.defineProperty(global, 'navigator', prevNavigatorDesc);
    } else {
      delete global.navigator;
    }
  }
});

test('Voice dictation automatically ends after 3-second delay without voice input and AIPage auto-prompts model', async () => {
  const {
    VOICE_SILENCE_DELAY_MS,
    startVoiceDictation,
    resetVoiceAssistantState,
  } = require('../src/services/voiceAssistant.ts');

  assert.equal(VOICE_SILENCE_DELAY_MS, 3000);

  const prevWindow = global.window;
  const prevNavigatorDesc = Object.getOwnPropertyDescriptor(global, 'navigator');

  let activeInstance = null;
  class MockSpeechRecognitionTimed {
    constructor() {
      this.lang = '';
      this.continuous = false;
      this.interimResults = false;
      this.onresult = null;
      this.onerror = null;
      this.onend = null;
      this.onaudiostart = null;
      this.onsoundstart = null;
      this.onspeechstart = null;
      this.stopped = false;
      activeInstance = this;
    }
    start() {
      this.onaudiostart?.();
    }
    stop() {
      this.stopped = true;
      this.onend?.();
    }
    abort() {
      this.stopped = true;
    }
  }

  global.window = {
    SpeechRecognition: MockSpeechRecognitionTimed,
  };

  try {
    resetVoiceAssistantState();

    // Inactivity timeout with no speech: fires onError with no-speech and stops
    const errors = [];
    let ended = false;
    const finals = [];
    startVoiceDictation({
      silenceTimeoutMs: 35,
      onError: err => errors.push(err),
      onEnd: () => { ended = true; },
      onFinal: txt => finals.push(txt),
    });

    await new Promise(resolve => setTimeout(resolve, 55));
    assert.equal(ended, true);
    assert.deepEqual(finals, []);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /No speech detected/);

    // Speech activity resets silence timer, then auto-ends with onFinal
    errors.length = 0;
    ended = false;
    finals.length = 0;
    const interims = [];

    startVoiceDictation({
      silenceTimeoutMs: 40,
      onError: err => errors.push(err),
      onEnd: () => { ended = true; },
      onInterim: txt => interims.push(txt),
      onFinal: txt => finals.push(txt),
    });

    // Send speech at 20ms
    await new Promise(resolve => setTimeout(resolve, 20));
    activeInstance.onresult?.({
      resultIndex: 0,
      results: [{ 0: { transcript: 'What is my current heart rate?' }, isFinal: true, length: 1 }],
    });

    // At 30ms (10ms after speech), it should still be listening because speech reset the timer
    assert.equal(ended, false);
    assert.equal(finals.length, 0);

    // At 75ms (55ms after speech), the 40ms silence timer has expired and auto-ended
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(ended, true);
    assert.deepEqual(finals, ['What is my current heart rate?']);
    assert.equal(errors.length, 0);

    // Fallback MediaRecorder also auto-stops on silence timeout
    delete global.window.SpeechRecognition;
    let recorderStopped = false;
    const recorderMime = 'audio/mp4';
    class AutoStopRecorder {
      static isTypeSupported() { return true; }
      constructor(stream, opts = {}) {
        this.stream = stream;
        this.mimeType = opts.mimeType || 'audio/mp4';
        this.state = 'inactive';
        this.ondataavailable = null;
        this.onstop = null;
      }
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        recorderStopped = true;
        this.ondataavailable?.({ data: new Blob(['audio-bytes'], { type: recorderMime }) });
        this.onstop?.();
      }
    }

    Object.defineProperty(global, 'navigator', {
      configurable: true,
      writable: true,
      value: {
        onLine: true,
        mediaDevices: {
          async getUserMedia() {
            return { getTracks: () => [{ stop() { } }] };
          },
        },
      },
    });
    global.window = { MediaRecorder: AutoStopRecorder };

    const recorderFinals = [];
    startVoiceDictation({
      silenceTimeoutMs: 40,
      onFinal: txt => recorderFinals.push(txt),
      transcribeAudio: async () => 'Telemetry status nominal',
    });

    await new Promise(resolve => setTimeout(resolve, 65));
    assert.equal(recorderStopped, true, 'Recorder should auto-stop after silence timeout without manual stop() call');
    assert.deepEqual(recorderFinals, ['Telemetry status nominal']);

    // Verify AIPage contains auto-prompt send logic and audio priming
    const aiPageSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'AIPage.tsx'), 'utf8');
    assert.match(aiPageSource, /void\s+send\(fullPrompt,\s*'chat'\)/);
    assert.match(aiPageSource, /primeAudioPlayback\(\)/);
  } finally {
    resetVoiceAssistantState();
    global.window = prevWindow;
    if (prevNavigatorDesc) {
      Object.defineProperty(global, 'navigator', prevNavigatorDesc);
    } else {
      delete global.navigator;
    }
  }
});

test('Web Speech TTS skips robotic-only eSpeak voices in favor of Tier 2 neural audio when online', async () => {
  const {
    speakAssistantReply,
    resetVoiceAssistantState,
  } = require('../src/services/voiceAssistant.ts');

  const prevWindow = global.window;
  const prevCreateUrl = URL.createObjectURL;
  const prevRevokeUrl = URL.revokeObjectURL;

  let webSpeechCalls = 0;
  let serverAudioCalls = 0;
  const createdAudio = [];

  class MockAudio {
    constructor(src = '') {
      this.src = src;
      this.muted = false;
      this.preload = '';
      this.onplay = null;
      this.onended = null;
      this.onerror = null;
      this.paused = true;
      createdAudio.push(this);
    }
    async play() {
      this.paused = false;
      this.onplay?.();
    }
    pause() {
      this.paused = true;
    }
  }

  class MockUtterance {
    constructor(text) {
      this.text = text;
    }
  }

  URL.createObjectURL = () => 'blob:edge-mp3-1';
  URL.revokeObjectURL = () => { };

  const roboticOnly = {
    name: 'English (America)+eSpeak',
    lang: 'en-US',
    localService: true,
    default: true,
    voiceURI: 'espeak-us',
  };

  resetVoiceAssistantState();
  global.window = {
    Audio: MockAudio,
    SpeechSynthesisUtterance: MockUtterance,
    speechSynthesis: {
      speaking: false,
      pending: false,
      paused: false,
      getVoices: () => [roboticOnly],
      cancel() { },
      resume() { },
      speak() {
        webSpeechCalls++;
      },
    },
  };

  try {
    let ends = 0;
    const started = speakAssistantReply('Edge neural fallback active.', {
      onEnd: () => ends++,
      fetchAudio: async () => {
        serverAudioCalls++;
        return new Blob(['ID3'], { type: 'audio/mpeg' });
      },
    });
    assert.equal(started, true);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(webSpeechCalls, 0, 'Should bypass robotic eSpeak Tier 1 when online server audio is available');
    assert.equal(serverAudioCalls, 1);
    assert.equal(createdAudio.length, 1);
    createdAudio[0].onended?.();
    assert.equal(ends, 1);

    // If a primed Audio element enters error state, fallback discards it and creates a fresh Audio instance,
    // and request timeouts surface an explicit error instead of leaving UI stuck.
    const { primeAudioPlayback } = require('../src/services/voiceAssistant.ts');
    resetVoiceAssistantState();
    createdAudio.length = 0;
    primeAudioPlayback();
    assert.equal(createdAudio.length, 1);
    createdAudio[0].error = { code: 4 };

    speakAssistantReply('Fresh element after primed error.', {
      onEnd: () => ends++,
      fetchAudio: async () => new Blob(['ID3'], { type: 'audio/mpeg' }),
    });
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(createdAudio.length, 2, 'Should bypass errored primedAudio with fresh Audio instance');
    createdAudio[1].onended?.();
    assert.equal(ends, 2);

    const timeoutErrors = [];
    speakAssistantReply('Timeout should notify error callback.', {
      onError: msg => timeoutErrors.push(msg),
      fetchAudio: async () => {
        throw new Error('Request timed out before audio synthesis completed.');
      },
    });
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(timeoutErrors.length, 1);
    assert.match(timeoutErrors[0], /timed out/i);
  } finally {
    resetVoiceAssistantState();
    global.window = prevWindow;
    URL.createObjectURL = prevCreateUrl;
    URL.revokeObjectURL = prevRevokeUrl;
  }
});

test('SelfExamCapture keeps the 3 clinical domains and formats observation speech for Edge TTS readout', () => {
  const { SELF_EXAM_GUIDES, buildObservationSpeechText } = require('../src/services/selfExams.ts');
  const { SelfExamCapture } = require('../src/components/SelfExamCapture.tsx');

  assert.deepEqual(Object.keys(SELF_EXAM_GUIDES), [
    'ocular_ultrasound',
    'dermal_radiation',
    'glucometer_nutrition',
  ]);

  const examHtml = renderToStaticMarkup(React.createElement(SelfExamCapture, {
    astronautId: 'ASTRO-01',
    vitals: {
      astronaut_id: 'ASTRO-01',
      timestamp: '2026-11-15T08:00:00Z',
      heart_rate: 72,
      spo2: 98.5,
      core_temp: 36.8,
      radiation_rate: 15.0,
      hrv: 52,
      blood_glucose: 94,
      hydration_pct: 94,
      wbc_k_ul: 6.1,
      mission_day: 24,
    },
    kpIndex: 2.2,
    offline: false,
    examType: 'dermal_radiation',
    onExamTypeChange: () => { },
    assessments: [],
    onAssessmentSaved: () => { },
  }));
  assert.doesNotMatch(examHtml, /All 3 Domains \(Combined\)/);
  assert.match(examHtml, /Ocular Ultrasound \(SANS\)/);
  assert.match(examHtml, /Skin &amp; Radiation Erythema/);
  assert.match(examHtml, /Glucometer &amp; Intake Check/);

  const captureSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'SelfExamCapture.tsx'), 'utf8');
  assert.match(captureSrc, /preferServerAudio:\s*true/);
  assert.match(captureSrc, /Auto-read/);
  assert.match(captureSrc, /Read Aloud/);
  assert.match(captureSrc, /Synthesizing\.\.\./);
  assert.match(captureSrc, /primeAudioPlayback\(\)/);

  const todayIso = new Date().toISOString();
  const speechText = buildObservationSpeechText({
    id: 'dermal-1',
    astronautId: 'ASTRO-01',
    examType: 'dermal_radiation',
    recordedAt: todayIso,
    severity: 'warning',
    findings: 'Mild post-EVA forearm erythema.',
    recommendedActions: ['Rinse with sterile saline', 'Recheck border in 12 hours'],
    groundConsultRequired: true,
    analysisSource: 'gemini-vision',
  });
  assert.match(speechText, /Skin & Radiation Erythema assessment: warning/);
  assert.match(speechText, /Rinse with sterile saline/);
  assert.match(speechText, /Ground Flight Surgeon review is recommended/);
});

test('speakAssistantReply preferServerAudio prioritizes Edge TTS over local OS voices and falls back cleanly', async () => {
  const { speakAssistantReply, resetVoiceAssistantState } = require('../src/services/voiceAssistant.ts');
  const prevWindow = global.window;
  const prevCreateUrl = URL.createObjectURL;
  const prevRevokeUrl = URL.revokeObjectURL;

  let serverCalls = 0;
  let webSpeechCalls = 0;
  const createdAudio = [];
  class MockAudio {
    constructor(src) {
      this.src = src || '';
      this.muted = false;
      this.error = null;
      this.onplay = null;
      this.onended = null;
      this.onerror = null;
      createdAudio.push(this);
    }
    pause() { }
    removeAttribute() { }
    load() { }
    play() {
      this.onplay?.();
      return Promise.resolve();
    }
  }
  class MockUtterance {
    constructor(text) {
      this.text = text;
    }
  }
  const naturalVoice = {
    name: 'Samantha',
    lang: 'en-US',
    localService: true,
    default: true,
    voiceURI: 'com.apple.voice.Samantha',
  };

  URL.createObjectURL = () => 'blob:mock-edge-mp3';
  URL.revokeObjectURL = () => { };
  resetVoiceAssistantState();
  global.window = {
    Audio: MockAudio,
    SpeechSynthesisUtterance: MockUtterance,
    speechSynthesis: {
      speaking: false,
      pending: false,
      paused: false,
      getVoices: () => [naturalVoice],
      cancel() { },
      resume() { },
      speak(utt) {
        webSpeechCalls++;
        utt.onstart?.();
        utt.onend?.();
      },
    },
  };

  try {
    let ends = 0;
    const ok = speakAssistantReply('Observation findings look nominal across all domains.', {
      preferServerAudio: true,
      onEnd: () => ends++,
      fetchAudio: async () => {
        serverCalls++;
        return new Blob(['ID3'], { type: 'audio/mpeg' });
      },
    });
    assert.equal(ok, true);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(serverCalls, 1, 'Expected preferServerAudio to request Edge TTS immediately');
    assert.equal(webSpeechCalls, 0, 'Expected natural OS voice not to preempt preferServerAudio');
    createdAudio[0].onended?.();
    assert.equal(ends, 1);

    // Server TTS failure should fall back to Tier 1 local OS voice when available.
    resetVoiceAssistantState();
    speakAssistantReply('Uncached observation text for fallback test.', {
      preferServerAudio: true,
      onEnd: () => ends++,
      fetchAudio: async () => {
        serverCalls++;
        throw new Error('Upstream TTS temporarily unreachable');
      },
    });
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(serverCalls, 2);
    assert.equal(webSpeechCalls, 1, 'Expected clean Tier 1 local speech fallback after server error');
    assert.equal(ends, 2);
  } finally {
    resetVoiceAssistantState();
    global.window = prevWindow;
    URL.createObjectURL = prevCreateUrl;
    URL.revokeObjectURL = prevRevokeUrl;
  }
});

test('toRemoteCheckInPayload strips private free-text notes while preserving trend metrics and remoteRowToCheckIn round-trips cleanly', () => {
  const now = new Date('2026-11-15T12:00:00Z');
  const record = sample({
    id: 'db-checkin-ASTRO-01-01',
    astronautId: 'ASTRO-01',
    createdAt: now.toISOString(),
    symptoms: 'SECRET SYMPTOMS',
    notes: 'SECRET REFLECTION',
    biometrics: {
      astronaut_id: 'ASTRO-01',
      timestamp: now.toISOString(),
      heart_rate: 64,
      spo2: 98.5,
      core_temp: 36.8,
      radiation_rate: 15.2,
      hrv: 52,
      telemetry_source: 'simulated',
      overall_health_score: 91.2,
      health_status: 'NOMINAL',
    },
    metabolic: {
      bloodGlucoseMgDl: 94,
      hydrationMl: 2450,
      nutritionQuality: 'optimal',
      immuneSymptoms: [],
    },
    spaceWellness: {
      version: 1,
      mode: 'local-demo',
      pain: { intensity: 2, location: 'SECRET LOCATION', notes: 'SECRET PAIN NOTE' },
      mental: { isolation: 2, socialConnection: 4, emotionalWellbeing: 4 },
      sleep: sleepTiming('2026-11-14T22:00', '2026-11-15T05:30'),
    },
  });

  const payload = toRemoteCheckInPayload(record);
  assert.doesNotMatch(JSON.stringify(payload), /SECRET/);
  assert.equal(payload.client_id, 'db-checkin-ASTRO-01-01');
  assert.equal(payload.pain_level, 2);
  assert.equal(payload.blood_glucose_mg_dl, 94);
  assert.equal(payload.hydration_ml, 2450);

  const roundTripped = remoteRowToCheckIn({
    id: 'pg-uuid-1',
    client_id: String(payload.client_id),
    astronaut_id: String(payload.astronaut_id),
    recorded_at: String(payload.recorded_at),
    mood: Number(payload.mood),
    energy: Number(payload.energy),
    stress: Number(payload.stress),
    sleep_hours: Number(payload.sleep_hours),
    pain_level: Number(payload.pain_level),
    blood_glucose_mg_dl: Number(payload.blood_glucose_mg_dl),
    hydration_ml: Number(payload.hydration_ml),
    nutrition_quality: String(payload.nutrition_quality),
    immune_symptoms: [],
    metrics: payload.metrics,
  });

  assert.equal(validateCheckIn(roundTripped), null);
  assert.equal(roundTripped.syncStatus, 'synced');
  assert.equal(roundTripped.metabolic.bloodGlucoseMgDl, 94);
  assert.equal(roundTripped.metabolic.hydrationMl, 2450);
  assert.equal(roundTripped.spaceWellness.pain.intensity, 2);
  assert.equal(roundTripped.spaceWellness.sleep.windowMinutes, 450);
  assert.equal(roundTripped.biometrics.heart_rate, 64);

  const exam = remoteRowToAssessment({
    id: 'pg-exam-1',
    client_id: 'db-exam-ASTRO-01-01',
    astronaut_id: 'ASTRO-01',
    exam_type: 'ocular_ultrasound',
    recorded_at: now.toISOString(),
    severity: 'nominal',
    findings: 'Symmetric ONSD 4.2 mm',
    recommended_actions: ['Continue routine monitoring'],
    ground_consult_required: false,
    analysis_source: 'database-baseline',
  });
  assert.equal(exam.id, 'db-exam-ASTRO-01-01');
  assert.equal(exam.examType, 'ocular_ultrasound');
  assert.equal(exam.findings, 'Symmetric ONSD 4.2 mm');
});

test('online HTTP browser hydrates check-ins and self-exams from DB and persists new check-ins remotely', async () => {
  const { listImageAssessments } = require('../src/services/selfExams.ts');
  const prevWindow = globalThis.window;
  const prevFetch = globalThis.fetch;
  const prevNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const postedPayloads = [];

  try {
    globalThis.window = { location: { origin: 'http://localhost:5173' } };
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
    globalThis.fetch = async (url, init) => {
      const target = String(url);
      if (init?.method === 'POST' && target.includes('/wellness/checkins')) {
        postedPayloads.push(JSON.parse(String(init.body)));
        return { ok: true, json: async () => ({ persisted: true, client_id: 'user-db-checkin-1' }) };
      }
      if (target.includes('/wellness/checkins/ASTRO-01')) {
        return {
          ok: true,
          json: async () => ({
            records: [
              {
                client_id: 'db-checkin-ASTRO-01-01',
                astronaut_id: 'ASTRO-01',
                recorded_at: '2026-11-15T10:00:00Z',
                mood: 4,
                energy: 4,
                stress: 2,
                sleep_hours: 7.4,
                blood_glucose_mg_dl: 91,
                hydration_ml: 2400,
                nutrition_quality: 'optimal',
                immune_symptoms: [],
                metrics: { sleepQuality: 4, fatigue: 2, moodLabel: 'Good', exerciseMinutes: 45 },
              },
            ],
          }),
        };
      }
      if (target.includes('/wellness/assessments/ASTRO-01')) {
        return {
          ok: true,
          json: async () => ({
            records: [
              {
                client_id: 'db-exam-ASTRO-01-01',
                astronaut_id: 'ASTRO-01',
                exam_type: 'dermal_radiation',
                recorded_at: '2026-11-14T08:00:00Z',
                severity: 'nominal',
                findings: 'Clear forearm skin post-EVA',
                recommended_actions: ['Routine hydration'],
                ground_consult_required: false,
                analysis_source: 'database-baseline',
              },
            ],
          }),
        };
      }
      throw new Error(`Unexpected fetch URL: ${target}`);
    };

    const hydrated = await checkins.list('ASTRO-01');
    assert.equal(hydrated.length, 1);
    assert.equal(hydrated[0].id, 'db-checkin-ASTRO-01-01');
    assert.equal(hydrated[0].syncStatus, 'synced');

    const hydratedExams = await listImageAssessments('ASTRO-01');
    assert.equal(hydratedExams.length, 1);
    assert.equal(hydratedExams[0].id, 'db-exam-ASTRO-01-01');
    assert.equal(hydratedExams[0].examType, 'dermal_radiation');

    await checkins.save(sample({ id: 'user-db-checkin-1', astronautId: 'ASTRO-01', notes: 'LOCAL ONLY NOTE' }));
    assert.equal(postedPayloads.length, 1);
    assert.equal(postedPayloads[0].client_id, 'user-db-checkin-1');
    assert.doesNotMatch(JSON.stringify(postedPayloads[0]), /LOCAL ONLY NOTE/);
    const localAfterSave = await db.checkins.get('user-db-checkin-1');
    assert.equal(localAfterSave.syncStatus, 'synced');
  } finally {
    globalThis.window = prevWindow;
    globalThis.fetch = prevFetch;
    if (prevNav) Object.defineProperty(globalThis, 'navigator', prevNav);
  }
});

test('seedSimulatedHistory builds 24 chronological points and AnalyticsPage renders DB trends without demo buttons', () => {
  const now = new Date();
  const simConfig = defaultSimulationConfig();
  const history = seedSimulatedHistory('ASTRO-01', 'NONE', simConfig, 24, 90, now.getTime());
  assert.equal(history.length, 24);
  for (let i = 1; i < history.length; i++) {
    assert.ok(history[i].timestamp > history[i - 1].timestamp);
  }
  const uniqueHr = new Set(history.map(h => h.heart_rate));
  assert.ok(uniqueHr.size >= 3, 'Expected simulated telemetry history to show orbital wave variation');

  const dbCheckins = [0, 1, 2, 3, 4].map(dayOffset => remoteRowToCheckIn({
    client_id: `db-checkin-ASTRO-01-0${dayOffset + 1}`,
    astronaut_id: 'ASTRO-01',
    recorded_at: new Date(now.getTime() - dayOffset * 24 * 3600_000).toISOString(),
    mood: 4,
    energy: 4,
    stress: 2,
    sleep_hours: 7.2,
    pain_level: 0,
    blood_glucose_mg_dl: 92 + dayOffset,
    hydration_ml: 2400,
    nutrition_quality: 'optimal',
    immune_symptoms: [],
    metrics: {
      sleepQuality: 4,
      fatigue: 2,
      moodLabel: 'Good',
      exerciseMinutes: 45,
      biometrics: {
        astronaut_id: 'ASTRO-01',
        timestamp: new Date(now.getTime() - dayOffset * 24 * 3600_000).toISOString(),
        heart_rate: 62 + dayOffset,
        spo2: 98.5,
        core_temp: 36.8,
        radiation_rate: 15.1,
        hrv: 52,
        telemetry_source: 'simulated',
      },
    },
  }));
  const dbExams = [
    remoteRowToAssessment({
      client_id: 'db-exam-ASTRO-01-01',
      astronaut_id: 'ASTRO-01',
      exam_type: 'ocular_ultrasound',
      recorded_at: now.toISOString(),
      severity: 'nominal',
      findings: 'Bilateral ONSD 4.2 mm',
      recommended_actions: ['Continue routine monitoring'],
      ground_consult_required: false,
      analysis_source: 'database-baseline',
    }),
  ];

  const html = renderToStaticMarkup(React.createElement(AnalyticsPage, {
    records: dbCheckins,
    astronaut: { id: 'ASTRO-01', name: 'Cmdr. Elena Vance', role: 'Mission Commander', age: 39, resting_hr: 62 },
    alerts: [],
    assessments: dbExams,
    vitals: history[history.length - 1],
    telemetryHistory: history,
    simConfig,
    kpIndex: 2.3,
  }));

  assert.doesNotMatch(html, /Populate Demo Data/);
  assert.doesNotMatch(html, /Clear Demo Data/);
  assert.match(html, /<svg/);
  assert.match(html, /Sleep duration/);
  assert.match(html, /Check-in heart rate/);
  assert.match(html, /Check-in blood sugar/);
  assert.match(html, /Saved camera &amp; ultrasound exams/);
});

test('speakAssistantReply defaults to Edge TTS server audio when preferServerAudio is omitted', async () => {
  const { speakAssistantReply, resetVoiceAssistantState } = require('../src/services/voiceAssistant.ts');
  const prevWindow = global.window;
  const prevCreateUrl = URL.createObjectURL;
  const prevRevokeUrl = URL.revokeObjectURL;

  let serverCalls = 0;
  let webSpeechCalls = 0;
  const createdAudio = [];
  class MockAudio {
    constructor(src) {
      this.src = src || '';
      this.muted = false;
      this.error = null;
      this.onplay = null;
      this.onended = null;
      this.onerror = null;
      createdAudio.push(this);
    }
    pause() { }
    removeAttribute() { }
    load() { }
    play() {
      this.onplay?.();
      return Promise.resolve();
    }
  }
  class MockUtterance {
    constructor(text) {
      this.text = text;
    }
  }
  const naturalVoice = {
    name: 'Samantha',
    lang: 'en-US',
    localService: true,
    default: true,
    voiceURI: 'com.apple.voice.Samantha',
  };

  URL.createObjectURL = () => 'blob:default-edge-mp3';
  URL.revokeObjectURL = () => { };
  resetVoiceAssistantState();
  global.window = {
    Audio: MockAudio,
    SpeechSynthesisUtterance: MockUtterance,
    speechSynthesis: {
      speaking: false,
      pending: false,
      paused: false,
      getVoices: () => [naturalVoice],
      cancel() { },
      resume() { },
      speak(utt) {
        webSpeechCalls++;
        utt.onstart?.();
        utt.onend?.();
      },
    },
  };

  try {
    let ends = 0;
    const ok = speakAssistantReply('Default Edge TTS should run without preferServerAudio flag.', {
      onEnd: () => ends++,
      fetchAudio: async () => {
        serverCalls++;
        return new Blob(['ID3'], { type: 'audio/mpeg' });
      },
    });
    assert.equal(ok, true);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(serverCalls, 1, 'Expected omitted preferServerAudio to default to Edge TTS server audio');
    assert.equal(webSpeechCalls, 0);
    createdAudio[0].onended?.();
    assert.equal(ends, 1);

    resetVoiceAssistantState();
    speakAssistantReply('Explicit opt-out still allows local Web Speech first.', {
      preferServerAudio: false,
      onEnd: () => ends++,
      fetchAudio: async () => {
        serverCalls++;
        return new Blob(['ID3'], { type: 'audio/mpeg' });
      },
    });
    assert.equal(serverCalls, 1);
    assert.equal(webSpeechCalls, 1);
    assert.equal(ends, 2);
  } finally {
    resetVoiceAssistantState();
    global.window = prevWindow;
    URL.createObjectURL = prevCreateUrl;
    URL.revokeObjectURL = prevRevokeUrl;
  }
});

test('AIPage character-by-character streaming slices sections and speakAssistantReply emits audio progress for TTS sync', async () => {
  const {
    AIMessage,
    computeDisplayCharWeights,
    charCountForStreamRatio,
    sliceReplyForStream,
  } = require('../src/pages/AIPage.tsx');
  const { speakAssistantReply, resetVoiceAssistantState } = require('../src/services/voiceAssistant.ts');

  const reply = {
    facts: 'HR 72 BPM. SpO2 98%.',
    explanation: 'Hydration and rest stay nominal.',
    action: 'Continue standard check-in tomorrow.',
    escalateWhen: 'Report resting HR > 115 BPM.',
    nasaReference: 'NASA OSDR baseline',
    source: 'gemini',
    sourceLabel: 'Gemini',
    suggestedActions: [{ label: 'Open Check-In', targetPage: 'checkin' }],
    sbarText: 'S: Nominal telemetry',
  };

  const weights = computeDisplayCharWeights(reply);
  const total = reply.facts.length + reply.explanation.length + reply.action.length;
  assert.equal(weights.length, total);
  assert.equal(charCountForStreamRatio(weights, 0), 0);
  assert.equal(charCountForStreamRatio(weights, 1), total);
  const half = charCountForStreamRatio(weights, 0.5);
  assert.ok(half > 0 && half < total);

  // Punctuation characters add pause weight compared to letters.
  const dotIdx = reply.facts.indexOf('.');
  assert.ok((weights[dotIdx] - weights[dotIdx - 1]) > (weights[1] - weights[0]));

  const partial = sliceReplyForStream(reply, 6);
  assert.equal(partial.facts, 'HR 72 ');
  assert.equal(partial.showExplanation, false);
  assert.equal(partial.showAction, false);
  assert.equal(partial.complete, false);
  assert.equal(partial.activeSection, 'facts');

  const waitingHtml = renderToStaticMarkup(React.createElement(AIMessage, {
    message: { id: 'm1', role: 'assistant', reply },
    streamedChars: 0,
    waitingForTts: true,
  }));
  assert.match(waitingHtml, /Thinking/);
  assert.doesNotMatch(waitingHtml, /Syncing speech/);
  assert.doesNotMatch(waitingHtml, /Ground Downlink SBAR/);

  const partialHtml = renderToStaticMarkup(React.createElement(AIMessage, {
    message: { id: 'm1', role: 'assistant', reply },
    streamedChars: reply.facts.length + 5,
    waitingForTts: false,
  }));
  assert.match(partialHtml, /HR 72 BPM\. SpO2 98%\./);
  assert.match(partialHtml, /Hydra/);
  assert.doesNotMatch(partialHtml, /Open Check-In/);

  const doneHtml = renderToStaticMarkup(React.createElement(AIMessage, {
    message: { id: 'm1', role: 'assistant', reply },
    streamedChars: total,
    waitingForTts: false,
  }));
  assert.match(doneHtml, /Continue standard check-in tomorrow\./);
  assert.match(doneHtml, /Ground Downlink SBAR/);
  assert.match(doneHtml, /Open Check-In/);
  assert.doesNotMatch(doneHtml, /typing-cursor/);

  const prevWindow = global.window;
  const prevCreateUrl = URL.createObjectURL;
  const prevRevokeUrl = URL.revokeObjectURL;
  const progressEvents = [];
  let audioInst = null;

  class MockAudio {
    constructor(src) {
      this.src = src || '';
      this.muted = false;
      this.error = null;
      this.duration = 4.0;
      this.currentTime = 0;
      this.onplay = null;
      this.ontimeupdate = null;
      this.onended = null;
      this.onerror = null;
      audioInst = this;
    }
    pause() { }
    removeAttribute() { }
    load() { }
    play() {
      this.onplay?.();
      return Promise.resolve();
    }
  }

  URL.createObjectURL = () => 'blob:sync-edge-mp3';
  URL.revokeObjectURL = () => { };
  resetVoiceAssistantState();
  global.window = { Audio: MockAudio };

  try {
    let startedMeta = null;
    speakAssistantReply('HR 72 BPM. Continue check-in.', {
      onStart: meta => { startedMeta = meta; },
      onProgress: p => progressEvents.push(p),
      fetchAudio: async () => new Blob(['ID3'], { type: 'audio/mpeg' }),
    });
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(startedMeta?.durationSec, 4.0);
    audioInst.currentTime = 2.0;
    audioInst.ontimeupdate?.();
    assert.ok(progressEvents.some(p => Math.abs(p.ratio - 0.5) < 0.01));
    audioInst.onended?.();
    assert.equal(progressEvents[progressEvents.length - 1]?.ratio, 1);
  } finally {
    resetVoiceAssistantState();
    global.window = prevWindow;
    URL.createObjectURL = prevCreateUrl;
    URL.revokeObjectURL = prevRevokeUrl;
  }
});

test('background alert TTS speaks concise summary and action without adding alert card toggles', async () => {
  const {
    speakAssistantReply,
    speakBackgroundAlert,
    stopAlertSpeaking,
    resetVoiceAssistantState,
  } = require('../src/services/voiceAssistant.ts');

  const hypoxia = {
    id: 'a-1',
    astronaut_id: 'ASTRO-01',
    timestamp: '2026-11-15T10:00:00Z',
    severity: 'CRITICAL',
    alert_type: 'HYPOXIA',
    message: 'Critical blood oxygen saturation drop (87.5%) observed during EVA activity.',
    recommended_action: 'Switch to secondary O2 supply and halt physical exertion.',
    acknowledged: false,
  };
  const tachycardia = {
    id: 'a-2',
    astronaut_id: 'ASTRO-01',
    timestamp: '2026-11-15T10:00:01Z',
    severity: 'WARNING',
    alert_type: 'TACHYCARDIA',
    message: 'Heart rate exceeded 162 BPM continuously for 45 seconds.',
    recommended_action: 'Rest in seated position and verify cuff contact.',
    acknowledged: false,
  };
  const dehydration = {
    id: 'a-3',
    astronaut_id: 'ASTRO-01',
    timestamp: '2026-11-15T10:00:02Z',
    severity: 'INFO',
    alert_type: 'DEHYDRATION',
    message: 'Hydration reserve projected low before 18:00 UTC.',
    recommended_action: 'Consume 300 mL electrolyte drink.',
    acknowledged: false,
  };

  const singleSpeech = formatSingleAlertSpeech(hypoxia);
  assert.match(singleSpeech, /Critical alert: Low blood oxygen\./);
  assert.match(singleSpeech, /Action: Switch to secondary O2 supply and halt physical exertion\./);
  assert.doesNotMatch(singleSpeech, /87\.5%/);
  assert.doesNotMatch(singleSpeech, /observed during EVA activity/);

  const summarySpeech = buildAlertAnnouncementText([dehydration, tachycardia, hypoxia]);
  assert.ok(summarySpeech.indexOf('Low blood oxygen') < summarySpeech.indexOf('Fast heart rate'));
  assert.ok(summarySpeech.indexOf('Fast heart rate') < summarySpeech.indexOf('Low hydration / fluid loss'));
  assert.doesNotMatch(summarySpeech, /Plus \d+ more active alert/);
  assert.equal(buildAlertAnnouncementText([{ ...hypoxia, acknowledged: true }]), '');

  // Long alert bursts chunk cleanly at alert boundaries so TTS request trimming never drops any alert.
  const radAlert = {
    ...tachycardia,
    id: 'a-4',
    alert_type: 'RADIATION_SPIKE',
    severity: 'CRITICAL',
    message: 'Radiation dosage 118.4 uSv/h.',
    recommended_action: 'Relocate crew to shielded storm shelter bay immediately and verify dosimeter log.',
  };
  const heatAlert = {
    ...tachycardia,
    id: 'a-5',
    alert_type: 'HEAT_STRESS',
    severity: 'WARNING',
    message: 'Core temp 38.4 C.',
    recommended_action: 'Increase liquid cooling garment loop flow rate and suspend strenuous exertion immediately.',
  };
  const co2Alert = {
    ...tachycardia,
    id: 'a-6',
    alert_type: 'HYPERCAPNIA',
    severity: 'WARNING',
    message: 'Resp rate 26.0/min.',
    recommended_action: 'Verify primary and backup amine CO2 scrubber beds and slow breathing cadence carefully.',
  };
  const orthoAlert = {
    ...dehydration,
    id: 'a-7',
    alert_type: 'ORTHOSTATIC_HYPOTENSION',
    severity: 'WARNING',
    message: 'BP 86/58 mmHg.',
    recommended_action: 'Assume seated or supine posture, hydrate with isotonic solution, and engage LBNP garment.',
  };
  const multiAnnouncements = buildAlertAnnouncementsByCrew(
    [dehydration, tachycardia, hypoxia, radAlert, heatAlert, co2Alert, orthoAlert],
    { 'ASTRO-01': 'Dr. Sarah Chen' },
    'ASTRO-01',
  );
  const combinedQueueText = multiAnnouncements.map(item => item.text).join(' ');
  assert.ok(multiAnnouncements.length >= 1);
  assert.ok(multiAnnouncements.every(item => item.text.length <= 1200));
  for (const label of [
    'Low blood oxygen',
    'Rise in radiation',
    'Fast heart rate',
    'High body temperature',
    'Elevated CO2 / breathing rate',
    'Low blood pressure / orthostatic',
    'Low hydration / fluid loss',
  ]) {
    assert.ok(combinedQueueText.includes(label), `Missing alert speech for ${label}`);
  }

  // AlertBanner cards must not render any read-aloud / auto-read button.
  const bannerHtml = renderToStaticMarkup(React.createElement(AlertBanner, {
    alerts: [hypoxia],
    onAcknowledge: () => { },
    onAcknowledgeAll: () => { },
  }));
  assert.match(bannerHtml, /CRITICAL/);
  assert.doesNotMatch(bannerHtml, /read\s*aloud|auto-read/i);

  // Episode deduplication ignores repeated ticks, catches escalation, and respects cooldown.
  const tracked = new Map();
  const warnHypoxia = { ...hypoxia, severity: 'WARNING' };
  assert.equal(selectNewlyTriggeredAlerts([warnHypoxia], tracked, 1_000).length, 1);
  assert.equal(selectNewlyTriggeredAlerts([warnHypoxia], tracked, 2_200).length, 0);
  assert.equal(selectNewlyTriggeredAlerts([hypoxia], tracked, 3_400).length, 1);
  assert.equal(selectNewlyTriggeredAlerts([{ ...hypoxia, acknowledged: true }], tracked, 4_600).length, 0);
  // Clears once absent past cooldown and re-triggers cleanly later.
  assert.equal(selectNewlyTriggeredAlerts([], tracked, 35_000).length, 0);
  assert.equal(selectNewlyTriggeredAlerts([warnHypoxia], tracked, 36_000).length, 1);

  const prevWindow = global.window;
  const prevCreateUrl = URL.createObjectURL;
  const prevRevokeUrl = URL.revokeObjectURL;
  const listeners = new Map();
  const audioInstances = [];
  const fetchedTexts = [];
  let blockNextPlay = false;

  class MockAlertAudio {
    constructor(src) {
      this.src = src || '';
      this.muted = false;
      this.duration = 2.5;
      this.currentTime = 0;
      this.onplay = null;
      this.ontimeupdate = null;
      this.onended = null;
      this.onerror = null;
      this.paused = false;
      audioInstances.push(this);
    }
    pause() { this.paused = true; }
    removeAttribute() { }
    load() { }
    play() {
      if (blockNextPlay) {
        return Promise.reject(Object.assign(new Error('Autoplay blocked'), { name: 'NotAllowedError' }));
      }
      this.onplay?.();
      return Promise.resolve();
    }
  }

  URL.createObjectURL = () => `blob:alert-mp3-${audioInstances.length + 1}`;
  URL.revokeObjectURL = () => { };
  resetVoiceAssistantState();
  global.window = {
    Audio: MockAlertAudio,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
  };

  try {
    // 1) Alert plays cleanly in background and defers when assistant speech is active.
    let assistantEnded = false;
    speakAssistantReply('All metrics nominal.', {
      fetchAudio: async text => {
        fetchedTexts.push(`assistant:${text}`);
        return new Blob(['ID3'], { type: 'audio/mpeg' });
      },
      onEnd: () => { assistantEnded = true; },
    });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(audioInstances.length, 1);

    let alertStarted = false;
    speakBackgroundAlert(singleSpeech, {
      onStart: () => { alertStarted = true; },
      fetchAudio: async text => {
        fetchedTexts.push(`alert:${text}`);
        return new Blob(['ID3'], { type: 'audio/mpeg' });
      },
    });
    await new Promise(resolve => setTimeout(resolve, 20));
    // Assistant playback was not interrupted and alert stayed deferred.
    assert.equal(audioInstances[0].paused, false);
    assert.equal(alertStarted, false);
    assert.equal(fetchedTexts.filter(t => t.startsWith('alert:')).length, 0);

    // Once assistant audio ends, deferred alert begins speaking immediately via Edge TTS fetcher.
    audioInstances[0].onended?.();
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(assistantEnded, true);
    assert.equal(alertStarted, true);
    assert.equal(audioInstances.length, 2);
    assert.ok(fetchedTexts.some(t => t === `alert:${singleSpeech}`));
    audioInstances[1].onended?.();

    // 2) Browser autoplay block fails silently and retries cleanly after user click gesture.
    blockNextPlay = true;
    let blockedNotified = false;
    let unblockedStart = false;
    speakBackgroundAlert('Warning alert: Rise in radiation. Action: Move to shielded bay.', {
      onBlocked: () => { blockedNotified = true; },
      onStart: () => { unblockedStart = true; },
      fetchAudio: async () => new Blob(['ID3'], { type: 'audio/mpeg' }),
    });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(blockedNotified, true);
    assert.equal(unblockedStart, false);

    blockNextPlay = false;
    for (const handler of [...(listeners.get('click') ?? [])]) handler();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(unblockedStart, true);

    stopAlertSpeaking();
  } finally {
    resetVoiceAssistantState();
    global.window = prevWindow;
    URL.createObjectURL = prevCreateUrl;
    URL.revokeObjectURL = prevRevokeUrl;
  }
});

test('multi-crew custom simulation reconciles distinct profile alerts and plays alert voice async across switches', async () => {
  const {
    speakBackgroundAlert,
    stopSpeaking,
    stopAlertSpeaking,
    syncActiveAlertSpeechKeys,
    resetVoiceAssistantState,
  } = require('../src/services/voiceAssistant.ts');

  // 1) Custom simulation evaluates distinct crew baselines/EVA exposures cleanly across ASTRO-01..03.
  const customSim = {
    ...defaultSimulationConfig(),
    missionZone: 'MARS_TRANSIT',
    missionDay: 365,
    solarStorm: 'M_FLARE_CME',
    shielding: 'NOMINAL',
    anomaly: 'NONE',
  };
  const v1 = simulatedVitals('ASTRO-01', customSim.anomaly, customSim, 5.7, 1_700_000_000_000);
  const v2 = simulatedVitals('ASTRO-02', customSim.anomaly, customSim, 5.7, 1_700_000_000_000);
  const a1 = evaluateLocalAlerts(v1, 5.7);
  const a2 = evaluateLocalAlerts(v2, 5.7);
  // ASTRO-01 defaults to active EVA while ASTRO-02 stays in cabin, producing higher EVA radiation/HR load.
  assert.ok(v1.radiation_rate > v2.radiation_rate);
  assert.ok(a1.length >= 1 && a2.length >= 1);

  // 2) reconcileCrewAlerts preserves peer crew alerts and isolates same-episode acknowledgements vs new episodes.
  const combined = reconcileCrewAlerts([], [...a1, ...a2], ['ASTRO-01', 'ASTRO-02', 'ASTRO-03']);
  const ackedFirst = combined.map(item =>
    item.astronaut_id === 'ASTRO-01' ? { ...item, acknowledged: true } : item,
  );
  // Re-evaluating ASTRO-02 keeps ASTRO-01's alert intact, and re-evaluating ASTRO-01 preserves same-episode ack.
  const afterSecondTick = reconcileCrewAlerts(ackedFirst, [...a1, ...a2], ['ASTRO-01', 'ASTRO-02']);
  assert.ok(afterSecondTick.some(item => item.astronaut_id === 'ASTRO-01' && item.acknowledged));
  assert.ok(afterSecondTick.some(item => item.astronaut_id === 'ASTRO-02' && !item.acknowledged));
  // A fresh server episode ID unacknowledges only the recurring episode.
  const freshIdEpisode = { ...a1[0], id: 'srv-new-ep-99', acknowledged: false };
  const afterNewEp = reconcileCrewAlerts(ackedFirst, [freshIdEpisode, ...a2], ['ASTRO-01', 'ASTRO-02']);
  assert.ok(afterNewEp.some(item => item.id === 'srv-new-ep-99' && !item.acknowledged));

  // 3) buildAlertAnnouncementsByCrew splits per crew member with active profile prioritized and names included.
  const crewNames = { 'ASTRO-01': 'Dr. Sarah Chen', 'ASTRO-02': 'Marcus Vance' };
  const hypoxiaSar = {
    id: 'h-sar',
    astronaut_id: 'ASTRO-01',
    timestamp: '2026-11-15T10:00:00Z',
    severity: 'CRITICAL',
    alert_type: 'HYPOXIA',
    message: 'SpO2 low',
    recommended_action: 'Switch to secondary O2 supply.',
    acknowledged: false,
  };
  const radMarc = {
    id: 'r-mar',
    astronaut_id: 'ASTRO-02',
    timestamp: '2026-11-15T10:00:01Z',
    severity: 'WARNING',
    alert_type: 'RADIATION_SPIKE',
    message: 'Rad elevated',
    recommended_action: 'Move to shielded bay.',
    acknowledged: false,
  };
  const grouped = buildAlertAnnouncementsByCrew([hypoxiaSar, radMarc], crewNames, 'ASTRO-02');
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].astronautId, 'ASTRO-02');
  assert.match(grouped[0].text, /Warning alert for Marcus Vance: Rise in radiation\./);
  assert.equal(grouped[1].astronautId, 'ASTRO-01');
  assert.match(grouped[1].text, /Critical alert for Dr\. Sarah Chen: Low blood oxygen\./);

  // 4) Async FIFO queue finishes item 1 before item 2, survives stopSpeaking() tab switch, and skips cleared keys only.
  const prevWindow = global.window;
  const prevCreateUrl = URL.createObjectURL;
  const prevRevokeUrl = URL.revokeObjectURL;
  const audioInstances = [];
  const startedTags = [];
  const endedTags = [];

  class AsyncQueueAudio {
    constructor(src) {
      this.src = src || '';
      this.paused = false;
      this.onplay = null;
      this.onended = null;
      this.onerror = null;
      audioInstances.push(this);
    }
    pause() { this.paused = true; }
    removeAttribute() { }
    load() { }
    play() {
      this.onplay?.();
      return Promise.resolve();
    }
  }

  URL.createObjectURL = () => `blob:async-alert-${audioInstances.length + 1}`;
  URL.revokeObjectURL = () => { };
  resetVoiceAssistantState();
  global.window = { Audio: AsyncQueueAudio };

  try {
    speakBackgroundAlert(grouped[0].text, {
      tag: grouped[0].astronautId,
      alertKeys: grouped[0].alertKeys,
      onStart: () => startedTags.push(grouped[0].astronautId),
      onEnd: () => endedTags.push(grouped[0].astronautId),
      fetchAudio: async () => new Blob(['ID3'], { type: 'audio/mpeg' }),
    });
    speakBackgroundAlert(grouped[1].text, {
      tag: grouped[1].astronautId,
      alertKeys: grouped[1].alertKeys,
      onStart: () => startedTags.push(grouped[1].astronautId),
      onEnd: () => endedTags.push(grouped[1].astronautId),
      fetchAudio: async () => new Blob(['ID3'], { type: 'audio/mpeg' }),
    });

    await new Promise(resolve => setTimeout(resolve, 25));
    // Item 1 (ASTRO-02) starts first while Item 2 (ASTRO-01) waits asynchronously in the queue.
    assert.deepEqual(startedTags, ['ASTRO-02']);
    assert.equal(audioInstances.length, 1);

    // Simulating AI tab / profile change calling assistant stopSpeaking() must NOT cut off background alert audio.
    stopSpeaking();
    assert.equal(audioInstances[0].paused, false);

    // Finish item 1 -> item 2 starts asynchronously on its own without manual re-trigger.
    audioInstances[0].onended?.();
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.deepEqual(startedTags, ['ASTRO-02', 'ASTRO-01']);
    assert.equal(audioInstances.length, 2);

    // Enqueue a 3rd alert, then clear ASTRO-01's alert key while letting queued global key remain valid.
    speakBackgroundAlert('Advisory: Check cabin seal.', {
      tag: 'ASTRO-03',
      alertKeys: ['ASTRO-03:DEEP_SPACE_DOSE'],
      onStart: () => startedTags.push('ASTRO-03'),
      fetchAudio: async () => new Blob(['ID3'], { type: 'audio/mpeg' }),
    });
    syncActiveAlertSpeechKeys(new Set(['ASTRO-03:DEEP_SPACE_DOSE']));
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.deepEqual(startedTags, ['ASTRO-02', 'ASTRO-01', 'ASTRO-03']);
    assert.ok(endedTags.includes('ASTRO-02'));

    stopAlertSpeaking();
  } finally {
    resetVoiceAssistantState();
    global.window = prevWindow;
    URL.createObjectURL = prevCreateUrl;
    URL.revokeObjectURL = prevRevokeUrl;
  }
});

test('selectAlertsForProfile scopes background alert dictation strictly to the selected crew profile', () => {
  const {
    selectAlertsForProfile,
    selectNewlyTriggeredAlerts,
    buildAlertAnnouncementsByCrew,
  } = require('../src/services/alertSpeech.ts');

  const combined = [
    {
      id: 'a-1',
      astronaut_id: 'ASTRO-01',
      timestamp: '2026-11-15T12:00:00Z',
      severity: 'CRITICAL',
      alert_type: 'HYPOXIA',
      message: 'SpO2 dropped',
      recommended_action: 'Switch to secondary oxygen supply.',
      acknowledged: false,
    },
    {
      id: 'a-2',
      astronaut_id: 'ASTRO-02',
      timestamp: '2026-11-15T12:00:01Z',
      severity: 'WARNING',
      alert_type: 'RADIATION_SPIKE',
      message: 'Rad elevated',
      recommended_action: 'Move to storm shelter bay.',
      acknowledged: false,
    },
  ];
  const crewNames = { 'ASTRO-01': 'Dr. Sarah Chen', 'ASTRO-02': 'Marcus Vance' };
  const tracked = new Map();

  // Viewing ASTRO-02 dictates only ASTRO-02 and ignores ASTRO-01's alert.
  const forAstro2 = selectAlertsForProfile(combined, 'ASTRO-02');
  assert.equal(forAstro2.length, 1);
  const triggered2 = selectNewlyTriggeredAlerts(forAstro2, tracked, 1000);
  const announcements2 = buildAlertAnnouncementsByCrew(triggered2, crewNames, 'ASTRO-02');
  assert.equal(announcements2.length, 1);
  assert.equal(announcements2[0].astronautId, 'ASTRO-02');
  assert.doesNotMatch(announcements2[0].text, /Sarah Chen|Low blood oxygen/);

  // Switching later to ASTRO-01 still dictates ASTRO-01 once selected, without including ASTRO-02.
  const forAstro1 = selectAlertsForProfile(combined, 'ASTRO-01');
  const triggered1 = selectNewlyTriggeredAlerts(forAstro1, tracked, 2000);
  const announcements1 = buildAlertAnnouncementsByCrew(triggered1, crewNames, 'ASTRO-01');
  assert.equal(announcements1.length, 1);
  assert.equal(announcements1[0].astronautId, 'ASTRO-01');
  assert.match(announcements1[0].text, /Critical alert for Dr\. Sarah Chen: Low blood oxygen\./);
});

test('speakAssistantReply recovers onto fresh Edge TTS Audio if primedAudio fails without dropping into OS speech', async () => {
  const {
    primeAudioPlayback,
    speakAssistantReply,
    resetVoiceAssistantState,
  } = require('../src/services/voiceAssistant.ts');

  const prevWindow = global.window;
  const prevCreateUrl = URL.createObjectURL;
  const prevRevokeUrl = URL.revokeObjectURL;

  const createdAudio = [];
  let webSpeechCalls = 0;

  class FlakyPrimedAudio {
    constructor(src = '') {
      this.src = src;
      this.muted = false;
      this.preload = '';
      this.error = null;
      this.paused = true;
      this.onplay = null;
      this.onended = null;
      this.onerror = null;
      this._index = createdAudio.length;
      createdAudio.push(this);
    }
    removeAttribute(attr) {
      if (attr === 'src') this.src = '';
    }
    load() { }
    pause() {
      this.paused = true;
    }
    play() {
      // First element simulates Chromium AbortError when replacing silent WAV src during priming reuse.
      if (this._index === 0 && this.src && !this.src.startsWith('data:audio/wav')) {
        const abortErr = new Error('The play() request was interrupted by a new load request.');
        abortErr.name = 'AbortError';
        return Promise.reject(abortErr);
      }
      this.paused = false;
      this.onplay?.();
      return Promise.resolve();
    }
  }

  class MockUtterance {
    constructor(text) {
      this.text = text;
    }
  }

  const naturalVoice = {
    name: 'Samantha',
    lang: 'en-US',
    localService: true,
    default: true,
    voiceURI: 'com.apple.voice.Samantha',
  };

  URL.createObjectURL = () => 'blob:edge-retry-mp3';
  URL.revokeObjectURL = () => { };
  resetVoiceAssistantState();
  global.window = {
    Audio: FlakyPrimedAudio,
    SpeechSynthesisUtterance: MockUtterance,
    speechSynthesis: {
      speaking: false,
      pending: false,
      paused: false,
      getVoices: () => [naturalVoice],
      cancel() { },
      resume() { },
      speak() {
        webSpeechCalls++;
      },
    },
  };

  try {
    primeAudioPlayback();
    let startedCount = 0;
    let endedCount = 0;
    speakAssistantReply('Ocular Ultrasound assessment: nominal.', {
      preferServerAudio: true,
      onStart: () => startedCount++,
      onEnd: () => endedCount++,
      fetchAudio: async () => new Blob(['ID3'], { type: 'audio/mpeg' }),
    });
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(createdAudio.length, 2, 'Expected retry onto a fresh Audio element after primedAudio AbortError');
    assert.equal(webSpeechCalls, 0, 'Must stay on Edge TTS Audio instead of falling back to local OS speech');
    assert.equal(startedCount, 1);
    createdAudio[1].onended?.();
    assert.equal(endedCount, 1);
  } finally {
    resetVoiceAssistantState();
    global.window = prevWindow;
    URL.createObjectURL = prevCreateUrl;
    URL.revokeObjectURL = prevRevokeUrl;
  }
});

test('live alert sync reconciles BLE overrides, DONKI Kp, and stale server alerts; simulation config stages edits', () => {
  // 1) Stale server radiation alert clears when displayed nominal/BLE vitals are normal, while BLE HR triggers TACHYCARDIA.
  const staleRad = {
    id: 'srv-rad-65',
    astronaut_id: 'ASTRO-01',
    timestamp: '2026-11-15T09:00:00Z',
    severity: 'CRITICAL',
    alert_type: 'RADIATION_SPIKE',
    message: 'Old spike',
    trigger_metric: 'Rad 65.0 uSv/h',
    recommended_action: 'Seek storm shelter.',
    acknowledged: false,
  };
  const peerHypoxia = {
    id: 'srv-peer-2',
    astronaut_id: 'ASTRO-02',
    timestamp: '2026-11-15T10:00:00Z',
    severity: 'WARNING',
    alert_type: 'HYPOXIA',
    message: 'Peer alert',
    trigger_metric: 'SpO2 93.0%',
    recommended_action: 'Check regulator.',
    acknowledged: false,
  };
  const liveVitalsWithBleHr = {
    ...simulatedVitals('ASTRO-01', 'NONE', defaultSimulationConfig()),
    heart_rate: 136,
    spo2: 98.4,
    radiation_rate: 14.2,
    telemetry_source: 'ble_measured',
  };
  const synced = syncActiveProfileAlerts([], [staleRad, peerHypoxia], liveVitalsWithBleHr, 2.0);
  assert.ok(!synced.some(a => a.astronaut_id === 'ASTRO-01' && a.alert_type === 'RADIATION_SPIKE' && !a.acknowledged));
  assert.ok(synced.some(a => a.astronaut_id === 'ASTRO-01' && a.alert_type === 'TACHYCARDIA' && a.trigger_metric === 'HR 136 BPM' && !a.acknowledged));
  assert.ok(synced.some(a => a.astronaut_id === 'ASTRO-02' && a.alert_type === 'HYPOXIA' && !a.acknowledged));

  // 2) Ongoing server alert adopts exact live trigger_metric and severity from displayed vitals.
  const stormVitals = {
    ...simulatedVitals('ASTRO-01', 'NONE', defaultSimulationConfig()),
    radiation_rate: 118.4,
    heart_rate: 72,
    spo2: 98.2,
  };
  const updatedRad = syncActiveProfileAlerts([], [staleRad], stormVitals, 8.3);
  const radItem = updatedRad.find(a => a.astronaut_id === 'ASTRO-01' && a.alert_type === 'RADIATION_SPIKE');
  assert.ok(radItem);
  assert.equal(radItem.trigger_metric, 'Rad 118.4 uSv/h');

  // 3) Simulation config comparison & AnomalyDemoBar staging badge render.
  const baseCfg = defaultSimulationConfig();
  assert.equal(isSimulationConfigEqual(baseCfg, { ...baseCfg }), true);
  assert.equal(isSimulationConfigEqual(baseCfg, { ...baseCfg, solarStorm: 'EXTREME_G5' }), false);

  const sampleVitals = simulatedVitals('ASTRO-01', 'NONE', baseCfg);
  const simBarHtml = renderToStaticMarkup(React.createElement(AnomalyDemoBar, {
    currentAnomaly: baseCfg.anomaly,
    simConfig: baseCfg,
    vitals: sampleVitals,
    onTrigger: () => { },
    onUpdateSimConfig: () => { },
    onRunDiagnostics: () => { },
    isDiagnosing: false,
  }));
  assert.match(simBarHtml, /Synced with live/i);

  const { SpaceEnvironmentPanel } = require('../src/components/SpaceEnvironment.tsx');
  const flatEnvHtml = renderToStaticMarkup(React.createElement(SpaceEnvironmentPanel, {
    vitals: sampleVitals,
    offline: false,
    hideScenarioControls: true,
  }));
  assert.doesNotMatch(flatEnvHtml, /open-subsection/);

  // 4) Responsive CSS, flattened mobile space-env disclosure, and camera/canvas contracts hold.
  assert.doesNotMatch(simBarHtml, /^<div class="panel simulation-controls">/);
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.css'), 'utf8');
  assert.match(css, /\.segmented\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.match(css, /\.segmented\s*\{[^}]*max-width:\s*100%/s);
  assert.match(css, /@media\(max-width:\s*639px\)[\s\S]*\.pill\s*\{[^}]*white-space:\s*normal/s);
  assert.match(css, /@media\(max-width:\s*639px\)[\s\S]*\.disclosure-content\s*>\s*\.panel\s*\{[^}]*background:\s*transparent/s);
  assert.match(css, /@media\(max-width:\s*639px\)[\s\S]*\.viz-svg\s*\{[^}]*max-height:\s*170px/s);
  assert.match(css, /@media\s*\(max-width:\s*399px\)[\s\S]*\.multi-trend-grid\.compact/s);
  assert.match(css, /\.checkin-workspace\s*\{[^}]*max-width:\s*1340px/);
  assert.match(css, /@media\(min-width:\s*1024px\)[\s\S]*\.checkin-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*330px/);
  assert.match(css, /@media\(min-width:\s*1024px\)[\s\S]*\.checkin-context\s*\{[^}]*position:\s*sticky/);

  const anatomySrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'BodyAnatomy3D.tsx'), 'utf8');
  assert.match(anatomySrc, /camera\.position\.set\(0\.72,\s*0\.24,\s*3\.68\)/);
  assert.match(anatomySrc, /const syncViewOffset = \(\) => \{\s*camera\.aspect = viewportW \/ viewportH;/);

  const ecgSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'ECGMonitor.tsx'), 'utf8');
  assert.match(ecgSrc, /canvas\.clientWidth/);
});

test('computeTextWeights and sliceObservationFindings provide accurate weights and character slicing', () => {
  const { computeTextWeights, sliceObservationFindings } = require('../src/services/selfExams.ts');

  const text = 'ONSD is 4.8 mm. Normal scleral contour.';
  const weights = computeTextWeights(text);
  assert.equal(weights.length, text.length);

  const dotIdx = text.indexOf('.');
  assert.ok((weights[dotIdx] - weights[dotIdx - 1]) > (weights[1] - weights[0]));

  const partial = sliceObservationFindings(text, 10);
  assert.equal(partial.text, text.slice(0, 10));
  assert.equal(partial.complete, false);

  const complete = sliceObservationFindings(text, text.length);
  assert.equal(complete.text, text);
  assert.equal(complete.complete, true);
});

test('SelfExamCapture renders assessment result inside the left column in vertical layout', () => {
  const { SelfExamCapture } = require('../src/components/SelfExamCapture.tsx');
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.css'), 'utf8');

  assert.match(css, /\.self-exam-left-column\s*\{[\s\S]*flex-direction:\s*column;/);

  const html = renderToStaticMarkup(React.createElement(SelfExamCapture, {
    astronautId: 'ASTRO-01',
    vitals: {
      astronaut_id: 'ASTRO-01',
      timestamp: '2026-11-15T08:00:00Z',
      heart_rate: 72,
    },
    kpIndex: 2.1,
    offline: false,
    examType: 'dermal_radiation',
    onExamTypeChange: () => {},
    assessments: [],
    onAssessmentSaved: () => {},
  }));

  assert.match(html, /self-exam-left-column/);
});

test('SelfExamCapture streams observation findings character by character synchronized with TTS', () => {
  const { SelfExamCapture } = require('../src/components/SelfExamCapture.tsx');
  const captureSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'SelfExamCapture.tsx'), 'utf8');

  assert.match(captureSrc, /sliceObservationStream/);
  assert.match(captureSrc, /typing-cursor/);
  assert.match(captureSrc, /charCountForStreamRatio/);
  assert.match(captureSrc, /computeObservationSpeechWeights/);
});

test('getObservationSpeechParts and sliceObservationStream synchronize sections with TTS', () => {
  const {
    getObservationSpeechParts,
    computeObservationSpeechWeights,
    sliceObservationStream,
  } = require('../src/services/selfExams.ts');

  const record = {
    id: 'test-1',
    astronautId: 'ASTRO-01',
    examType: 'dermal_radiation',
    recordedAt: '2026-11-15T08:00:00Z',
    severity: 'warning',
    findings: 'Mild erythema observed.',
    recommendedActions: ['Apply saline', 'Monitor spread'],
    groundConsultRequired: true,
    analysisSource: 'gemini-vision',
  };

  const parts = getObservationSpeechParts(record);
  assert.match(parts.intro, /Skin & Radiation Erythema assessment: warning\./);
  assert.equal(parts.findings, 'Mild erythema observed.');
  assert.match(parts.actionsText, /Recommended actions: Apply saline\. Monitor spread\./);
  assert.match(parts.consultText, /Ground Flight Surgeon review is recommended\./);

  const { introEndIdx, findingsEndIdx } = computeObservationSpeechWeights(record);
  assert.ok(introEndIdx > 0);
  assert.ok(findingsEndIdx > introEndIdx);

  // When revealedChars is within intro: findings should not have started typing yet!
  const introSlice = sliceObservationStream(record, introEndIdx - 5);
  assert.equal(introSlice.findingsText, '');
  assert.equal(introSlice.findingsComplete, false);
  assert.equal(introSlice.showActions, false);

  // When revealedChars enters findings:
  const findingsSlice = sliceObservationStream(record, introEndIdx + 4);
  assert.equal(findingsSlice.findingsText, 'Mild');
  assert.equal(findingsSlice.findingsComplete, false);
  assert.equal(findingsSlice.showActions, false);

  // When findings finishes:
  const actionsSlice = sliceObservationStream(record, findingsEndIdx + 2);
  assert.equal(actionsSlice.findingsText, 'Mild erythema observed.');
  assert.equal(actionsSlice.findingsComplete, true);
  assert.equal(actionsSlice.showActions, true);

  // Complete slice:
  const fullSlice = sliceObservationStream(record, undefined);
  assert.equal(fullSlice.findingsText, 'Mild erythema observed.');
  assert.equal(fullSlice.findingsComplete, true);
  assert.equal(fullSlice.showActions, true);
  assert.equal(fullSlice.showConsult, true);
  assert.equal(fullSlice.complete, true);
});

test('SelfExamCapture restricts analyze button when no image or scan is attached', () => {
  const { SelfExamCapture } = require('../src/components/SelfExamCapture.tsx');

  // Without dataUrl or captured image, button must have disabled attribute
  const noImageHtml = renderToStaticMarkup(React.createElement(SelfExamCapture, {
    astronautId: 'ASTRO-01',
    vitals: { astronaut_id: 'ASTRO-01', timestamp: '2026-11-15T08:00:00Z', heart_rate: 72 },
    kpIndex: 2.1,
    offline: false,
    examType: 'dermal_radiation',
    onExamTypeChange: () => {},
    assessments: [],
    onAssessmentSaved: () => {},
  }));

  assert.match(noImageHtml, /<button[^>]*disabled[^>]*>[\s\S]*?Analyze &amp; Save Exam<\/button>/);
});




