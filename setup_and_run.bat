@echo off
echo 🚀 Miila Setup and Launch Script
echo ================================
echo.

echo [SETUP] Installing backend dependencies...
pip install -r backend_requirements.txt
if %errorlevel% neq 0 (
    echo ❌ Backend setup failed!
    pause
    exit /b 1
)

echo [SETUP] Installing frontend dependencies...
cd frontend
call npm install
if %errorlevel% neq 0 (
    echo ❌ Frontend setup failed!
    pause
    exit /b 1
)
cd ..

echo.
echo ✅ Setup complete! Starting servers...
echo.

echo [1/2] Starting Backend API Server...
start "Miila Backend" cmd /k "python backend_api.py"
timeout /t 5 /nobreak >nul

echo [2/2] Starting Frontend React App...
start "Miila Frontend" cmd /k "cd frontend && npm start"

echo.
echo 🎉 Miila is starting up!
echo 🌐 Frontend: http://localhost:3000
echo 🔌 Backend:  http://localhost:8000
echo.
echo Your browser should open automatically in a few seconds...
echo Press any key to close this launcher...
pause >nul
