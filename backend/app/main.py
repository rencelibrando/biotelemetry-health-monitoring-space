from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum

from backend.app.core.config import settings
from backend.app.routes import astronauts, telemetry, alerts, diagnostics

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Space Biotelemetry & Astronaut Health Monitoring Serverless API (NASA Space Apps Challenge)",
    docs_url="/docs",
    openapi_url="/openapi.json"
)

# Enable CORS for PWA and local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Routes
app.include_router(astronauts.router, prefix=settings.API_V1_STR)
app.include_router(telemetry.router, prefix=settings.API_V1_STR)
app.include_router(alerts.router, prefix=settings.API_V1_STR)
app.include_router(diagnostics.router, prefix=settings.API_V1_STR)

@app.get("/")
def root():
    return {
        "status": "ONLINE",
        "system": "Biotelemetry Health Monitoring - Space Edge Node",
        "version": settings.VERSION,
        "docs": "/docs"
    }

# Vercel / AWS Lambda Serverless Handler
handler = Mangum(app)

