import React from 'react';
import { LucideIcon, ShieldAlert, CheckCircle, AlertTriangle } from 'lucide-react';

interface VitalCardProps {
  label: string;
  value: number | string;
  unit: string;
  icon: LucideIcon;
  status: 'NORMAL' | 'WARNING' | 'CRITICAL';
  baseline: string;
  ariaLabel: string;
}

export const VitalCard: React.FC<VitalCardProps> = ({
  label,
  value,
  unit,
  icon: Icon,
  status,
  baseline,
  ariaLabel
}) => {
  const getStatusStyles = () => {
    switch (status) {
      case 'CRITICAL':
        return {
          border: 'border-rose-500/60 bg-rose-950/20 shadow-rose-950/50',
          badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
          text: 'text-rose-400',
          icon: 'text-rose-400',
          StatusIcon: ShieldAlert
        };
      case 'WARNING':
        return {
          border: 'border-amber-500/50 bg-amber-950/20 shadow-amber-950/50',
          badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          text: 'text-amber-400',
          icon: 'text-amber-400',
          StatusIcon: AlertTriangle
        };
      default:
        return {
          border: 'border-slate-800 bg-slate-900/60 shadow-slate-950/40',
          badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          text: 'text-cyan-400',
          icon: 'text-cyan-400',
          StatusIcon: CheckCircle
        };
    }
  };

  const style = getStatusStyles();
  const StatusIcon = style.StatusIcon;

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      className={`p-4 rounded-xl border backdrop-blur transition-all duration-300 shadow-lg ${style.border}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700">
            <Icon className={`h-5 w-5 ${style.icon}`} />
          </div>
          <span className="text-xs font-semibold text-slate-300 tracking-wider uppercase">
            {label}
          </span>
        </div>

        {/* Color-blind safe status badge with explicit icon */}
        <div className={`flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full border ${style.badge}`}>
          <StatusIcon className="h-3 w-3" />
          <span>{status}</span>
        </div>
      </div>

      <div className="flex items-baseline gap-2 my-1">
        <span
          className={`text-3xl md:text-4xl font-mono font-bold tracking-tight ${style.text}`}
          aria-live="polite"
        >
          {value}
        </span>
        <span className="text-xs text-slate-400 font-mono uppercase">{unit}</span>
      </div>

      <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
        <span>Baseline Ref:</span>
        <span className="text-slate-300 font-medium">{baseline}</span>
      </div>
    </div>
  );
};

