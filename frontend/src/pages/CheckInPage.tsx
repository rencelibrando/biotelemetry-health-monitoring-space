import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Activity, ArrowLeft, ArrowRight, Check, Save, Sparkles } from 'lucide-react';
import { SpaceCheckInFields } from '../components/SpaceCheckInFields';
import type { SpaceEnvironment } from '../types/spaceWellness';
import type { VitalSigns } from '../types/telemetry';
import type { CheckIn } from '../types/wellness';
import { saveCheckInOnce } from '../services/checkins';
import { useCheckInDraft } from '../hooks/useCheckInDraft';
import { checkInStepError, recordFromDraft, type CheckInDraft } from '../services/checkInDraft';
import { PageHeading } from '../components/AppShell';
import { FormField, RatingField } from '../components/WellnessUI';

const steps = [
  'Sleep & Circadian Recovery',
  'Mood, Stress & Well-being',
  'Countermeasures, Hydration & Glucose',
];
const MOODS = ['Very low', 'Low', 'Okay', 'Good', 'Great'];
const NUTRITION_CHOICES: { value: NonNullable<CheckInDraft['nutritionQuality']>; label: string }[] = [
  { value: '', label: 'Not recorded' },
  { value: 'optimal', label: 'Optimal' },
  { value: 'adequate', label: 'Adequate' },
  { value: 'poor', label: 'Poor' },
];
const HYDRATION_PRESETS = ['1500', '2200', '2500'];

interface Props {
  astronautId: string;
  vitals: VitalSigns;
  records: CheckIn[];
  offline: boolean;
  gateway: boolean;
  onSaved(record: CheckIn): void | Promise<void>;
  historyLoading?: boolean;
  historyError?: string;
  environment?: SpaceEnvironment;
}

export function CheckInPage({
  astronautId,
  vitals,
  records,
  offline,
  gateway,
  onSaved,
  historyLoading = false,
  historyError = '',
  environment,
}: Props) {
  const recovery = useCheckInDraft(astronautId);
  const { draft, step, setStep } = recovery;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const firstRender = useRef(true);
  const latest = [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const hasSnapshot = gateway && !offline && vitals.astronaut_id === astronautId;
  const hasDisplayVitals = vitals.astronaut_id === astronautId && vitals.heart_rate !== undefined;

  const update: typeof recovery.update = (field, value) => {
    recovery.update(field, value);
    setSaved('');
  };

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus();
  }, [step]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error, step]);

  function applyNominalPrefill() {
    update('sleepHours', draft.sleepHours || '7.5');
    update('sleepQuality', 4);
    update('fatigue', 2);
    update('stress', 2);
    update('mood', draft.mood || 'Good');
    update('hydrationMl', draft.hydrationMl || '2200');
    update('nutritionQuality', draft.nutritionQuality || 'optimal');
    if (hasDisplayVitals && vitals.blood_glucose !== undefined && !draft.bloodGlucoseMgDl) {
      update('bloodGlucoseMgDl', String(Math.round(vitals.blood_glucose)));
    }
    setError('');
  }

  const autoVerifiedPreview: string[] = ['Daily Crew Health Check-In'];
  if (Number(draft.sleepHours) >= 7) autoVerifiedPreview.push('Circadian Light & 7h Sleep');
  if (draft.exercise === 'yes' && Number(draft.exerciseMinutes) >= 30) autoVerifiedPreview.push('ARED Resistive Loading');
  if (draft.exercise === 'yes' && Number(draft.exerciseMinutes) >= 45) autoVerifiedPreview.push('T2 / CEVIS Aerobic');
  if (Number(draft.hydrationMl) >= 2200) autoVerifiedPreview.push('Hydration Target (2,200+ mL)');
  if (draft.bloodGlucoseMgDl || draft.nutritionQuality) autoVerifiedPreview.push('Capillary Glucose & Ration Check');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const validation = checkInStepError(draft, step);
    if (validation) {
      setError(validation);
      return;
    }
    setError('');
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    for (let index = 0; index < 3; index++) {
      const problem = checkInStepError(draft, index);
      if (problem) {
        setStep(index);
        setError(problem);
        return;
      }
    }
    const submittedDraft = recovery.snapshot;
    const record = recordFromDraft(draft, astronautId, hasSnapshot ? { ...vitals } : null, submittedDraft.recordId);
    if (environment?.astronautId === astronautId) {
      record.spaceWellness = { version: 1, mode: 'local-demo', ...record.spaceWellness, environment };
    }
    setSaving(true);
    setSaved('');
    try {
      const committed = await saveCheckInOnce(record);
      setSaved(
        `Saved on this device at ${new Date(committed.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Matching Countermeasures are now auto-verified.`,
      );
      recovery.submitted(submittedDraft);
      try {
        await onSaved(committed);
      } catch {
        setError('Your record was saved, but the history view could not update. Retry loading local records. Do not submit again.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save. Your answers are still here. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="DAILY CREW CHECK-IN"
        title="Record how you feel."
        description="Three short steps. Saving automatically verifies matching Countermeasures on Home and Protocols."
        action={
          <button type="button" className="button secondary compact-btn" onClick={applyNominalPrefill} disabled={saving}>
            <Sparkles size={15} aria-hidden="true" />
            Pre-fill nominal crew shift
          </button>
        }
      />
      <div className="checkin-workspace">
        <p className="helper" role="status">
          {recovery.draftStatus}
        </p>
        {recovery.draftError && (
          <p className="warning-box" role="alert">
            {recovery.draftError}
          </p>
        )}
        <form noValidate onSubmit={submit} className="panel checkin-form">
          <div className="wizard-progress">
            <span role="status">Step {step + 1} of 3</span>
            <progress aria-label="Check-in step" value={step + 1} max={3} />
            <ol>
              {steps.map((title, index) => (
                <li key={title} aria-current={step === index ? 'step' : undefined}>
                  <span>{index + 1}</span>
                  {title}
                </li>
              ))}
            </ol>
          </div>
          <h2 ref={heading} tabIndex={-1} className="wizard-heading">
            {steps[step]}
          </h2>
          {error && (
            <p ref={errorRef} tabIndex={-1} className="error-box" role="alert">
              {error}
            </p>
          )}
          <fieldset disabled={saving} hidden={step !== 0}>
            <legend className="sr-only">Sleep and Circadian Recovery</legend>
            <p className="step-intro">Think about your most recent sleep. Tiredness is how much you feel you need rest.</p>
            <div className="form-grid">
              <FormField label="How many hours did you sleep?" hint="0–24 hours. For example, 7.5 means seven and a half hours.">
                <input
                  name="sleepHours"
                  type="number"
                  min="0"
                  max="24"
                  step="0.25"
                  inputMode="decimal"
                  placeholder="e.g. 7.5"
                  required
                  value={draft.sleepHours}
                  onChange={e => update('sleepHours', e.target.value)}
                />
              </FormField>
              <RatingField label="Sleep quality" name="sleepQuality" value={draft.sleepQuality} onChange={value => update('sleepQuality', value)} low="very poor" high="very good" />
              <RatingField label="How tired do you feel?" name="fatigue" value={draft.fatigue} onChange={value => update('fatigue', value)} low="not tired" high="very tired" />
            </div>
            <SpaceCheckInFields step={0} draft={draft} update={update} error={error} />
          </fieldset>

          <fieldset disabled={saving} hidden={step !== 1}>
            <legend className="sr-only">Mood, Stress and Well-being</legend>
            <p className="step-intro">Choose what best describes you today. There are no right or wrong answers.</p>
            <div className="form-grid">
              <RatingField label="Stress level" name="stress" value={draft.stress} onChange={value => update('stress', value)} low="very low" high="very high" />
              <div className="form-field">
                <span>How is your mood?</span>
                <input type="hidden" name="mood" value={draft.mood} />
                <div className="pill-choice-row" role="radiogroup" aria-label="How is your mood?">
                  {MOODS.map(mood => (
                    <button
                      key={mood}
                      type="button"
                      role="radio"
                      aria-checked={draft.mood === mood}
                      className={`pill-choice ${draft.mood === mood ? 'active' : ''}`}
                      onClick={() => update('mood', mood)}
                    >
                      {mood}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <FormField label="Any symptoms? (optional)" hint="Up to 500 characters. For urgent concerns, follow your mission's medical procedures.">
              <textarea
                name="symptoms"
                rows={3}
                maxLength={500}
                value={draft.symptoms}
                onChange={e => update('symptoms', e.target.value)}
                placeholder="Anything you would like to note?"
              />
            </FormField>
            <SpaceCheckInFields step={1} draft={draft} update={update} error={error} />
          </fieldset>

          <fieldset disabled={saving} hidden={step !== 2}>
            <legend className="sr-only">Countermeasures, Hydration and Glucose</legend>
            <p className="step-intro">Record completed ARED/aerobic loading, fluid intake, and capillary blood sugar.</p>
            <div className="form-grid">
              <div className="form-field">
                <span>Did you exercise today? (ARED / Aerobic)</span>
                <input type="hidden" name="exerciseCompletion" value={draft.exercise} />
                <div className="pill-choice-row" role="radiogroup" aria-label="Did you exercise today?">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={draft.exercise === 'yes'}
                    className={`pill-choice ${draft.exercise === 'yes' ? 'active' : ''}`}
                    onClick={() => update('exercise', 'yes')}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={draft.exercise === 'no'}
                    className={`pill-choice ${draft.exercise === 'no' ? 'active' : ''}`}
                    onClick={() => update('exercise', 'no')}
                  >
                    Not today
                  </button>
                </div>
              </div>
              {draft.exercise === 'yes' && (
                <FormField label="Exercise duration (minutes)" hint=">=30 min auto-verifies ARED; >=45 min also verifies Aerobic">
                  <input
                    name="exerciseMinutes"
                    type="number"
                    min="1"
                    max="1440"
                    step="1"
                    inputMode="numeric"
                    required
                    value={draft.exerciseMinutes}
                    onChange={e => update('exerciseMinutes', e.target.value)}
                    placeholder="e.g. 30"
                  />
                </FormField>
              )}
              <FormField label="Daily fluid intake (mL)" hint="Recommended target: 2,200–2,500 mL/day">
                <input
                  name="hydrationMl"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="10000"
                  step="50"
                  value={draft.hydrationMl ?? ''}
                  onChange={e => update('hydrationMl', e.target.value)}
                  placeholder="e.g. 2200"
                />
                <div className="pill-choice-row" role="group" aria-label="Hydration presets">
                  {HYDRATION_PRESETS.map(ml => (
                    <button
                      key={ml}
                      type="button"
                      className={`pill-choice ${draft.hydrationMl === ml ? 'active' : ''}`}
                      onClick={() => update('hydrationMl', ml)}
                    >
                      {ml} mL
                    </button>
                  ))}
                </div>
              </FormField>
              <FormField label="Blood sugar (mg/dL, optional)" hint="Nominal fasting range: 70–140 mg/dL">
                <input
                  name="bloodGlucoseMgDl"
                  type="number"
                  inputMode="decimal"
                  min="20"
                  max="600"
                  step="1"
                  value={draft.bloodGlucoseMgDl ?? ''}
                  onChange={e => update('bloodGlucoseMgDl', e.target.value)}
                  placeholder="e.g. 92"
                />
                {hasDisplayVitals && vitals.blood_glucose !== undefined && (
                  <button
                    type="button"
                    className="button secondary compact-btn"
                    style={{ marginTop: 6 }}
                    onClick={() => update('bloodGlucoseMgDl', String(Math.round(vitals.blood_glucose!)))}
                  >
                    Use live sensor ({Math.round(vitals.blood_glucose)} mg/dL)
                  </button>
                )}
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
            </div>
            <FormField label="Personal notes (optional)" hint="Up to 2,000 characters">
              <textarea
                name="notes"
                rows={3}
                maxLength={2000}
                value={draft.notes}
                onChange={e => update('notes', e.target.value)}
                placeholder="Anything else about your day?"
              />
            </FormField>
            <SpaceCheckInFields step={2} draft={draft} update={update} error={error} />
            <section className="checkin-review" aria-label="Review your answers">
              <h3>Before you save</h3>
              {(draft.painIntensity !== '' ||
                draft.painLocation ||
                draft.painNotes ||
                draft.isolation ||
                draft.socialConnection ||
                draft.emotionalWellbeing ||
                draft.sleepStartUtc ||
                draft.wakeUtc) && (
                <p className="helper">
                  Optional entries are included: {draft.painIntensity !== '' ? `pain ${draft.painIntensity}/10. ` : ''}
                  {draft.isolation ? `Isolation ${draft.isolation}/5. ` : ''}
                  {draft.sleepStartUtc ? 'Sleep times in UTC. ' : ''}Review the optional panels to change them.
                </p>
              )}
              <dl className="review-grid">
                <div>
                  <dt>Sleep</dt>
                  <dd>
                    {draft.sleepHours} hours · quality {draft.sleepQuality}/5
                  </dd>
                </div>
                <div>
                  <dt>Tiredness and stress</dt>
                  <dd>
                    {draft.fatigue}/5 · {draft.stress}/5
                  </dd>
                </div>
                <div>
                  <dt>Mood</dt>
                  <dd>{draft.mood || 'Choose above'}</dd>
                </div>
                <div>
                  <dt>Exercise</dt>
                  <dd>
                    {draft.exercise === 'yes'
                      ? `${draft.exerciseMinutes || '—'} minutes`
                      : draft.exercise === 'no'
                        ? 'Not today · 0 minutes'
                        : 'Choose above'}
                  </dd>
                </div>
                <div>
                  <dt>Fluids &amp; blood sugar</dt>
                  <dd>
                    {draft.hydrationMl ? `${draft.hydrationMl} mL` : '—'} ·{' '}
                    {draft.bloodGlucoseMgDl ? `${draft.bloodGlucoseMgDl} mg/dL` : '—'}
                  </dd>
                </div>
              </dl>
              <p className="helper">
                <strong>Auto-verifies on save:</strong> {autoVerifiedPreview.join(' · ')}
              </p>
            </section>
          </fieldset>

          {saved && (
            <div className="success-box" role="status">
              <Check size={18} />
              <span>
                {saved}{' '}
                <a href="#missions" className="text-link">
                  View Countermeasures
                </a>{' '}
                ·{' '}
                <a href="#analytics" className="text-link">
                  View Health Trends
                </a>
              </span>
            </div>
          )}
          <div className="wizard-actions">
            {step > 0 && (
              <button
                className="button secondary"
                type="button"
                disabled={saving}
                onClick={() => {
                  setError('');
                  setSaved('');
                  setStep(step - 1);
                }}
              >
                <ArrowLeft size={17} />
                Back
              </button>
            )}
            <button className="button primary" type="submit" disabled={saving || !!saved}>
              {step < 2 ? (
                <>
                  Continue
                  <ArrowRight size={17} />
                </>
              ) : (
                <>
                  <Save size={17} />
                  {saving ? 'Saving…' : saved ? 'Saved' : 'Save Health Record'}
                </>
              )}
            </button>
          </div>
          <p className="helper">
            {offline ? 'You are offline. ' : ''}Records are saved on this device and stay marked as not yet sent.
          </p>
        </form>
        <div className="checkin-context">
          <section className="panel" aria-label="Live telemetry snapshot">
            <div className="section-heading compact">
              <h2>
                <Activity size={17} /> Live Telemetry Context
              </h2>
              <span className="pill">{hasSnapshot ? 'API attached' : offline ? 'Offline' : 'Sim display'}</span>
            </div>
            <p className="helper">
              Latest check-in:{' '}
              {historyLoading
                ? 'Loading saved records…'
                : historyError
                  ? 'Saved history is unavailable. Please retry loading.'
                  : latest
                    ? new Date(latest.createdAt).toLocaleString()
                    : 'None saved yet'}
            </p>
            {hasDisplayVitals ? (
              <dl className="detail-list">
                <div>
                  <dt>Heart rate</dt>
                  <dd>{vitals.heart_rate} beats/min</dd>
                </div>
                <div>
                  <dt>Blood oxygen</dt>
                  <dd>{vitals.spo2}%</dd>
                </div>
                <div>
                  <dt>Body temperature</dt>
                  <dd>{vitals.core_temp} °C</dd>
                </div>
                <div>
                  <dt>Blood sugar</dt>
                  <dd>{vitals.blood_glucose ?? '--'} mg/dL</dd>
                </div>
                <div>
                  <dt>Hydration</dt>
                  <dd>{vitals.hydration_pct ?? 92}%</dd>
                </div>
                <div>
                  <dt>Radiation rate</dt>
                  <dd>{vitals.radiation_rate} μSv/h</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{vitals.timestamp ? new Date(vitals.timestamp).toLocaleTimeString() : '--'}</dd>
                </div>
              </dl>
            ) : (
              <p className="muted">No connected measurements are available. Only your answers will be saved.</p>
            )}
            <p className="helper">
              {hasSnapshot
                ? 'Connected server telemetry will attach automatically when you save this check-in.'
                : 'Local demo biometrics are shown live for reference only and will not be attached while disconnected.'}
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
