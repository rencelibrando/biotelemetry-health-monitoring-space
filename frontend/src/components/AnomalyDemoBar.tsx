import { Sparkles, AlertOctagon, HeartCrack, Flame, Stethoscope } from 'lucide-react';

interface AnomalyDemoBarProps {
  currentAnomaly: string;
  onTrigger: (anomaly: string) => void;
  onRunDiagnostics: () => void;
  isDiagnosing: boolean;
}
const scenarios = [
  { mode: 'NONE', label: 'Normal', icon: null },
  { mode: 'HYPOXIA', label: 'Hypoxia Test', icon: AlertOctagon },
  { mode: 'TACHYCARDIA', label: 'Tachycardia Test', icon: HeartCrack },
  { mode: 'RADIATION_SPIKE', label: 'Radiation Spike', icon: Flame },
];
export function AnomalyDemoBar({ currentAnomaly, onTrigger, onRunDiagnostics, isDiagnosing }: AnomalyDemoBarProps) {
  return <div className="panel simulation-controls"><h3><Sparkles size={18} />Mission simulation controls</h3><div className="simulation-actions" role="group" aria-label="Telemetry simulation scenario">{scenarios.map(({ mode, label, icon: Icon }) => <button key={mode} className="button secondary" aria-pressed={currentAnomaly === mode} onClick={() => onTrigger(mode)}>{Icon && <Icon size={16} />}{label}</button>)}<button className="button primary" onClick={onRunDiagnostics} disabled={isDiagnosing}><Stethoscope size={16} />{isDiagnosing ? 'Analyzing…' : 'Run Diagnostics'}</button></div></div>;
}
