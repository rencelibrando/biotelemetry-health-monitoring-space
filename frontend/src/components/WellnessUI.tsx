import { useState, useId, type ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';

export function Disclosure({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return <details className={`panel disclosure ${className}`}><summary>{title}</summary><div className="disclosure-content">{children}</div></details>;
}
export function HelpTip({ term, children }: { term: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <span className="help-tip"><button type="button" className="help-button" aria-label={`About ${term}`} aria-expanded={open} aria-describedby={open ? id : undefined} onClick={() => setOpen(!open)} onBlur={() => setOpen(false)} onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}><HelpCircle size={18} /></button>{open && <span className="help-tooltip" id={id} role="tooltip">{children}</span>}</span>;
}
export function FormField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="form-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
export function RatingField({ label, name, value, onChange, low, high }: { label: string; name: string; value: number; onChange(value: number): void; low: string; high: string }) {
  return <FormField label={`${label} · ${value}/5`} hint={`1 = ${low} · 5 = ${high}`}><input name={name} type="range" min="1" max="5" step="1" value={value} onChange={event => onChange(Number(event.target.value))} /></FormField>;
}
