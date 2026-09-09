@echo off
setlocal
cd /d "%~dp0"
set PORT=8080
start "" "http://127.0.0.1:%PORT%/"
python -m http.server %PORT% --bind 127.0.0.1 2>nul
if errorlevel 1 py -m http.server %PORT% --bind 127.0.0.1
