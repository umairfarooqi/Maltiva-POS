@echo off
cd /d "%~dp0"

if not exist node_modules (
    call npm install
)

if not exist dist-server\server.cjs (
    call npm run build:electron
)

set NODE_ENV=production
start /min "Maltiva POS Server" node dist-server/server.cjs
timeout /t 3 /nobreak >nul
start "" msedge --app=http://127.0.0.1:3000
