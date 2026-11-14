# BioTelemetry frontend handoff

Latest space-wellness pass: [Optional fields, environment provenance, 40-test results and manual QA](SPACE_WELLNESS_QA.md). New fields are versioned local-demo extensions; [backend review proposal](docs/SPACE_WELLNESS_BACKEND_PROPOSAL.md). Older implementation reports below remain architectural history.

Latest reliability pass: [Draft recovery, shared state, AI scoping and manual QA](RELIABILITY_QA.md). TypeScript, production build and 29 tests pass. Drafts now persist locally; earlier in-memory-draft limitations below are superseded.

Latest UX pass: [Usability simplification](UX_SIMPLIFICATION.md) documents the current screen labels, three-step check-in, progressive disclosure and 15-test verification results. The initial implementation details below describe the preserved integration architecture.

A mobile-first redesign of the existing React + Vite + TypeScript application. Backend code, schemas, API routes, environment files, and the pre-existing package-lock changes were left untouched. No new dependencies were installed.

## Run locally

With Node.js 20.19+ or 22+ and npm available:

```sh
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. FastAPI remains optional for the local demo. The existing Vite proxy sends `/api` to http://localhost:8000. The optional, public `VITE_API_BASE_URL` setting overrides the shared API base; its default is `/api/v1`. Do not place Gemini or other secret keys in Vite configuration.

```sh
npm run build
npm test
npm run preview -- --host 127.0.0.1
```

Tests inspect generated PWA files, so build before running the test suite. Production preview normally runs at http://localhost:4173. Service workers are generated for production, not the development server. Use HTTPS for deployment; localhost is suitable for PWA testing. Hosting is expected at the origin root.

The task environment has no npm executable on PATH. Verification used the existing Node runtime supplied by VS Code (`ELECTRON_RUN_AS_NODE=1`), invoking `node_modules/typescript/bin/tsc`, `node_modules/vite/bin/vite.js build`, and `--test tests/frontend.test.cjs`. All three completed successfully outside the sandbox after esbuild directory-access restrictions prevented a sandboxed build.

## Design and screens

Shared semantic CSS variables and Tailwind aliases define the navy, cyan, white, muted, success, warning, and critical palette. Typography uses Inter when locally available, with Segoe UI and system sans-serif fallbacks; there is no external font dependency.

- **Dashboard:** selected astronaut and role, explicitly unconfigured mission day, demo mission context, API/offline status, four primary biometric cards, respiratory rate, environmental radiation, suit battery, ECG, observations, daily mission progress, and check-in/assistant actions. Test anomalies and diagnostics are retained in an expandable tools panel. Telemetry and ECG are explicitly simulated.
- **Check-In:** validated sleep duration/quality, fatigue, stress, mood, exercise duration, symptoms, and notes. Automatic API simulation snapshots are separate from manual fields. Local demo readings are never attached as fetched biometrics. Successful saves show time and pending status; errors retain the form.
- **Analytics:** daily, trailing seven-day, and trailing thirty-day filters; real saved check-in values for sleep, fatigue, and stress; heart rate from attached API simulation snapshots; crew resting-HR reference comparison; latest self-report and observation history. Empty states replace fabricated history. SVG charts include date labels, units, focusable points with native tooltips, accessible summaries, and expandable data tables. Recharts was not installed, so this implementation adds no chart dependency.
- **Missions:** all nine requested activities in three categories; Routine/Recommended indicators; reversible completion controls; per-astronaut local-calendar-day progress and dated history. Completion is explicitly unrelated to medical health status. Suggestions reference approved mission routines.
- **Gemini AI:** suggested questions, conversation, input, loading and error states, connection status, separated facts/explanations/actions, and links to missions. The deterministic adapter reads saved context; Gemini is not connected. Offline messages clearly explain that Gemini is unavailable. Conversations are in memory and reset on astronaut changes or reload.

The official primary color is `#00BCFFFF`, defined by `--accent` with matching Tailwind `accent`/`primary` tokens. Primary buttons use dark text; active navigation, selected tabs, links, focus indicators and progress bars share this color. Status and secondary data colors remain distinct.

At widths below 640px, content stacks and five fixed bottom tabs include safe-area padding. From 640px, forms, charts, and cards adapt to two columns. At 1024px the sidebar replaces bottom navigation. Wider screens add secondary information columns and a four-card biometric row at 1500px. Content includes space beneath fixed navigation. Browser zoom is enabled; controls have visible focus, semantic labels, keyboard support, and reduced-motion styling. The ECG becomes a static illustrative trace with reduced motion enabled.

## Files

Modified:

- `index.html`, `package.json`, `tailwind.config.js`, `vite.config.ts`: identity, zoom/safe-area metadata, test command, tokens, manifest and offline shell.
- `src/App.tsx`, `src/index.css`: integrated five-screen workspace, hash navigation, responsive layouts and design system.
- `src/components/AlertBanner.tsx`, `DiagnosticsModal.tsx`, `ECGMonitor.tsx`, `VitalCard.tsx`: refactored monitoring components, honest simulation labels, focus-managed diagnostics, reduced motion and readable metrics.
- `src/db/localDb.ts`: additive Dexie version 2 stores for check-ins and mission completions. Existing telemetry/alert stores and records are retained.
- `src/services/api.ts`: same endpoint paths and payloads, shared configurable base, eight-second timeouts, HTTP failure handling, typed batch receipts.

Added:

- `src/components/AppShell.tsx`: shared branding, sidebar, bottom tabs, top bar, astronaut selection, connection status, page heading, empty state and mission progress.
- `src/hooks/useTelemetry.ts`, `useWellness.ts`: existing monitoring lifecycle refactor and local data loading.
- `src/pages/CheckInPage.tsx`, `AnalyticsPage.tsx`, `MissionsPage.tsx`, `AIPage.tsx`: wellness screens and their reusable form, chart, mission and chat components.
- `src/services/checkins.ts`, `analytics.ts`, `missions.ts`, `ai.ts`, `telemetryQueue.ts`: typed feature adapters and conservative queue processing.
- `src/types/wellness.ts`, `src/vite-env.d.ts`: request, record, page and response types.
- `public/branding/biotelemetry-logo.png`: original artwork supplied after initial implementation; `pwa-192.png` and `pwa-512.png` are proportional installation icons derived from that artwork.
- `tests/frontend.test.cjs`: regression suite using Node's built-in runner and the already installed TypeScript compiler.
- This handoff document.

`frontend/package-lock.json` was already modified when work began and was not edited by this implementation. The old Navbar and CrewSelector files remain available; the shared shell now provides their controls.

## Existing functionality retained

Crew selection (now a header select), astronaut hotkeys 1–3, selected-astronaut polling, API telemetry samples and synthetic ECG fallback, all vital metrics, alerts and server-confirmed acknowledgement, Space acknowledgement outside interactive controls, optional audio blips/alarms, high contrast, anomaly simulation, API diagnostics, loss-of-signal simulation, Dexie buffering and manual telemetry batch upload.

Observation history is now also saved in the existing alerts store. Polling avoids overlapping requests and ignores stale responses on astronaut changes. HTTP failures no longer create a false acknowledgement. Diagnostics retain server labels and suggestions, clearly presented as unvalidated simulation output; the arbitrary overall health score is intentionally omitted.

## Demo and live boundaries

- A local fallback crew and illustrative telemetry allow the interface to work without FastAPI. The header identifies demo crew and source status. Connected backend telemetry is also treated as simulation, matching the existing backend implementation.
- Check-ins are stored in IndexedDB per astronaut with `syncStatus: pending`. No server persistence or successful cloud sync is claimed.
- Mission completion history stays local. No mission endpoint is called.
- Analytics uses saved records, not invented clinical findings, seeded history, or an overall health score.
- The assistant is a deterministic demo adapter, not Gemini, and sends no messages to an AI provider. Assistant use is disabled while offline or during simulated loss of signal.
- Mission context/day is not supplied by the API. It remains explicitly labeled demo/unconfigured.

## Integration gaps for the FastAPI team

These are proposed adapter needs, not implemented routes or changes to the existing API contract:

| Feature | Suggested server interface / required agreement |
| --- | --- |
| Check-ins | `GET /api/v1/checkins?astronaut_id=...`, `POST /api/v1/checkins`; agree on the `CheckIn` field mapping, server IDs, idempotency keys, receipt shape and durable persistence before marking any record synced. |
| History | Existing `GET /api/v1/telemetry/history` can support a future longitudinal telemetry adapter. Current charts use check-in snapshots; agree on time windows, pagination, provenance and timestamps before connecting server history. |
| Mission progress | `GET /api/v1/missions?astronaut_id=...&date=...` and a completion update endpoint; agree on mission IDs, timezone/day boundaries, reversible completions, idempotency and offline conflict resolution. |
| Gemini | A server-only assistant endpoint such as `POST /api/v1/ai/chat`; agree on conversation/context scope, provenance, authorization, structured facts/explanation/action output and errors. Gemini secrets stay on FastAPI. |
| Mission context | Mission name, launch date/day and approved routine metadata are not currently provided. |
| Durable telemetry sync | Existing `/telemetry/sync-batch` reports SUCCESS/count even when storage fails or only memory is available. It cannot currently prove durable persistence. An explicit, reliable persistence receipt (the adapter anticipates `persisted: true`) or per-record receipt is needed before deletion. This is not implemented on the backend. |

The new features expose `CheckInService`, `MissionService`, and `AssistantService` interfaces. Replace the local adapters after endpoint contracts are agreed. Authentication and Supabase integration remain with the backend team.

## Telemetry queue safety

The original code queried a boolean IndexedDB index using numeric `0`, which does not find legacy boolean records. The frontend now filters records without changing their schema. Uploads include only the selected astronaut's pending records. A failed request, partial receipt, mismatched astronaut, or unconfirmed durable persistence retains the batch. Only the exact local IDs in a confirmed batch can be removed; newly buffered records and other astronauts' records are preserved.

The existing backend's success response lacks durable confirmation, so local records remain pending after upload. A notice distinguishes server receipt from persistence. Avoid repeated uploads until backend idempotency is implemented. No automatic retry or full-queue deletion is performed.

## Verification

- TypeScript strict compilation: **passed**.
- Vite production build: **passed**, including generated service worker and manifest.
- Regression tests: **11 passed, 0 failed**. Coverage includes validation, saved-record isolation and retained values, failed-write retention, mission toggles and date history, range boundaries, deterministic/offline assistant behavior, incomplete/failed queue receipts, confirmed-batch deletion isolation, accessible navigation rendering, and PWA asset references/cache policy.
- HTTP smoke checks: application shell, manifest, service worker, and both PNG icons returned **200** from production preview.
- Git whitespace check: **passed**.
- Backend/schema/environment modifications: **none**.

Tests use a storage table adapter to verify service behavior and failure handling. They do **not** replace real-browser IndexedDB, React interaction, responsive visual, installability or offline lifecycle testing. Browser automation had no connected browser; the native UI helper also failed to connect. No visual/device check is claimed.

## Remaining checks and limitations

The original `public/branding/biotelemetry-logo.png` is now integrated in the mobile header, desktop sidebar and favicon. PWA icons are proportional 192px and 512px derivatives of the original square artwork. The original PNG is unchanged. Older placeholder-named files are retained to preserve user edits, but no UI or manifest references them and the service worker excludes them from precaching. No Stitch reference screens were available in the repository.

Before release, verify in an actual browser:

1. At 320, 390, 768, 1024 and 1440px, visit all five tabs. Check page overflow, chart labels, form controls, bottom navigation, safe areas, keyboard focus, zoom and reduced motion.
2. Save a fictional check-in; reload; switch astronauts and back. Confirm records are isolated and still pending. Verify storage-denied failure feedback.
3. Complete and undo a mission; reload. Verify per-astronaut and per-day history.
4. Build and preview, visit the app once online, wait for service-worker activation, then go offline and reload. Visit all tabs and save a check-in/mission offline. Gemini remains unavailable. The shell must have been cached on a previous online visit.
5. Run the existing backend, inspect alerts and diagnostics, test keyboard/sound controls, simulate loss of signal, and inspect the telemetry queue. Check that unsuccessful or unconfirmed uploads retain records.
6. Test the Dexie v1-to-v2 upgrade with an existing populated browser database. Confirm telemetry and alert history survive.
7. Inspect the browser's PWA installability report and install on a mobile device with the integrated original branding.

Local records are device/browser/origin-specific, with no cross-device synchronization or authentication in this demo. Clearing site storage removes them. Observation history contains only observations received by this browser. Historical telemetry not attached to a check-in is not currently charted. Charts provide descriptive comparisons only; no medical interpretation is inferred.




