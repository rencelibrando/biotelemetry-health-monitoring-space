import { CheckCircle2, AlertTriangle, BellRing } from 'lucide-react';
import type { AlertItem } from '../types/telemetry';
const labels: Record<AlertItem['alert_type'], string> = { HYPOXIA: 'Low blood oxygen', TACHYCARDIA: 'Fast heart rate', BRADYCARDIA: 'Slow heart rate', RADIATION_SPIKE: 'Rise in radiation', HEAT_STRESS: 'High body temperature' };
export function AlertBanner({ alerts, onAcknowledge }: { alerts: AlertItem[]; onAcknowledge(id: string): void }) {
  const open = alerts.filter(alert => !alert.acknowledged);
  if (!open.length) return <div className="observation-empty"><CheckCircle2 size={18} /><span>No received notifications are waiting for review. This does not tell us whether you are medically well.</span></div>;
  const alert = open[0];
  return <div role="alert" className={`observation-alert ${alert.severity === 'CRITICAL' ? 'critical' : ''}`}><div><span className="pill"><AlertTriangle size={13} />{alert.severity} · {labels[alert.alert_type]}</span><p>{alert.message}</p><small className="muted">{open.length} to review. Marking one as seen does not resolve a medical concern.</small></div><button onClick={() => onAcknowledge(alert.id)} className="button secondary"><BellRing size={16} />Mark as seen</button></div>;
}
