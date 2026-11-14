import React from 'react';
import { DiagnosticResult } from '../types/telemetry';
import { X, ShieldCheck, Activity } from 'lucide-react';

interface DiagnosticsModalProps {
  result: DiagnosticResult | null;
  onClose: () => void;
}

export const DiagnosticsModal: React.FC<DiagnosticsModalProps> = ({ result, onClose }) => {
  if (!result) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-slate-900 border border-cyan-500/50 rounded-2xl p-6 shadow-2xl text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-cyan-400" />
            <h2 className="text-base font-bold uppercase tracking-wider">
              Autonomous Health Assessment • {result.astronaut_id}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Overall Score */}
        <div className="my-5 p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs font-mono uppercase text-slate-400">Physiological Index Score</div>
            <div className="text-3xl font-mono font-bold text-cyan-400">
              {result.overall_health_score} / 100
            </div>
          </div>
          <div className="text-right">
            <span
              className={`px-3 py-1 rounded-full text-xs font-mono font-semibold border ${
                result.cardiovascular_status === 'NOMINAL'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
              }`}
            >
              {result.cardiovascular_status}
            </span>
          </div>
        </div>

        {/* Risk Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4 text-xs font-mono">
          <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/60">
            <div className="text-slate-400">Hypoxia Risk</div>
            <div className="text-sm font-bold text-white mt-0.5">{result.hypoxia_risk}</div>
          </div>
          <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/60">
            <div className="text-slate-400">Radiation Exposure</div>
            <div className="text-sm font-bold text-white mt-0.5">{result.radiation_risk}</div>
          </div>
        </div>

        {/* Action Recommendations */}
        <div className="mb-4">
          <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">
            Clinical Recommendations:
          </h3>
          <ul className="space-y-1.5 text-xs text-slate-300">
            {result.recommendations.map((rec, idx) => (
              <li key={idx} className="flex items-start gap-2 bg-slate-950/40 p-2 rounded border border-slate-800">
                <ShieldCheck className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-semibold tracking-wider uppercase transition"
        >
          Dismiss Assessment
        </button>
      </div>
    </div>
  );
};

