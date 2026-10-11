# DocuNova Backend Startup Script
# Usage: .\start_backend.ps1

$env:PYTHONPATH = "$PSScriptRoot\backend"

Write-Host "Starting DocuNova backend on http://localhost:8000 ..." -ForegroundColor Cyan

& "$PSScriptRoot\venv\Scripts\python.exe" -m uvicorn api.fastapi_app:app --host 0.0.0.0 --port 8000 --reload
