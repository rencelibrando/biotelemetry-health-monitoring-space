import uvicorn
import os
import sys

# Ensure root directory is on the path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

if __name__ == "__main__":
    print("🚀 Starting Space Biotelemetry Server on http://localhost:8000")
    print("📖 Interactive API Docs available at http://localhost:8000/docs")
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)

