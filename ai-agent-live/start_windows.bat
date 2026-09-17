@echo off
setlocal

echo === AI Agent Live Visualization ===
echo Backend: http://127.0.0.1:8000  Frontend: http://127.0.0.1:5173
echo.

if not exist "backend\.env" (
    copy "backend\.env.example" "backend\.env" >nul
    echo Created backend\.env from .env.example - MOCK_MODE=true
)

if not exist "frontend\node_modules" (
    echo Installing frontend dependencies - first run only...
    pushd frontend
    call npm install
    popd
)

start "AI Agent Live - backend" cmd /k "cd backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"
start "AI Agent Live - frontend" cmd /k "cd frontend && npm run dev"

echo.
echo Backend and frontend started in separate windows. Close those windows to stop.
endlocal
