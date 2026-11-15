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
    const result = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
    }, fileName: filename });
    module._compile(result.outputText, filename);
  };
}
class TableAdapter {
  constructor(key) { this.key = key; this.data = new Map(); this.failure = false; }
  async add(record) { if (this.failure) throw new Error('Storage unavailable'); if (this.data.has(record[this.key])) throw new Error('Duplicate'); this.data.set(record[this.key], structuredClone(record)); }
  async put(record) { if (this.failure) throw new Error('Storage unavailable'); this.data.set(record[this.key], structuredClone(record)); }
  async get(key) { return structuredClone(this.data.get(key)); }
  async delete(key) { this.data.delete(key); }
  async bulkDelete(keys) { keys.forEach(key => this.data.delete(key)); }
  filter(predicate) { const rows = [...this.data.values()].filter(predicate); return { toArray: async () => structuredClone(rows), count: async () => rows.length }; }
  where(field) { return { equals: value => {
    let reverse = false;
    const rows = () => [...this.data.values()].filter(row => row[field] === value);
    const collection = { toArray: async () => structuredClone(rows()), reverse() { reverse = !reverse; return collection; }, async sortBy(key) { const sorted = rows().sort((a,b) => a[key].localeCompare(b[key])); return structuredClone(reverse ? sorted.reverse() : sorted); } };
    return collection;
  } }; }
}
const db = { checkins: new TableAdapter('id'), missionCompletions: new TableAdapter('key'), vitalsQueue: new TableAdapter('localId'), imagingAssessments: new TableAdapter('id'), transaction: async (_mode, _table, work) => work() };
const loadOriginal = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../db/localDb') return { localDb: db };
  return loadOriginal.call(this, request, parent, isMain);
};
const { checkins, validateCheckIn, saveCheckInOnce } = require('../src/services/checkins.ts');
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
const { AnomalyDemoBar } = require('../src/components/AnomalyDemoBar.tsx');
const { DiagnosticsModal } = require('../src/components/DiagnosticsModal.tsx');
const {
  computeSpaceEnvironmentRisks,
  defaultSimulationConfig,
  evaluateLocalAlerts,
} = require('../src/services/simulationConfig.ts');
const { buildPropagatedIssFeed, parseEnlilFrameLabel } = require('../src/services/spaceWeather.ts');
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
  const now = new Date(2026, 10, 14, 12); const recordAt = (day, hour=0) => sample({ createdAt: new Date(2026, 10, day, hour).toISOString() });
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
  const noop = () => {};
  for (const page of ['dashboard','checkin','analytics','missions','ai']) {
    const html = renderToStaticMarkup(React.createElement(AppShell, { page, crew: [{ id: 'A', name: 'Demo Crew' }], activeId: 'A', selectCrew: noop, crewDemo: true, offline: true, gateway: false, los: true, toggleLos: noop, pending: 2, syncing: false, sync: noop, sound: false, toggleSound: noop, contrast: false, toggleContrast: noop }, 'Content'));
    for (const route of ['dashboard','checkin','analytics','missions','ai']) assert.ok(html.includes(`href="#${route}"`));
    assert.equal((html.match(/aria-current="page"/g) || []).length, 2); assert.match(html, /Skip to content/); assert.match(html, /Offline · saved on this device/); assert.match(html, /Select astronaut/);
    for (const label of ['Home', 'Check-In', 'My Health Trends', 'Daily Activities', 'AI Assistant']) assert.ok(html.includes(label));
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
  const html = renderToStaticMarkup(React.createElement(CheckInPage, { astronautId: 'A', vitals: { astronaut_id: 'A' }, records: [], offline: true, gateway: false, onSaved: async () => {} }));
  assert.equal((html.match(/<fieldset/g) || []).length, 3);
  assert.equal((html.match(/<fieldset hidden=""/g) || []).length, 2);
  for (const field of ['sleepHours', 'sleepQuality', 'fatigue', 'stress', 'mood', 'symptoms', 'exerciseCompletion', 'notes']) assert.ok(html.includes(`name="${field}"`));
  assert.match(html, /Step 1 of 3/); assert.match(html, /Continue/); assert.match(html, /Before you save/);
});
test('activity suggestions use saved progress and check-in state, with at most three choices', () => {
  const date = '2026-11-14';
  assert.deepEqual(recommendedActivities([], date, false).map(item => item.id), ['sleep', 'mood', 'exercise']);
  assert.deepEqual(recommendedActivities([], date, true).map(item => item.id), ['patterns', 'recovery', 'reflection']);
  assert.deepEqual(recommendedActivities([{ date, missionId: 'sleep' }, { date: '2026-11-13', missionId: 'mood' }], date, false).map(item => item.id), ['mood', 'exercise']);
  assert.equal(recommendedActivities(['sleep', 'mood', 'exercise'].map(missionId => ({ date, missionId })), date, false).length, 0);
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
  const html = renderToStaticMarkup(React.createElement(CheckInPage, { astronautId: 'A', vitals: { astronaut_id: 'A' }, records: [], offline: true, gateway: false, onSaved: () => {} }));
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
  const unreliable = createWellnessStore('A', checkins, { list: async () => { if (reads++) throw new Error('Read failed'); return []; }, toggle: async () => {} });
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
    assert.match(html, /Demo mode/); assert.match(html, /disabled=""/); assert.match(html, status.recordsLoading ? /Loading saved records/ : /Saved context could not be loaded/);
  }
});

test('confirmed local writes notify the current profile view even when submission began on an abandoned screen', async () => {
  const current = createWellnessStore('A'), other = createWellnessStore('B');
  const stopCurrent = current.subscribe(() => {}), stopOther = other.subscribe(() => {});
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
  const returned = createWellnessStore('A', checkins, service); const stop = returned.subscribe(() => {}); await returned.reload();
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
  assert.match(html, /No recorded data yet/); assert.match(html, /No sleep times recorded/); assert.match(html, /No mood or stress entries/); assert.match(html, /No environment snapshots saved/);
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
test('app shell renders optional Bluetooth heart sensor setting cleanly', () => {
  const html = renderToStaticMarkup(React.createElement(AppShell, {
    page: 'dashboard',
    crew: [{ id: 'ASTRO-01', name: 'Dr. Sarah Chen', role: 'Commander', age: 38, resting_hr: 62, baseline_spo2: 98.8, status: 'NOMINAL' }],
    activeId: 'ASTRO-01',
    selectCrew: () => {},
    crewDemo: true,
    offline: false,
    gateway: true,
    los: false,
    toggleLos: () => {},
    pending: 0,
    syncing: false,
    sync: () => {},
    sound: false,
    toggleSound: () => {},
    contrast: false,
    toggleContrast: () => {},
    bleStatus: 'disconnected',
    connectBle: () => {},
    disconnectBle: () => {},
  }, React.createElement('div', null, 'Body')));
  assert.match(html, /Add Bluetooth heart sensor/);
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
    alerts, onAcknowledge: () => {}, onAcknowledgeAll: () => {},
  }));
  assert.match(alertHtml, /Mark all/);
  assert.match(alertHtml, /Recommended action:/);

  const risks = computeSpaceEnvironmentRisks(sampleVitals, simConfig);
  assert.equal(risks.length, 6);
  const simHtml = renderToStaticMarkup(React.createElement(AnomalyDemoBar, {
    currentAnomaly: 'COMPOUND_CRISIS', simConfig, vitals: sampleVitals,
    onTrigger: () => {}, onUpdateSimConfig: () => {}, onRunDiagnostics: () => {}, isDiagnosing: false,
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
    onClose: () => {},
  }));
  assert.match(diagHtml, /36\.2 \/ 100/);
  assert.match(diagHtml, /737\.3 mSv/);

  const dupAlerts = [
    { id: 'h-old', astronaut_id: 'ASTRO-01', timestamp: '2026-11-14T18:00:00Z', severity: 'CRITICAL', alert_type: 'HYPOXIA', message: 'SpO2 88.2%', trigger_metric: 'SpO2 88.2%', acknowledged: false },
    { id: 'h-new', astronaut_id: 'ASTRO-01', timestamp: '2026-11-14T18:01:00Z', severity: 'CRITICAL', alert_type: 'HYPOXIA', message: 'SpO2 86.4%', trigger_metric: 'SpO2 86.4%', acknowledged: false },
    { id: 'r-1', astronaut_id: 'ASTRO-01', timestamp: '2026-11-14T18:01:05Z', severity: 'WARNING', alert_type: 'RADIATION_SPIKE', message: 'Rad 35 uSv/h', trigger_metric: 'Rad 35 uSv/h', acknowledged: false },
  ];
  const dedupedAlertHtml = renderToStaticMarkup(React.createElement(AlertBanner, {
    alerts: dupAlerts, onAcknowledge: () => {}, onAcknowledgeAll: () => {},
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
    onOpenSelfExam: () => {},
    onAskAi: () => {},
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
    onExamTypeChange: () => {},
    assessments: astro1List,
    onAssessmentSaved: () => {},
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
  assert.ok(readiness.xp > 0);
  assert.ok(readiness.badges.some(b => b.id === 'ared-pro' && b.earned));
  assert.ok(readiness.badges.some(b => b.id === 'sans-watch' && b.earned));
  assert.ok(readiness.badges.some(b => b.id === 'hydrated' && b.earned));

  const missionsHtml = renderToStaticMarkup(React.createElement(MissionsPage, {
    checkedIn: true,
    astronautId: 'ASTRO-01',
    completions: [],
    onToggle: async () => {},
    loading: false,
    loadError: '',
    activitySaving: false,
    readiness,
  }));
  assert.match(missionsHtml, /Check-In Streak/);
  assert.match(missionsHtml, /XP/);

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
  assert.match(liveAnalyticsHtml, /Live Biometric Stream &amp; Rolling Trends/);
  assert.match(liveAnalyticsHtml, /94\.2 \/ 100/);
  assert.match(liveAnalyticsHtml, /102/);
  assert.doesNotMatch(liveAnalyticsHtml, /<details/);

  const liveCheckinHtml = renderToStaticMarkup(React.createElement(LiveCheckInPage, {
    astronautId: 'ASTRO-01',
    vitals,
    records: [],
    offline: false,
    gateway: true,
    onSaved: () => {},
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
  assert.match(liveAiHtml, /HR 70 BPM/);
  assert.match(liveAiHtml, /Glucose 94 mg\/dL/);
  assert.doesNotMatch(liveAiHtml, /<details/);

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
