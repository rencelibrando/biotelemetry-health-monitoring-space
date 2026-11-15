import React from 'react';
import biotelemetryMark from '../assets/biotelemetry-mark.png';
import type { Page } from '../types/wellness';
import { 
  ArrowRight, 
  ExternalLink,
  Orbit,
  Layers,
  Database,
  Code2,
  Compass,
  Sparkles,
  Workflow,
  Activity,
  ClipboardCheck,
  BarChart3
} from 'lucide-react';

interface LandingPageProps {
  onEnterApp: (targetPage?: Page) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onEnterApp }) => {

  return (
    <div className="landing-master">
      {/* Background Starfield and Fluid Space Lighting */}
      <div className="landing-space-backdrop" />
      <div className="landing-glow glow-cyan" />
      <div className="landing-glow glow-blue" />

      {/* SECTION 1: Natural Document Flow Navigation Header */}
      <header className="landing-nav">
        <div className="nav-inner">
          {/* Logo is Clickable -> Navigates to Dashboard */}
          <button 
            onClick={() => onEnterApp()} 
            className="nav-brand-button"
            title="Launch BioTelemetry Dashboard"
            aria-label="BioTelemetry Home - Launch Dashboard"
          >
            <div className="brand-lockup">
              <div className="brand-mark">
                <img 
                  src={biotelemetryMark} 
                  alt="BioTelemetry Icon" 
                  className="nav-icon-img"
                  draggable={false}
                />
              </div>
              <div className="brand-text">
                <strong className="brand-title">Bio<span>Telemetry</span></strong>
                <small className="brand-tagline">HUMAN HEALTH. BEYOND EARTH.</small>
              </div>
            </div>
          </button>

          <nav className="nav-links hidden lg:flex" aria-label="Landing page sections">
            <a href="#overview">Overview</a>
            <a href="#problem">The Mission</a>
            <a href="#capabilities">Capabilities</a>
            <a href="#architecture">Architecture</a>
            <a href="#science">NASA Science</a>
            <a href="#team">Team</a>
          </nav>

          <div className="nav-cta-wrap">
            <button onClick={() => onEnterApp()} className="btn-launch-primary">
              <span>Launch Dashboard</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* SECTION 1B: Cohesive Cinematic Hero Viewport */}
      <section id="overview" className="hero-section">
        <div className="hero-content-group">
          {/* NASA International Space Apps Challenge 2026 Label */}
          <div className="hero-eyebrow animate-slide-up">
            <Sparkles className="h-4 w-4 text-cyan-400" />
            <span>NASA INTERNATIONAL SPACE APPS CHALLENGE 2026 · HUMAN HEALTH IN SPACE</span>
          </div>

          {/* Main Headline */}
          <h1 className="hero-headline animate-slide-up">
            AUTONOMOUS HEALTH<br />
            <span className="blue-electric-text">FOR DEEP SPACE.</span>
          </h1>

          {/* Supporting Description */}
          <p className="hero-subhead animate-slide-up-delayed">
            A mission-critical, offline-first clinical workstation engineered for interplanetary spaceflight. 
            Safeguards astronaut health, tracks acute physiological decline, and guarantees onboard diagnostic 
            autonomy when communication with Earth is delayed or severed.
          </p>

          {/* System Capability Badges Strip */}
          <div className="hero-badges-strip animate-slide-up-delayed">
            <span className="hero-pill"><span className="hero-pill-dot" /> 100% Offline Autonomy (IndexedDB)</span>
            <span className="hero-pill"><span className="hero-pill-dot" /> Deterministic Clinical Triage</span>
            <span className="hero-pill"><span className="hero-pill-dot" /> NASA-STD-3001 Compliance</span>
            <span className="hero-pill"><span className="hero-pill-dot" /> Multimodal Edge Architecture</span>
          </div>

          {/* Explore the Platform and View GitHub Source Buttons */}
          <div className="hero-actions animate-slide-up-delayed">
            <button onClick={() => onEnterApp('dashboard')} className="hero-btn-main">
              <span>Launch Mission Workspace</span>
              <ArrowRight className="h-5 w-5" />
            </button>
            <a 
              href="https://github.com/trishtanroxas/biotelemetry-health-monitoring-space" 
              target="_blank" 
              rel="noreferrer"
              className="hero-btn-ghost"
            >
              <ExternalLink className="h-4 w-4" />
              <span>View GitHub Source</span>
            </a>
          </div>
        </div>
      </section>

      {/* SECTION 2: Grounded NASA Environmental Risk Prevention */}
      <section id="problem" className="editorial-problem-section">
        <div className="section-meta">
          <span className="section-number">01</span>
          <span className="section-tag">DEEP SPACE ENVIRONMENTAL HAZARDS</span>
        </div>

        <div className="editorial-header">
          <h2 className="editorial-title">
            HARNESSING NASA DATA TO<br />
            <span className="blue-electric-text">PREVENT HEALTH RISKS.</span>
          </h2>
          <p className="editorial-lead">
            Outside Earth's magnetosphere and atmosphere, interplanetary spaceflight exposes astronaut crews to 
            continuous physical and biological hazards. BioTelemetry correlates real-time environmental telemetry 
            with baseline physiological limits to intercept health risks before irreversible damage occurs.
          </p>
        </div>

        {/* 4 Environmental Risk Mitigation Cards */}
        <div className="hazards-editorial-grid">
          <div className="hazard-entry">
            <div className="hazard-stat">Kp 0-9</div>
            <h3>1. Space Weather &amp; Solar Storms</h3>
            <p>
              Coronal mass ejections and severe geomagnetic disturbances generate intense proton flux storms. 
              Tracking space weather warning thresholds intercepts high-flux radiation before acute damage impacts 
              the spacecraft habitat.
            </p>
            <span className="hazard-annotation">SOLAR DISTURBANCES</span>
          </div>

          <div className="hazard-entry">
            <div className="hazard-stat">600 mSv</div>
            <h3>2. Galactic Cosmic Rays &amp; Ionizing Flux</h3>
            <p>
              Galactic Cosmic Rays (GCR) and Solar Particle Events (SPE) continuously penetrate spacecraft shielding, 
              driving cumulative cellular oxidative stress, genetic mutagenesis, and career dose ceiling risks.
            </p>
            <span className="hazard-annotation">RADIATION FIELD</span>
          </div>

          <div className="hazard-entry">
            <div className="hazard-stat">21% O2</div>
            <h3>3. Cabin Atmosphere &amp; Hypoxia Prevention</h3>
            <p>
              Sealed habitat life support systems remain vulnerable to ambient O2 partial pressure deviations, 
              toxic gas accumulation, and micro-depressurization, threatening rapid cognitive impairment if unmonitored.
            </p>
            <span className="hazard-annotation">ATMOSPHERIC SAFETY</span>
          </div>

          <div className="hazard-entry">
            <div className="hazard-stat">0G-SANS</div>
            <h3>4. Microgravity Fluid Redistribution</h3>
            <p>
              Chronic absence of gravitational load induces cephalic fluid shift, elevating intracranial and intraocular 
              pressures, triggering optic disc edema (SANS), cardiovascular deconditioning, and bone mineral atrophy.
            </p>
            <span className="hazard-annotation">PHYSIOLOGICAL DECONDITIONING</span>
          </div>
        </div>
      </section>

      {/* SECTION 3: Platform Capabilities */}
      <section id="capabilities" className="capabilities-editorial-section">
        <div className="section-meta">
          <span className="section-number">02</span>
          <span className="section-tag">OPERATIONAL CAPABILITIES</span>
        </div>

        <div className="editorial-header">
          <h2 className="editorial-title">
            FIVE DEDICATED WORKSPACE<br />
            <span className="blue-electric-text">CLINICAL MODULES.</span>
          </h2>
          <p className="editorial-lead">
            Each operational module within the BioTelemetry workstation is purpose-built to address specific medical 
            monitoring, diagnostic, and countermeasure requirements in deep space.
          </p>
        </div>

        <div className="three-features-columns">
          {/* Module 1: 3D Anatomy & ECG */}
          <div className="feature-col">
            <div className="col-num">01</div>
            <div className="col-icon text-cyan-400"><Activity className="h-6 w-6" /></div>
            <h3>Interactive 3D Anatomical Twin &amp; Live ECG</h3>
            <p>
              Interactive Three.js 3D human body model with orbital rotation and organ system inspection across 
              cardiovascular, neurological, musculoskeletal, metabolic, and immune domains, paired with a real-time 
              Lead-II ECG waveform canvas monitor.
            </p>
            <div className="feature-col-tag">3D Anatomy &amp; Electrophysiology</div>
            <button onClick={() => onEnterApp('dashboard')} className="feature-nav-btn">
              <span>Open 3D Dashboard</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Module 2: Check-In & Self-Exams */}
          <div className="feature-col">
            <div className="col-num">02</div>
            <div className="col-icon text-emerald-400"><ClipboardCheck className="h-6 w-6" /></div>
            <h3>Clinical Check-In &amp; Vision AI Self-Exams</h3>
            <p>
              Structured 3-step circadian wellness logging capturing sleep windows, mood, mental fatigue, and 0-10 
              pain scales with local auto-saving, alongside camera-guided visual self-exams for dermal radiation scoring 
              and ocular fundus assessments.
            </p>
            <div className="feature-col-tag">Clinical Wizard &amp; Vision AI</div>
            <button onClick={() => onEnterApp('checkin')} className="feature-nav-btn">
              <span>Open Check-In &amp; Exams</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Module 3: Health Trends & Analytics */}
          <div className="feature-col">
            <div className="col-num">03</div>
            <div className="col-icon text-blue-400"><BarChart3 className="h-6 w-6" /></div>
            <h3>Longitudinal Health Trends &amp; Analytics</h3>
            <p>
              High-resolution chronological time-series analytics visualizing heart rate, blood pressure, SpO2 blood 
              oxygen, body temperature, and cumulative radiation dose across 24-hour, 7-day, and 30-day mission filters.
            </p>
            <div className="feature-col-tag">Telemetry Analytics &amp; Trends</div>
            <button onClick={() => onEnterApp('analytics')} className="feature-nav-btn">
              <span>View Health Trends</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Module 4: Countermeasures & Protocols */}
          <div className="feature-col">
            <div className="col-num">04</div>
            <div className="col-icon text-amber-400"><Orbit className="h-6 w-6" /></div>
            <h3>Prescribed Space Countermeasures</h3>
            <p>
              Daily routine tracking and automated verification of 9 NASA-recommended countermeasures, including 
              ARED heavy resistive exercise, cycle ergometry, circadian light exposure, and operational readiness scoring.
            </p>
            <div className="feature-col-tag">Protocols &amp; Daily Compliance</div>
            <button onClick={() => onEnterApp('missions')} className="feature-nav-btn">
              <span>Open Countermeasures</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Module 5: Autonomous Voice AI Flight Surgeon */}
          <div className="feature-col">
            <div className="col-num">05</div>
            <div className="col-icon text-purple-400"><Sparkles className="h-6 w-6" /></div>
            <h3>Voice-Enabled AI Flight Surgeon</h3>
            <p>
              Autonomous clinical consultation using structured SBAR telemetry analysis, hands-free offline voice 
              dictation, and neural Edge TTS voice readouts to assist astronaut self-diagnosis without ground consultation.
            </p>
            <div className="feature-col-tag">Clinical Decision Support</div>
            <button onClick={() => onEnterApp('ai')} className="feature-nav-btn">
              <span>Consult AI Assistant</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* SECTION 4: Engineered Architecture & Frameworks */}
      <section id="architecture" className="architecture-editorial-section">
        <div className="section-meta">
          <span className="section-number">03</span>
          <span className="section-tag">SYSTEM ARCHITECTURE</span>
        </div>

        <div className="editorial-header">
          <h2 className="editorial-title">
            OFFLINE-FIRST HYBRID<br />
            <span className="blue-electric-text">SOFTWARE ARCHITECTURE.</span>
          </h2>
          <p className="editorial-lead">
            Engineered to withstand total communication blackouts, maintaining full clinical parity on-device 
            while providing transparent synchronization when orbital communications restore.
          </p>
        </div>

        {/* Horizontal Interconnected Architecture Pipeline */}
        <div className="system-flow-strip">
          <div className="flow-step">
            <Code2 className="h-5 w-5 text-cyan-400" />
            <div className="flow-text">
              <strong>FRONTEND CLIENT</strong>
              <span>React 18 + Vite PWA (Three.js WebGL)</span>
            </div>
          </div>
          <div className="flow-arrow"><ArrowRight className="flow-arrow-icon" /></div>

          <div className="flow-step">
            <Database className="h-5 w-5 text-emerald-400" />
            <div className="flow-text">
              <strong>LOCAL PERSISTENCE</strong>
              <span>IndexedDB (Dexie.js Transactional)</span>
            </div>
          </div>
          <div className="flow-arrow"><ArrowRight className="flow-arrow-icon" /></div>

          <div className="flow-step">
            <Workflow className="h-5 w-5 text-purple-400" />
            <div className="flow-text">
              <strong>BACKEND API GATEWAY</strong>
              <span>Python FastAPI / Serverless</span>
            </div>
          </div>
          <div className="flow-arrow"><ArrowRight className="flow-arrow-icon" /></div>

          <div className="flow-step">
            <Layers className="h-5 w-5 text-amber-400" />
            <div className="flow-text">
              <strong>CLOUD TELEMETRY</strong>
              <span>Supabase PostgreSQL (RLS)</span>
            </div>
          </div>
        </div>

        {/* 4 Engineering Principles */}
        <div className="pillars-grid">
          <div className="pillar-block">
            <h4>1. Client-Side Edge Runtime</h4>
            <p>Pure in-browser PWA execution with WebGL rendering and web worker threads, enabling continuous telemetry ingestion and diagnostic rule evaluation with zero server round-trip latency.</p>
          </div>
          <div className="pillar-block">
            <h4>2. ACID Local Persistence</h4>
            <p>Transactional IndexedDB storage schema (<code>SpaceBiotelemetryDB</code> via Dexie.js) providing atomic read/write isolation, schema migrations, and structured indexing per astronaut profile during complete offline isolation.</p>
          </div>
          <div className="pillar-block">
            <h4>3. Idempotent Ground Synchronization</h4>
            <p>Optimistic offline queuing with exponential backoff and replay semantics, safely synchronizing buffered mission logs with Supabase PostgreSQL via Row Level Security (RLS) upon orbital occultation recovery.</p>
          </div>
          <div className="pillar-block">
            <h4>4. Hybrid Microservice &amp; Inference Gateway</h4>
            <p>Modular Python FastAPI backend orchestration supporting high-throughput telemetry simulation, Edge TTS audio generation, and multimodal AI endpoints while maintaining client fallback autonomy.</p>
          </div>
        </div>
      </section>

      {/* SECTION 5: NASA Scientific Foundation */}
      <section id="science" className="science-section">
        <div className="section-meta">
          <span className="section-number">04</span>
          <span className="section-tag">OPEN SCIENCE FOUNDATION</span>
        </div>

        <div className="editorial-header">
          <h2 className="editorial-title">
            GROUNDED IN NASA STANDARDS<br />
            <span className="blue-electric-text">&amp; OPEN DATA.</span>
          </h2>
          <p className="editorial-lead">
            Every clinical threshold, physiological baseline, risk algorithm, and countermeasure schedule in 
            BioTelemetry is anchored in official NASA aerospace standards and peer-reviewed open science repositories.
          </p>
        </div>

        <div className="research-badges-flow">
          <div className="research-badge">
            <span className="badge-abbr">OSDR</span>
            <div>
              <strong>NASA Open Science Data Repository</strong>
              <p>Transcriptomic and biological omics repositories (including OSD-575 immune dysregulation data) validating leukocyte suppression and spaceflight cellular stress markers.</p>
            </div>
          </div>

          <div className="research-badge">
            <span className="badge-abbr">RadLab</span>
            <div>
              <strong>NASA RadLab Space Radiation Portal</strong>
              <p>Calibrated dosimeter measurements from ISS expeditions and interplanetary robotic missions establishing baseline Galactic Cosmic Ray flux and ionizing radiation models.</p>
            </div>
          </div>

          <div className="research-badge">
            <span className="badge-abbr">STD-3001</span>
            <div>
              <strong>NASA-STD-3001 Technical Medical Standards</strong>
              <p>NASA Space Flight Human-System Standards specifying allowable physiological deviations, emergency triage alert thresholds, and clinical environmental limits.</p>
            </div>
          </div>

          <div className="research-badge">
            <span className="badge-abbr">HRP</span>
            <div>
              <strong>NASA Human Research Program Evidence Base</strong>
              <p>Evidence-based clinical risk taxonomy and longitudinal astronaut health studies defining countermeasure efficacy, exercise prescriptions, and fluid shift protocols.</p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 6: Team BioTelemetry */}
      <section id="team" className="team-editorial-section">
        <div className="section-meta">
          <span className="section-number">05</span>
          <span className="section-tag">THE COLLABORATORS</span>
        </div>

        <div className="editorial-header">
          <h2 className="editorial-title">
            THE PEOPLE BEHIND<br />
            <span className="blue-electric-text">THE MISSION.</span>
          </h2>
          <p className="editorial-lead">
            Team <strong>BioTelemetry</strong> united for the NASA International Space Apps Challenge 2026 to engineer deep space health autonomy.
          </p>
        </div>

        <div className="team-profiles-row">
          <a
            href="https://github.com/jmprz"
            target="_blank"
            rel="noopener noreferrer"
            className="profile-card"
            title="View John Matthew Perez on GitHub"
          >
            <div className="profile-avatar-wrap ring-cyan">
              <img src="/team/perez.jpg" alt="John Matthew Perez" className="profile-avatar-img" />
            </div>
            <div className="profile-name">John Matthew Perez</div>
            <div className="profile-handle">
              <span>@jmprz</span>
              <ExternalLink className="h-3 w-3 inline ml-1 opacity-70" aria-hidden="true" />
            </div>
            <div className="profile-role">Frontend Developer & UI/UX Dev</div>
          </a>

          <a
            href="https://github.com/trishtanroxas"
            target="_blank"
            rel="noopener noreferrer"
            className="profile-card"
            title="View Trishtan Alexis Roxas on GitHub"
          >
            <div className="profile-avatar-wrap ring-purple">
              <img src="/team/roxas.jpg" alt="Trishtan Alexis Roxas" className="profile-avatar-img" />
            </div>
            <div className="profile-name">Trishtan Alexis Roxas</div>
            <div className="profile-handle">
              <span>@trishtanroxas</span>
              <ExternalLink className="h-3 w-3 inline ml-1 opacity-70" aria-hidden="true" />
            </div>
            <div className="profile-role">Full-Stack Developer & Creative Technologist</div>
          </a>

          <a
            href="https://github.com/jomudesu"
            target="_blank"
            rel="noopener noreferrer"
            className="profile-card"
            title="View Joem Manuel M. Balaguer on GitHub"
          >
            <div className="profile-avatar-wrap ring-emerald">
              <img src="/team/balaguer.jpg" alt="Joem Manuel M. Balaguer" className="profile-avatar-img" />
            </div>
            <div className="profile-name">Joem Manuel M. Balaguer</div>
            <div className="profile-handle">
              <span>@jomudesu</span>
              <ExternalLink className="h-3 w-3 inline ml-1 opacity-70" aria-hidden="true" />
            </div>
            <div className="profile-role">Full-Stack Developer</div>
          </a>

          <a
            href="https://github.com/rencelibrando"
            target="_blank"
            rel="noopener noreferrer"
            className="profile-card"
            title="View Clarence Librando on GitHub"
          >
            <div className="profile-avatar-wrap ring-blue">
              <img src="/team/librando.jpg" alt="Clarence Librando" className="profile-avatar-img" />
            </div>
            <div className="profile-name">Clarence Librando</div>
            <div className="profile-handle">
              <span>@rencelibrando</span>
              <ExternalLink className="h-3 w-3 inline ml-1 opacity-70" aria-hidden="true" />
            </div>
            <div className="profile-role">Backend Developer, Data Analysis & CI/CD Automation</div>
          </a>

          <a
            href="https://github.com/rjregero03"
            target="_blank"
            rel="noopener noreferrer"
            className="profile-card"
            title="View Renejule Regero on GitHub"
          >
            <div className="profile-avatar-wrap ring-amber">
              <img src="/team/regero.jpg" alt="Renejule Regero" className="profile-avatar-img" />
            </div>
            <div className="profile-name">Renejule Regero</div>
            <div className="profile-handle">
              <span>@rjregero03</span>
              <ExternalLink className="h-3 w-3 inline ml-1 opacity-70" aria-hidden="true" />
            </div>
            <div className="profile-role">Full-Stack Developer</div>
          </a>
        </div>
      </section>

      {/* SECTION 7: Final Call to Action */}
      <section className="final-cta-section">
        <div className="final-cta-inner">
          <div className="cta-icon-wrap">
            <Compass className="h-8 w-8 text-cyan-400 animate-spin-slow" />
          </div>
          <h2 className="cta-title">
            THE FUTURE OF SPACE HEALTH<br />
            <span className="blue-electric-text">IS AUTONOMOUS.</span>
          </h2>
          <p className="cta-text">
            Because when humanity ventures farther into space, the ability to protect human life must travel with us.
          </p>
          <div className="cta-buttons">
            <button onClick={() => onEnterApp()} className="btn-launch-large">
              <span>Launch Mission Dashboard</span>
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </section>

      {/* SECTION 8: Master Footer */}
      <footer className="master-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <button 
              onClick={() => onEnterApp()} 
              className="footer-logo-btn"
              title="Launch Dashboard"
            >
              <div className="brand-lockup">
                <div className="brand-mark">
                  <img 
                    src={biotelemetryMark} 
                    alt="BioTelemetry Icon" 
                    className="nav-icon-img"
                    draggable={false}
                  />
                </div>
                <div className="brand-text">
                  <strong className="brand-title">Bio<span>Telemetry</span></strong>
                  <small className="brand-tagline">HUMAN HEALTH. BEYOND EARTH.</small>
                </div>
              </div>
            </button>
          </div>

          <div className="footer-links">
            <a href="#overview">Overview</a>
            <a href="#problem">The Mission</a>
            <a href="#capabilities">Capabilities</a>
            <a href="#architecture">Architecture</a>
            <a href="#science">NASA Science</a>
            <a href="#team">Team</a>
          </div>

          <div className="footer-meta">
            <span>NASA Space Apps Challenge 2026</span>
            <span>Developed by Team <strong>BioTelemetry</strong></span>
          </div>
        </div>
      </footer>

      
    </div>
  );
};
