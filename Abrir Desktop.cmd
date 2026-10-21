@echo off
cd /d "%~dp0"
if exist "dist\ControleMobile\ControleMobile.exe" (
  start "" "dist\ControleMobile\ControleMobile.exe"
  exit /b 0
)
py desktop\app.py
pause
