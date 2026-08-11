# GlobePulse — Installation Guide (Mac & Windows)

**Who this is for:** anyone setting up GlobePulse on a fresh laptop/desktop for the first time.
This is a beginner guide — do every step in order. For the day-to-day Git/PR workflow *after* setup,
see [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md).

**What you're installing:** GlobePulse runs as three local services —
a **React** frontend, a **FastAPI** backend, and a local **Google Firestore emulator** —
with **Google Gemini** powering the AI assistant.

> **Time needed:** ~20–30 minutes the first time (most of it is installing prerequisites).

---

## Part 0 — Prerequisites (install these first)

You need **four** tools. Install each, then run its "check" command to confirm.

| Tool | Why GlobePulse needs it | Minimum version |
|------|-------------------------|-----------------|
| **Git** | Download the code | any recent |
| **Python** | FastAPI backend + data pipeline | **3.10+** (3.12 recommended) |
| **Node.js** (includes npm) | React frontend + the Firebase emulator tool | **20.19+** (Node 20 LTS or newer) |
| **Java (JDK)** | The Firestore emulator is a Java program — it will not start without it | **Java 21** |

### macOS

The easiest path is [Homebrew](https://brew.sh). If you don't have it, install it first (one command on the Homebrew site), then:

```bash
brew install git python node openjdk@21
```

After installing, make sure Java 21 is visible on your PATH (Homebrew prints the exact line; this is the common one for Apple Silicon):

```bash
echo 'export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### Windows

Install each with its official installer (click through the defaults). Easiest is [winget](https://learn.microsoft.com/windows/package-manager/) in PowerShell:

```powershell
winget install --id Git.Git -e
winget install --id Python.Python.3.12 -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id EclipseAdoptium.Temurin.21.JDK -e
```

Or download manually: [Git](https://git-scm.com/download/win) · [Python](https://www.python.org/downloads/windows/) (tick **"Add Python to PATH"** in the installer) · [Node.js LTS](https://nodejs.org/) · [Temurin JDK 21](https://adoptium.net/temurin/releases/?version=21).

> **Close and reopen your terminal** after installing, so the new tools are on your PATH.

### Verify everything is installed

Run these — each should print a version (exact numbers may differ):

```bash
git --version        # git version 2.4x.x
python --version     # Python 3.12.x   (on Mac you may need: python3 --version)
node --version       # v20.19.x or newer
npm --version        # 10.x.x
java -version        # openjdk version "21.x.x"
```

If any command is "not found", that tool didn't install or isn't on your PATH — fix that before continuing.

---

## Part 1 — Get a Google Gemini API key

The AI assistant and the sentiment pipeline call Google Gemini, so you need a free API key.

1. Go to **https://aistudio.google.com/apikey** (Google AI Studio).
2. Sign in with a Google account and click **Create API key**.
3. Copy the key somewhere safe for the next step. **Never commit it to Git** (the project's `.gitignore` already excludes `.env`).

---

## Part 2 — Download the project

```bash
# Go to wherever you keep projects (example)
cd ~/Documents          # macOS/Linux
# cd %USERPROFILE%\Documents   # Windows CMD

git clone https://github.com/pravintakpire/GlobePulse.git
cd GlobePulse
```

---

## Part 3 — Create your `.env` file

The backend reads secrets from a `.env` file in the project root. Copy the example and fill it in:

```bash
# macOS/Linux
cp .env.example .env

# Windows (PowerShell)
copy .env.example .env
```

Open `.env` in your editor and set at least these two values:

```bash
GEMINI_API_KEY="paste-your-gemini-key-here"
AGENT_MODEL=gemini-2.5-flash
FIRESTORE_PROJECT_ID=globepulse-demo
FIRESTORE_EMULATOR_HOST=localhost:8080
ADMIN_KEY="choose-any-strong-string"       # gates the /api/pipeline/run endpoint
```

- `GEMINI_API_KEY` — the key from Part 1 (**required** for the AI assistant + pipeline).
- `ADMIN_KEY` — any strong string you pick; needed only if you trigger the news-ingestion pipeline.

> `.env` is git-ignored, so your key stays on your machine only.

---

## Part 4 — Create a Python virtual environment & install dependencies

A "virtual environment" keeps this project's Python packages separate from the rest of your system.

**macOS / Linux:**
```bash
python3 -m venv .venv
source .venv/bin/activate
```

**Windows (PowerShell):**
```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
# If PowerShell blocks the script, run once:
#   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```
**Windows (CMD):** `python -m venv .venv` then `.venv\Scripts\activate.bat`

Your prompt should now start with `(.venv)`. Now install everything (backend + frontend):

```bash
make install
```

> **No `make`?** (common on Windows) run the three underlying commands instead:
> ```bash
> pip install -r requirements.txt
> pip install -r backend/requirements.txt
> npm install --prefix frontend
> ```

---

## Part 5 — Run the app

### macOS / Linux (one command)

```bash
make start        # or: ./start.sh
```

This launches all three services in the background and prints a status report. Stop them with `make stop` (or `./stop.sh`).

> The first launch is slower — the Firestore emulator downloads its files once. If the status report
> says a service is "NOT running", give it ~15 seconds and re-check (the built-in wait is short).

### Windows

The `start.sh`/`stop.sh` scripts are Bash + `lsof`, which aren't native to Windows. Easiest is to run the **three services in three separate terminals** (keep each open):

**Terminal 1 — Firestore emulator:**
```powershell
npx -y firebase-tools@latest emulators:start --only firestore
```
**Terminal 2 — Backend (activate the venv first):**
```powershell
.venv\Scripts\Activate.ps1
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```
**Terminal 3 — Frontend:**
```powershell
npm --prefix frontend run dev
```

> Prefer one command on Windows? Install `make` (`winget install ezwinports.make` or via [Chocolatey](https://chocolatey.org/) `choco install make`) and use `make dev-emulator`, `make dev-backend`, `make dev-frontend` in three terminals. `make start`/`./start.sh` still need Git Bash/WSL to work fully.

---

## Part 6 — Verify it works

Open these in your browser:

| What | URL |
|------|-----|
| **Frontend UI** | http://localhost:5173 |
| **Backend API docs (Swagger)** | http://localhost:8000/docs |
| **Firestore emulator console** | http://localhost:4001 |

Then log in with a seeded demo account to confirm the full stack works:

- **Email:** `demo1@globepulse.com`
- **Password:** `password123`

You should land on the dashboard with a sentiment heatmap and a price/sentiment chart, and the floating **GlobePulse AI** button should open a chat that streams a response.

---

## Part 7 — Stopping & restarting

```bash
# macOS/Linux
make stop        # or ./stop.sh

# Windows: press Ctrl+C in each of the three terminals
```

To start again later: activate the venv (`source .venv/bin/activate` / `.venv\Scripts\Activate.ps1`) and run `make start` (Mac) or the three commands (Windows). You do **not** need to reinstall dependencies unless they changed.

---

## Part 8 — Troubleshooting

| Symptom | Fix |
|---------|-----|
| **`java` not found / emulator won't start** | Install **JDK 21** (Part 0) and confirm `java -version`. On macOS, add the Homebrew `openjdk@21` line to your `~/.zshrc`. |
| **`npm` / `node` not found** | Install Node LTS (Part 0), then reopen your terminal. |
| **`make: command not found` (Windows)** | Use the manual commands shown under each step, or install `make` (Part 5). |
| **"Port 8080/8000/5173 already in use"** | Another process (or a previous run) holds the port. macOS/Linux: `make stop`, or `lsof -i:8000` then `kill <PID>`. Windows: `netstat -ano \| findstr :8000` then `taskkill /PID <pid> /F`. |
| **AI assistant returns an error / no answer** | `GEMINI_API_KEY` is missing or invalid in `.env`. Double-check Part 1/Part 3, then restart the backend. |
| **`./start.sh: Permission denied` (macOS/Linux)** | `chmod +x start.sh stop.sh` once, then retry. |
| **PowerShell won't run the activate script** | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, then re-open PowerShell. |
| **Login fails for the demo user** | Make sure the backend fully started (its log prints "seeded demo and local users"). The emulator must be running first. |
| **Frontend loads but no data** | The backend and emulator must both be up; the backend seeds demo articles on startup. Restart in order: emulator → backend → frontend. |

---

## Quick reference (copy/paste)

**macOS / Linux — full first-time setup:**
```bash
brew install git python node openjdk@21
git clone https://github.com/pravintakpire/GlobePulse.git && cd GlobePulse
cp .env.example .env            # then edit .env and add your GEMINI_API_KEY
python3 -m venv .venv && source .venv/bin/activate
make install
make start                      # open http://localhost:5173
```

**Windows (PowerShell) — full first-time setup:**
```powershell
winget install Git.Git Python.Python.3.12 OpenJS.NodeJS.LTS EclipseAdoptium.Temurin.21.JDK
git clone https://github.com/pravintakpire/GlobePulse.git; cd GlobePulse
copy .env.example .env          # then edit .env and add your GEMINI_API_KEY
python -m venv .venv; .venv\Scripts\Activate.ps1
pip install -r requirements.txt; pip install -r backend/requirements.txt; npm install --prefix frontend
# then run the 3 services in 3 terminals (see Part 5)
```
