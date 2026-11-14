# Frontend reliability and integration-readiness handoff

## Changes

- **Persistent drafts:** `services/drafts.ts` and `hooks/useCheckInDraft.ts` save incomplete answers and the current step synchronously after every edit/step change. Keys use `biotelemetry:checkin-draft:v1:<encoded astronaut ID>`. Drafts restore by astronaut and work offline without changing the IndexedDB schema. Recovery, autosave, quota/read failure and cleanup messages are explicit. Corrupt/unreadable drafts are retained rather than silently removed or overwritten.
- **Successful local submission:** the Check-In screen clears its submitted draft only after IndexedDB confirms a saved record. Failed submission retains answers. A revision check protects a newer draft saved in another tab while submission was pending. Editing answers creates a new record ID; unchanged replay after an interrupted cleanup returns the existing record instead of creating a duplicate. Form fields are disabled during submission.
- **Immediate history:** `services/wellnessState.ts` is the shared state source for Home, Trends, Activities and the assistant. Confirmed local records are merged into the selected astronaut's history immediately, without a full-page reload or dependence on a second database read. Older in-flight reads cannot overwrite records committed during that read.
- **Profile transitions:** in-page `wellnessEvents.ts` notifications let the current profile view receive a confirmed write that began on a screen which has since unmounted. All updates are scoped by astronaut ID. This also covers activity writes completing during a profile switch.
- **Activity consistency:** Home and Daily Activities use the same mutation method and source of progress. Duplicate actions are blocked while a change is pending. Progress is read back from local storage before completion is confirmed. Failed/unconfirmed progress reads retain known data, show an error and require recovery before further toggles.
- **Loading/error states:** independent check-in/activity read results preserve available data when the other read fails. Initial reads and failures are distinguished from empty history. AI prompts and activity mutations are disabled while their source context is loading or unavailable. Retry local records is provided by the existing global error state.
- **AI context:** the demo adapter now requires an explicit astronaut ID and independently filters records, observations and completions to that astronaut. The latest actual saved check-in/notification is used. Today's activity total uses unique known activity IDs from saved completions, not an externally supplied count. The conversation remains explicitly a deterministic demo; Gemini is not called and is unavailable offline.

No backend files, Supabase configuration, environment files, REST contracts, database schemas, telemetry polling, ECG rendering, diagnostic/alert logic, PWA configuration or telemetry queue synchronization logic were changed. Existing package/lockfile edits and original logo artwork were preserved. No dependencies were added.

## Files in this pass

Added: `src/services/drafts.ts`, `wellnessState.ts`, `wellnessEvents.ts`, and `src/hooks/useCheckInDraft.ts`.

Updated: `src/App.tsx`, `src/hooks/useWellness.ts`, `src/pages/CheckInPage.tsx`, `MissionsPage.tsx`, `AIPage.tsx`, `src/services/checkins.ts`, `checkInDraft.ts`, `ai.ts`, and `tests/frontend.test.cjs`. Handoff documents point to this report.

The `CheckIn` stored-record shape remains unchanged, including `syncStatus: pending`. Drafts are local to this browser and origin. Saved records continue to use the existing Dexie database.

## Validation results

- TypeScript strict validation: **passed**.
- Vite production build and PWA service-worker generation: **passed**.
- Automated tests: **29 passed, 0 failed**.
- Coverage includes all existing regressions plus complete draft/step restoration, astronaut isolation, corrupt/denied/quota-limited storage, failed submission retention, conditional cleanup, duplicate/concurrent submissions, immediate history notification, stale-read protection, partial loading failures, navigation/profile progress, writes finishing after profile changes, AI source isolation, activity-count filtering, and disabled AI input when context is unavailable.

Tests use a localStorage-shaped adapter and an in-memory IndexedDB table adapter. The restore test server-renders the real Check-In component with stored draft state; this is not a real browser reload or click test. Browser discovery returned no apps or browser sessions. The entire browser checklist below is **UNVERIFIED**. Real IndexedDB durability, React interaction/focus, service-worker lifecycle, mobile keyboards, installation and responsive visuals are not claimed as passed.

## Exact manual checklist — UNVERIFIED

Use a fresh browser test profile and fictional records. Keep the same origin and port throughout: storage on `localhost:5173`, `localhost:4173` and `127.0.0.1:4173` is separate.

### 1. Start production preview and cache the shell

```sh
cd frontend
npm run build
npm test
npm run preview -- --host localhost --port 4173
```

Open `http://localhost:4173/#dashboard`. In browser developer tools, Application → Service Workers, confirm the worker is activated. Visit all five screens once online. With FastAPI stopped, expect the labeled demo/server-unavailable state, simulated measurements and ECG, and no invented notifications or clinical conclusions.

### 2. Recover drafts at each step

1. Select the first astronaut (A); note its ID in Home → Mission details and simulation tools.
2. On Check-In enter sleep **7.5**, quality **4**, tiredness **2**. Confirm the draft-saved status; reload. Expect these values on Step 1.
3. Continue. Enter stress **3**, mood **Good**, symptoms **Reliability A symptoms**. Reload. Expect Step 2 and all prior answers unchanged.
4. Continue. Choose exercise **Yes**, duration **30**, notes **Reliability A notes**. Reload. Expect Step 3 with all answers and review values intact.
5. Navigate Home → Trends → Check-In without saving. Expect the same unfinished draft and step.

### 3. Isolate astronaut drafts

1. Switch to the second astronaut (B). Expect an independent draft, with none of A's answers.
2. Enter sleep **6**, quality **2**, tiredness **4**; continue to Step 2; choose mood **Low** and stress **4**. Reload and verify B's draft.
3. Switch A → B → A. A must restore Step 3, 7.5 hours, Good mood, 30 minutes and A's notes. B must restore Step 2 and its own values.

### 4. Save locally and update views immediately

1. With A selected, press Save Health Record on Step 3.
2. Expect a local-save confirmation, explicitly **not yet sent to the server**. The submitted draft is cleared and the form resets for a new record. Save remains disabled until answers are changed.
3. Without reloading, follow View your history. In My Health Trends → Past check-ins, verify the new date/time, 7.5 hours, quality 4, tiredness 2, stress 3, Good mood, exercise 30, and A's symptoms/notes.
4. Visit Home. Expect today's check-in status and latest mood to reflect the new record immediately. Visit AI Assistant and ask about sleep; expect A's actual saved entry.
5. In Application → Local Storage, expect A's submitted `biotelemetry:checkin-draft:v1:...` key to be absent and B's unfinished key still present. IndexedDB → `SpaceBiotelemetryDB` → `checkins` should contain the new record with `syncStatus: pending`.
6. Reload. Expect exactly one new saved record and no resurrection of the successfully cleared A draft. B's draft must still restore.

### 5. Activity consistency and astronaut changes

1. On A's Home, toggle one activity. Note the completion total. Open Daily Activities → All Activities; the same activity and total must match.
2. Navigate Trends → Home → Daily Activities. Progress must remain unchanged.
3. Switch to B. A's activity completion must not appear as B's progress. Complete a different B activity; switch A → B and check each total.
4. Reload each profile. Saved progress must remain independent. Undo A's activity under All Activities and confirm Home immediately agrees.
5. Try rapid repeated clicks while an activity is saving. Controls should be disabled, with no accidental double-toggle. If a local read/write fails, expect recovery feedback rather than a false zero or completion confirmation.

### 6. AI records, pending context and honesty

1. Finish and save B's check-in with **6 hours**, **Low** mood, **Not today** for exercise, and B-specific notes.
2. Ask the sleep question on A: expect 7.5 hours from A. Switch B and ask again: expect 6 hours from B. Ask how you have been feeling and compare actual saved mood/tiredness/stress.
3. Ask what activities can be completed today. Completion facts must match the selected profile's saved progress for today; duplicates, other profiles and other dates must not increase the count.
4. Ask why a notification was flagged. With none recorded, expect a statement that no saved notification is available. With a notification received through the simulation backend, only the selected astronaut's notification may be quoted.
5. While initial context loads, prompts/input must be unavailable with loading text. During a failed context read, expect an explicit error and Retry local records; do not accept fabricated empty-history responses.
6. Every answer must remain labeled demo, separate facts/explanation/next step, and avoid claims that Gemini ran or that a medical diagnosis/safety assessment was made.

### 7. Failure recovery in a disposable test profile

To test failed IndexedDB submission, enter a complete fictional draft, then run this in DevTools Console before pressing Save:

```js
window.reliabilityOriginalAdd = IDBObjectStore.prototype.add;
IDBObjectStore.prototype.add = function (...args) {
  if (this.name === 'checkins') throw new Error('Reliability test: write denied');
  return window.reliabilityOriginalAdd.apply(this, args);
};
```

Save must show an error, leave all answers/draft present and create no record. Restore the method and retry:

```js
IDBObjectStore.prototype.add = window.reliabilityOriginalAdd;
```

Expect one record, updated history and cleared submitted draft.

For interrupted cleanup, start a new complete fictional draft and temporarily fail only draft removal:

```js
window.reliabilityOriginalRemove = Storage.prototype.removeItem;
Storage.prototype.removeItem = function (key) {
  if (key.startsWith('biotelemetry:checkin-draft:v1:')) throw new Error('Reliability test: cleanup denied');
  return window.reliabilityOriginalRemove.call(this, key);
};
```

Save must confirm the health record but explicitly report retained draft cleanup. Restore the method:

```js
Storage.prototype.removeItem = window.reliabilityOriginalRemove;
```

Reload, then submit that restored draft **without changing answers**. Expect the existing record to be returned, no duplicate history entry, and successful draft cleanup. Editing answers intentionally starts a new record identity.

For corrupt-draft recovery, copy a fictional draft's Local Storage value first, replace it with invalid JSON, and reload. Expect a recovery error; the invalid value must remain untouched. Restore the copied value in developer tools and reload; the draft should recover. Denied/quota-limited draft writes should show an explicit warning and keep the previous stored value; these failure boundaries are also covered automatically.

### 8. Offline and PWA lifecycle

1. After the online visit and activated worker in step 1, use DevTools Network → Offline. Reload and navigate all five screens. Expect the cached shell and explicit offline status.
2. Enter a partial draft, reload and verify restoration. Complete/save a fictional check-in offline, then verify history without reloading. Complete an activity; reload again and check both saved records and progress.
3. AI must be unavailable offline; no offline Gemini claim is allowed. Reconnect and confirm it uses the saved local entries.
4. Inspect installability and install the PWA. Confirm the original branding and repeat a draft restore/reload in installed mode.

### 9. Existing monitoring and synchronization

1. Start the existing FastAPI service normally. Select each astronaut and inspect API polling, ECG, all measurements, notifications and diagnostics using the existing expandable controls.
2. Verify sound/high contrast and astronaut/acknowledgement keyboard controls. Simulation output must remain explicitly labeled.
3. Use Settings & connection → Test offline mode to buffer telemetry. Reconnect and use the pending-measurements upload control.
4. On network failure, partial receipt, mismatched astronaut or no explicit durable-persistence confirmation, expect local queued telemetry to remain. A server ingestion acknowledgement alone must not be presented as durable synchronization.

### 10. Responsive and accessibility smoke check

At **375×812**, **390×844**, **768×1024** and **1440×900**, verify all five screens, bottom/sidebar navigation, no page-wide overflow, readable draft/error messages, Back/Continue/final Save, focus movement, 200% zoom, help buttons, reduced motion, mobile safe areas and an accessible chat composer with the on-screen keyboard open.

## Remaining backend integration dependencies

Unchanged: agreed durable check-in persistence/sync and idempotency; activity sync/conflict resolution and date boundaries; server-side Gemini with structured provenance and safe errors; actual mission metadata; reliable durable telemetry persistence receipts and idempotent batch handling. No new FastAPI endpoints are called by this pass.

## Known limits

Drafts and records are browser/origin-specific and disappear if the user clears site storage. They do not sync across devices. Multiple tabs editing the same astronaut use last successful write for autosave; revision checks protect cleanup from deleting a newer draft, but there is no collaborative merge UI. Corrupt/unsupported draft versions are retained and require recovery from the saved value or developer tools; the app does not silently destroy them. Cross-tab live history/progress updates are not promised; in-page navigation/profile changes are notified, and a normal reload reads the database. Actual browser and offline checks above remain unverified.
