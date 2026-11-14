import { useEffect, useRef } from 'react';
import { Activity } from 'lucide-react';

export function ECGMonitor({ ecgSamples, heartRate }: { ecgSamples?: number[]; heartRate: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const buffer = useRef<number[]>([]);
  const pulse = useRef(heartRate);
  useEffect(() => { pulse.current = heartRate; }, [heartRate]);
  useEffect(() => { if (ecgSamples?.length) buffer.current = [...buffer.current, ...ecgSamples].slice(-1000); }, [ecgSamples]);
  useEffect(() => {
    const canvas = canvasRef.current; const ctx = canvas?.getContext('2d'); if (!canvas || !ctx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, offset = 0, last = 0;
    const sample = (phase: number) => 0.07 * Math.exp(-((phase - 0.19) ** 2) / 0.001) - 0.12 * Math.exp(-((phase - 0.37) ** 2) / 0.0002) + 1.15 * Math.exp(-((phase - 0.4) ** 2) / 0.00012) - 0.26 * Math.exp(-((phase - 0.43) ** 2) / 0.0002) + 0.17 * Math.exp(-((phase - 0.65) ** 2) / 0.003);
    const history = Array.from({ length: 800 }, (_, i) => sample((i / 150) % 1));
    function draw(time: number) {
      if (!canvas || !ctx) return;
      if (time - last > 30 || reduced.matches) {
        if (!reduced.matches) {
          offset += 4;
          for (let i = 0; i < 4; i++) { history.shift(); history.push(buffer.current.length ? buffer.current.shift()! : sample(((offset + i + 800) / (10000 / pulse.current)) % 1)); }
        }
        last = time;
        const styles = getComputedStyle(canvas);
        ctx.fillStyle = styles.getPropertyValue('--canvas-bg'); ctx.fillRect(0, 0, 800, 180);
        ctx.strokeStyle = styles.getPropertyValue('--chart-grid'); ctx.lineWidth = 1;
        for (let x = 0; x < 800; x += 25) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 180); ctx.stroke(); }
        for (let y = 0; y < 180; y += 25) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(800, y); ctx.stroke(); }
        ctx.strokeStyle = styles.getPropertyValue('--accent'); ctx.lineWidth = 2; ctx.beginPath();
        history.forEach((value, i) => { const y = 108 - value * 65; if (i === 0) ctx.moveTo(i, y); else ctx.lineTo(i, y); }); ctx.stroke();
      }
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <section className="panel ecg-panel"><div className="section-heading"><h2><Activity size={19} />ECG waveform</h2><span className="pill"><span className="status-dot" />{ecgSamples?.length ? 'API samples' : 'SIMULATED'}</span></div><div className="ecg-canvas"><canvas ref={canvasRef} width={800} height={180} role="img" aria-label={`Illustrative ECG waveform. Simulated heart rate ${heartRate} beats per minute. Not a diagnostic trace.`} /><div className="ecg-label">ILLUSTRATIVE SINGLE-LEAD TRACE</div></div><div className="ecg-footer"><span>Simulation · not a diagnostic trace</span><span><HeartIcon />{heartRate} bpm</span></div></section>;
}
function HeartIcon() { return <Activity size={14} />; }
