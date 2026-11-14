import React, { useRef, useEffect } from 'react';
import { Activity } from 'lucide-react';

interface ECGMonitorProps {
  ecgSamples?: number[];
  heartRate: number;
}

export const ECGMonitor: React.FC<ECGMonitorProps> = ({ ecgSamples, heartRate }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dataBufferRef = useRef<number[]>([]);
  const cursorXRef = useRef<number>(0);

  // Append new samples from telemetry stream to circular buffer
  useEffect(() => {
    if (ecgSamples && ecgSamples.length > 0) {
      dataBufferRef.current.push(...ecgSamples);
      if (dataBufferRef.current.length > 1000) {
        dataBufferRef.current = dataBufferRef.current.slice(-1000);
      }
    }
  }, [ecgSamples]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      const midY = height / 2;

      // Draw subtle background medical grid
      ctx.fillStyle = 'rgba(2, 6, 23, 0.25)';
      ctx.fillRect(0, 0, width, height);

      // Grid lines
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.5)';
      ctx.lineWidth = 1;

      const step = 25;
      for (let x = 0; x < width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw ECG sweep trace
      const speed = 2.5; // pixels per frame
      const currentX = cursorXRef.current;
      const nextX = (currentX + speed) % width;

      // Erase ahead of the sweep cursor
      ctx.fillStyle = '#020617';
      ctx.fillRect(nextX, 0, 20, height);

      // Fetch next sample or synthetic baseline
      let sample = 0.0;
      if (dataBufferRef.current.length > 0) {
        sample = dataBufferRef.current.shift()!;
      } else {
        // Fallback synthetic heartbeat wave
        const t = performance.now() / 1000;
        const hz = (heartRate || 70) / 60;
        const phase = (t * hz) % 1.0;
        if (phase > 0.38 && phase < 0.44) {
          sample = 1.2 * Math.sin(((phase - 0.38) / 0.06) * Math.PI);
        }
      }

      // Scale voltage (mV) to canvas pixels
      const voltageScale = 45; 
      const y = midY - sample * voltageScale;

      // Draw glowing line
      ctx.shadowColor = '#00f2fe';
      ctx.shadowBlur = 6;
      ctx.strokeStyle = '#00f2fe';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';

      ctx.beginPath();
      ctx.moveTo(currentX, midY);
      ctx.lineTo(nextX, y);
      ctx.stroke();

      // Reset shadow
      ctx.shadowBlur = 0;

      cursorXRef.current = nextX;
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [heartRate]);

  return (
    <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-cyan-400" />
          <span className="text-xs font-semibold text-slate-300 tracking-wider uppercase">
            Biomedical Telemetry • Continuous Single-Lead ECG (Lead II)
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
          <span className="hidden sm:inline">25 mm/s • 10 mm/mV</span>
          <span className="px-2 py-0.5 rounded bg-cyan-950/40 text-cyan-400 border border-cyan-800/50">
            60 FPS STREAM
          </span>
        </div>
      </div>

      <div className="relative w-full h-44 rounded-lg overflow-hidden border border-slate-800 bg-slate-950">
        <canvas
          ref={canvasRef}
          width={800}
          height={176}
          className="w-full h-full object-fill block"
          aria-label="Real-time electrocardiogram waveform monitor"
        />
        <div className="absolute top-2 left-3 font-mono text-[10px] text-slate-500 uppercase">
          CAL: 1.0mV / 100ms
        </div>
        <div className="absolute bottom-2 right-3 font-mono text-xs text-cyan-400 bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800">
          Pulse: <span className="font-bold">{heartRate || '--'}</span> BPM
        </div>
      </div>
    </div>
  );
};

