@echo off
echo Starting SceneSynth Development Servers...
echo.

REM Start Flask backend on port 5328
start cmd /k "cd /d %~dp0 && call venv\Scripts\activate && set FLASK_APP=api/generate.py && set FLASK_ENV=development && python -m flask run --port 5328"

REM Wait a moment for Flask to start
timeout /t 2 /nobreak >nul

REM Start Vite frontend
echo Starting Vite frontend...
npm run dev
