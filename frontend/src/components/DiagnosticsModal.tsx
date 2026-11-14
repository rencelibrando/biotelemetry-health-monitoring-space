import { useEffect, useRef } from 'react';
import { Activity, X } from 'lucide-react';
import type { DiagnosticResult } from '../types/telemetry';

export function DiagnosticsModal({ result, onClose }: { result: DiagnosticResult | null; onClose(): void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!result) return;
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; close.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button, a, [tabindex="0"]') ?? []);
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', keyboard); previous?.focus(); };
  }, [result, onClose]);
  if (!result) return null;
  return <div className="modal-overlay"><div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="diagnostic-title" className="panel diagnostic-modal"><div className="section-heading"><h2 id="diagnostic-title"><Activity size={19} />Simulation diagnostics</h2><button ref={close} aria-label="Close diagnostics" onClick={onClose} className="button secondary"><X size={19} /></button></div><p className="warning-box">Unvalidated API simulation output. This report is not a clinical assessment. Review any medical action with your mission medical team.</p><p className="helper">Astronaut: {result.astronaut_id}. The server’s overall health score is intentionally not displayed.</p><dl className="detail-list"><div><dt>Server cardiovascular label</dt><dd>{result.cardiovascular_status}</dd></div><div><dt>Server hypoxia label</dt><dd>{result.hypoxia_risk}</dd></div><div><dt>Server radiation label</dt><dd>{result.radiation_risk}</dd></div></dl><h3 className="mt-6">Server-generated suggestions</h3><ul>{result.recommendations.map((recommendation, i) => <li key={i}>{recommendation}</li>)}</ul><button className="button primary" onClick={onClose}>Close report</button></div></div>;
}
