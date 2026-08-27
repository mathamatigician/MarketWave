#!/bin/bash

# Port definitions
EMULATOR_PORT=8080
BACKEND_PORT=8000
FRONTEND_PORT=5173

# Clean up or initialize PID file
> .marketwave.pids

check_port() {
  lsof -i:$1 -t -sTCP:LISTEN >/dev/null 2>&1
}

echo "============================================="
echo "🚀 Starting MarketWave Platform Services..."
echo "============================================="

# Auto-create .env from .env.example if missing
if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
  echo "ℹ️  Created .env from .env.example"
fi

# Detect Python interpreter
if [ -f ".venv/bin/python" ]; then
  PYTHON_CMD=".venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON_CMD="python3"
else
  PYTHON_CMD="python"
fi

# 1. Start Firestore Emulator
if check_port $EMULATOR_PORT; then
  echo "⚠️  Port $EMULATOR_PORT is already in use. Skipping Firestore Emulator start."
else
  echo "Starting Firestore Emulator..."
  [ -d "/opt/homebrew/opt/openjdk@21/bin" ] && export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"
  npx -y firebase-tools@latest emulators:start --only firestore --project marketwave-demo > firestore-emulator.log 2>&1 &
  EMULATOR_PID=$!
  echo "EMULATOR_PID=$EMULATOR_PID" >> .marketwave.pids
  echo "👉 Firestore Emulator started (PID: $EMULATOR_PID)"
  
  # Wait for emulator to listen on EMULATOR_PORT before starting backend
  echo "Waiting for Firestore Emulator to initialize..."
  for i in {1..15}; do
    if check_port $EMULATOR_PORT; then
      break
    fi
    sleep 1
  done
fi

# 2. Start FastAPI Backend
if check_port $BACKEND_PORT; then
  echo "⚠️  Port $BACKEND_PORT is already in use. Skipping FastAPI Backend start."
else
  echo "Starting FastAPI Backend..."
  $PYTHON_CMD -m uvicorn backend.main:app --host 0.0.0.0 --port $BACKEND_PORT --reload --reload-dir backend > backend.log 2>&1 &
  BACKEND_PID=$!
  echo "BACKEND_PID=$BACKEND_PID" >> .marketwave.pids
  echo "👉 FastAPI Backend started (PID: $BACKEND_PID)"
fi

# 3. Start Frontend Dev Server
if check_port $FRONTEND_PORT; then
  echo "⚠️  Port $FRONTEND_PORT is already in use. Skipping Frontend Dev Server start."
else
  echo "Starting Frontend Dev Server..."
  npx --prefix frontend vite frontend --host 0.0.0.0 --port $FRONTEND_PORT > frontend.log 2>&1 &
  FRONTEND_PID=$!
  echo "FRONTEND_PID=$FRONTEND_PID" >> .marketwave.pids
  echo "👉 Frontend Dev Server started (PID: $FRONTEND_PID)"
fi

echo ""
echo "Waiting for backend & frontend services to initialize..."
for i in {1..15}; do
  if check_port $BACKEND_PORT && check_port $FRONTEND_PORT; then
    break
  fi
  sleep 1
done

# Detect Local Network IP (portable across macOS/Linux -- avoids relying on
# the Linux-only `ip` command or a hardcoded interface name; opens no real
# connection, just asks the OS which local address it would route through).
LOCAL_IP=$(python3 -c "
import socket
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect(('8.8.8.8', 80))
    print(s.getsockname()[0])
    s.close()
except Exception:
    pass
" 2>/dev/null)
[ -z "$LOCAL_IP" ] && LOCAL_IP="localhost"

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
else
  echo "❌ Frontend Dev Server (Port $FRONTEND_PORT) is NOT running. Check: tail -n 20 frontend.log"
fi

echo "============================================="
echo "🔗 Access URLs"
echo "============================================="
echo "🖥️  Local UI:           http://localhost:5173"
echo "📱 Phone / Network UI: http://$LOCAL_IP:5173"
echo "🔌 FastAPI Swagger:    http://localhost:8000/docs"
echo "🗄️  Firestore Console:  http://localhost:4000"
echo "============================================="
echo "💡 To view logs: tail -f *.log"
echo "🛑 To stop all services: ./stop.sh"
echo "============================================="
