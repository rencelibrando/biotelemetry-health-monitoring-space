import React from 'react';
import { Sparkles, AlertOctagon, HeartCrack, Flame, Stethoscope } from 'lucide-react';

interface AnomalyDemoBarProps {
  currentAnomaly: string;
  onTrigger: (anomaly: string) => void;
  onRunDiagnostics: () => void;
  isDiagnosing: boolean;
}

export const AnomalyDemoBar: React.FC<AnomalyDemoBarProps> = ({
  currentAnomaly,
  onTrigger,
  onRunDiagnostics,
  isDiagnosing
}) => {
  return (
    <div className="p-4 rounded-xl border border-cyan-900/40 bg-slate-900/50 backdrop-blur shadow-lg">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-cyan-400" />
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            NASA Mission Simulation Controls:
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onTrigger('NONE')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-mono border transition ${
              currentAnomaly === 'NONE'
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold'
                : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            Normal
          </button>

          <button
            onClick={() => onTrigger('HYPOXIA')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono border transition ${
              currentAnomaly === 'HYPOXIA'
                ? 'bg-rose-500/20 border-rose-400 text-rose-300 font-bold'
                : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            <AlertOctagon className="h-3.5 w-3.5 text-rose-400" />
            Hypoxia Test
          </button>

          <button
            onClick={() => onTrigger('TACHYCARDIA')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono border transition ${
              currentAnomaly === 'TACHYCARDIA'
                ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold'
                : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            <HeartCrack className="h-3.5 w-3.5 text-amber-400" />
            Tachycardia Test
          </button>

          <button
            onClick={() => onTrigger('RADIATION_SPIKE')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono border transition ${
              currentAnomaly === 'RADIATION_SPIKE'
                ? 'bg-purple-500/20 border-purple-400 text-purple-300 font-bold'
                : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            <Flame className="h-3.5 w-3.5 text-purple-400" />
            Radiation Spike
          </button>

          <button
            onClick={onRunDiagnostics}
            disabled={isDiagnosing}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-mono bg-cyan-600 hover:bg-cyan-500 text-white font-semibold transition active:scale-95 disabled:opacity-50"
          >
            <Stethoscope className="h-3.5 w-3.5" />
            {isDiagnosing ? 'Analyzing...' : 'Run Diagnostics'}
          </button>
        </div>
      </div>
    </div>
  );
};

