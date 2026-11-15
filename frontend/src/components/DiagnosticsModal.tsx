import type { DiagnosticResult } from '../types/telemetry';
import { Modal } from './Modal';

export function DiagnosticsModal({ result, onClose }: { result: DiagnosticResult | null; onClose(): void }) {
  return <Modal open={!!result} onClose={onClose} title="Simulation diagnostics" eyebrow="TELEMETRY TOOLS" description="A closer look at the API simulation output.">
    {result && <><p className="warning-box">Unvalidated API simulation output. This report is not a clinical assessment. Review any medical action with your mission medical team.</p><p className="helper">Astronaut: {result.astronaut_id}. The server’s overall health score is intentionally not displayed.</p><dl className="detail-list"><div><dt>Server cardiovascular label</dt><dd>{result.cardiovascular_status}</dd></div><div><dt>Server hypoxia label</dt><dd>{result.hypoxia_risk}</dd></div><div><dt>Server radiation label</dt><dd>{result.radiation_risk}</dd></div></dl><h3 className="mt-6">Server-generated suggestions</h3><ul>{result.recommendations.map((recommendation, index) => <li key={index}>{recommendation}</li>)}</ul></>}
  </Modal>;
}
