# Design: Cloud Run Deployment + Custom Domain (Phase 2 of the GCP Backend Move)

**Status:** Approved for planning
**Date:** 2026-08-15
**Related:** [docs/superpowers/specs/2026-08-07-cloud-firestore-migration-design.md](2026-08-07-cloud-firestore-migration-design.md) (Phase 1, implemented), [docs/google_cloud_migration_roadmap.md](../../google_cloud_migration_roadmap.md)

## Goal & Scope

Make GlobePulse reachable on the real internet at `globepulseai.com`, replacing
"runs on a developer's laptop" with a deployed, publicly reachable service —
end to end: containerize both the FastAPI backend and the React frontend,
deploy both to Cloud Run, move secrets out of local `.env` files into Secret
Manager, and map the purchased domain to both services.

This is Phase 2 of the GCP backend move. Phase 1 (real Cloud Firestore,
hard-fail in cloud mode) is done — see the linked spec, implemented in PR #15.

## Current State (baseline)

- **GCP project**: `globepulse-ai` is provisioned — billing linked, Firestore
  Native database live in `asia-south1`, deny-all `firestore.rules` deployed.
  Nothing else exists in the project yet: no Cloud Run, no Artifact Registry
  images, no Secret Manager secrets, no custom service accounts. (Project ID
  predates confirming the real domain is `globepulseai.com`, not `.ai` —
  kept as-is; it's an internal label with no functional dependency on the
  domain name.)
- **Domain**: `globepulseai.com` is registered at Hostinger and fully
  delegated (`artemis.dns-parking.com` / `hermes.dns-parking.com`). The apex
  and `www` both currently point at Hostinger's default parking page
  (`2.57.91.91`). No MX or TXT records exist — nothing to preserve.
- **Backend**: no `Dockerfile` anywhere in the repo. `backend/main.py` runs
  today via `uvicorn main:app --host 0.0.0.0 --port 8000 --reload`
  (`Makefile`'s `dev-backend` target). CORS `allow_origins` is a hardcoded
  list of localhost origins only (`backend/main.py`).
- **Frontend**: standard Vite + React SPA (`npm run build` → `tsc -b && vite
  build`, outputs to `frontend/dist/`). No client-side router (`App.tsx`
  switches views via component state, not URL routes), so no SPA-fallback
  routing concern.
- **Frontend → backend URL handling is not production-ready**:
  `frontend/src/config.ts` derives the backend origin as
  `${window.location.protocol}//${window.location.hostname}:8000` — correct
  only because both currently run on the same machine on port 8000. Under a
  subdomain split (`api.globepulseai.com` separate from
  `www.globepulseai.com`) this resolves to the wrong host entirely, and
  production traffic isn't on port 8000 at all.
  Two components bypass this shared config and hardcode the URL directly:
  `frontend/src/components/SubscriptionModal.tsx` (4 call sites,
  `http://127.0.0.1:8000`) and `frontend/src/components/Feedback.tsx` (2 call
  sites, `http://localhost:8000`) — pre-existing bugs, not introduced by this
  design.
- **Secrets today**: `GEMINI_API_KEY`, `ADMIN_KEY`, `RAZORPAY_KEY_ID`,
  `RAZORPAY_KEY_SECRET` all live in a local, gitignored `.env`, loaded via
  `pydantic-settings`.
- **Dependency file drift**: root `requirements.txt` is stale — missing
  `razorpay` (added to `backend/requirements.txt` in PR #12, never synced to
  the root copy). `Makefile`'s `install` target installs from the stale root
  file; `backend/requirements.txt` is the one that's actually current.
- **Docker**: available locally (v28.2.2), but not required — Cloud Run's
  `--source` deploy flag builds via Cloud Build and pushes to Artifact
  Registry automatically, so neither this session nor future deploys need a
  local Docker daemon.
- **Tooling constraint learned in Phase 1**: `firebase login` needs an
  interactive browser OAuth flow that doesn't work in a sandboxed/headless
  environment. This design avoids the Firebase CLI entirely — both services
  deploy via plain `gcloud run deploy`, which is already authenticated.

## Architecture

Two independent Cloud Run services in `globepulse-ai`, region `asia-south1`
(same region as Firestore, minimizing latency and matching the
₹-priced-Razorpay rationale from Phase 1):

```
                              globepulseai.com
                              www.globepulseai.com
                                      │
                                      ▼
                     ┌────────────────────────────────┐
                     │   Cloud Run: globepulse-frontend │
                     │   nginx serving the Vite build   │
                     │   (public, no GCP API access)    │
                     └────────────────────────────────┘
                                      │
                                      │ REST + WebSocket
                                      │ (browser → api.globepulseai.com)
                                      ▼
                     ┌────────────────────────────────┐
                     │   Cloud Run: globepulse-backend  │
                     │   FastAPI/uvicorn                │
                     │   service account:               │
                     │     roles/datastore.user          │
                     │     secretmanager.secretAccessor  │
                     │       (scoped to 4 secrets)       │
                     └───────────┬────────────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
              Cloud Firestore  Secret Manager  Gemini API
              (globepulse-ai,  (4 app secrets)
               asia-south1)

                     api.globepulseai.com
                              │
                              ▼
                     (same globepulse-backend service)
```

Both services are public (`--allow-unauthenticated`) — the browser calls the
backend directly over the internet, not through a GCP-internal path, so
Cloud Run's IAM-based service-to-service auth doesn't apply here.

The frontend service has no GCP API access at all — it's a static file
server, nothing more. Only the backend gets a dedicated service account and
IAM grants.

## Code Changes

### 1. `backend/Dockerfile` (new)

Deployed with `backend/` itself as the build context (see runbook step 5:
`gcloud run deploy --source=backend`), so paths below are relative to
`backend/`, not the repo root — this avoids the ambiguity of having two
different Dockerfiles both needing to be discovered from a single repo-root
`--source=.` build.

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY . ./backend/

# Cloud Run sets $PORT at runtime (defaults to 8080); bind to it explicitly
# rather than hardcoding, so this also works unchanged if Cloud Run's default
# ever changes. Run as the `backend` package (not `main:app` directly) so
# main.py's `from backend.agents...` root-relative imports resolve — this
# mirrors start.sh's working invocation (`python -m uvicorn backend.main:app`
# from the repo root); /app is that "repo root" inside the image.
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
```

> **Revision note:** the snippet above reflects the fixed layout (a final
> whole-branch review caught that the first version — `COPY . .` directly
> into `/app`, `CMD uvicorn main:app` — built a container that crashed on
> start with `ModuleNotFoundError: No module named 'backend'`, since
> `main.py` imports root-relative through a `backend` package). The real
> `backend/Dockerfile` is the source of truth if this ever drifts again.

### 2. `backend/.dockerignore` (new)

```
__pycache__/
*.pyc
.venv/
.env
*.json
!package.json
test_*.py
```

(The `*.json` / `!package.json` pair excludes the local fallback data files —
`users.json`, `feedback.json`, `orders.json`, `alerts.json` — none of which
belong in a cloud-mode image, since cloud mode hard-fails instead of using
them per the Phase 1 design.)

### 3. `frontend/Dockerfile` (new)

Same convention as the backend: deployed with `frontend/` as the build
context (`gcloud run deploy --source=frontend`), so paths are relative to
`frontend/`.

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

`VITE_API_URL`/`VITE_WS_URL` are Vite build-time env vars — they get baked
into the static JS bundle at `docker build` time via `--build-arg`, which is
why they're passed as Docker build args, not runtime Cloud Run env vars (a
static file server can't inject env vars into already-built JS).

### 4. `frontend/nginx.conf` (new)

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

Listens on 8080 to match Cloud Run's default `$PORT` (nginx can't read the
`$PORT` env var directly without an entrypoint template step, and Cloud Run
lets you configure the container port explicitly at deploy time via
`--port`, so this fixed value is deployed with `--port=8080` rather than
adding startup-script complexity for no real benefit). The `try_files`
SPA fallback is included defensively even though today's `App.tsx` has no
client-side router — harmless now, and correct if routing is added later.

### 5. `frontend/src/config.ts` — env-driven with dev fallback

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

### 6. `SubscriptionModal.tsx` and `Feedback.tsx` — stop hardcoding the URL

Both files currently call `fetch('http://127.0.0.1:8000/api/...')` /
`fetch('http://localhost:8000/api/feedback')` directly. Replace every such
call with the shared `API_URL` import (`import { API_URL } from
'../config'`), matching every other component in the codebase, e.g.
`` fetch(`${API_URL}/api/subscription/plans`) ``.

### 7. `backend/config.py` — configurable CORS origins

Add:

```python
        allowed_origins: str = "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174,http://localhost:8000,http://127.0.0.1:8000"
```

to both `Settings` class bodies (same pattern as every other setting in the
file). In production this gets overridden via Cloud Run env var to
`https://globepulseai.com,https://www.globepulseai.com`.

### 8. `backend/main.py` — read CORS origins from settings

Replace the hardcoded `allow_origins` list:

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

with:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.allowed_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 9. Remove the stale root `requirements.txt`, fix `Makefile`

Delete `requirements.txt` (root). Change `Makefile`'s `install` target from
`$(PIP) install -r requirements.txt` to `$(PIP) install -r
backend/requirements.txt`.

## Provisioning & Deployment Runbook

Documented steps — not all executed as part of writing this spec; the
implementation plan turns these into concrete, testable tasks.

1. Enable required APIs on `globepulse-ai`: `run.googleapis.com`,
   `artifactregistry.googleapis.com`, `secretmanager.googleapis.com`,
   `iam.googleapis.com`.
2. Create the backend's dedicated service account:
   ```
   gcloud iam service-accounts create globepulse-backend \
     --project=globepulse-ai \
     --display-name="GlobePulse backend runtime"
   ```
3. Create the 4 secrets (empty shells; the user adds real values themselves,
   not pasted into any AI session):
   ```
   for s in gemini-api-key admin-key razorpay-key-id razorpay-key-secret; do
     gcloud secrets create "$s" --project=globepulse-ai --replication-policy=automatic
   done
   ```
   Then, for each: `gcloud secrets versions add <name> --project=globepulse-ai --data-file=-`
   (typed/pasted interactively by the user, not by the agent).
4. Grant the service account access to each secret and to Firestore:
   ```
   gcloud projects add-iam-policy-binding globepulse-ai \
     --member="serviceAccount:globepulse-backend@globepulse-ai.iam.gserviceaccount.com" \
     --role="roles/datastore.user"
   # + roles/secretmanager.secretAccessor on each of the 4 secrets individually
   ```
   > ⚠️ **Pre-flight blocker, discovered 2026-08-15, not yet fixed:**
   > `backend/requirements.txt` pins no version for `google-antigravity` or
   > `google-generativeai`. A fresh install today resolves
   > `google-antigravity==0.1.12` (needs `protobuf>=7.35.0` at runtime — its
   > generated code is gencode 7.35.0) against
   > `google-ai-generativelanguage==0.6.15` (a transitive dep of
   > `google-generativeai`, hard-capped at `protobuf<6.0.0dev`) and
   > `grpcio-status` (capped at `protobuf<6.0dev`) — an unresolvable range
   > conflict. `pip` silently installs `protobuf==5.29.6` (satisfying the
   > caps, violating antigravity's floor), so the container builds cleanly
   > but crashes on start with
   > `google.protobuf.runtime_version.VersionError: ... gencode 7.35.0
   > runtime 5.29.6`, before binding to `$PORT`. Confirmed pre-existing (not
   > caused by this branch — `backend/requirements.txt`'s lack of pins
   > predates Phase 2) and confirmed NOT fixable by simply pinning
   > `protobuf` up (breaks `google-ai-generativelanguage`/`grpcio-status`)
   > or down (breaks `google-antigravity`). **Do not run step 5 until this
   > is resolved** — likely needs a newer `google-generativeai` release
   > that drops the old protobuf cap, or dropping/replacing whichever of
   > the two packages is less load-bearing. Track as separate follow-up
   > work, not part of this plan.
5. Deploy the backend from source (Cloud Build handles the container build —
   no local Docker needed). `--source=backend` makes `backend/` the build
   context, so it finds `backend/Dockerfile` as that context's `Dockerfile`:
   ```
   gcloud run deploy globepulse-backend \
     --source=backend \
     --region=asia-south1 \
     --project=globepulse-ai \
     --service-account=globepulse-backend@globepulse-ai.iam.gserviceaccount.com \
     --set-env-vars="^##^FIRESTORE_PROJECT_ID=globepulse-ai##ALLOWED_ORIGINS=https://globepulseai.com,https://www.globepulseai.com" \
     --set-secrets=GEMINI_API_KEY=gemini-api-key:latest,ADMIN_KEY=admin-key:latest,RAZORPAY_KEY_ID=razorpay-key-id:latest,RAZORPAY_KEY_SECRET=razorpay-key-secret:latest \
     --allow-unauthenticated
   ```
   Note: no `FIRESTORE_EMULATOR_HOST` is set, which (per the Phase 1 design)
   puts the deployed backend in cloud mode automatically.
6. Deploy the frontend, pointing its build-time API URL at the mapped
   backend domain. `--port=8080` is explicit here since nginx (unlike
   uvicorn in the backend) doesn't read Cloud Run's `$PORT` env var itself —
   it's hardcoded to listen on 8080 in `nginx.conf`, which happens to match
   Cloud Run's default, but making it explicit avoids relying on that
   default silently matching:
   ```
   gcloud run deploy globepulse-frontend \
     --source=frontend \
     --region=asia-south1 \
     --project=globepulse-ai \
     --port=8080 \
     --set-build-env-vars=VITE_API_URL=https://api.globepulseai.com,VITE_WS_URL=wss://api.globepulseai.com \
     --allow-unauthenticated
   ```
   Note: `gcloud run deploy --source` build env vars are documented primarily
   for buildpacks builds; confirm during the actual deploy that they're
   forwarded as Docker `--build-arg` for this Dockerfile-based build (check
   the Cloud Build log for `VITE_API_URL` reaching the build step). If they
   aren't forwarded, the frontend will build successfully but silently fall
   back to `window.location.hostname:8000` in the bundle — a broken
   production frontend that looks like a successful deploy. Fallback if
   needed: build locally with `docker build --build-arg VITE_API_URL=... -f
   frontend/Dockerfile frontend`, push to Artifact Registry, and deploy with
   `--image` instead of `--source`.
7. Verify domain ownership with Google (required before domain mapping will
   succeed) via Search Console or `gcloud domains verify globepulseai.com`.
8. Create the domain mappings:
   ```
   gcloud run domain-mappings create --service=globepulse-backend --domain=api.globepulseai.com --region=asia-south1 --project=globepulse-ai
   gcloud run domain-mappings create --service=globepulse-frontend --domain=globepulseai.com --region=asia-south1 --project=globepulse-ai
   gcloud run domain-mappings create --service=globepulse-frontend --domain=www.globepulseai.com --region=asia-south1 --project=globepulse-ai
   ```
   Each command prints the exact DNS records (CNAME for the two subdomains,
   a fixed A/AAAA set for the apex) to add at Hostinger — these are
   generated per-mapping, not knowable in advance, and get handed to the
   user verbatim when this step runs.
9. Add those records in Hostinger hPanel → Domains → globepulseai.com → DNS
   records. No existing MX/TXT records exist to preserve.
10. Wait for the managed SSL certificate to provision (Cloud Run handles
    this automatically once DNS resolves correctly — typically minutes to a
    few hours).

## Testing

- Automated: none of this is meaningfully unit-testable (it's
  infrastructure/deployment configuration, not application logic) except
  the `config.py`/`main.py` CORS-origin-parsing change, which gets a small
  unit test (splits/strips a comma-separated string correctly, including
  the default value).
- Manual smoke-test checklist after deploying (not automated — hits live
  billed resources):
  1. `curl https://api.globepulseai.com/api/subscription/plans` returns the
     plans list (confirms the backend is up and Firestore cloud mode works).
  2. Load `https://globepulseai.com` in a browser, confirm the dashboard
     renders and network requests go to `api.globepulseai.com`, not
     `localhost`.
  3. Sign up a throwaway account through the deployed frontend, confirm the
     user document appears in the real Firestore console.
  4. Open the agent chat, confirm the WebSocket connects to
     `wss://api.globepulseai.com/ws/chat` and streams a response.
  5. Confirm `https://www.globepulseai.com` also loads (both frontend
     domain mappings).

## Risks / Notes

- Cloud Run's free tier (2 million requests/month, generous CPU/memory
  allotment) comfortably covers a hackathon/demo workload for both services.
- `--allow-unauthenticated` is required for both services since the browser
  calls them directly — this is standard for a public web app, not a
  security gap. Firestore access is still fully locked down server-side
  (Phase 1's deny-all rules) and the backend is the only thing with
  Firestore credentials.
- Secret values are never handled by the agent/AI session — only secret
  *names* and the `gcloud` commands to set them are specified here. The
  user adds real values directly.
- The `www.globepulseai.com` and `globepulseai.com` apex both map to the
  same frontend service — no separate redirect logic needed, Cloud Run
  domain mappings handle both independently at the DNS level.

## Explicitly Out of Scope

- CI/CD automation (GitHub Actions or Cloud Build triggers on push) —
  deploys stay manual (`gcloud run deploy`) for now.
- Cloud CDN in front of the frontend Cloud Run service.
- Cloud Scheduler + Cloud Run Jobs for the news-ingestion pipeline (already
  deferred in the Phase 1 spec; still only manually triggered via the
  admin-key-gated `/api/pipeline/run` endpoint).
- Autoscaling/concurrency tuning beyond Cloud Run defaults.
- Monitoring/alerting dashboards beyond Cloud Run's built-in metrics.
- Granting `SUNILMVVK`/`mathamatigician` any IAM access to `globepulse-ai`
  (deferred in Phase 1, still deferred here — deploys are performed by the
  project owner).
