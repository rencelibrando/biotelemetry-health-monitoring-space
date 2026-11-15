import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LayoutDashboard, ClipboardCheck, BarChart3, Orbit, Sparkles, Wifi, WifiOff, ChevronDown, ChevronRight, Volume2, VolumeX, Contrast, SlidersHorizontal } from 'lucide-react';
import type { Astronaut } from '../types/telemetry';
import type { Page } from '../types/wellness';

export const navigation = [
  { id: 'dashboard' as const, label: 'Home', shortLabel: 'Home', icon: LayoutDashboard },
  { id: 'checkin' as const, label: 'Check-In', shortLabel: 'Check-In', icon: ClipboardCheck },
  { id: 'analytics' as const, label: 'My Health Trends', shortLabel: 'Trends', icon: BarChart3 },
  { id: 'missions' as const, label: 'Countermeasures', shortLabel: 'Protocols', icon: Orbit },
  { id: 'ai' as const, label: 'AI Assistant', shortLabel: 'Assistant', icon: Sparkles },
];

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  const [missing, setMissing] = useState(false);
  return <div className="brand"><div className="brand-mark">{missing ? <span role="status">Logo unavailable</span> : <img src="/branding/biotelemetry-logo.png" alt={compact ? "BioTelemetry" : ""} onError={() => setMissing(true)} />}</div>{!compact && <div><strong>Bio<span>Telemetry</span></strong><small>HUMAN HEALTH. BEYOND EARTH.</small></div>}</div>;
}

export function ConnectionStatus({ offline, gateway }: { offline: boolean; gateway: boolean }) {
  return <span role="status" className={`connection ${offline ? 'warning' : gateway ? 'success' : ''}`}>{offline ? <WifiOff size={15} /> : <Wifi size={15} />}{offline ? 'Offline · saved on this device' : gateway ? 'Connected · NASA-calibrated telemetry' : 'Demo · server unavailable'}</span>;
}

interface ShellProps {
  children: ReactNode; page: Page; crew: Astronaut[]; activeId: string; selectCrew(id: string): void;
  crewDemo: boolean; offline: boolean; gateway: boolean; los: boolean; toggleLos(): void;
  sound: boolean; toggleSound(): void;
  contrast: boolean; toggleContrast(): void;
}

export function AppShell(props: ShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <div className={`app-shell app-shell-${props.page} ${props.contrast ? 'high-contrast' : ''}`} data-page={props.page}>
      <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>Skip to content</a>
      <aside className="sidebar">
        <a href="#dashboard" className="brand-link" aria-label="BioTelemetry Home"><BrandLogo /></a>
        <nav aria-label="Main navigation" className="side-nav">{navigation.map(({ id, label, icon: Icon }) => <a key={id} href={`#${id}`} aria-current={props.page === id ? 'page' : undefined}><Icon size={20} /><span>{label}</span>{props.page === id && <ChevronRight size={16} />}</a>)}</nav>
        <div className="sidebar-footer"><span className="status-dot" /> SPACE APPS CHALLENGE 2026<small>Monitoring Human Health Beyond Earth</small></div>
      </aside>
      <div className={`main-shell main-shell-${props.page}`} data-page={props.page}>
        <header className="topbar">
          <a href="#dashboard" className="mobile-brand" aria-label="BioTelemetry Home"><BrandLogo compact /></a>
          <div className="topbar-right">
            <ConnectionStatus offline={props.offline} gateway={props.gateway} />
            <div className="topbar-profile-group">
              <div className="crew-select">
                <span className="avatar">{props.crew.find(a => a.id === props.activeId)?.name.split(' ').filter(s => s !== 'Dr.').map(s => s[0]).slice(0, 2).join('')}</span>
                <label><span className="sr-only">Select astronaut{props.crewDemo ? ' (demo crew)' : ''}</span><select aria-label="Select astronaut" value={props.activeId} onChange={e => props.selectCrew(e.target.value)}>{props.crew.map(member => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label>
              </div>
              <div className="topbar-menu" ref={menuRef}>
                <button
                  type="button"
                  className="topbar-menu-trigger"
                  aria-label="Workspace controls"
                  aria-expanded={menuOpen}
                  aria-haspopup="true"
                  aria-controls="topbar-controls-menu"
                  onClick={() => setMenuOpen(open => !open)}
                >
                  <SlidersHorizontal size={15} aria-hidden="true" />
                  <ChevronDown size={14} aria-hidden="true" />
                </button>
                <div id="topbar-controls-menu" className="topbar-dropdown" role="group" aria-label="Display and simulation controls" hidden={!menuOpen}>
                  <button type="button" onClick={props.toggleSound} aria-pressed={props.sound}>
                    {props.sound ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
                    <span>Sound {props.sound ? 'on' : 'off'}</span>
                  </button>
                  <button type="button" onClick={props.toggleContrast} aria-pressed={props.contrast}>
                    <Contrast size={16} aria-hidden="true" />
                    <span>High contrast {props.contrast ? 'on' : 'off'}</span>
                  </button>
                  <button type="button" onClick={props.toggleLos} aria-pressed={props.los}>
                    <WifiOff size={15} aria-hidden="true" />
                    <span>{props.los ? 'End offline test' : 'Test offline mode'}</span>
                  </button>
                  <span className="topbar-dropdown-meta">Demo experience · {props.crewDemo ? 'sample crew' : 'selected crew'}</span>
                </div>
              </div>
            </div>
          </div>
        </header>
        <main id="main-content" className={`main-${props.page}`} data-page={props.page} tabIndex={-1}>{props.children}</main>
        <footer className="page-footer"><span>BioTelemetry <span className="muted">/ Designed for the human side of exploration</span></span><span>SIMULATION ENVIRONMENT</span></footer>
      </div>
      <nav className="bottom-nav" aria-label="Mobile navigation">{navigation.map(({ id, label, shortLabel, icon: Icon }) => <a key={id} href={`#${id}`} aria-label={label} aria-current={props.page === id ? 'page' : undefined}><Icon size={21} /><span>{shortLabel}</span></a>)}</nav>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return <div className="empty-state"><BarChart3 size={28} /><h3>{title}</h3><p>{children}</p></div>;
}

export function MissionProgress({ completed, total = 9 }: { completed: number; total?: number }) {
  return <div className="mission-progress"><div className="row"><span>Today’s protocol compliance</span><strong>{completed}<span className="muted"> / {total}</span></strong></div><progress aria-label="Daily countermeasures completed" value={completed} max={total} /><small>Countermeasures verified today, not a standalone clinical clearance.</small></div>;
}

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}
