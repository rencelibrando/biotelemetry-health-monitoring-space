import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LayoutDashboard, ClipboardCheck, BarChart3, Orbit, Sparkles, Wifi, WifiOff, ChevronRight, Volume2, VolumeX, Contrast, RefreshCw, HelpCircle, BookOpen, ArrowRight } from 'lucide-react';
import type { Astronaut } from '../types/telemetry';
import type { Page } from '../types/wellness';
import { WelcomeTour } from './WelcomeTour';
import { isWelcomeHidden } from '../services/onboarding';
import { useScrollReveal } from '../hooks/useScrollReveal';

export const navigation = [
  { id: 'dashboard' as const, label: 'Home', shortLabel: 'Home', icon: LayoutDashboard },
  { id: 'checkin' as const, label: 'Check-In', shortLabel: 'Check-In', icon: ClipboardCheck },
  { id: 'analytics' as const, label: 'My Health Trends', shortLabel: 'Trends', icon: BarChart3 },
  { id: 'missions' as const, label: 'Daily Activities', shortLabel: 'Activities', icon: Orbit },
  { id: 'ai' as const, label: 'AI Assistant', shortLabel: 'Assistant', icon: Sparkles },
];
export function BrandLogo({ compact = false }: { compact?: boolean }) {
  const [missing, setMissing] = useState(false);
  return <div className="brand"><div className="brand-mark">{missing ? <span role="status">Logo unavailable</span> : <img src="/branding/biotelemetry-logo.png" alt={compact ? "BioTelemetry" : ""} onError={() => setMissing(true)} />}</div>{!compact && <div><strong>Bio<span>Telemetry</span></strong><small>HUMAN HEALTH. BEYOND EARTH.</small></div>}</div>;
}
export function ConnectionStatus({ offline, gateway }: { offline: boolean; gateway: boolean }) {
  return <span role="status" className={`connection ${offline ? 'warning' : gateway ? 'success' : ''}`}>{offline ? <WifiOff size={15} /> : <Wifi size={15} />}{offline ? 'Offline · saved on this device' : gateway ? 'Connected · demo measurements' : 'Demo · server unavailable'}</span>;
}
interface ShellProps {
  children: ReactNode; page: Page; crew: Astronaut[]; activeId: string; selectCrew(id: string): void;
  crewDemo: boolean; offline: boolean; gateway: boolean; los: boolean; toggleLos(): void;
  pending: number; syncing: boolean; sync(): void; sound: boolean; toggleSound(): void;
  contrast: boolean; toggleContrast(): void;
}
export function AppShell(props: ShellProps) {
  const shell = useRef<HTMLDivElement>(null);
  useScrollReveal(shell);
  const current = navigation.find(item => item.id === props.page)!;
  const [guideOpen, setGuideOpen] = useState(false);
  useEffect(() => {
    try { if (!isWelcomeHidden(window.localStorage)) setGuideOpen(true); }
    catch { setGuideOpen(true); }
  }, []);
  return <div ref={shell} className={`app-shell ${props.contrast ? 'high-contrast' : ''}`}>
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>Skip to content</a>
    <aside className="sidebar">
      <a href="#dashboard" className="brand-link" aria-label="BioTelemetry Home"><BrandLogo /></a>
      <div className="workspace-label">CREW WORKSPACE <span>01</span></div>
      <nav data-tour="navigation" aria-label="Main navigation" className="side-nav">{navigation.map(({ id, label, icon: Icon }) => <a key={id} href={`#${id}`} aria-current={props.page === id ? 'page' : undefined}><Icon size={20} /><span>{label}</span>{props.page === id && <ChevronRight size={16} />}</a>)}</nav>
      <button type="button" className="sidebar-guide" onClick={() => setGuideOpen(true)}><BookOpen size={21} /><strong>Start with your day.</strong><span>See how observations connect to the research.</span><span className="text-link">A quick introduction<ArrowRight size={15} /></span></button>
      <div className="sidebar-footer"><span className="status-dot" /> SPACE-HEALTH PROTOTYPE<small>Independent project using NASA research</small></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><a href="#dashboard" className="mobile-brand" aria-label="BioTelemetry Home"><BrandLogo compact /></a><div className="breadcrumb">Crew workspace <ChevronRight size={14} /><strong>{current.label}</strong></div><div className="topbar-right"><ConnectionStatus offline={props.offline} gateway={props.gateway} /><div data-tour="crew" className="crew-select"><span className="avatar">{props.crew.find(a => a.id === props.activeId)?.name.split(' ').filter(s => s !== 'Dr.').map(s => s[0]).slice(0, 2).join('')}</span><label><span className="sr-only">Select astronaut{props.crewDemo ? ' (demo crew)' : ''}</span><select aria-label="Select astronaut" value={props.activeId} onChange={e => props.selectCrew(e.target.value)}>{props.crew.map(member => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label></div></div></header>
      <div className="utility-bar"><span>Personal log · {props.crewDemo ? 'sample crew' : 'selected crew'}</span><button type="button" className="guide-trigger" onClick={() => setGuideOpen(true)}><HelpCircle size={15} />How it works</button>{props.pending > 0 && <button className="button secondary pending-records" disabled={props.offline || props.syncing} onClick={props.sync}><RefreshCw size={15} />{props.syncing ? 'Sending…' : `${props.pending} measurements not yet sent`}</button>}<details className="utility-settings"><summary>Settings & connection</summary><div className="utility-actions"><button onClick={props.toggleSound} aria-pressed={props.sound}>{props.sound ? <Volume2 size={17} /> : <VolumeX size={17} />}Sound {props.sound ? 'on' : 'off'}</button><button onClick={props.toggleContrast} aria-pressed={props.contrast}><Contrast size={17} />High contrast {props.contrast ? 'on' : 'off'}</button><button onClick={props.toggleLos} aria-pressed={props.los}><WifiOff size={15} />{props.los ? 'End offline test' : 'Test offline mode'}</button><p className="helper">The offline test stores simulated measurements on this device. Reconnect to send them. Records stay here until the server confirms they were saved.</p></div></details></div>
      <main id="main-content" tabIndex={-1}>{props.children}</main>
      <footer className="page-footer"><span>BioTelemetry <span className="muted">/ Designed for the human side of exploration</span></span><span>SIMULATION ENVIRONMENT</span></footer>
    </div>
    <nav data-tour="navigation" className="bottom-nav" aria-label="Mobile navigation">{navigation.map(({ id, label, shortLabel, icon: Icon }) => <a key={id} href={`#${id}`} aria-label={label} aria-current={props.page === id ? 'page' : undefined}><Icon size={21} /><span>{shortLabel}</span></a>)}</nav>
    <WelcomeTour open={guideOpen} onClose={() => setGuideOpen(false)} />
  </div>;
}
export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return <div className="empty-state"><BarChart3 size={28} /><h3>{title}</h3><p>{children}</p></div>;
}
export function MissionProgress({ completed, total = 9 }: { completed: number; total?: number }) {
  return <div className="mission-progress"><div className="row"><span>Today’s completion</span><strong>{completed}<span className="muted"> / {total}</span></strong></div><progress aria-label="Daily activities completed" value={completed} max={total} /><small>Activities completed today, not a measure of health.</small></div>;
}
export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}



