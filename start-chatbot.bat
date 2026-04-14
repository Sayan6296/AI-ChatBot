@echo off
setlocal

set "ROOT=%~dp0"
set "PYTHON_EXE=%ROOT%.venv\Scripts\python.exe"
set "APP_HOST=localhost"

if not exist "%PYTHON_EXE%" (
  set "PYTHON_EXE=python"
)

for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$config = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1; if ($config) { $config.IPv4Address.IPAddress }"`) do set "APP_HOST=%%I"

echo Phone link: http://%APP_HOST%:5173
echo Backend is proxied through: http://%APP_HOST%:5173/api/health

start "Chatbot Backend" /D "%ROOT%backend" cmd /k ""%PYTHON_EXE%" server.py"
start "Chatbot Frontend" /D "%ROOT%frontend" cmd /k "npm run dev -- --host 0.0.0.0 --port 5173 --strictPort"

timeout /t 3 /nobreak >nul
start "" "http://%APP_HOST%:5173"

endlocal
