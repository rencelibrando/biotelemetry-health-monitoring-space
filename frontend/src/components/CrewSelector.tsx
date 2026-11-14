import React from 'react';
import { Astronaut } from '../types/telemetry';
import { User, BatteryCharging } from 'lucide-react';

interface CrewSelectorProps {
  crew: Astronaut[];
  activeId: string;
  onSelect: (id: string) => void;
  suitBattery?: number;
}

export const CrewSelector: React.FC<CrewSelectorProps> = ({
  crew,
  activeId,
  onSelect,
  suitBattery = 98.2
}) => {
  return (
    <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <User className="h-5 w-5 text-cyan-400" />
          <span className="text-xs font-semibold text-slate-300 tracking-wider uppercase">
            Active Crew Selection (Hot-Swap)
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-mono text-emerald-400">
          <BatteryCharging className="h-4 w-4" />
          <span>SUIT: {suitBattery}%</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {crew.map((member) => {
          const isActive = member.id === activeId;
          return (
            <button
              key={member.id}
              onClick={() => onSelect(member.id)}
              className={`p-3 rounded-lg border text-left transition-all flex flex-col justify-between ${
                isActive
                  ? 'border-cyan-500/80 bg-cyan-950/30 text-white shadow-cyan-950/50 shadow-md'
                  : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
              aria-pressed={isActive}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-cyan-400">{member.id}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                  {member.suit_id || 'EVA-SUIT'}
                </span>
              </div>
              <div className="mt-1 font-semibold text-sm text-slate-100">{member.name}</div>
              <div className="text-[11px] text-slate-400 truncate">{member.role}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

