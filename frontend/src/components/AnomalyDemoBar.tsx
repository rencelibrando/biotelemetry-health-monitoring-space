import { useState } from 'react';
import {
  Sparkles,
  Stethoscope,
  RotateCcw,
  Shield,
  Clock,
  Orbit,
  Activity,
  AlertTriangle,
} from 'lucide-react';
import type { VitalSigns } from '../types/telemetry';
import {
  computeSpaceEnvironmentRisks,
  defaultSimulationConfig,
  formatLatency,
  getMissionZone,
  MISSION_ZONES,
  SHIELDING_OPTIONS,
  SIMULATION_SCENARIOS,
  SOLAR_STORM_OPTIONS,
  type MissionZoneId,
  type ScenarioCategory,
  type ShieldingMode,
  type SimulationConfig,
  type SolarStormMode,
} from '../services/simulationConfig';

interface AnomalyDemoBarProps {
  currentAnomaly: string;
  simConfig?: SimulationConfig;
  vitals?: VitalSigns;
  onTrigger: (anomaly: string) => void;
  onUpdateSimConfig?: (next: SimulationConfig) => void;
  onRunDiagnostics: () => void;
  isDiagnosing: boolean;
}

const CATEGORY_LABELS: { id: ScenarioCategory; label: string }[] = [
  { id: 'orbital', label: 'Orbital & EVA' },
  { id: 'atmosphere', label: 'Atmosphere & Thermal' },
  { id: 'cardio', label: 'Cardio & Autonomic' },
  { id: 'radiation', label: 'Radiation & Compound' },
  { id: 'metabolic', label: 'Glucose & Metabolic' },
];

const DURATION_PRESETS = [1, 14, 90, 180, 365, 500];

export function AnomalyDemoBar({
  currentAnomaly,
  simConfig = defaultSimulationConfig(),
  vitals,
  onTrigger,
  onUpdateSimConfig,
  onRunDiagnostics,
  isDiagnosing,
}: AnomalyDemoBarProps) {
  const [category, setCategory] = useState<ScenarioCategory>('orbital');

  const update = (patch: Partial<SimulationConfig>) => {
    const merged = { ...simConfig, ...patch };
    if (patch.anomaly !== undefined) onTrigger(patch.anomaly);
    if (onUpdateSimConfig) onUpdateSimConfig(merged);
  };

  const zone = getMissionZone(simConfig.missionZone);
  const activeScenario = SIMULATION_SCENARIOS.find(s => s.mode === currentAnomaly) ?? SIMULATION_SCENARIOS[0];
  const categoryScenarios = SIMULATION_SCENARIOS.filter(s => s.category === category);
  const envRisks = vitals ? computeSpaceEnvironmentRisks(vitals, simConfig) : [];

  return (
    <div className="panel simulation-controls">
      <div className="section-heading">
        <h3><Sparkles size={18} /> Mission &amp; Spaceflight Health Simulation Lab</h3>
        <div className="viz-actions">
          <button
            type="button"
            className="button secondary compact-btn"
            onClick={() => {
              const reset = defaultSimulationConfig();
              onTrigger(reset.anomaly);
              onUpdateSimConfig?.(reset);
            }}
          >
            <RotateCcw size={14} />
            Reset nominal
          </button>
          <button type="button" className="button primary" onClick={onRunDiagnostics} disabled={isDiagnosing}>
            <Stethoscope size={16} />
            {isDiagnosing ? 'Analyzing…' : 'Run Diagnostics'}
          </button>
        </div>
      </div>

      {vitals && (
        <div className="sim-impact-banner" aria-label="Live simulated astronaut health summary">
          <div className="sim-impact-metric">
            <span className="eyebrow">SIMULATED HEALTH INDEX</span>
            <strong>
              {vitals.overall_health_score !== undefined ? `${vitals.overall_health_score.toFixed(1)} / 100` : '--'}
              <span className={`pill sim-status-${(vitals.health_status ?? 'NOMINAL').toLowerCase()}`}>
                {vitals.health_status ?? 'NOMINAL'}
              </span>
            </strong>
          </div>
          <div className="sim-impact-metric">
            <span className="eyebrow">DISTANCE &amp; SIGNAL LAG</span>
            <strong>{zone.distanceLabel}</strong>
            <small className="muted">One-way latency: {formatLatency(vitals.comms_latency_sec ?? zone.commsLatencySec)}</small>
          </div>
          <div className="sim-impact-metric">
            <span className="eyebrow">MISSION DURATION &amp; DOSE</span>
            <strong>Day {simConfig.missionDay}</strong>
            <small className="muted">
              Cumulative: {vitals.cumulative_dose_msv !== undefined ? `${vitals.cumulative_dose_msv.toFixed(1)} mSv` : '--'} · {zone.gravityG}g
            </small>
          </div>
        </div>
      )}

      {onUpdateSimConfig && (
        <div className="sim-controls-grid">
          <div className="sim-control-block">
            <span className="eyebrow"><Orbit size={12} /> 1. MISSION DISTANCE &amp; DESTINATION</span>
            <div className="sim-option-grid" role="radiogroup" aria-label="Mission distance and destination">
              {MISSION_ZONES.map(z => (
                <button
                  key={z.id}
                  type="button"
                  role="radio"
                  aria-checked={simConfig.missionZone === z.id}
                  className={`sim-option-btn ${simConfig.missionZone === z.id ? 'active' : ''}`}
                  onClick={() => update({ missionZone: z.id as MissionZoneId })}
                >
                  <strong>{z.label}</strong>
                  <small>{z.distanceLabel}</small>
                </button>
              ))}
            </div>
            <p className="helper">{zone.summary}</p>
          </div>

          <div className="sim-control-block">
            <span className="eyebrow"><Clock size={12} /> 2. MISSION DURATION (DAYS IN SPACE)</span>
            <div className="sim-slider-row">
              <input
                type="range"
                min={1}
                max={540}
                value={simConfig.missionDay}
                aria-label="Simulated mission duration in days"
                onChange={e => update({ missionDay: Number(e.target.value) })}
              />
              <span className="pill">Day {simConfig.missionDay}</span>
            </div>
            <div className="flare-chip-row" role="group" aria-label="Mission duration presets">
              {DURATION_PRESETS.map(day => (
                <button
                  key={day}
                  type="button"
                  className={`flare-chip ${simConfig.missionDay === day ? 'active' : ''}`}
                  aria-pressed={simConfig.missionDay === day}
                  onClick={() => update({ missionDay: day })}
                >
                  Day {day}
                </button>
              ))}
            </div>

            <div className="sim-subgrid">
              <div>
                <span className="eyebrow"><Shield size={12} /> SHIELDING &amp; EVA</span>
                <div className="flare-chip-row" role="radiogroup" aria-label="Radiation shielding mode">
                  {SHIELDING_OPTIONS.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      role="radio"
                      aria-checked={simConfig.shielding === s.id}
                      className={`flare-chip ${simConfig.shielding === s.id ? 'active' : ''}`}
                      onClick={() => update({ shielding: s.id as ShieldingMode })}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="eyebrow"><AlertTriangle size={12} /> SOLAR STORM OVERRIDE</span>
                <div className="flare-chip-row" role="radiogroup" aria-label="Solar storm scenario override">
                  {SOLAR_STORM_OPTIONS.map(st => (
                    <button
                      key={st.id}
                      type="button"
                      role="radio"
                      aria-checked={simConfig.solarStorm === st.id}
                      className={`flare-chip ${simConfig.solarStorm === st.id ? 'active' : ''}`}
                      onClick={() => update({ solarStorm: st.id as SolarStormMode })}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="sim-scenarios-section">
        <div className="row">
          <span className="eyebrow"><Activity size={12} /> 3. ENVIRONMENTAL &amp; BIOMETRIC STRESS SCENARIOS ({SIMULATION_SCENARIOS.length})</span>
          <span className="helper">Active: <strong>{activeScenario.label}</strong>: {activeScenario.summary}</span>
        </div>
        <div className="segmented scenario-picker" role="tablist" aria-label="Simulation scenario categories">
          {CATEGORY_LABELS.map(cat => (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={category === cat.id}
              onClick={() => setCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="simulation-actions" role="group" aria-label="Telemetry simulation scenario">
          {categoryScenarios.map(sc => (
            <button
              key={sc.mode}
              type="button"
              className="button secondary"
              aria-pressed={currentAnomaly === sc.mode}
              onClick={() => update({ anomaly: sc.mode })}
            >
              {sc.label}
            </button>
          ))}
        </div>
      </div>

      {envRisks.length > 0 && (
        <div className="open-subsection">
          <h4>Spaceflight Environmental Health Risks (NASA HRP + OSDR Model)</h4>
          <p className="helper">
            Simulated impact of distance, mission duration, gravity field, atmosphere, and space weather on astronaut health.
          </p>
          <div className="env-risk-grid">
            {envRisks.map(risk => (
              <article key={risk.domain} className={`env-risk-card risk-${risk.risk_level.toLowerCase()}`}>
                <div className="row">
                  <strong>{risk.domain}</strong>
                  <span className="pill">{risk.risk_level}</span>
                </div>
                <small className="muted">{risk.hazard}</small>
                <p>{risk.summary}</p>
                <p className="alert-action-guide">
                  <strong>Countermeasure:</strong> {risk.countermeasure}
                </p>
                <small className="muted">{risk.evidence_basis}</small>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
