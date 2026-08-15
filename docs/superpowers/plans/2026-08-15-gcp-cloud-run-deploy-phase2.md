# Cloud Run Deployment (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the backend and frontend production-deployable to Cloud Run — configurable CORS, a working production API-URL story in the frontend, and a Dockerfile for each service — so the actual `gcloud run deploy` + domain mapping (spec's Provisioning & Deployment Runbook) can run against known-good code afterward.

**Architecture:** Two independently deployable services, each getting its own Dockerfile with its own subdirectory as build context (`backend/`, `frontend/`). The frontend's backend URL becomes a Vite build-time env var with a local-dev fallback; the backend's CORS origins become a runtime env var via `config.py`.

**Tech Stack:** Python 3.12 / FastAPI (backend), React 19 + Vite + TypeScript (frontend), Docker, nginx:alpine (static file serving). Backend tests use stdlib `unittest` (no pytest in this repo). Frontend has no test runner — verification is `npm run build` (TypeScript compiles cleanly) plus targeted `grep` checks.

**Spec:** [docs/superpowers/specs/2026-08-15-gcp-cloud-run-deploy-design.md](../specs/2026-08-15-gcp-cloud-run-deploy-design.md)

## Global Constraints

- No downloadable service-account JSON key files anywhere — Cloud Run's attached service account and Secret Manager provide credentials, matching Phase 1's ADC-only stance.
- Secret *values* are never handled in this plan or by the agent — only secret names and the commands to set them (that's the deployment runbook in the spec, not this plan).
- Local dev behavior must not change: `config.ts`'s hostname-derived fallback and `main.py`'s default CORS origin list both stay exactly as they are today when no env var overrides them.
- Each Dockerfile uses its own subdirectory (`backend/`, `frontend/`) as the build context — not the repo root — so `gcloud run deploy --source=backend` / `--source=frontend` find the right `Dockerfile` unambiguously.

---

### Task 1: Fix dependency file drift

**Files:**
- Delete: `requirements.txt` (repo root)
- Modify: `Makefile:50`

**Interfaces:** none — no code depends on this, just which file `make install` reads from.

- [ ] **Step 1: Confirm the drift**

Run: `diff backend/requirements.txt requirements.txt`
Expected: a difference showing `razorpay` present in `backend/requirements.txt` but missing from the root copy (added in PR #12, never synced).

- [ ] **Step 2: Delete the stale root copy**

```bash
git rm requirements.txt
```

- [ ] **Step 3: Point `Makefile`'s install target at the real file**

In `Makefile`, change:

```makefile
	$(PIP) install -r requirements.txt
```

to:

```makefile
	$(PIP) install -r backend/requirements.txt
```

- [ ] **Step 4: Verify**

Run: `grep -n "requirements.txt" Makefile docs/INSTALLATION.md README.md`
Expected: every remaining reference points at `backend/requirements.txt`, none at a bare root `requirements.txt`. (If `docs/INSTALLATION.md`/`README.md` also reference the root file directly, e.g. `pip install -r requirements.txt` in a code block, update those too, same substitution.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(deps): remove stale root requirements.txt, always install from backend/requirements.txt"
```

---

### Task 2: Configurable CORS origins

**Files:**
- Modify: `backend/config.py`
- Modify: `backend/main.py:33-46` (the `CORSMiddleware` block)
- Create: `backend/test_config.py`

**Interfaces:**
- Produces: `config.get_allowed_origins() -> List[str]` — pure function, no I/O beyond reading the already-loaded `settings` object. Deliberately kept out of `main.py` so it's testable without triggering `main.py`'s heavy top-level imports (`google.antigravity`, the orchestrator) which are slow/network-dependent to import.

- [ ] **Step 1: Write the failing test**

Create `backend/test_config.py`:

```python
import os
import sys
import unittest
from unittest.mock import patch

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import config


class TestGetAllowedOrigins(unittest.TestCase):
    def test_default_matches_todays_localhost_list(self):
        origins = config.get_allowed_origins()

        self.assertEqual(origins, [
            "http://localhost:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:5174",
            "http://localhost:8000",
            "http://127.0.0.1:8000",
        ])

    def test_parses_comma_separated_env_override(self):
        with patch.object(
            config.settings,
            "allowed_origins",
            "https://globepulseai.com, https://www.globepulseai.com",
        ):
            origins = config.get_allowed_origins()

        self.assertEqual(origins, [
            "https://globepulseai.com",
            "https://www.globepulseai.com",
        ])

    def test_ignores_empty_entries(self):
        with patch.object(config.settings, "allowed_origins", "https://a.com,,https://b.com,"):
            origins = config.get_allowed_origins()

        self.assertEqual(origins, ["https://a.com", "https://b.com"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3 -m unittest test_config.py -v`
Expected: FAIL — `AttributeError: module 'config' has no attribute 'get_allowed_origins'`

- [ ] **Step 3: Add the setting and the helper to `backend/config.py`**

Add `allowed_origins` to both `Settings` class bodies (same pattern as every
other field — the `pydantic_settings.BaseSettings` branch and the
`pydantic.BaseSettings` fallback branch), right after `firestore_emulator_host`:

```python
        allowed_origins: str = "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174,http://localhost:8000,http://127.0.0.1:8000"
```

Then, after the `settings = Settings()` line and the existing post-processing
block at the bottom of the file, add:

```python
def get_allowed_origins() -> List[str]:
    """Parses the comma-separated ALLOWED_ORIGINS setting into a clean list.

    Kept here rather than inline in main.py so it's unit-testable without
    importing main.py's heavier dependencies.
    """
    return [origin.strip() for origin in settings.allowed_origins.split(",") if origin.strip()]
```

This needs `List` imported — change the top of `backend/config.py` from:

```python
import os
from typing import Optional
```

to:

```python
import os
from typing import List, Optional
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python3 -m unittest test_config.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire it into `backend/main.py`**

Change:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://localhost:8000",
        "http://127.0.0.1:8000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

to:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

- [ ] **Step 6: Verify main.py still parses correctly**

Run: `cd backend && python3 -m py_compile main.py config.py`
Expected: no output, exit code 0 (a full import of `main.py` isn't used here — its top-level imports, e.g. `google.antigravity`, are slow/network-dependent in this environment; syntax-checking is what's practical, and the actual behavior is already covered by Task 2's unit tests plus the live smoke test after deployment).

- [ ] **Step 7: Commit**

```bash
git add backend/config.py backend/main.py backend/test_config.py
git commit -m "feat(cors): make allowed origins configurable via ALLOWED_ORIGINS env var"
```

---

### Task 3: Frontend production-ready API URL handling

**Files:**
- Modify: `frontend/src/config.ts`
- Modify: `frontend/src/components/SubscriptionModal.tsx:53,90,119,145`
- Modify: `frontend/src/components/Feedback.tsx:41,80`

**Interfaces:**
- Consumes: `import.meta.env.VITE_API_URL` / `VITE_WS_URL` (Vite build-time env vars — no code needs to declare these; Vite's bundled `vite/client` types already index `import.meta.env` as `any`, confirmed via `frontend/tsconfig.app.json`'s `"types": ["vite/client"]`, so no new `.d.ts` file is needed).
- Produces: `API_URL: string`, `WS_URL: string` (unchanged names/types — every other component already imports these from `frontend/src/config.ts`; only their *values* change, not their shape).

- [ ] **Step 1: Update `frontend/src/config.ts`**

Replace:

```typescript
const hostname = window.location.hostname || 'localhost';
const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

export const API_URL = `${protocol}//${hostname}:8000`;
export const WS_URL = `${wsProtocol}//${hostname}:8000`;
```

with:

```typescript
const hostname = window.location.hostname || 'localhost';
const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

// In production these are baked in at build time (see frontend/Dockerfile).
// Local dev leaves them unset and falls back to today's derived-from-hostname
// behavior, unchanged.
export const API_URL = import.meta.env.VITE_API_URL || `${protocol}//${hostname}:8000`;
export const WS_URL = import.meta.env.VITE_WS_URL || `${wsProtocol}//${hostname}:8000`;
```

- [ ] **Step 2: Fix `SubscriptionModal.tsx`'s 4 hardcoded URLs**

Add the import at the top of the file (after the existing `lucide-react` import):

```typescript
import { API_URL } from '../config';
```

Then replace each of the 4 occurrences:

- `fetch('http://127.0.0.1:8000/api/subscription/plans')` → `` fetch(`${API_URL}/api/subscription/plans`) ``
- `fetch('http://127.0.0.1:8000/api/subscription/verify-payment', {` (appears twice, identical) → `` fetch(`${API_URL}/api/subscription/verify-payment`, { `` (both occurrences)
- `fetch('http://127.0.0.1:8000/api/subscription/create-order', {` → `` fetch(`${API_URL}/api/subscription/create-order`, { ``

- [ ] **Step 3: Fix `Feedback.tsx`'s 2 hardcoded URLs**

`Feedback.tsx`'s top import is a multi-line `lucide-react` import
(`import React, ... from 'react';` then `import {` ... icon names ... `} from
'lucide-react';`). Add the new import line right after that closing `}
from 'lucide-react';` line:

```typescript
import { API_URL } from '../config';
```

Then replace both occurrences:

- `fetch('http://localhost:8000/api/feedback')` → `` fetch(`${API_URL}/api/feedback`) ``
- `fetch('http://localhost:8000/api/feedback', {` → `` fetch(`${API_URL}/api/feedback`, { ``

- [ ] **Step 4: Verify no hardcoded backend URLs remain**

Run: `grep -rn "localhost:8000\|127.0.0.1:8000" frontend/src`
Expected: no output (empty) — every call site now goes through `API_URL`/`WS_URL`.

- [ ] **Step 5: Verify the build still compiles**

Run: `cd frontend && npm run build`
Expected: exits 0 (`tsc -b && vite build` succeeds — this also catches the unused-import lint rules `noUnusedLocals`/`noUnusedParameters` from `tsconfig.app.json`, so a missed import or leftover unused variable fails this step loudly).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/config.ts frontend/src/components/SubscriptionModal.tsx frontend/src/components/Feedback.tsx
git commit -m "fix(frontend): make backend API URL production-configurable, fix hardcoded localhost URLs"
```

---

### Task 4: Backend Dockerfile

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/.dockerignore`

**Interfaces:** none — this packages Task 1/2's already-verified code, no new application code.

- [ ] **Step 1: Create `backend/.dockerignore`**

```
__pycache__/
*.pyc
.venv/
.env
*.json
!package.json
test_*.py
```

(The `*.json` / `!package.json` pair excludes the local JSON fallback files —
`users.json`, `feedback.json`, `orders.json`, `alerts.json` — none of which
belong in a cloud-mode image, since Phase 1's cloud mode hard-fails instead
of using them. There is no `package.json` in `backend/`; the negation is
defensive documentation of intent, not something currently matched.)

- [ ] **Step 2: Create `backend/Dockerfile`**

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Cloud Run sets $PORT at runtime (defaults to 8080); bind to it explicitly
# rather than hardcoding, so this also works unchanged if Cloud Run's default
# ever changes.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
```

- [ ] **Step 3: Verify the image builds**

Run: `cd backend && docker build -t globepulse-backend-test .`
Expected: exits 0, ends with `Successfully tagged globepulse-backend-test:latest` (or BuildKit's equivalent final `naming to ... done` line).

Note: a local `docker run` smoke test is intentionally **not** part of this
task. The backend's top-level imports (`google.antigravity`, the
orchestrator config) attempt credential/network resolution that has been
observed to hang for minutes in sandboxed environments without real network
access to Google's auth endpoints — a risk with no corresponding benefit
here, since the real runtime verification happens against the actual
deployed Cloud Run service (with real credentials and real network) in the
deployment runbook's smoke-test checklist, not against this local build.

- [ ] **Step 4: Commit**

```bash
git add backend/Dockerfile backend/.dockerignore
git commit -m "feat(deploy): add backend Dockerfile for Cloud Run"
```

---

### Task 5: Frontend Dockerfile

**Files:**
- Create: `frontend/Dockerfile`
- Create: `frontend/nginx.conf`

**Interfaces:**
- Consumes: `VITE_API_URL`, `VITE_WS_URL` build args (Task 3's `config.ts` reads these via `import.meta.env` at build time).

- [ ] **Step 1: Create `frontend/nginx.conf`**

```nginx
server {
    listen 8080;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Listens on 8080 to match Cloud Run's default container port. There's no
client-side router in this app today (`App.tsx` switches views via
component state, not URL routes), so the `try_files` SPA fallback isn't
exercised yet — it's included defensively since it's harmless now and
correct if routing is ever added.

- [ ] **Step 2: Create `frontend/Dockerfile`**

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL
ARG VITE_WS_URL
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_WS_URL=${VITE_WS_URL}
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

- [ ] **Step 3: Verify the image builds with production build args**

Run:
```bash
cd frontend && docker build \
  --build-arg VITE_API_URL=https://api.globepulseai.com \
  --build-arg VITE_WS_URL=wss://api.globepulseai.com \
  -t globepulse-frontend-test .
```
Expected: exits 0, ends with a successful tag/naming line.

- [ ] **Step 4: Verify the container actually serves the built app**

Unlike the backend, this is safe to run locally — nginx serving static
files makes no network calls, no credential lookups, no risk of hanging.

Run:
```bash
docker run -d --name globepulse-frontend-smoketest -p 18080:8080 globepulse-frontend-test
sleep 2
curl -sf http://localhost:18080/ | grep -o "<title>[^<]*</title>"
docker stop globepulse-frontend-smoketest && docker rm globepulse-frontend-smoketest
```
Expected: the `curl` prints the page's `<title>` tag (confirms `index.html`
is being served, not a 404 or nginx default page), then both cleanup
commands succeed.

- [ ] **Step 5: Commit**

```bash
git add frontend/Dockerfile frontend/nginx.conf
git commit -m "feat(deploy): add frontend Dockerfile (nginx) for Cloud Run"
```

---

## After this plan

This branch still needs a PR into `develop` (branch protection currently
has no required-review rule active, but re-check before assuming that —
it was deliberately relaxed mid-Phase-1 and could be restored).

Once merged, the actual GCP provisioning and deployment — enabling APIs,
creating the service account and secrets, `gcloud run deploy` for both
services, domain verification, and the `gcloud run domain-mappings create`
calls that generate the real DNS records for Hostinger — is the spec's
"Provisioning & Deployment Runbook" section. Those are one-shot
infrastructure operations, not code with a TDD cycle, so they're executed
directly against the real `globepulse-ai` project rather than turned into
plan tasks here, the same way Phase 1's GCP project provisioning was
handled after its own implementation plan finished.
