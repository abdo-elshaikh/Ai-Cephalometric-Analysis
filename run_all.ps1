# Run all services for AI Cephalometric Analysis System
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   AI Cephalometric Analysis System Launcher" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

# 1. Check if Docker is running
Write-Host "[1/4] Checking Infrastructure (Docker)..." -ForegroundColor Yellow
& docker info >$null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] ERROR: Docker is not running or not accessible." -ForegroundColor Red
    Write-Host "Please start Docker Desktop and try again." -ForegroundColor Red
    pause
    exit
}
docker compose up postgres redis -d

# 2. Check AI Service
Write-Host "[2/4] Checking AI Microservice..." -ForegroundColor Yellow
if (-not (Test-Path "ai_service\.venv")) {
    Write-Host "[!] .venv not found. Creating..." -ForegroundColor Magenta
    python -m venv ai_service\.venv
}

# Check for torch
$torchCheck = & "ai_service\.venv\Scripts\python.exe" -c "import torch" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] Dependencies missing. Installing AI requirements..." -ForegroundColor Magenta
    Set-Location "ai_service"
    & ".\.venv\Scripts\pip.exe" install -r requirements.txt
    Set-Location ".."
}

Write-Host "🤖 Starting AI Microservice..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd ai_service; .\.venv\Scripts\activate; python main.py" -WindowStyle Normal

# 3. Check Frontend
Write-Host "[3/4] Checking Frontend..." -ForegroundColor Yellow
if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "[!] node_modules missing. Running npm install..." -ForegroundColor Magenta
    Set-Location "frontend"
    npm install
    Set-Location ".."
}

Write-Host "🌐 Starting Frontend..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev" -WindowStyle Normal

# 4. Start Backend
Write-Host "[4/4] Starting Backend API..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend\CephAnalysis.API; dotnet run" -WindowStyle Normal

Write-Host "`n✅ ALL SERVICES ARE STARTING!" -ForegroundColor Green
Write-Host "------------------------------------------------"
Write-Host "Frontend: http://localhost:5173"
Write-Host "Backend API: http://localhost:5000/swagger"
Write-Host "AI Service: http://localhost:8000/docs"
Write-Host "------------------------------------------------"
