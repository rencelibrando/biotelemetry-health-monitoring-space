# 🚀 NASA Space Apps Challenge: Astronaut Biotelemetry & Health Monitoring Space

> An ultra-lightweight, offline-first **Progressive Web App (PWA)** and **Serverless FastAPI** monitoring platform for real-time astronaut biometrics during spaceflight and Extravehicular Activity (EVA).

---

## 🛰️ Key Features

- **⚡ 60 FPS Real-time ECG Waveform:** Hardware-accelerated HTML5 `<canvas>` rendering of single-lead (Lead II) P-Q-R-S-T electrocardiogram signals without React re-render lag.
- **📡 Loss of Signal (LOS) / Offline PWA:** Automatic IndexedDB buffering using `Dexie.js` and Service Workers (`vite-plugin-pwa`) when the spacecraft loses communication with Earth.
- **🔄 Auto-Sync Queue:** Automatically packages queued telemetry into a batch REST payload (`POST /api/v1/telemetry/sync-batch`) to reconcile with Supabase when communication is re-established.
- **🚨 Automated Health Anomaly Detection:** Real-time algorithmic triage for Hypoxia ($SpO_2 < 90\%$), Tachycardia/Bradycardia, Heat Stress, and Solar Particle Event (Radiation Spikes).
- **♿ Spaceflight Accessibility (WCAG 2.1):**
  - **Color-Blind Safe:** Status badges pair distinct icons with text labels (`NORMAL`, `WARNING`, `CRITICAL`).
  - **Screen Reader Support:** `aria-live="assertive"` on critical medical alarms.
  - **Synthesized Audio Alarms:** Web Audio API sound alerts for off-screen warnings.
  - **High-Contrast Mode:** One-click toggle for readability through astronaut helmet visors.
  - **Keyboard Hotkeys:** `Space` to acknowledge alarms, `1`-`3` to hot-swap active astronaut.
- **☁️ Cloud & Serverless Ready:**
  - **Frontend:** React + Vite + TypeScript PWA (Deployable on Vercel / Netlify / Cloudflare Pages).
  - **Backend:** FastAPI with Mangum adapter for Vercel Python Serverless Functions (`api/index.py`).
  - **Database:** Supabase PostgreSQL with real-time replication.

---

## 🛠️ Project Architecture

```
biotelemetry-health-monitoring-space/
├── api/
│   └── index.py               # Vercel serverless Python entrypoint
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI entry & CORS
│   │   ├── core/              # Config & Supabase client
│   │   ├── routes/            # REST API (astronauts, telemetry, alerts, diagnostics)
│   │   ├── schemas/           # Pydantic data models
│   │   └── services/          # Biometric simulation & anomaly analyzer
│   ├── requirements.txt
│   ├── run.py                 # Local server runner
│   └── supabase_schema.sql    # Ready-to-paste PostgreSQL schema
│
├── frontend/
│   ├── src/
│   │   ├── components/        # ECGMonitor, VitalCards, AlertBanner, CrewSelector
│   │   ├── db/localDb.ts      # IndexedDB offline buffer (Dexie.js)
│   │   ├── services/          # REST client & Web Audio API
│   │   └── App.tsx            # Main mission dashboard layout
│   ├── vite.config.ts         # PWA Service Worker & proxy config
│   └── package.json
│
└── vercel.json                # Vercel Serverless routing configuration
```

---

## 💻 Quickstart (Run Locally)

### 1. Start the Backend API (FastAPI)
```bash
# In the project root
python -m venv venv
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
# source venv/bin/activate

pip install -r backend/requirements.txt
python backend/run.py
```
* API Server will start at: `http://localhost:8000`
* Interactive Swagger Docs: `http://localhost:8000/docs`

---

### 2. Start the Frontend PWA (React + Vite)
```bash
cd frontend
npm install
npm run dev
```
* PWA will be live at: `http://localhost:5173`

---

## 🗄️ Setting Up Supabase (Optional for Cloud Sync)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** in your Supabase dashboard.
3. Copy and paste the contents of `backend/supabase_schema.sql` and run it.
4. Copy your **Project URL** and **Anon Key** into `.env`:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your-anon-key
   ```
*(Note: If you run without Supabase credentials, the backend automatically runs in graceful in-memory mode so everything works immediately).*

