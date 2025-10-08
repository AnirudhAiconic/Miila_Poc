@echo off
echo Stopping Miila servers...
setlocal

REM Optional brutal mode: stop ALL python/node processes
if /I "%~1"=="/ALL" goto brutal
if /I "%~1"=="-ALL" goto brutal

REM Kill anything bound to backend port :8000
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }" >nul 2>&1

REM Kill anything bound to frontend port :3000
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }" >nul 2>&1

REM Close windows started by our launchers (best-effort)
taskkill /FI "WINDOWTITLE eq Miila Backend*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Miila Frontend*" /F >nul 2>&1

REM Aggressively stop uvicorn/python processes that look like our backend
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { ($_.CommandLine -match 'uvicorn' -or $_.CommandLine -match 'backend_api:app' -or $_.CommandLine -match 'backend_api.py') -and ($_.ExecutablePath -match 'Miila') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1

REM Stop Node dev servers (react-scripts/webpack) related to our frontend
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'node.exe' -and ($_.CommandLine -match 'react-scripts' -or $_.CommandLine -match 'webpack') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1

echo Done. All known Miila servers were asked to stop.
exit /b 0

:brutal
echo BRUTAL mode: stopping ALL python/node dev servers for this user...
taskkill /IM python.exe /F >nul 2>&1
taskkill /IM uvicorn.exe /F >nul 2>&1
taskkill /IM node.exe /F >nul 2>&1
echo Done.
exit /b 0


