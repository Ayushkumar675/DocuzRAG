# DocuNova Frontend Startup Script
# Usage: .\start_frontend.ps1

Write-Host "Starting DocuNova frontend on http://localhost:3000 ..." -ForegroundColor Cyan

Set-Location "$PSScriptRoot\frontend"
& ".\node_modules\.bin\next.cmd" dev
