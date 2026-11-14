# Space environment and wellness enhancement handoff

## Implemented

All additions follow the existing five-screen navigation, original logo, official `#00BCFFFF` blue and progressive-disclosure UI.

- Check-In Step 1 adds optional UTC sleep/wake dates and times, with overnight validation and a separately labeled elapsed sleep window.
- Step 2 adds optional, neutrally worded isolation, social-connection and emotional-well-being self-reports.
- Step 3 adds optional pain intensity 0–10, pain location and discomfort notes. Blank pain is distinct from a recorded zero. No score is interpreted as a diagnosis or a safety conclusion.
- Draft recovery/autosave includes every optional field, remains per astronaut, and migrates old drafts without deleting or rewriting them on read. New optional answers use a versioned local envelope; old saved check-ins remain valid.
- Home adds a compact expandable Space Environment section with source labels for cabin oxygen, environmental radiation rate, mission duration, gravity scenario, assumed time in microgravity, and unavailable space weather. Optional manual scenario/oxygen observations are saved locally per astronaut.
- The microgravity information panel connects existing exercise records and Daily Activities without calculating physiological losses or prescribing routines. It links to [NASA's exercise physiology information](https://www.nasa.gov/directorates/esdmd/hhp/exercise-physiology-and-countermeasures/).
- My Health Trends adds closed-by-default pain, sleep-schedule, connection/emotional and environment sections. Pain/mental charts use fixed reporting scales. Sleep schedules show UTC windows wrapping at midnight and the shortest clock difference between successive recorded bedtimes. This is descriptive, not a diagnosis. Context links to [NASA's sleep and irregular-schedule information](https://www.nasa.gov/reference/risk-from-inadequate-sleep-and-irregular-schedules/).
- Past check-ins show optional values and original source-labeled environment snapshots. Empty histories remain empty; missing observations are not filled with fictional records.
- The AI demo understands pain, connection/emotional ratings, sleep timing and available environment context. Only selected-astronaut facts are used. An explicit context projection excludes symptoms, private notes, pain locations and discomfort text. Gemini is not called and remains unavailable offline.

## Files

Added types/services: `src/types/spaceWellness.ts`, `src/services/spaceWellness.ts`, `sleepTiming.ts`, `environment.ts`, and `src/hooks/useEnvironment.ts`.

Added components: `SpaceCheckInFields.tsx`, `SpaceEnvironment.tsx`, `SpaceWellnessTrends.tsx`, and extracted reusable `TrendChart.tsx` (the existing chart implementation, with fixed-domain support and a single-string native tooltip title).

Updated integration: `src/App.tsx`, `src/pages/CheckInPage.tsx`, `AnalyticsPage.tsx`, `AIPage.tsx`, `src/types/wellness.ts`, `src/services/checkInDraft.ts`, `drafts.ts`, `checkins.ts`, `ai.ts`, and `src/index.css`.

Updated tests: `tests/frontend.test.cjs`. Added separate backend review proposal: [SPACE_WELLNESS_BACKEND_PROPOSAL.md](docs/SPACE_WELLNESS_BACKEND_PROPOSAL.md).

No backend/Supabase/environment configuration, REST telemetry contract, IndexedDB schema/version, navigation routes, polling, ECG/diagnostic/alert logic, PWA configuration, telemetry synchronization, package dependencies or existing lockfile changes were modified. Existing local submission/state/activity reliability tests still pass. Original-logo checksum remains unchanged.

## Validation

- TypeScript strict validation: **passed**.
- Vite production build and service-worker generation: **passed**.
- Automated frontend tests: **40 passed, 0 failed**, with no chart tooltip warning.
- New coverage: optional pain bounds/zero, text and mental-rating validation, all new draft fields and per-astronaut restoration, version-1 draft migration, overnight/invalid/leap-day/UTC-DST timing, circular bedtime comparison, environment source labels and profile isolation, unsupported microgravity scenarios, analytics empty states, local extension persistence/legacy-adapter exclusion, AI privacy projection and no personal-dose/live-weather inference.

Browser discovery returned no available apps or browser sessions. The tests use storage adapters and server-rendered components. Actual browser interactions, responsive visuals, IndexedDB/localStorage reload durability, mobile keyboard behavior and service-worker offline lifecycle remain **UNVERIFIED**.

## Exact manual checklist — UNVERIFIED

Use a fresh browser test profile at one origin. Run `npm run build`, `npm test`, then `npm run preview -- --host localhost --port 4173` from `frontend`. Open `http://localhost:4173` once online and wait for service-worker activation.

1. **Existing behavior:** verify unchanged Home/Check-In/Trends/Activities/Assistant navigation, crew selection, live simulation, expandable ECG, alerts/diagnostics, activity history and pending synchronization notices. Repeat the existing [reliability checklist](RELIABILITY_QA.md) for save/reload/profile-switch behavior.
2. **Optional default:** on a new profile, leave all new fields blank. Complete the original required fields and save. No pain/mental rating or sleep window should be invented. The source-labeled environment snapshot may contain the available demo radiation context; cabin/mission/weather information should remain unavailable unless configured.
3. **Sleep timing:** Step 1 → Sleep times. Enter start `2026-11-13 23:00` and wake `2026-11-14 07:00`, both explicitly UTC. Expect an eight-hour elapsed window. Keep reported sleep duration at `7.5` hours; it must remain separate. Enter wake on the same date at `07:00`; Continue must report an error and open the timing section. Correct the wake date. Leave only one time entered; saving that optional interval must require both times or clearing both.
4. **Mental self-reports:** Step 2 → optional connection panel. Set isolation `2`, connection `4`, emotional well-being `3`. Existing mood/stress/tiredness stay independent. No psychiatric classification or overall health score should appear.
5. **Pain:** Step 3 → optional pain panel. Enter `0`, a location and a short discomfort note. Expect zero to persist as no pain. Try `-1`, `11`, and `1.5`; saving must be blocked. Restore `0`. Confirm blank remains a valid choice distinct from zero. Verify location/notes character limits and readable labels/focus.
6. **Drafts:** reload at each step after entering optional values. Every answer and step should restore. Switch to astronaut B; its draft must be separate. Return to A and finish saving. Expect immediate history update, pending server status and conditional draft cleanup. An existing old-version draft should restore its original fields with blank new fields.
7. **Environment:** Home → Space Environment. Initially expect cabin oxygen/mission/gravity/weather unavailable and radiation simulated. Under Scenario and manual observations choose orbital microgravity demo, enter a past UTC mission start and cabin observation `21`; Save local context. Expect manual labels for cabin/duration, simulated scenario gravity, and explicitly assumed microgravity duration. Change to surface or ground demo; microgravity duration must be unavailable. Switch profiles and reload; settings must remain separate. No actual-sensor or live-weather claim is allowed.
8. **Environment history:** save a check-in after configuring context. Change the Home context afterward. Past check-ins must retain the old snapshot, while Home uses the newly saved settings. No personal accumulated dose or clinical safety level should appear.
9. **Analytics:** open each optional section. Older records/no optional observations should show empty states. A zero-pain entry must appear as a real reading. Save a second timed record around midnight (e.g. bedtime `00:15` after a prior `23:45`); the clock difference should be 30 minutes, not 23.5 hours. Check UTC labels and midnight wrapping. Time-range filters select check-ins by their recorded timestamps.
10. **AI/privacy:** ask about pain, isolation/connection, sleep schedule, radiation, cabin oxygen, microgravity, and space weather. Facts must match only the selected astronaut. Pain zero must be reported as zero, not missing; missing pain must not be called no pain. Radiation must remain a source-labeled environmental rate, not personal dose. Weather must be unavailable. Private symptoms, locations, discomfort text and reflections must not appear in assistant context/responses or any provider request. No Gemini request should occur.
11. **Offline:** after caching online, set DevTools Network to Offline, reload, navigate all screens, restore/edit a draft, save an extended check-in and activity, and reload again. Expect preserved data and unsynced labels; AI unavailable offline. External NASA source pages need connectivity, while the app's explanatory text remains in the cached shell.
12. **Mobile/accessibility:** test 375×812, 390×844, 768×1024 and 1440×900. Inspect optional panels, date/time pickers, numeric pain entry, charts, source labels, tables, bottom navigation, safe areas, focus/error announcements and no page-wide overflow. Repeat reduced-motion and 200% zoom checks.

## Remaining limits and backend coordination

All added observations are local demo data. No real cabin sensor, mission clock, gravity sensor, personal dosimeter or space-weather feed is connected. Current radiation is simulated. Microgravity time is an explicit scenario assumption. UTC timing supports one elapsed window of up to 24 hours, not multiple sleep episodes or a configured mission-local timezone. Bedtime comparisons describe recorded entries and do not establish a circadian condition.

Backend review must agree on the optional versioned fields, provenance/units/staleness, privacy policy and the additional context schema before synchronization or AI transmission is enabled. Existing dependencies on durable record/activity sync, idempotency, mission metadata, server-side Gemini and truthful telemetry persistence receipts remain unchanged. See the separate proposal for exact structures and migration boundaries.
