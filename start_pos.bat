@echo off
cd /d "%~dp0"

echo [1/3] Closing any previous POS server...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do taskkill /f /pid %%a >nul 2>&1

echo [2/3] Starting Maltiva POS Server...
start /min "Maltiva POS Server" npm run dev

echo [3/3] Waiting for server to become ready...
:WAIT_LOOP
timeout /t 1 /nobreak >nul
curl -s http://127.0.0.1:3000/api/health >nul 2>&1
if errorlevel 1 (
    goto WAIT_LOOP
)

echo Server is ready! Launching App Window...
start "" msedge --app=http://127.0.0.1:3000
