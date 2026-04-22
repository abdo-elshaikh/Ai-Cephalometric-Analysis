@echo off
SETLOCAL EnableDelayedExpansion
TITLE AI Cephalometric Analysis System - Launcher
echo ================================================
echo   AI Cephalometric Analysis System Launcher
echo ================================================

:: 1. Check if Docker is running
echo [1/4] Checking Infrastructure (Docker)...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] ERROR: Docker is not running or not accessible.
    echo Please start Docker Desktop and try again.
    pause
    exit /b
)
docker compose up postgres redis -d

:: 2. Check AI Service
echo [2/4] Checking AI Microservice...
if not exist "ai_service\.venv\" (
    echo [!] .venv not found. Creating virtual environment...
    python -m venv ai_service\.venv
)

:: Check for torch (avoiding parentheses in echo inside IF blocks)
ai_service\.venv\Scripts\python.exe -c "import torch" 2>nul
if %errorlevel% neq 0 (
    echo [!] Dependencies missing. Installing AI requirements...
    cd ai_service
    call .venv\Scripts\activate
    pip install -r requirements.txt
    cd ..
)

echo 🤖 Starting AI Microservice in new window...
start "AI Microservice" /D "ai_service" cmd /k ".\.venv\Scripts\activate && python main.py"

:: 3. Check Frontend
echo [3/4] Checking Frontend...
if not exist "frontend\node_modules\" (
    echo [!] node_modules missing. Running npm install...
    cd frontend
    call npm install
    cd ..
)

echo 🌐 Starting Frontend in new window...
start "Frontend" /D "frontend" cmd /k "npm run dev"

:: 4. Start Backend
echo [4/4] Starting Backend API...
start "Backend API" /D "backend\CephAnalysis.API" cmd /k "dotnet run"

echo.
echo ✅ ALL SERVICES ARE STARTING!
echo ------------------------------------------------
echo Frontend: http://localhost:5000
echo Backend API: http://localhost:5000/swagger
echo AI Service: http://localhost:8000/docs
echo ------------------------------------------------
echo (Keep this window open to see launcher logs, or close it if done.)
pause
