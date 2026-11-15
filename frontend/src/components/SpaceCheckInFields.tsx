import type { CheckInDraft } from '../services/checkInDraft';
import { sleepTiming } from '../services/sleepTiming';
import { FormField } from './WellnessUI';

interface Props { step: number; draft: CheckInDraft; update<K extends keyof CheckInDraft>(field: K, value: CheckInDraft[K]): void; error: string }
function OptionalRating({ label, name, value, low, high, update }: { label: string; name: 'isolation' | 'socialConnection' | 'emotionalWellbeing'; value: string; low: string; high: string; update: Props['update'] }) {
  return (
    <div className="form-field">
      <span>{label}</span>
      <input type="hidden" name={name} value={value} />
      <div className="pill-choice-row" role="radiogroup" aria-label={label}>
        <button
          type="button"
          role="radio"
          aria-checked={value === ''}
          className={`pill-choice ${value === '' ? 'active' : ''}`}
          onClick={() => update(name, '')}
        >
          Skip
        </button>
        {['1', '2', '3', '4', '5'].map(num => (
          <button
            key={num}
            type="button"
            role="radio"
            aria-checked={value === num}
            className={`pill-choice ${value === num ? 'active' : ''}`}
            onClick={() => update(name, num)}
          >
            {num}
          </button>
        ))}
      </div>
      <small>{`1 = ${low} · 5 = ${high}`}</small>
    </div>
  );
}

const NUTRITION_CHOICES: { value: NonNullable<CheckInDraft['nutritionQuality']>; label: string }[] = [
  { value: '', label: 'Not recorded' },
  { value: 'optimal', label: 'Optimal' },
  { value: 'adequate', label: 'Adequate' },
  { value: 'poor', label: 'Poor' },
];

export function SpaceCheckInFields({ step, draft, update }: Props) {
  const timing = sleepTiming(draft.sleepStartUtc, draft.wakeUtc);
  const title = step === 0
    ? 'Sleep timing (UTC, optional)'
    : step === 1
      ? 'Connection and emotional well-being (optional)'
      : 'Pain, nutrition and metabolic details (optional)';
  return (
    <section className="optional-fields-card" aria-label={title}>
      <div className="section-heading compact">
        <h3>{title}</h3>
        <span className="pill">Optional</span>
      </div>
      {step === 0 && (
        <>
          <p className="helper">Use UTC for both dates and times, regardless of this device’s timezone. For overnight sleep, select the next date for wake-up.</p>
          <div className="form-grid">
            <FormField label="Sleep start date and time (UTC)">
              <input name="sleepStartUtc" type="datetime-local" step="60" value={draft.sleepStartUtc} onChange={e => update('sleepStartUtc', e.target.value)} />
            </FormField>
            <FormField label="Wake-up date and time (UTC)">
              <input name="wakeUtc" type="datetime-local" step="60" value={draft.wakeUtc} onChange={e => update('wakeUtc', e.target.value)} />
            </FormField>
          </div>
          {timing && (
            <p className="helper" role="status">
              Recorded sleep window: {(timing.windowMinutes / 60).toFixed(2)} hours. This is elapsed time, not necessarily time asleep.
            </p>
          )}
        </>
      )}
      {step === 1 && (
        <>
          <p className="helper">Share only what you want to record. These are personal self-reports, not mental health diagnoses.</p>
          <div className="form-grid">
            <OptionalRating label="How isolated have you felt today?" name="isolation" value={draft.isolation} low="not at all" high="very much" update={update} />
            <OptionalRating label="How connected have you felt to other people?" name="socialConnection" value={draft.socialConnection} low="not connected" high="very connected" update={update} />
            <OptionalRating label="How has your emotional well-being felt today?" name="emotionalWellbeing" value={draft.emotionalWellbeing} low="very low" high="very good" update={update} />
          </div>
          <p className="helper">Personal reflections stay in this local prototype. Free-text notes are not sent to Gemini.</p>
        </>
      )}
      {step === 2 && (
        <>
          <p className="helper">A pain score describes your experience. It does not identify a condition or determine what action is medically appropriate.</p>
          <div className="form-grid">
            <FormField label="Pain intensity (0–10)" hint="Leave blank to skip. 0 = no pain; 10 = intense pain.">
              <input name="painIntensity" type="number" inputMode="numeric" min="0" max="10" step="1" value={draft.painIntensity} onChange={e => update('painIntensity', e.target.value)} />
            </FormField>
            <FormField label="Pain location (optional)" hint="Up to 100 characters">
              <input name="painLocation" type="text" maxLength={100} value={draft.painLocation} onChange={e => update('painLocation', e.target.value)} placeholder="e.g. lower back" />
            </FormField>
          </div>
          <FormField label="Discomfort notes (optional)" hint="Up to 500 characters. Follow approved procedures for medical concerns.">
            <textarea name="painNotes" rows={2} maxLength={500} value={draft.painNotes} onChange={e => update('painNotes', e.target.value)} />
          </FormField>
          <div className="form-grid">
            <FormField label="Blood sugar (mg/dL, optional)" hint="Nominal fasting range: 70-140 mg/dL">
              <input name="bloodGlucoseMgDl" type="number" inputMode="decimal" min="20" max="600" step="1" value={draft.bloodGlucoseMgDl ?? ''} onChange={e => update('bloodGlucoseMgDl', e.target.value)} placeholder="e.g. 92" />
            </FormField>
            <FormField label="Daily fluid intake (mL, optional)" hint="Recommended target: 2,200-2,500 mL/day">
              <input name="hydrationMl" type="number" inputMode="numeric" min="0" max="10000" step="50" value={draft.hydrationMl ?? ''} onChange={e => update('hydrationMl', e.target.value)} placeholder="e.g. 2200" />
            </FormField>
            <div className="form-field">
              <span>Nutrition intake status (optional)</span>
              <input type="hidden" name="nutritionQuality" value={draft.nutritionQuality ?? ''} />
              <div className="pill-choice-row" role="radiogroup" aria-label="Nutrition intake status">
                {NUTRITION_CHOICES.map(choice => (
                  <button
                    key={choice.label}
                    type="button"
                    role="radio"
                    aria-checked={(draft.nutritionQuality ?? '') === choice.value}
                    className={`pill-choice ${(draft.nutritionQuality ?? '') === choice.value ? 'active' : ''}`}
                    onClick={() => update('nutritionQuality', choice.value)}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            </div>
            <FormField label="Skin / immune signs (optional)" hint="Comma-separated signs e.g. dry skin, congestion">
              <input name="immuneSymptoms" type="text" maxLength={120} value={draft.immuneSymptoms ?? ''} onChange={e => update('immuneSymptoms', e.target.value)} placeholder="e.g. none, mild rash" />
            </FormField>
          </div>
        </>
      )}
    </section>
  );
}
