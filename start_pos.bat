@echo off
cd /d "%~dp0"

echo Starting Maltiva POS from source. Installed tills should use the desktop shortcut.
call npm run electron:start
if errorlevel 1 echo Startup failed. Review the error above and the application logs.
