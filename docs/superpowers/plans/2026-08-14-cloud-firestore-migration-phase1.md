# Cloud Firestore Migration (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it possible to point GlobePulse's FastAPI backend at a real, GCP-hosted Cloud Firestore database instead of the local-only emulator, purely via environment configuration — with no silent data divergence if the real database is briefly unreachable.

**Architecture:** Two modes, selected entirely by whether `FIRESTORE_EMULATOR_HOST` is present in the process environment. Emulator mode (today's default developer experience) keeps the existing lenient behavior: a Firestore failure logs and falls back to a local JSON file. Cloud mode is new: a Firestore failure raises instead of silently falling back, so a developer's laptop and the real shared database can never quietly drift apart. No new library — `google-cloud-firestore` stays; only `backend/config.py` and `backend/database.py` change.

**Tech Stack:** Python 3.12, FastAPI, `google-cloud-firestore`, `pydantic-settings`. Tests use the stdlib `unittest` + `unittest.mock` (matching `tests/test_agentic_flow.py` — this repo has no pytest installed and no CI).

**Spec:** [docs/superpowers/specs/2026-08-07-cloud-firestore-migration-design.md](../specs/2026-08-07-cloud-firestore-migration-design.md)

## Global Constraints

- No downloadable service-account JSON key file — cloud mode auth comes from `gcloud auth application-default login` (Application Default Credentials), never a key file.
- Cloud mode must hard-fail (raise) on a Firestore error instead of silently falling back to a local JSON file. Emulator mode's existing lenient fallback must be unchanged.
- Mode selection is purely `FIRESTORE_EMULATOR_HOST` presence in `os.environ` — no new env var names, no per-environment code branches.
- `backend/test_firestore_emulator.py` (the existing manual emulator smoke-test script) stays as-is; it is not a task in this plan.
- Tests must never make a real network call or depend on a running Firestore emulator — `firestore.Client` is always mocked.

---

## ⚠️ Rollout note — read before starting Task 2

Your own local `.env` at the repo root currently has **no** `FIRESTORE_EMULATOR_HOST` line. Today that's masked by `config.py`'s hardcoded `"localhost:8080"` default. After Task 1 removes that default, your local backend would start in **cloud mode** on the next run — and since no real GCP project/ADC is configured on this machine, it would hard-fail on startup. Task 2 includes adding the line to your real `.env`, not just `.env.example`, specifically to prevent that. Don't skip it.

---

### Task 1: Stop forcing the Firestore emulator host by default

**Files:**
- Modify: `backend/config.py:19` and `backend/config.py:37` (both `Settings` class definitions — the `pydantic-settings` branch and the `pydantic` v1 fallback branch)
- Create: `backend/test_firestore_mode.py`

**Interfaces:**
- Produces: no change to any existing public name — `config.Settings.firestore_emulator_host` simply defaults to `None` instead of `"localhost:8080"`.

- [ ] **Step 1: Write the failing test**

Create `backend/test_firestore_mode.py`:

```python
import os
import sys
import unittest
from unittest.mock import patch

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import config


class TestFirestoreEmulatorHostDefault(unittest.TestCase):
    """backend/config.py must not force emulator mode by default -- that's
    what blocked cloud mode from ever being reachable before this change."""

    def test_defaults_to_none_when_unset(self):
        env_patcher = patch.dict(os.environ)
        env_patcher.start()
        self.addCleanup(env_patcher.stop)
        os.environ.pop("FIRESTORE_EMULATOR_HOST", None)

        settings = config.Settings(_env_file=None)

        self.assertIsNone(settings.firestore_emulator_host)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3 -m unittest test_firestore_mode.py -v`
Expected: FAIL — `AssertionError: 'localhost:8080' is not None`

- [ ] **Step 3: Change the default in `backend/config.py`**

In both `Settings` class bodies (the `pydantic_settings.BaseSettings` branch and the `pydantic.BaseSettings` fallback branch), change:

```python
        firestore_emulator_host: Optional[str] = "localhost:8080"
```

to:

```python
        firestore_emulator_host: Optional[str] = None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python3 -m unittest test_firestore_mode.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/config.py backend/test_firestore_mode.py
git commit -m "fix(config): stop defaulting Firestore emulator host so cloud mode is reachable"
```

---

### Task 2: Explicit Firestore mode + hard-fail-in-cloud-mode in `backend/database.py`

**Files:**
- Modify: `backend/database.py:1-22` (module-level Firestore client init), and the `except Exception as e:` blocks inside `load_users`, `save_users`, `save_order`, `get_order`, `load_feedback`, `save_feedback`
- Modify: `backend/test_firestore_mode.py` (append tests)
- Modify: `.env.example`
- Modify: `.env` (this machine's real, gitignored local file — see rollout note above)

**Interfaces:**
- Consumes: `config.settings.firestore_project_id` (from Task 1's `config` module, unchanged type: `str`)
- Produces: `database.FIRESTORE_MODE: str` (`"emulator"` or `"cloud"`), `database._handle_firestore_failure(action: str, exc: Exception) -> None` (raises `RuntimeError` in cloud mode, otherwise only logs)

**Scope note:** the spec's prose names `load_users()`/`save_users()` as the example, but `save_order`/`get_order` (Razorpay order records) and `load_feedback`/`save_feedback` share the exact same try-Firestore-then-fall-back-to-local-JSON shape, for the exact same reason the spec gives (avoid silent divergence from the real database) — orders are arguably higher-stakes than users since they're the source of truth for what a payment actually paid for. This task applies the same hard-fail helper to all six functions rather than leaving three of them inconsistent. `seed_demo_users`/`seed_demo_articles`/`seed_demo_feedback` are deliberately **not** touched — they're idempotent best-effort seed operations that already `return` early when `db is None`, not a read/write source-of-truth path, so the divergence risk the spec is guarding against doesn't apply to them.

- [ ] **Step 1: Write the failing tests**

In `backend/test_firestore_mode.py`, replace the import block at the top of the file:

```python
import os
import sys
import unittest
from unittest.mock import patch

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import config
```

with:

```python
import importlib
import os
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import config
import database
```

Then add this new class at the bottom of the file, right before `if __name__ == "__main__":`:

```python
class TestFirestoreModeHardFail(unittest.TestCase):
    """database.py must hard-fail on a Firestore error in cloud mode instead
    of silently falling back to a local JSON file (which would let a real
    shared database quietly diverge from whatever's on one developer's
    laptop), while emulator mode keeps today's lenient fallback."""

    def setUp(self):
        self._orig_cwd = os.getcwd()
        self._tmp_dir = tempfile.TemporaryDirectory()
        os.chdir(self._tmp_dir.name)
        self.addCleanup(os.chdir, self._orig_cwd)
        self.addCleanup(self._tmp_dir.cleanup)

        env_patcher = patch.dict(os.environ)
        env_patcher.start()
        self.addCleanup(env_patcher.stop)

        self.mock_firestore_client = MagicMock()
        client_patcher = patch(
            "google.cloud.firestore.Client", return_value=self.mock_firestore_client
        )
        client_patcher.start()
        self.addCleanup(client_patcher.stop)

    def _reload_in_mode(self, firestore_emulator_host):
        os.environ.pop("FIRESTORE_EMULATOR_HOST", None)
        if firestore_emulator_host:
            os.environ["FIRESTORE_EMULATOR_HOST"] = firestore_emulator_host
        importlib.reload(config)
        importlib.reload(database)

    def test_cloud_mode_raises_on_load_failure(self):
        self._reload_in_mode(firestore_emulator_host=None)
        self.assertEqual(database.FIRESTORE_MODE, "cloud")
        self.mock_firestore_client.collection.side_effect = Exception("outage")

        with self.assertRaises(RuntimeError):
            database.load_users()

    def test_cloud_mode_does_not_write_local_file_on_save_failure(self):
        self._reload_in_mode(firestore_emulator_host=None)
        self.mock_firestore_client.batch.side_effect = Exception("outage")

        with self.assertRaises(RuntimeError):
            database.save_users({"a@b.com": {"first_name": "A"}})

        self.assertFalse(os.path.exists(database.get_users_file_path()))

    def test_emulator_mode_falls_back_on_load_failure(self):
        self._reload_in_mode(firestore_emulator_host="localhost:8080")
        self.assertEqual(database.FIRESTORE_MODE, "emulator")
        self.mock_firestore_client.collection.side_effect = Exception("not running")

        result = database.load_users()

        self.assertEqual(result, {})

    def test_emulator_mode_still_writes_local_file_on_save_failure(self):
        self._reload_in_mode(firestore_emulator_host="localhost:8080")
        self.mock_firestore_client.batch.side_effect = Exception("not running")

        database.save_users({"a@b.com": {"first_name": "A"}})

        self.assertTrue(os.path.exists(database.get_users_file_path()))
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python3 -m unittest test_firestore_mode.py -v`
Expected: FAIL — `AttributeError: module 'database' has no attribute 'FIRESTORE_MODE'`

- [ ] **Step 3: Replace the module-level Firestore init in `backend/database.py`**

Replace lines 12-22 (from `# Setup Firestore Client if environment is present` through the closing `else:` block) with:

```python
# Firestore mode is decided purely by whether FIRESTORE_EMULATOR_HOST is set in
# the process environment (config.py sets it from settings.firestore_emulator_host
# unless GOOGLE_APPLICATION_CREDENTIALS/K_SERVICE are present). Emulator mode keeps
# today's lenient local-file fallback; cloud mode hard-fails instead of risking
# silent data divergence between a developer's machine and the real database.
FIRESTORE_MODE = "emulator" if "FIRESTORE_EMULATOR_HOST" in os.environ else "cloud"

db = None
if settings.firestore_project_id:
    try:
        db = firestore.Client(project=settings.firestore_project_id)
        logger.info(f"Firestore Client initialized successfully ({FIRESTORE_MODE} mode).")
    except Exception as e:
        logger.error(f"Failed to initialize Firestore Client: {e}")
        if FIRESTORE_MODE == "cloud":
            raise RuntimeError(
                f"Firestore client failed to initialize in cloud mode: {e}"
            ) from e
        db = None
else:
    logger.info("Firestore Client initialization skipped (no FIRESTORE_PROJECT_ID configured).")


def _handle_firestore_failure(action: str, exc: Exception) -> None:
    """Handles a Firestore operation failure.

    In emulator mode, logs and lets the caller fall back to its local JSON
    file, matching today's lenient offline-friendly behavior. In cloud mode,
    re-raises so callers cannot silently fall back to a local file and let
    data quietly diverge from the real, shared database.
    """
    logger.error(f"Error {action}: {exc}")
    if FIRESTORE_MODE == "cloud":
        raise RuntimeError(f"Firestore operation failed in cloud mode while {action}") from exc
```

- [ ] **Step 4: Route the six functions' Firestore exception handlers through `_handle_firestore_failure`**

In `load_users` (`backend/database.py`), change:

```python
        except Exception as e:
            logger.error(f"Error loading users from Firestore: {e}")
```

to:

```python
        except Exception as e:
            _handle_firestore_failure("loading users from Firestore", e)
```

In `save_users`, change:

```python
        except Exception as e:
            logger.error(f"Error saving users to Firestore: {e}")
```

to:

```python
        except Exception as e:
            _handle_firestore_failure("saving users to Firestore", e)
```

In `save_order`, change:

```python
        except Exception as e:
            logger.error(f"Error saving order {order_id} to Firestore: {e}")
```

to:

```python
        except Exception as e:
            _handle_firestore_failure(f"saving order {order_id} to Firestore", e)
```

In `get_order`, change:

```python
        except Exception as e:
            logger.error(f"Error fetching order {order_id} from Firestore: {e}")
```

to:

```python
        except Exception as e:
            _handle_firestore_failure(f"fetching order {order_id} from Firestore", e)
```

In `load_feedback`, change:

```python
        except Exception as e:
            logger.error(f"Error loading feedback from Firestore: {e}")
```

to:

```python
        except Exception as e:
            _handle_firestore_failure("loading feedback from Firestore", e)
```

In `save_feedback`, change:

```python
        except Exception as e:
            logger.error(f"Error saving feedback to Firestore: {e}")
```

to:

```python
        except Exception as e:
            _handle_firestore_failure("saving feedback to Firestore", e)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python3 -m unittest test_firestore_mode.py -v`
Expected: PASS (5 tests: the Task 1 test plus the 4 new ones)

- [ ] **Step 6: Update `.env.example` to document both modes**

Replace the current single-mode block:

```bash
GEMINI_API_KEY="your gemini key"
AGENT_MODEL=gemini-2.5-flash
FIRESTORE_PROJECT_ID=globepulse-demo
FIRESTORE_EMULATOR_HOST=localhost:8080
ADMIN_KEY="your_secure_admin_key_here"
```

with:

```bash
GEMINI_API_KEY="your gemini key"
AGENT_MODEL=gemini-2.5-flash
ADMIN_KEY="your_secure_admin_key_here"

# --- Firestore: local dev (emulator) — default, matches today's setup ---
FIRESTORE_PROJECT_ID=globepulse-demo
FIRESTORE_EMULATOR_HOST=localhost:8080

# --- Firestore: cloud (real Cloud Firestore) — remove the line above, set these instead ---
# FIRESTORE_PROJECT_ID=<your-real-gcp-project-id>
# (no FIRESTORE_EMULATOR_HOST — auth comes from `gcloud auth application-default login`)
```

(Leave the Razorpay block below unchanged.)

- [ ] **Step 7: Add the emulator line to this machine's real local `.env`**

Check `.env` at the repo root for a `FIRESTORE_EMULATOR_HOST` line. If it's missing (it is, as of this plan being written), append:

```bash
FIRESTORE_EMULATOR_HOST=localhost:8080
```

This keeps local `make dev-backend` / `make start` working exactly as before Task 1's default change. Confirm with `grep FIRESTORE_EMULATOR_HOST .env` before moving on.

- [ ] **Step 8: Commit**

```bash
git add backend/database.py backend/test_firestore_mode.py .env.example
git commit -m "feat(firestore): hard-fail on Firestore errors in cloud mode instead of silently diverging to local JSON"
```

(`.env` is gitignored and intentionally not part of this commit — Step 7 is a local machine change, not a code change.)

---

### Task 3: Update setup docs for the two Firestore modes

**Files:**
- Modify: `docs/INSTALLATION.md:110-114` (the `.env` setup block)
- Modify: `docs/superpowers/specs/2026-08-07-cloud-firestore-migration-design.md` (status line)

**Interfaces:** none — documentation only, no code.

- [ ] **Step 1: Update `docs/INSTALLATION.md`**

Find the `.env` block showing:

```
FIRESTORE_PROJECT_ID=globepulse-demo
FIRESTORE_EMULATOR_HOST=localhost:8080
```

Add a short note directly below it (keep the existing block as-is for the default/emulator path):

```markdown
> **Using real Cloud Firestore instead of the emulator?** Remove the
> `FIRESTORE_EMULATOR_HOST` line, point `FIRESTORE_PROJECT_ID` at your real
> GCP project, and run `gcloud auth application-default login` once. See
> [docs/superpowers/specs/2026-08-07-cloud-firestore-migration-design.md](superpowers/specs/2026-08-07-cloud-firestore-migration-design.md)
> for the full provisioning runbook.
```

- [ ] **Step 2: Mark the spec as implemented**

In `docs/superpowers/specs/2026-08-07-cloud-firestore-migration-design.md`, change the header line:

```markdown
**Status:** Approved for planning
```

to:

```markdown
**Status:** Implemented (code changes only — see spec's "Provisioning Runbook" for the still-manual GCP project setup steps)
```

- [ ] **Step 3: Commit**

```bash
git add docs/INSTALLATION.md docs/superpowers/specs/2026-08-07-cloud-firestore-migration-design.md
git commit -m "docs: document cloud Firestore mode setup and mark phase 1 spec implemented"
```

---

## After this plan

This branch still needs to go through a PR into `develop` (branch protection requires 1 approval). Actual GCP project provisioning (creating the project, enabling the Firestore API, granting IAM roles, running `gcloud auth application-default login`) is the "Provisioning Runbook" section of the spec — deliberately manual steps, not something this plan automates, and not required before merging (emulator mode is unaffected).

Phase 2 (containerizing FastAPI, Cloud Run deployment, Secret Manager, custom domain mapping, frontend hosting) is a separate design — brainstorm it fresh once this is merged.
