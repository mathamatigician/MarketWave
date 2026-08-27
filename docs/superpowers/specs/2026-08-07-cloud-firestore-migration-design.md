# Design: Real Cloud Firestore Migration (Phase 1 of the GCP Backend Move)

**Status:** Implemented (code changes only — see this spec's "Provisioning Runbook" for the still-manual GCP project setup steps)
**Date:** 2026-08-07
**Related:** [docs/google_cloud_migration_roadmap.md](../../google_cloud_migration_roadmap.md), [docs/firestore_feasibility_study.md](../../firestore_feasibility_study.md)

## Goal & Scope

Move MarketWave's datastore off the local-only Firestore emulator onto a real,
GCP-hosted Cloud Firestore database. The FastAPI backend keeps running wherever
it runs today (a developer's machine) — it just talks to real Firestore instead
of `localhost:8080`.

This is phase 1 of a larger "move the backend to GCP" effort. Phase 2
(containerizing and deploying FastAPI itself to Cloud Run, Secret Manager for
API keys, CORS for a real frontend origin) is explicitly **out of scope** here
and gets its own design/spec afterward. Cloud Scheduler + Cloud Run Jobs for
automating the news-ingestion pipeline is a further, optional phase — today the
pipeline is only ever triggered manually via the admin-key-gated
`/api/pipeline/run` endpoint, so nothing about "moving the backend" requires
automating it.

## Current State (baseline)

- `backend/database.py` already uses the real `google-cloud-firestore` Python
  SDK — not a mock or a different local library. It is currently pointed at
  the **local Firestore emulator** via `FIRESTORE_EMULATOR_HOST=localhost:8080`
  in `.env`.
- If the Firestore client can't be built, `load_users()`/`save_users()` fall
  back to reading/writing a local `users.json` file. This fallback is silent —
  no error is raised, just a log line.
- `firestore.rules` already denies all direct client reads/writes (`allow
  read, write: if false`), because only the trusted server-side SDK ever talks
  to Firestore — the React frontend only calls the FastAPI backend over HTTP.
  This rule is correct as-is and needs no changes, only deployment to a real
  project.
- No Dockerfile, no Cloud Run/App Engine config, and no service-account/ADC
  setup exist anywhere in the repo today — everything currently assumes a
  local dev machine.
- No precious data is at risk in this migration: the local `users.json` only
  contains the seeded demo account, and `seed_demo_users()` /
  `seed_demo_articles()` are already idempotent (they check for existing data
  before writing).

## Architecture

No new library — the same `google-cloud-firestore` SDK stays. Two modes,
selected purely by environment configuration, with no per-environment code
branches:

- **Local/dev (default, unchanged):** Firestore emulator, exactly as today.
- **Cloud (new):** a real Native-mode Firestore database in a GCP project,
  reached via `gcloud auth application-default login` (Application Default
  Credentials) for any developer who needs to hit it from a laptop.
  **No downloadable service-account JSON key file** — a long-lived key file is
  itself a secret that has to be distributed and protected, the same class of
  risk as the hardcoded Razorpay credentials flagged in the PR #12 review.
  ADC ties access to each developer's own Google identity, is easy to revoke
  per-person via IAM, and requires zero extra code (the `google-cloud-firestore`
  SDK's default credential resolution already checks for it).
  In phase 2, Cloud Run's attached service account will provide credentials
  automatically in production — no code change needed then either.

```
Local dev machine                    Real Cloud Firestore (GCP project)
┌─────────────────────┐              ┌────────────────────────────────┐
│ FastAPI (uvicorn)    │   ADC auth   │  Firestore (Native mode)       │
│ backend/database.py  │─────────────▶│  users / articles collections  │
│                       │              │  firestore.rules: deny-all     │
└─────────────────────┘              └────────────────────────────────┘
        │
        │ (local dev mode only, unchanged)
        ▼
┌─────────────────────┐
│ Firestore Emulator   │
│ localhost:8080       │
└─────────────────────┘
```

## Code Changes

### 1. `backend/config.py` — stop forcing the emulator host by default

Today, `firestore_emulator_host: Optional[str] = "localhost:8080"` defaults to
the emulator address even when `.env` doesn't set it, and the post-processing
block exports it into the process environment unless
`GOOGLE_APPLICATION_CREDENTIALS` or `K_SERVICE` is present:

```python
if settings.firestore_emulator_host and "GOOGLE_APPLICATION_CREDENTIALS" not in os.environ and "K_SERVICE" not in os.environ:
    os.environ["FIRESTORE_EMULATOR_HOST"] = settings.firestore_emulator_host
```

This means there is currently no way to run "real Firestore via ADC, no key
file, not on Cloud Run" — the emulator address always wins unless one of those
two specific env vars is present. Fix:

- Change the field default to `None`: `firestore_emulator_host: Optional[str] = None`.
- `.env.example` and each developer's local `.env` explicitly set
  `FIRESTORE_EMULATOR_HOST=localhost:8080` to opt into emulator mode (today's
  default developer experience is preserved — nothing changes for anyone who
  keeps that line in their `.env`).
- Leaving it unset (or removing the line) + having valid ADC credentials +
  `FIRESTORE_PROJECT_ID` pointed at the real project = cloud mode.

### 2. `backend/database.py` — explicit mode, hard-fail in cloud mode

Client-init condition changes from gating on specific env-var names to: try to
build a client whenever `FIRESTORE_PROJECT_ID` is configured.

- **Emulator mode** (`FIRESTORE_EMULATOR_HOST` set): keep today's lenient
  behavior — if the emulator isn't reachable, fall back to `users.json` as
  now. This is convenient for offline/local dev and low-risk since the
  emulator's data was never durable anyway.
- **Cloud mode** (`FIRESTORE_EMULATOR_HOST` unset, real project configured):
  **hard-fail** — raise instead of silently writing to `users.json`. Once
  we're pointed at a real shared database, a silent local-file fallback risks
  data quietly diverging between individual machines and the real DB with no
  visible error. This was an explicit decision: no silent fallback in cloud
  mode.

### 3. `.env.example` — document both modes

Add two clearly-labeled blocks so a developer knows exactly which variables to
set/unset to switch:

```bash
# --- Local dev (Firestore emulator) — default ---
FIRESTORE_PROJECT_ID=marketwave-demo
FIRESTORE_EMULATOR_HOST=localhost:8080

# --- Cloud (real Firestore) — remove the line above, set these instead ---
# FIRESTORE_PROJECT_ID=<your-real-gcp-project-id>
# (no FIRESTORE_EMULATOR_HOST — auth comes from `gcloud auth application-default login`)
```

## Provisioning Runbook (documented steps, not executed as part of this design)

1. `gcloud projects create <PROJECT_ID>` (or reuse an existing empty GCP
   project) and confirm billing is enabled.
2. `gcloud services enable firestore.googleapis.com --project <PROJECT_ID>`.
3. `gcloud firestore databases create --project <PROJECT_ID> --location=asia-south1 --type=firestore-native`
   — region defaults to `asia-south1` (Mumbai) given the ₹-priced Razorpay
   integration; a one-line change if a different region is wanted.
4. Grant each developer's own Google identity `roles/datastore.user` on the
   project (least privilege — not Owner, not a shared service-account key).
5. `firebase deploy --only firestore:rules --project <PROJECT_ID>` to push the
   existing deny-all `firestore.rules` unchanged.
6. Each developer who needs to hit the real project runs
   `gcloud auth application-default login` once.
7. Point `.env` at the new project (see block above) and start the backend
   normally (`make dev-backend` or `make start` without the emulator target) —
   `seed_demo_users()` / `seed_demo_articles()` run automatically on startup
   and are idempotent, so this alone seeds the new database.

## Testing

- `backend/test_firestore_emulator.py` stays as-is and continues to test
  emulator mode — no changes needed there.
- Add a manual smoke-test checklist for verifying the real project (not
  automated, since it would hit a live billed resource):
  1. Sign up a throwaway test account → confirm the user document appears in
     the Firestore console.
  2. Log in with the seeded demo account → confirm `subscription`/`watchlist`
     fields round-trip correctly.
  3. Update the watchlist → confirm the write lands in the real project.
  4. Kill local ADC credentials (`gcloud auth application-default revoke`) →
     confirm the backend now hard-fails on a Firestore call in cloud mode
     instead of silently falling back to `users.json`.

## Risks / Notes

- Firestore's free tier (50k reads / 20k writes per day) comfortably covers a
  hackathon/demo workload — no cost action needed for this phase.
- Hard-failing in cloud mode is a deliberate behavior change from today's
  always-lenient fallback; it only applies when `FIRESTORE_EMULATOR_HOST` is
  unset, so it cannot affect the existing local emulator workflow.

## Explicitly Out of Scope

- Containerizing and deploying FastAPI to Cloud Run.
- Cloud Scheduler + Cloud Run Jobs for the news-ingestion pipeline.
- Firebase Hosting for the frontend.
- Secret Manager for `GEMINI_API_KEY` / Razorpay keys (stay in local `.env`
  for now — revisited in the Cloud Run phase).
