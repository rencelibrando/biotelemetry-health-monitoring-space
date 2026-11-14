# Space wellness and environment — proposed backend contract

**Coordination proposal only.** No FastAPI routes, Supabase tables, API payloads, environment files or server behavior were changed. New functionality currently persists only in the frontend's local demo stores. Agreement on authorization, persistence, privacy, validation, versioning and idempotency is required before connecting any new endpoint.

## Versioned local check-in extension

The existing `CheckIn` fields remain intact. A new optional `spaceWellness` envelope is stored in the same local IndexedDB check-in object. Old records with no envelope remain valid; the database schema/version was not changed.

```ts
spaceWellness?: {
  version: 1;
  mode: 'local-demo';
  pain?: {
    intensity?: number; // integer 0–10; 0 explicitly means no pain
    location?: string;  // optional, at most 100 characters
    notes?: string;     // optional discomfort reflection, at most 500 characters
  };
  mental?: {
    isolation?: number;          // integer 1–5: not at all → very much
    socialConnection?: number;  // integer 1–5: not connected → very connected
    emotionalWellbeing?: number;// integer 1–5: very low → very good
  };
  sleep?: {
    startUtc: string;            // canonical ISO UTC instant, minute precision
    wakeUtc: string;             // explicit date, including next day when overnight
    timeBasis: 'UTC';
    windowMinutes: number;      // elapsed interval, >0 and <=1440
  };
  environment?: SpaceEnvironment; // same-astronaut, source-labeled snapshot
}
```

Omitted optional fields mean **not recorded**, not zero/normal/safe. Existing `sleepHours` remains the user's report of time asleep. The optional elapsed window is separate because time between start and wake does not necessarily equal time asleep. Partial timing is allowed in an unfinished draft but both endpoints are required before saving that optional interval. The UI uses UTC wall-time fields explicitly, not browser-local time or a mission-local zone. Mission time conversion and long/segmented sleep periods require a later agreed model.

`services/spaceWellness.ts` provides an explicit allowlist adapter, `toLegacyCheckIn`, which excludes `spaceWellness`. It is not connected to a server call. Existing telemetry endpoints continue to receive only their existing payloads. Do not append this extension to a legacy endpoint without agreement.

## Proposed environment structure

```ts
type Source = 'measured' | 'simulated' | 'manual' | 'unavailable';
type Datum<T> = {
  value: T | null;
  source: Source;
  detail: string;          // source/assumption explanation, not clinical guidance
  recordedAt?: string;    // source observation timestamp, when available
};
type SpaceEnvironment = {
  version: 1;
  astronautId: string;
  capturedAt: string;
  scenario: 'unconfigured' | 'orbital-demo' | 'surface-demo' | 'ground-demo';
  cabinOxygen: Datum<number>;          // volume percentage, not blood oxygen
  radiationRate: Datum<number>;        // environmental μSv/h, not personal dose
  missionDurationHours: Datum<number>;
  gravity: Datum<string>;
  microgravityHours: Datum<number>;
  spaceWeather: Datum<string>;
};
```

Current source rules:

| Item | Current implementation |
| --- | --- |
| Cabin oxygen | Unavailable unless a user enters a manual observation. SpO₂ is never reused as cabin oxygen. No cabin sensor endpoint exists in the frontend contract. |
| Environmental radiation | Reuses the selected astronaut's existing `radiation_rate`, explicitly simulated whether served by the simulator API or local fallback. Carries the telemetry timestamp. It is not integrated into a personal dose. |
| Mission duration | Derived from an optional manually entered UTC start and selected demo scenario. It is not an authoritative mission clock. |
| Gravity | A user-selected demo scenario label, not a measurement. |
| Microgravity duration | Only orbital-demo supports it. Assumes continuous microgravity since the manually entered start. Ground/surface/unconfigured cases show unavailable, not a made-up duration. |
| Space weather | Unavailable. No live feed, event alert or inferred event is fabricated. |
| Actual measured sources | The type and source label are supported for future agreed providers; this pass introduces no real sensor feed. |

A validated future provider should specify sensor identity, calibration, units, source timestamps, staleness rules, uncertainty and provenance separately. Personal dosimetry requires its own measurement/validated method; the environmental-rate field must not be relabeled as personal accumulated dose. No arbitrary safety limits or NASA-approved action thresholds are introduced.

## Local configuration and drafts

Per-astronaut environment observations/settings use `biotelemetry:environment:v1:<encoded astronaut ID>`, with `version: 1`, selected scenario, optional `missionStartUtc` and optional `cabinOxygenPercent`. Values are persisted only with Save local context. They are not sent to the backend. New check-ins capture a separate environment snapshot; changing context later does not rewrite historical snapshots.

The existing draft storage key (`biotelemetry:checkin-draft:v1:<encoded astronaut ID>`) remains stable to preserve recovery. Its payload is now version **2**, containing the new optional string fields plus the unchanged core answers, step, record identity and revision. Version-1 payloads are upgraded in memory with blank optional defaults, retaining all old answers/IDs/revision and leaving the stored raw value unchanged until a subsequent edit or successful submission. Unsupported/corrupt versions remain retained with a recovery error. Existing conditional cleanup and replay-safe submission behavior is preserved.

## AI privacy and proposed integration boundary

`buildAssistantContext` explicitly projects only selected-astronaut numeric/categorical facts, UTC sleep timing and source-labeled environment context. It excludes **symptoms, personal notes, pain location and discomfort notes**. Personal reflections stay in the local prototype. The deterministic demo sends no requests to Gemini or another model provider.

The future server assistant needs an agreed, separately reviewed context schema and consent/privacy policy. Do not pass full check-in objects to a model. Keep observed facts, generated explanations and suggested steps distinct. No pain/mental-health diagnosis, personal radiation-dose inference, muscle/bone-loss estimate or offline Gemini claim is supported.

Existing backend gaps remain: durable check-in synchronization and idempotency, activity sync/conflict resolution, mission metadata and time basis, server-side Gemini, and truthful durable telemetry receipts. This proposal adds optional wellness/environment field agreement and provenance validation to that coordination work; it does not implement server behavior.
