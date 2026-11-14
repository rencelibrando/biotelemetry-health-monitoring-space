import React from 'react';
import { AlertItem } from '../types/telemetry';
import { ShieldAlert, AlertTriangle, CheckCircle2, BellRing } from 'lucide-react';

interface AlertBannerProps {
  alerts: AlertItem[];
  onAcknowledge: (alertId: string) => void;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({ alerts, onAcknowledge }) => {
  const unacknowledged = alerts.filter(a => !a.acknowledged);

  if (unacknowledged.length === 0) {
    return (
      <div className="flex items-center justify-between p-3 rounded-lg border border-emerald-900/40 bg-emerald-950/20 text-emerald-300 text-xs font-mono">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>PHYSIOLOGICAL STATUS: NOMINAL • NO ACTIVE MEDICAL CONTINGENCIES</span>
        </div>
        <span className="hidden sm:inline text-slate-500">SYSTEM SCAN COMPLETE</span>
      </div>
    );
  }

  const latestAlert = unacknowledged[0];
  const isCritical = latestAlert.severity === 'CRITICAL';

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`p-4 rounded-xl border transition-all animate-pulse duration-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xl ${
        isCritical
          ? 'border-rose-500 bg-rose-950/60 text-rose-200'
          : 'border-amber-500 bg-amber-950/60 text-amber-200'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-black/40 border border-white/10 shrink-0">
          {isCritical ? (
            <ShieldAlert className="h-6 w-6 text-rose-400" />
          ) : (
            <AlertTriangle className="h-6 w-6 text-amber-400" />
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-xs uppercase tracking-wider px-2 py-0.5 rounded bg-black/40 border border-white/20">
              {latestAlert.severity} • {latestAlert.alert_type}
            </span>
            <span className="text-xs text-white/70 font-mono">
              Astronaut: {latestAlert.astronaut_id}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-white">
            {latestAlert.message}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
        <button
          onClick={() => onAcknowledge(latestAlert.id)}
          className="px-4 py-2 rounded-lg font-mono text-xs font-semibold bg-white text-slate-950 hover:bg-slate-200 transition active:scale-95 shadow-md flex items-center gap-1.5"
          aria-label={`Acknowledge ${latestAlert.alert_type} emergency alert`}
        >
          <BellRing className="h-4 w-4" />
          ACKNOWLEDGE ALARM
        </button>
      </div>
    </div>
  );
};

