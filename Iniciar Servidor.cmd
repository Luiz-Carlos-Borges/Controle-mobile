@echo off
cd /d "%~dp0"
if not defined CONTROL_ADMIN_TOKEN (
  echo Defina CONTROL_ADMIN_TOKEN antes de iniciar. Consulte README.md.
  pause
  exit /b 1
)
py server\server.py
pause
