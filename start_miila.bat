@echo off
echo Starting Miila Application...
echo.

echo [1/2] Starting Backend API Server...
start "Miila Backend" cmd /k "python backend_api.py"
timeout /t 3 /nobreak >nul

echo [2/2] Starting Frontend React App...
start "Miila Frontend" cmd /k "cd frontend && npm start"

echo.
echo ✅ Both servers starting...
echo 🌐 Frontend: http://localhost:3000
echo 🔌 Backend:  http://localhost:8000
echo.
echo Press any key to close this launcher...
pause >nul
