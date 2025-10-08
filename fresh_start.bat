@echo off
setlocal
echo === Miila Fresh Start ===
echo This will stop old servers, install deps, and start backend+frontend.

REM Stop anything on our ports
call "%~dp0stop_all.bat"

REM Install backend deps
echo [BACKEND] Installing dependencies...
pip install -r "%~dp0backend_requirements.txt"
if %errorlevel% neq 0 goto :fail

REM Install frontend deps
echo [FRONTEND] Installing dependencies...
pushd "%~dp0frontend"
call npm install --no-fund --no-audit
if %errorlevel% neq 0 goto :fail
popd

REM Start backend
echo [START] Backend on :8000
start "Miila Backend" cmd /k "cd /d %~dp0 && set PYTHONDONTWRITEBYTECODE=1 && python -m uvicorn backend_api:app --host 0.0.0.0 --port 8000 --reload"
timeout /t 5 /nobreak >nul

REM Start frontend
echo [START] Frontend on :3000
start "Miila Frontend" cmd /k "cd /d %~dp0frontend && npm start"

echo === Done. Open http://localhost:3000 ===
exit /b 0

:fail
echo ❌ Fresh start failed. Check the logs above.
exit /b 1


