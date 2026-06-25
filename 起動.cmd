@echo off
setlocal
cd /d "%~dp0"
set "PORT=8080"

where node >nul 2>nul
if %errorlevel%==0 (
  node server.js %PORT%
  goto :eof
)

start "" "http://127.0.0.1:%PORT%/"
python -m http.server %PORT% --bind 127.0.0.1 2>nul
if errorlevel 1 py -m http.server %PORT% --bind 127.0.0.1
if errorlevel 1 (
  echo.
  echo Could not start the local server. Please install Node.js or Python.
  pause
)
