@echo off
setlocal EnableDelayedExpansion
rem Always run from this .bat's folder (relative paths break when launched from elsewhere).
cd /d "%~dp0"

echo === AI Agent Live Visualization ===
echo Backend: http://127.0.0.1:8000  Frontend: http://127.0.0.1:5173
echo.

rem --- Python ---------------------------------------------------------------
where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python not found in PATH. Install Python 3.11+ and retry.
    pause
    exit /b 1
)

rem --- Node.js --------------------------------------------------------------
rem Node may be a portable install in LOCALAPPDATA\nodejs\node-*, and Explorer
rem can hold a stale PATH without it - so look for it ourselves.
where npm >nul 2>nul
if errorlevel 1 (
    for /d %%D in ("%LOCALAPPDATA%\nodejs\node-*" "%ProgramFiles%\nodejs") do (
        if exist "%%~D\npm.cmd" set "NODE_DIR=%%~D"
    )
    if defined NODE_DIR (
        set "PATH=!NODE_DIR!;!PATH!"
        echo Using Node.js from !NODE_DIR!
    ) else (
        echo [ERROR] Node.js not found. Install Node 18+ from https://nodejs.org and retry.
        pause
        exit /b 1
    )
)

rem --- backend setup --------------------------------------------------------
if not exist "backend\.env" (
    copy "backend\.env.example" "backend\.env" >nul
    echo Created backend\.env from .env.example - MOCK_MODE=true
)

python -c "import fastapi, uvicorn, pydantic_settings, openai, dotenv" >nul 2>nul
if errorlevel 1 (
    echo Installing backend dependencies...
    python -m pip install -r backend\requirements.txt
    if errorlevel 1 (
        echo [ERROR] pip install failed - see output above.
        pause
        exit /b 1
    )
)

rem --- frontend setup -------------------------------------------------------
if not exist "frontend\node_modules\.bin\vite.cmd" (
    echo Installing frontend dependencies - first run only...
    pushd frontend
    call npm install
    popd
    if not exist "frontend\node_modules\.bin\vite.cmd" (
        echo [ERROR] npm install failed - see output above.
        pause
        exit /b 1
    )
)

rem Child windows inherit this script's PATH (including the Node dir found above).
start "AI Agent Live - backend" /D "%~dp0backend" cmd /k python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
start "AI Agent Live - frontend" /D "%~dp0frontend" cmd /k npm run dev

rem Open the UI as soon as the frontend answers (up to 60s), not after a fixed delay.
echo Waiting for frontend...
powershell -NoProfile -Command "$d=(Get-Date).AddSeconds(60); while((Get-Date) -lt $d){ try { Invoke-WebRequest http://127.0.0.1:5173 -UseBasicParsing -TimeoutSec 2 | Out-Null; break } catch { Start-Sleep -Milliseconds 300 } }"
start "" http://127.0.0.1:5173

echo.
echo Backend and frontend started in separate windows. Stop both: stop_windows.bat
endlocal
