.PHONY: help install dev-backend dev-frontend dev-emulator start stop test-api clean

VENV = .venv

# Detect OS and virtual environment directory structure (bin vs Scripts)
ifeq ($(OS),Windows_NT)
    ifneq ($(wildcard $(VENV)/bin/*),)
        BIN = $(VENV)/bin
    else ifneq ($(wildcard $(VENV)/Scripts/*),)
        BIN = $(VENV)/Scripts
    else
        BIN = .
    endif
else
    ifneq ($(wildcard $(VENV)/bin/*),)
        BIN = $(VENV)/bin
    else
        BIN = .
    endif
endif

# Define executable wrappers that fall back to global paths if venv is missing
PYTHON = $(if $(filter-out .,$(BIN)),$(BIN)/python,python)
PIP = $(if $(filter-out .,$(BIN)),$(BIN)/pip,pip)
UVICORN = $(if $(filter-out .,$(BIN)),$(BIN)/uvicorn,uvicorn)

# Default target: show help instructions
help:
	@echo "======================================================================="
	@echo "                       GlobePulse Makefile                             "
	@echo "======================================================================="
	@echo "Virtual Environment Config:"
	@echo "  Detected Bin Directory: $(BIN)"
	@echo "  Python Command:         $(PYTHON)"
	@echo "======================================================================="
	@echo "Available commands:"
	@echo "  make install         - Install backend (FastAPI) and frontend (React) dependencies"
	@echo "  make dev-backend     - Start the FastAPI backend server locally"
	@echo "  make dev-frontend    - Start the React frontend development server"
	@echo "  make dev-emulator    - Start the local Google Firestore emulator"
	@echo "  make start           - Start all platform services using start.sh"
	@echo "  make stop            - Stop all platform services using stop.sh"
	@echo "  make test-api        - Run Firestore emulator validation script"
	@echo "  make clean           - Remove temporary python caches and artifacts"
	@echo "======================================================================="

# Installation Target
install:
	@echo "Installing root dependencies using $(PIP)..."
	$(PIP) install -r requirements.txt
	@echo "Installing backend dependencies using $(PIP)..."
	$(PIP) install -r backend/requirements.txt
	@echo "Installing frontend packages..."
	cd frontend && npm install

# Local Dev Target: FastAPI Backend
dev-backend:
	@echo "Starting FastAPI backend server using $(UVICORN)..."
	cd backend && $(UVICORN) main:app --host 0.0.0.0 --port 8000 --reload

# Local Dev Target: React Frontend
dev-frontend:
	@echo "Starting React frontend (Vite)..."
	cd frontend && npm run dev

# Local Dev Target: Firestore Emulator
dev-emulator:
	@echo "Starting Firestore Emulator..."
	npx -y firebase-tools@latest emulators:start --only firestore

# Start / Stop Targets
start:
	@echo "Starting platform services using start.sh..."
	@./start.sh

stop:
	@echo "Stopping platform services using stop.sh..."
	@./stop.sh


# Testing Targets
test-api:
	@echo "Verifying local Firestore integration using $(PYTHON)..."
	$(PYTHON) backend/test_firestore_emulator.py

# Cleanup Target
clean:
	@echo "Cleaning cache files..."
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	@echo "Cleanup completed."
