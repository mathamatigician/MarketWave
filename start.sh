#!/bin/bash

# Port definitions
EMULATOR_PORT=8080
BACKEND_PORT=8000
FRONTEND_PORT=5173

# Clean up or initialize PID file
> .globepulse.pids

check_port() {
  lsof -i:$1 -t -sTCP:LISTEN >/dev/null 2>&1
}

echo "============================================="
echo "🚀 Starting GlobePulse Platform Services..."
echo "============================================="

# 1. Start Firestore Emulator
if check_port $EMULATOR_PORT; then
  echo "⚠️  Port $EMULATOR_PORT is already in use. Skipping Firestore Emulator start."
else
  echo "Starting Firestore Emulator..."
  export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"
  npx -y firebase-tools@latest emulators:start --only firestore > firestore-emulator.log 2>&1 &
  EMULATOR_PID=$!
  echo "EMULATOR_PID=$EMULATOR_PID" >> .globepulse.pids
  echo "👉 Firestore Emulator started (PID: $EMULATOR_PID)"
fi

# 2. Start FastAPI Backend
if check_port $BACKEND_PORT; then
  echo "⚠️  Port $BACKEND_PORT is already in use. Skipping FastAPI Backend start."
else
  echo "Starting FastAPI Backend..."
  .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port $BACKEND_PORT --reload > backend.log 2>&1 &
  BACKEND_PID=$!
  echo "BACKEND_PID=$BACKEND_PID" >> .globepulse.pids
  echo "👉 FastAPI Backend started (PID: $BACKEND_PID)"
fi

# 3. Start Frontend Dev Server
if check_port $FRONTEND_PORT; then
  echo "⚠️  Port $FRONTEND_PORT is already in use. Skipping Frontend Dev Server start."
else
  echo "Starting Frontend Dev Server..."
  npm --prefix frontend run dev -- --port $FRONTEND_PORT > frontend.log 2>&1 &
  FRONTEND_PID=$!
  echo "FRONTEND_PID=$FRONTEND_PID" >> .globepulse.pids
  echo "👉 Frontend Dev Server started (PID: $FRONTEND_PID)"
fi

echo ""
echo "Waiting for services to initialize..."
for i in {1..6}; do
  if check_port $EMULATOR_PORT && check_port $BACKEND_PORT && check_port $FRONTEND_PORT; then
    break
  fi
  sleep 1
done

echo ""
echo "============================================="
echo "📊 Service Status Report"
echo "============================================="

if check_port $EMULATOR_PORT; then
  echo "✅ Firestore Emulator (Port $EMULATOR_PORT) is RUNNING."
else
  echo "❌ Firestore Emulator (Port $EMULATOR_PORT) is NOT running. Check: tail -n 20 firestore-emulator.log"
fi

if check_port $BACKEND_PORT; then
  echo "✅ FastAPI Backend (Port $BACKEND_PORT) is RUNNING."
else
  echo "❌ FastAPI Backend (Port $BACKEND_PORT) is NOT running. Check: tail -n 20 backend.log"
fi

if check_port $FRONTEND_PORT; then
  echo "✅ Frontend Dev Server (Port $FRONTEND_PORT) is RUNNING."
  # Read port from dev server if it changed, otherwise fallback to default
  # (Vite defaults to 5173 but could choose another if occupied)
else
  echo "❌ Frontend Dev Server (Port $FRONTEND_PORT) is NOT running. Check: tail -n 20 frontend.log"
fi

echo "============================================="
echo "🔗 Access URLs"
echo "============================================="
echo "🖥️  Frontend UI:        http://localhost:5173"
echo "🔌 FastAPI Swagger:    http://localhost:8000/docs"
echo "🗄️  Firestore Console:  http://localhost:4001"
echo "============================================="
echo "💡 To view logs: tail -f *.log"
echo "🛑 To stop all services: ./stop.sh"
echo "============================================="
