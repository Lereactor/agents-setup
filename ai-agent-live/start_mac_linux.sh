#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "=== AI Agent Live Visualization ==="
echo "Backend: http://127.0.0.1:8000  Frontend: http://127.0.0.1:5173"
echo

if [ ! -f backend/.env ]; then
    cp backend/.env.example backend/.env
    echo "Created backend/.env from .env.example (MOCK_MODE=true)"
fi

if [ ! -d frontend/node_modules ]; then
    echo "Installing frontend dependencies (first run only)..."
    (cd frontend && npm install)
fi

(cd backend && python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload) &
BACKEND_PID=$!
(cd frontend && npm run dev) &
FRONTEND_PID=$!

trap 'kill $BACKEND_PID $FRONTEND_PID 2>/dev/null' EXIT
wait
