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
    const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    }, fileName: filename });
    module._compile(result.outputText, filename);
  };
}
class TableAdapter {
  constructor(key) { this.key = key; this.data = new Map(); this.failure = false; }
  async add(record) { if (this.failure) throw new Error('Storage unavailable'); if (this.data.has(record[this.key])) throw new Error('Duplicate'); this.data.set(record[this.key], structuredClone(record)); }
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
const db = { checkins: new TableAdapter('id'), missionCompletions: new TableAdapter('key'), vitalsQueue: new TableAdapter('localId'), transaction: async (_mode, _table, work) => work() };
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
const { companionSummary, decodeWeather, weatherSummary, loadVisionObservations, saveVisionObservation } = require('../src/services/companion.ts');
const { CompanionDashboard, CompanionEvidence, StudyComparison, WeatherReplay, CompanionDemoControls } = require('../src/components/CompanionDashboard.tsx');
const { buildCompanionDemo, companionScenarios } = require('../src/services/companionDemo.ts');
const { Modal } = require('../src/components/Modal.tsx');
const { CardTrend } = require('../src/components/CardTrend.tsx');
const { isWelcomeHidden, saveWelcomePreference, onboardingKey, placeTourCard, tourSteps } = require('../src/services/onboarding.ts');
const { WelcomeTour } = require('../src/components/WelcomeTour.tsx');
const researchSnapshot = require('../src/data/researchSnapshot.json');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const sample = (overrides = {}) => ({ id: 'record-1', astronautId: 'A', createdAt: '2026-11-14T09:00:00Z', sleepHours: 7.5, sleepQuality: 4, fatigue: 2, stress: 3, mood: 'Good', exerciseMinutes: 30, symptoms: '', notes: '', biometrics: null, syncStatus: 'pending', ...overrides });
beforeEach(() => { delete globalThis.window; for (const table of [db.checkins, db.missionCompletions, db.vitalsQueue]) { table.data.clear(); table.failure = false; } Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } }); });

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

test('companion summaries isolate crew, exclude future entries, and count the latest entry per calendar day', () => {
  const now = new Date(2026, 10, 15, 12);
  const at = (day, hour, overrides = {}) => sample({ id: `r-${day}-${hour}`, createdAt: new Date(2026, 10, day, hour).toISOString(), ...overrides });
  const records = [at(15, 9, { exerciseMinutes: 30, sleepHours: 8 }), at(15, 8, { exerciseMinutes: 60, sleepHours: 6 }), at(14, 9, { exerciseMinutes: 0, sleepHours: 7 }), at(9, 0, { exerciseMinutes: 20 }), at(8, 23, { exerciseMinutes: 999 }), at(15, 13, { exerciseMinutes: 999 }), at(15, 10, { astronautId: 'B', exerciseMinutes: 999 }), sample({ createdAt: 'invalid' })];
  const summary = companionSummary('A', records, now);
  assert.equal(summary.coverage, 3); assert.equal(summary.exerciseMinutes, 50); assert.equal(summary.exerciseDays, 2);
  assert.equal(summary.latest.sleepHours, 8); assert.equal(summary.previous.sleepHours, 6); assert.equal(summary.sleepChange, 2);
  assert.equal(summary.sleepAverage, 7.5); assert.equal(companionSummary('C', records, now).sleepAverage, null);
});

test('vision observations persist separately per astronaut and retain explicit no-change and unsure responses', () => {
  const storage = memoryStorage();
  const first = saveVisionObservation('A', 'no-change', storage, new Date('2026-11-15T01:00Z'));
  saveVisionObservation('A', 'unsure', storage, new Date('2026-11-15T02:00Z'));
  saveVisionObservation('B', 'change', storage, new Date('2026-11-15T03:00Z'));
  assert.equal(first[0].status, 'no-change');
  assert.deepEqual(loadVisionObservations('A', storage).map(x => x.status), ['unsure', 'no-change']);
  assert.equal(loadVisionObservations('B', storage).length, 1); assert.deepEqual(loadVisionObservations('C', storage), []);
  assert.throws(() => saveVisionObservation('A', 'healthy', storage), /Choose a vision observation/);
});

test('vision storage failures and malformed histories preserve existing data', () => {
  const storage = memoryStorage(); saveVisionObservation('A', 'change', storage);
  const before = [...storage.data.entries()];
  assert.throws(() => saveVisionObservation('A', 'unsure', { getItem: storage.getItem, setItem() { throw new Error('Quota'); } }), /Quota/);
  assert.deepEqual([...storage.data.entries()], before);
  const key = [...storage.data.keys()][0]; storage.setItem(key, '{broken');
  assert.throws(() => loadVisionObservations('A', storage)); assert.throws(() => saveVisionObservation('A', 'unsure', storage));
  assert.equal(storage.getItem(key), '{broken');
  storage.setItem(key, JSON.stringify([{ ...JSON.parse(before[0][1])[0], astronautId: 'B' }]));
  assert.throws(() => loadVisionObservations('A', storage), /Existing data was retained/);
});

test('historical replay preserves missing Kp and does not declare an empty catalog day safe', () => {
  const empty = decodeWeather([['2026-11-14', 0, 0, 0, 0, null]])[0];
  assert.equal(empty.maxKp, null); assert.equal(weatherSummary(empty), 'No catalog entries');
  const html = renderToStaticMarkup(React.createElement(WeatherReplay, { day: empty, onSelect() {} }));
  assert.match(html, /No entry/); assert.match(html, /Missing entries do not establish quiet or safe conditions/);
  assert.doesNotMatch(html, /SAFE|NORMAL|Live feed/);
  const max = decodeWeather(researchSnapshot.weather.days).find(x => x.date === '2024-05-11');
  assert.equal(max.maxKp, 9); assert.equal(max.flares, 13); assert.equal(max.sep, 2);
});

test('research comparisons expose species and per-group sample counts without assigning study values to crew', () => {
  for (const [study, species, unit] of [[researchSnapshot.vision, 'Mice', 'mmHg'], [researchSnapshot.bone, 'Rats', '%'], [researchSnapshot.blood, 'Humans', '10³ cells/µL']]) {
    const html = renderToStaticMarkup(React.createElement(StudyComparison, { study, species, unit, title: 'Research comparison', explanation: 'Context only' }));
    assert.match(html, new RegExp(species)); assert.match(html, /Sample IDs/); assert.match(html, /no significance test or individual prediction/);
    assert.ok(html.includes(`https://osdr.nasa.gov/bio/repo/data/studies/${study.study}`));
    for (const group of study.groups) assert.ok(html.includes(group.mean.toFixed(2)));
  }
  assert.deepEqual(researchSnapshot.vision.groups.map(x => x.n), [20, 20]);
  assert.deepEqual(researchSnapshot.bone.groups.map(x => x.n), [13, 12, 10]);
  assert.deepEqual(researchSnapshot.blood.groups.map(x => x.n), [4, 4]);
});

test('companion evidence has honest empty, unavailable, species, and zero-pain states', () => {
  const base = { summary: companionSummary('A', []), day: decodeWeather(researchSnapshot.weather.days)[0], onSelectDate() {}, observations: [], visionLoading: false, visionError: '', saveVision() {}, recordsLoading: false, recordsError: '' };
  const recovery = renderToStaticMarkup(React.createElement(CompanionEvidence, { ...base, topic: 'recovery' }));
  assert.match(recovery, /No check-ins saved yet/); assert.match(recovery, /These blood tests do not measure sleep or mood/); assert.match(recovery, /No readiness score/);
  const error = renderToStaticMarkup(React.createElement(CompanionEvidence, { ...base, topic: 'movement', recordsError: 'Storage unavailable' }));
  assert.match(error, /Saved check-ins are unavailable/);
  const summary = companionSummary('A', [sample({ createdAt: new Date().toISOString(), spaceWellness: { version: 1, mode: 'local-demo', pain: { intensity: 0 } } })]);
  const movement = renderToStaticMarkup(React.createElement(CompanionEvidence, { ...base, topic: 'movement', summary }));
  assert.match(movement, /0\/10/); assert.match(movement, /Rats/); assert.match(movement, /Unrecorded days are unknown/);
  const vision = renderToStaticMarkup(React.createElement(CompanionEvidence, { ...base, topic: 'vision', visionError: 'Storage unavailable' }));
  assert.match(vision, /Save vision observation/); assert.match(vision, /disabled/); assert.match(vision, /Mice/);
  const dashboard = renderToStaticMarkup(React.createElement(CompanionDashboard, { astronautId: 'A', records: [], loading: false, error: '' }));
  assert.match(dashboard, /Your space-health companion/); assert.match(dashboard, /bundled offline/); assert.match(dashboard, /Research provenance and limits/);
});

test('demo scenarios are deterministic, scoped to crew and valid across all seven days without future entries', () => {
  const now = new Date(2026, 10, 15, 12);
  for (const scenario of companionScenarios) for (let day = 1; day <= 7; day++) {
    const demo = buildCompanionDemo('A', scenario.id, day, now);
    assert.deepEqual(demo, buildCompanionDemo('A', scenario.id, day, now));
    assert.equal(demo.records.length, day); assert.equal(demo.vision.length, day);
    assert.equal(companionSummary('A', demo.records, now).coverage, day);
    for (const record of demo.records) { assert.equal(validateCheckIn(record), null); assert.equal(record.astronautId, 'A'); assert.ok(new Date(record.createdAt) <= now); assert.equal(record.biometrics, null); }
    assert.equal(companionSummary('B', demo.records, now).coverage, 0);
    assert.ok(buildCompanionDemo('B', scenario.id, day, now).records.every(r => r.astronautId === 'B'));
  }
  for (const day of [0, 8, 1.5, NaN]) assert.throws(() => buildCompanionDemo('A', 'steady', day, now));
  assert.throws(() => buildCompanionDemo('A', 'unknown', 7, now));
});

test('demo day progression produces descriptive changes while leaving saved records untouched', async () => {
  await checkins.save(sample()); const before = await checkins.list('A');
  const now = new Date(2026, 10, 15, 12);
  const start = buildCompanionDemo('A', 'demanding', 1, now), end = buildCompanionDemo('A', 'demanding', 7, now);
  assert.equal(start.vision[0].status, 'no-change'); assert.equal(end.vision[0].status, 'change');
  assert.equal(end.sleepChangeFromStart, -2.5); assert.equal(end.fatigueChangeFromStart, 3);
  assert.equal(companionSummary('A', end.records, now).exerciseMinutes, 140);
  const recovery = buildCompanionDemo('A', 'recovery', 7, now);
  assert.equal(recovery.sleepChangeFromStart, 2.5); assert.equal(recovery.fatigueChangeFromStart, -3);
  assert.deepEqual(await checkins.list('A'), before);
});

test('demo UI labels fictional entries, exposes day controls and removes personal write actions', () => {
  const model = buildCompanionDemo('A', 'demanding', 7);
  const controls = renderToStaticMarkup(React.createElement(CompanionDemoControls, { active: true, scenario: 'demanding', day: 7, model, onStart() {}, onExit() {}, onScenario() {}, onDay() {} }));
  assert.match(controls, /Exit demo/); assert.match(controls, /Demo day 7 of 7/); assert.match(controls, /No demo entries are saved/); assert.match(controls, /not medical estimates or forecasts/);
  for (const topic of ['vision', 'movement', 'recovery']) {
    const html = renderToStaticMarkup(React.createElement(CompanionEvidence, { topic, demo: true, summary: companionSummary('A', model.records), day: decodeWeather(researchSnapshot.weather.days)[0], onSelectDate() {}, observations: model.vision, visionLoading: false, visionError: '', saveVision() { throw new Error('Must not write'); }, recordsLoading: false, recordsError: '' }));
    assert.match(html, /SYNTHETIC DEMO/);
    assert.doesNotMatch(html, /Save vision observation|Record a daily check-in/);
    if (topic === 'vision') { assert.match(html, /Change noticed/); assert.match(html, /Demo vision history/); }
  }
});

test('detail dialogs are named and leave private form content unmounted while closed', () => {
  const props = { title: 'Vision details', description: 'Your observations and the research.', onClose() {} };
  const closed = renderToStaticMarkup(React.createElement(Modal, { ...props, open: false }, 'PRIVATE CONTENT'));
  assert.match(closed, /<dialog/); assert.match(closed, /aria-labelledby=/); assert.match(closed, /aria-describedby=/);
  assert.doesNotMatch(closed, /PRIVATE CONTENT/);
  const opened = renderToStaticMarkup(React.createElement(Modal, { ...props, open: true }, 'PRIVATE CONTENT'));
  assert.match(opened, /PRIVATE CONTENT/); assert.match(opened, /Close Vision details/); assert.match(opened, /Escape/);
});

test('card traces preserve honest empty states and render flat series without invalid coordinates', () => {
  for (const values of [[], [8]]) {
    const html = renderToStaticMarkup(React.createElement(CardTrend, { values }));
    assert.doesNotMatch(html, /<svg|<path/); assert.match(html, /aria-hidden="true"/);
  }
  for (const values of [[8, 8, 8], [5, 7, 6], [0, 0, 0]]) {
    const html = renderToStaticMarkup(React.createElement(CardTrend, { values }));
    assert.match(html, /<svg/); assert.doesNotMatch(html, /NaN|Infinity/); assert.match(html, /aria-hidden="true"/);
  }
});

test('companion cards expose detail dialogs and keep the dashboard compact before interaction', () => {
  const html = renderToStaticMarkup(React.createElement(CompanionDashboard, { astronautId: 'A', records: [], loading: false, error: '' }));
  assert.equal((html.match(/aria-haspopup="dialog"/g) || []).length, 5);
  assert.match(html, /RESEARCH FIELD NOTES/); assert.match(html, /View details/);
  assert.doesNotMatch(html, /class="evidence-grid"|class="vision-form"/);
});

test('welcome appears by default and only explicit opt-out suppresses it without changing health records', () => {
  const storage = memoryStorage(); storage.setItem('personal-records', 'KEEP');
  storage.setItem('biotelemetry:onboarding:v1', JSON.stringify({ version: 1, outcome: 'completed' }));
  assert.equal(isWelcomeHidden(storage), false);
  assert.equal(saveWelcomePreference(storage, true), true);
  assert.equal(isWelcomeHidden(storage), true);
  assert.deepEqual(JSON.parse(storage.getItem(onboardingKey)), { version: 2, dontShowAgain: true });
  assert.equal(saveWelcomePreference(storage, false), true);
  assert.equal(isWelcomeHidden(storage), false);
  assert.equal(storage.getItem('personal-records'), 'KEEP');
  for (const invalid of ['{broken', 'null', JSON.stringify({ version: 99, dontShowAgain: true }), JSON.stringify({ version: 2, dontShowAgain: 'true' }), JSON.stringify({ version: 1, outcome: 'completed' })]) {
    storage.setItem(onboardingKey, invalid); assert.equal(isWelcomeHidden(storage), false); assert.equal(storage.getItem(onboardingKey), invalid);
  }
});

test('blocked welcome preferences never prevent the introduction from being used', () => {
  assert.equal(isWelcomeHidden({ getItem() { throw new Error('Blocked'); } }), false);
  assert.equal(saveWelcomePreference({ setItem() { throw new Error('Quota'); } }, true), false);
});

test('tour card placement fits phone and desktop viewports including bottom navigation and missing targets', () => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 900 }, { width: 1440, height: 900 }]) {
    const targets = [null, { left: 10, top: 15, width: 200, height: 44 }, { left: 0, top: viewport.height - 70, width: viewport.width, height: 70 }, { left: viewport.width - 150, top: 50, width: 140, height: 44 }];
    for (const target of targets) {
      const placed = placeTourCard(target, viewport, 330);
      assert.ok(placed.left >= 0); assert.ok(placed.top >= 0);
      assert.ok(placed.left + placed.width <= viewport.width);
      assert.ok(placed.top + 330 <= viewport.height);
    }
  }
  const bottom = placeTourCard({ left: 0, top: 760, width: 390, height: 70 }, { width: 390, height: 844 }, 330);
  assert.equal(bottom.placement, 'above');
});

test('welcome offers a guided introduction or skip without rendering hidden tour content', () => {
  const html = renderToStaticMarkup(React.createElement(WelcomeTour, { open: true, onClose() {} }));
  assert.match(html, /Welcome to BioTelemetry/); assert.match(html, /Show me around/); assert.match(html, /Explore on my own/);
  assert.match(html, /show again/); assert.match(html, /type="checkbox"/); assert.doesNotMatch(html, /checked=""/);
  assert.match(html, /5 short stops/); assert.doesNotMatch(html, /class="tour-card"/);
  assert.equal(tourSteps[0].id, 'checkin'); assert.equal(tourSteps[tourSteps.length - 1].id, 'crew');
  assert.equal(new Set(tourSteps.map(step => step.id)).size, tourSteps.length);
});
