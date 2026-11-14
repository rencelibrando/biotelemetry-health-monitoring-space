# BioTelemetry usability simplification

Subsequent reliability update: [RELIABILITY_QA.md](RELIABILITY_QA.md). Unfinished drafts now persist per astronaut across reloads, successful saves update shared history directly, and 29 tests pass. In-memory-only draft limitations in this earlier report are superseded.

This pass keeps the existing application, routes, data models and monitoring logic. The original logo and official `#00BCFFFF` primary blue remain unchanged.

## What changed

- **Navigation:** Home, Check-In, My Health Trends, Daily Activities and AI Assistant. Mobile uses Home, Check-In, Trends, Activities and Assistant with full accessible names. The existing `dashboard`, `checkin`, `analytics`, `missions` and `ai` hashes are unchanged.
- **Home:** today's check-in status, one prominent Record Today's Health action, four plain-language measurements, notifications to review, activity progress and a short assistant link. No medical safety conclusion is inferred. ECG, HRV, radiation, blood pressure, suit battery, mission metadata and diagnostic tools are still available in expandable sections. Sound, contrast and offline test controls are under Settings & connection. Pending measurements remain visible outside settings.
- **Check-In:** three steps for sleep/recovery, mood/well-being and physical activity/notes. Each step validates its answers. Back and Continue preserve the same controlled draft; inactive fields stay mounted. The final step includes a review before saving. Step headings and errors receive focus, and progress is announced. Drafts also survive navigation between tabs for the same astronaut because the form remains mounted. Changing astronauts or reloading discards an unsaved draft; saved records still use IndexedDB.
- **Exercise answer:** Yes requires completed minutes. Not today saves zero minutes using the existing `exerciseMinutes` field. The completion choice is UI-only; no database field or server contract was added. Switching that choice preserves the typed duration in the draft so it can be restored before saving.
- **My Health Trends:** Today, 7-day and 30-day filters; descriptive summaries; sleep and heart-rate charts; expandable historical check-ins with all manual fields. Tiredness/stress charts, resting-heart-rate comparison and notification history remain available in details panels. Explanatory help buttons define unfamiliar terms without presenting medical targets or diagnoses.
- **Daily Activities:** up to three context-based suggestions, chosen from existing recording/review activities. Before today's check-in these are sleep, mood and exercise logs; afterward they are sleep review, recovery recording and reflection. Completed suggestions are omitted. All nine activities, reversible completion and history remain accessible. Each card has one action: Mark complete or Undo completion. Durations are omitted because there are no approved duration estimates in the catalog; exercise durations are not invented.
- **AI Health Assistant:** conversation-first layout with exactly three suggested questions. Demo mode and offline unavailability remain explicit. Recorded facts, explanation and next step remain separate. The long sidebar and privacy explanation are replaced by a short expandable section. No Gemini requests or browser secrets were introduced.
- **Shared UX:** readable text, consistent buttons, safe-area spacing, expandable details, plain-language status copy, and a corrected skip link that focuses main content without changing the current route.

## Files and reusable components

Changed: `src/App.tsx`, `src/components/AppShell.tsx`, `AlertBanner.tsx`, `VitalCard.tsx`, all four `src/pages/*Page.tsx` files, `src/index.css`, `src/services/missions.ts` (catalog labels only), `src/services/ai.ts` (response wording only), and `tests/frontend.test.cjs`.

Added: `src/components/WellnessUI.tsx` exports reusable `Disclosure`, `HelpTip`, `FormField` and `RatingField` components. `src/services/checkInDraft.ts` contains UI-only draft defaults, per-step validation and conversion into the unchanged `CheckIn` record contract.

Updated handoff documents: this file, `README.md` and `VISUAL_QA.md`.

## Preserved features and boundaries

Telemetry polling, astronaut selection/hotkeys, ECG rendering, all vital values, alerts, acknowledgement, diagnostics, audio and high contrast, check-in storage, charts, all activity IDs/categories and completion history, deterministic assistant behavior, offline buffering and conservative telemetry synchronization are retained.

`useTelemetry.ts`, `db/localDb.ts`, `services/api.ts`, `services/checkins.ts`, `services/telemetryQueue.ts`, types, manifest and service-worker configuration were not changed in this pass. No FastAPI, Supabase, environment, database schema or API contract changes were made. Existing package and lockfile changes were left untouched. No dependencies were added.

## Verification

- TypeScript strict checks: **passed**.
- Vite production build and service-worker generation: **passed**.
- Existing 11 tests and four new UX regressions: **15 passed, 0 failed**.
- New checks cover step-specific validation/ranges, no mutation of draft answers during validation/conversion, mapping to the original pending record shape, exercise-choice behavior, mounted/hidden step markup and context-based activity suggestions.
- Existing tests still cover stored-record boundaries, astronaut/date isolation, history filters, offline assistant errors, navigation routes, incomplete/failed sync retention, deletion limited to confirmed batches, genuine PWA icon dimensions and network-only API caching.

The tests use a table adapter rather than a browser's IndexedDB. The wizard rendering test checks generated HTML; it does not simulate real clicks, keyboard focus or browser layout. Browser discovery returned no apps or browsers, so responsive visual checks, real React interactions, actual IndexedDB reload persistence and service-worker offline lifecycle checks remain **unverified**.

## Manual checks before release

At 375×812, 390×844, 768×1024 and 1440×900:

1. Visit all five tabs, verify the full and short labels, active states, zoom, keyboard navigation, safe areas and no page-wide overflow.
2. On Home, verify today's status from a saved check-in. Expand ECG, additional measurements, mission/diagnostic tools and settings. Verify all monitoring controls and live values still update with FastAPI connected.
3. Enter sleep, mood, stress, symptoms, exercise and notes. Move Back/Continue repeatedly, including using Enter to continue. Verify entries are retained and invalid values do not advance. Test Yes/Not today switching, the final review and save errors. Navigate away and back before saving; the same astronaut's draft should remain.
4. Save a fictional check-in, reload and verify every field in Past check-ins. Switch astronauts and confirm isolation. Confirm automatic demo measurements are separate and absent when the server is unavailable.
5. Complete and undo activities under All Activities. Confirm the recommended list never exceeds three, reacts to today's check-in/completions, and leaves completed entries available under All Activities for undo.
6. Check chart help buttons with pointer, keyboard and screen reader; test Escape and focus dismissal. Inspect mobile label readability and expandable data tables/history.
7. Use all three assistant suggestions, loading/error feedback and the on-screen mobile keyboard. Verify no sideways overflow with long messages and input above bottom navigation.
8. After a production online visit and service-worker activation, go offline, reload, navigate all tabs, save a check-in and activity, and reload again. Verify saved data and pending labels remain. Gemini must remain unavailable offline.
9. Test unavailable FastAPI, offline buffering, incomplete uploads and failed syncs. Locally queued data must remain until a reliable durable persistence receipt is received.

## Remaining dependencies and usability limits

Check-in sync, activity sync, real server-side Gemini integration, mission metadata and reliable durable telemetry receipts/idempotency still depend on the backend team. They are unchanged by this UX pass. The assistant remains a deterministic demo; it cannot assess medical safety or explain clinical causes.

Unsaved drafts are kept only in memory. Manual activity completion records what the user marks complete; it does not verify an activity occurred. All Activities intentionally retains access to the complete catalog, so recommendations also appear there. Native expandable sections remember their open state only while their page is mounted. Real usability with first-time users and assistive technology still needs observation in a browser.

