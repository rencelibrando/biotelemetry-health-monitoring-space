import type { LucideIcon } from 'lucide-react';


interface VitalCardProps {
  label: string; value: number | string; unit: string; icon: LucideIcon;
  status: 'NORMAL' | 'WARNING' | 'CRITICAL'; baseline: string; ariaLabel: string;
}
export function VitalCard({ label, value, unit, icon: Icon, status, baseline, ariaLabel }: VitalCardProps) {
  return <section className={`panel vital-card ${status.toLowerCase()}`} aria-label={ariaLabel}>
    <div className="vital-label"><span className="metric-icon"><Icon size={19} /></span><span>{label}</span></div>
    <div className="vital-value">{value}<span>{unit}</span></div>
    <div className="vital-bottom"><span className="metric-status"><span className="status-dot" />{status === 'NORMAL' ? 'Demo reading' : `${status.toLowerCase()} test range`}</span><span>{baseline}</span></div>
  </section>;
}

