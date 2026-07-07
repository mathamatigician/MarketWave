#!/bin/bash

# Port definitions
EMULATOR_PORT=8080
BACKEND_PORT=8000
FRONTEND_PORT=5173

echo "============================================="
echo "🛑 Stopping GlobePulse Platform Services..."
echo "============================================="

if [ -f .globepulse.pids ]; then
  # Load saved process IDs
  source .globepulse.pids
  
  if [ ! -z "$EMULATOR_PID" ]; then
    if kill -0 $EMULATOR_PID 2>/dev/null; then
      kill $EMULATOR_PID 2>/dev/null
      echo "Stopped Firestore Emulator (PID: $EMULATOR_PID)"
    fi
  fi
  
  if [ ! -z "$BACKEND_PID" ]; then
    if kill -0 $BACKEND_PID 2>/dev/null; then
      kill $BACKEND_PID 2>/dev/null
      echo "Stopped FastAPI Backend (PID: $BACKEND_PID)"
    fi
  fi
  
  if [ ! -z "$FRONTEND_PID" ]; then
    if kill -0 $FRONTEND_PID 2>/dev/null; then
      kill $FRONTEND_PID 2>/dev/null
      echo "Stopped Frontend Dev Server (PID: $FRONTEND_PID)"
    fi
  fi
  
  rm .globepulse.pids
else
  echo "⚠️  No PID registry (.globepulse.pids) found."
fi

# Fallback cleanup check on designated ports
echo "Checking ports for orphaned services..."
for port in $EMULATOR_PORT $BACKEND_PORT $FRONTEND_PORT; do
  PID=$(lsof -t -i:$port -sTCP:LISTEN)
  if [ ! -z "$PID" ]; then
    kill -9 $PID 2>/dev/null
    echo "⚡ Force-killed orphaned process on port $port (PID: $PID)"
  fi
done

echo "============================================="
echo "✅ All GlobePulse services stopped."
echo "============================================="
