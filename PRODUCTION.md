# BioTelemetry Production Architecture & 3D Anatomical Model Reference

This document serves as the technical and operational reference for the production deployment of BioTelemetry on `rence-branch`.

---

## 1. Production Deployment Overview

- **Production URL**: https://biotelemetry-space-rence.vercel.app
- **Swagger API Docs**: https://biotelemetry-space-rence.vercel.app/docs
- **Vercel Project**: `biotelemetry-space-rence`
- **Owner Scope**: `civilex` (Account: `rencelibrando`)
- **Connected Git Repository**: `https://github.com/rencelibrando/biotelemetry-health-monitoring-space`
- **Target Branch**: `rence-branch`
- **Architecture**: Next.js-compatible Vite PWA Frontend + FastAPI Serverless Python Backend

---

## 2. 3D Astronaut Anatomical Model Architecture

The 3D interactive anatomical model is implemented in `frontend/src/components/BodyAnatomy3D.tsx` and dynamically loaded inside `frontend/src/components/BodyHealthMap.tsx`.

### Core Rendering Pipeline
- **Engine**: Three.js (`three` + `OrbitControls`).
- **Shader Pipeline**:
  - `HOLOGRAM_VERTEX_SHADER`: Calculates view-space normal matrix, view position, and object-space Y elevation.
  - `HOLOGRAM_FRAGMENT_SHADER`: Evaluates view angle Fresnel rim lighting, animated scanline banding, and dual-tone sci-fi cyan/navy shading.
- **Mesh Synthesis**:
  - `buildLoftedMesh`: Generates continuous procedural anatomy slices for cranium, neck, torso, abdomen, and pelvis with bilateral ribcage and spinal sculpting.
  - `buildCurveLimbMesh`: Constructs smooth Catmull-Rom tubular limbs using rotation-minimizing Bishop frames to avoid inflection twisting across joints.
  - `createMultidimensionalBackdrop`: Generates multi-depth radial floor grids, orientation axes, and dynamic elevation rings.

### Anatomical Systems & 3D Local Centroids
Hotspot pins dynamically map to 3D internal coordinates in object space (`anatomyGroup`):

| Body System ID | Organ / Clinical Target | 3D Anchor Coordinate (X, Y, Z) | Status Hex Color |
|---|---|---|---|
| `neuro_ocular` | Brain & Ocular Sheath (SANS) | `(0.000, 0.745, 0.022)` | Cyan (`0x67e8f9`) |
| `cardiovascular` | Heart & Aorta | `(0.024, 0.368, 0.024)` | Rose (`0xf43f5e`) |
| `respiratory` | Lungs & Bronchial Trachea | `(-0.074, 0.392, 0.008)` | Sky Blue (`0x38bdf8`) |
| `metabolic` | Liver, Stomach & Visceral GI | `(0.028, 0.195, 0.028)` | Orange (`0xfb923c`) |
| `musculoskeletal` | Lumbar Spine & Femoral Quads | `(-0.108, -0.235, 0.010)` | Blue (`0x60a5fa`) |
| `dermal_immune` | Forearm Band & Lymph Nodes | `(-0.312, 0.005, 0.012)` | Teal (`0x2dd4bf`) |

### Screen-Space Pin Projection
Hotspot pins are HTML DOM elements (`button.body-pin`) overlaid on the Three.js canvas:
1. Every animation frame, the anchor vector is transformed into world coordinates:
   `projVec.copy(meta.anchorLocal).applyMatrix4(anatomyGroup.matrixWorld)`
2. The world vector is projected into normalized device coordinates (NDC):
   `projVec.project(camera)`
3. Percentage coordinates are applied to the element style:
   `xPct = (projVec.x * 0.5 + 0.5) * 100`
   `yPct = (-projVec.y * 0.5 + 0.5) * 100`
4. Back-facing and frustum-culled pins are detected via camera line-of-sight dot product:
   `cameraSideDot = -(bodyToPin.x * camDir.x + bodyToPin.z * camDir.z)`
   Pins outside view frustum are hidden (`opacity: 0`, `pointer-events: none`).

### Camera & OrbitControls Configuration
- **Perspective Camera**: FOV 36 deg, initial position `(0.72, 0.24, 3.68)`.
- **Target Height**: Default target centered at `(0, -0.02, 0)`.
- **Polar Angle Range**: Clamped between `1.10` and `1.75` radians to prevent figure inversion.
- **Screen-Space Panning**: Panning shifts camera position and controls target using camera Right and Up vectors (`applyCanvasPan`), preserving symmetric camera view.
- **Bundle Optimization**: `BodyAnatomy3D` bundles Three.js and OrbitControls into a single unified lazy chunk (`BodyAnatomy3D-*.js`), preventing nested dynamic import waterfalls.

---

## 3. Speech Synthesis & AI Voice Assistant Architecture

Speech synthesis is orchestrated by `frontend/src/services/voiceAssistant.ts` and backed by `backend/app/services/assistant_service.py` via `/api/v1/assistant/tts`.

### Multi-Tier Fallback Hierarchy
1. **Tier 1 (Server Edge TTS)**: Synthesizes high-fidelity neural voice (`en-US-AvaNeural`) using `edge-tts`.
2. **Tier 2 (Server Gemini TTS)**: When cloud datacenter IPs face Microsoft 403 blocks, the server automatically fails over to Gemini audio synthesis (`GEMINI_TTS_ENABLED=true`).
3. **Tier 3 (Local Browser Web Speech API)**: If server synthesis is unreachable, the client falls back to device speech synthesis (`window.speechSynthesis`), preferring natural voices and falling back to local system voices.

---

## 4. Fullstack Vercel Serverless Runtime Configuration

### Vercel Configuration (`vercel.json`)
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "version": 2,
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/static-build",
      "config": {
        "distDir": "frontend/dist"
      }
    },
    {
      "src": "serverless/index.py",
      "use": "@vercel/python"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/serverless/index.py"
    },
    {
      "src": "/(docs|openapi.json)",
      "dest": "/serverless/index.py"
    },
    {
      "handle": "filesystem"
    },
    {
      "src": "/(.*)",
      "dest": "/index.html"
    }
  ]
}
```

### Python Dependencies (`pyproject.toml`)
Vercel uses `uv` for python builds. All dependencies must be listed in `pyproject.toml`:
```toml
[project]
name = "biotelemetry-health-monitoring-space"
version = "1.0.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.110.0",
    "uvicorn[standard]>=0.29.0",
    "pydantic>=2.6.0",
    "supabase>=2.4.0",
    "numpy>=1.26.0",
    "mangum>=0.17.0",
    "python-dotenv>=1.0.1",
    "httpx>=0.27.0",
    "edge-tts>=7.3.0",
]

[tool.vercel]
entrypoint = "serverless.index:app"
```

### Environment Variables Matrix

| Variable Name | Environment | Purpose |
|---|---|---|
| `SUPABASE_URL` | Production / Preview | Supabase project API URL |
| `SUPABASE_KEY` | Production / Preview | Supabase service or anon key |
| `VITE_SUPABASE_URL` | Production / Preview | Frontend Supabase client URL |
| `VITE_SUPABASE_ANON_KEY` | Production / Preview | Frontend anon public key |
| `NASA_API_KEY` | Production / Preview | NASA Open API / DONKI access |
| `GEMINI_API_KEY` | Production / Preview | Google Gemini API key |
| `GEMINI_MODEL` | Production / Preview | `gemini-3.5-flash-lite` |
| `GEMINI_TTS_ENABLED` | Production / Preview | Set to `true` for cloud neural audio fallback |
| `EDGE_TTS_ENABLED` | Production / Preview | Set to `true` for default Edge speech |
| `EDGE_TTS_VOICE` | Production / Preview | `en-US-AvaNeural` |
| `TTS_PREFER_LOCAL` | Production / Preview | `false` |
| `ENVIRONMENT` | Production / Preview | `production` |

---

## 5. Branch Management & Synchronization Strategy

### Tracked Branches and Remotes
- **Local working branch**: `rence-branch`
- **Fork remote (`myfork`)**: `https://github.com/rencelibrando/biotelemetry-health-monitoring-space.git`
- **Upstream remote (`origin`)**: `https://github.com/trishtanroxas/biotelemetry-health-monitoring-space.git`

### Rules Before Switching Branches
1. Always verify the working tree is clean: `git status`.
2. Do not merge foreign branches (`feature/tan-branch`, `master`) directly into `rence-branch`. If a merge occurs, restore clean history by resetting to the stable commit and force-pushing.
3. Verification checklist before pushing:
   - Run unit tests: `npm --prefix frontend test` (must pass 72/72 tests).
   - Run production build: `npm --prefix frontend run build` (must exit code 0).
   - Validate Vercel deployment: `npx vercel deploy --prod --yes`.
