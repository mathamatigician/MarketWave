# Google Sign-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Sign in with Google" as an additional login method, alongside the existing email/password forms, auto-linked by email.

**Architecture:** Frontend gets a signed ID token from Google Identity Services and POSTs it to a new `/api/auth/google` backend endpoint. The backend verifies the token's signature server-side (`google-auth`), looks up or creates a Firestore user by the verified email, and returns the same response shape `/api/login` already returns — so the frontend's existing `onLoginSuccess`/`localStorage` session handling needs zero changes.

**Tech Stack:** FastAPI + `google-auth` (backend), Google Identity Services JS SDK (frontend, no new npm dependency), same Docker/Cloud Run deployment pattern as the rest of the app.

**Spec:** `docs/superpowers/specs/2026-08-15-google-signin-design.md`

## Global Constraints

- No secret values handled in this plan or by the implementing agent. The Google OAuth Client ID is the only new credential-like value and it is **public by design** — a plain env var (`GOOGLE_CLIENT_ID` backend, `VITE_GOOGLE_CLIENT_ID` frontend build arg), never a Secret Manager entry.
- Never import `backend/main.py` directly in a test or verification script — its top-level `google.antigravity`/orchestrator imports hang in this environment. Use `python3 -m py_compile main.py` for syntax-only verification of `main.py` changes, and put anything that needs real unit testing in its own importable module (this is why `backend/google_auth.py` exists).
- `frontend/` has no test framework (no vitest/jest — checked `package.json`). Frontend task verification is `npm run build` (runs `tsc -b` then `vite build`) succeeding cleanly, plus (where relevant) a real `docker build`/`docker run` smoke test — never claim a frontend change works without actually running one of these.
- Every new `config.py` setting must be added identically to **both** `Settings` class bodies (the `pydantic_settings` branch and the `pydantic` v1 fallback branch) — this repo's established dual-branch pattern.
- Google Sign-In must not change any existing behavior when it isn't used: the button renders nothing if `GOOGLE_CLIENT_ID`/`VITE_GOOGLE_CLIENT_ID` is unset, and no existing endpoint's behavior changes.
- Match existing code style exactly (import order, docstring style, existing indentation) — don't reformat surrounding code.

---

### Task 1: Backend — Google ID-token verification module

**Files:**
- Create: `backend/google_auth.py`
- Create: `backend/test_google_auth.py`
- Modify: `backend/config.py` (add `google_client_id` setting to both `Settings` classes)
- Modify: `backend/requirements.txt` (add `google-auth`)

**Interfaces:**
- Produces: `google_auth.verify_and_get_user(credential: str) -> dict` — verifies the token, returns a user dict (same shape as `/api/login`'s response, no `password_hash` key). Raises `ValueError` if the token is invalid. Task 2 (main.py route) calls this directly.
- Consumes: `database.load_users() -> dict`, `database.save_users(users: dict)` (existing, unchanged), `config.settings.google_client_id` (added by this task).

- [ ] **Step 1: Add the `google_client_id` setting to `backend/config.py`**

In `backend/config.py`, add `google_client_id: str = ""` to **both** `Settings` class bodies. The first occurrence (inside the `try:` block, `pydantic_settings` branch) currently reads:

```python
    class Settings(BaseSettings):
        gemini_api_key: Optional[str] = None
        google_api_key: Optional[str] = None
        agent_model: str = "gemini-2.5-flash"
        firestore_project_id: str = "globepulse-demo"
        firestore_emulator_host: Optional[str] = None
        allowed_origins: str = "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174,http://localhost:8000,http://127.0.0.1:8000"
        admin_key: Optional[str] = None
        razorpay_key_id: Optional[str] = None
        razorpay_key_secret: Optional[str] = None

        model_config = SettingsConfigDict(
```

Change it to:

```python
    class Settings(BaseSettings):
        gemini_api_key: Optional[str] = None
        google_api_key: Optional[str] = None
        agent_model: str = "gemini-2.5-flash"
        firestore_project_id: str = "globepulse-demo"
        firestore_emulator_host: Optional[str] = None
        allowed_origins: str = "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174,http://localhost:8000,http://127.0.0.1:8000"
        admin_key: Optional[str] = None
        razorpay_key_id: Optional[str] = None
        razorpay_key_secret: Optional[str] = None
        google_client_id: str = ""

        model_config = SettingsConfigDict(
```

The second occurrence (inside the `except ImportError:` block, `pydantic` v1 fallback branch) currently reads:

```python
    class Settings(BaseSettings):
        gemini_api_key: Optional[str] = None
        google_api_key: Optional[str] = None
        agent_model: str = "gemini-2.5-flash"
        firestore_project_id: str = "globepulse-demo"
        firestore_emulator_host: Optional[str] = None
        allowed_origins: str = "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174,http://localhost:8000,http://127.0.0.1:8000"
        admin_key: Optional[str] = None
        razorpay_key_id: Optional[str] = None
        razorpay_key_secret: Optional[str] = None

        class Config:
            env_file = env_path
```

Change it to:

```python
    class Settings(BaseSettings):
        gemini_api_key: Optional[str] = None
        google_api_key: Optional[str] = None
        agent_model: str = "gemini-2.5-flash"
        firestore_project_id: str = "globepulse-demo"
        firestore_emulator_host: Optional[str] = None
        allowed_origins: str = "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174,http://localhost:8000,http://127.0.0.1:8000"
        admin_key: Optional[str] = None
        razorpay_key_id: Optional[str] = None
        razorpay_key_secret: Optional[str] = None
        google_client_id: str = ""

        class Config:
            env_file = env_path
```

- [ ] **Step 2: Add `google-auth` to `backend/requirements.txt`**

Current `backend/requirements.txt`:

```
fastapi
uvicorn
google-antigravity
pydantic
pandas
numpy
requests
beautifulsoup4
googlenewsdecoder
google-genai
yahooquery
websockets
google-cloud-firestore
pydantic-settings

razorpay
```

Add `google-auth` on its own line, next to the other `google-*` packages:

```
fastapi
uvicorn
google-antigravity
pydantic
pandas
numpy
requests
beautifulsoup4
googlenewsdecoder
google-genai
google-auth
yahooquery
websockets
google-cloud-firestore
pydantic-settings

razorpay
```

- [ ] **Step 3: Write the failing tests — `backend/test_google_auth.py`**

```python
import os
import sys
import unittest
from unittest.mock import patch

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import google_auth


class TestVerifyAndGetUser(unittest.TestCase):
    def _fake_idinfo(self, **overrides):
        idinfo = {
            "email": "newuser@example.com",
            "given_name": "New",
            "family_name": "User",
            "picture": "https://example.com/photo.jpg",
        }
        idinfo.update(overrides)
        return idinfo

    @patch("google_auth.database.save_users")
    @patch("google_auth.database.load_users")
    @patch("google_auth.id_token.verify_oauth2_token")
    def test_creates_new_user_with_correct_defaults(
        self, mock_verify, mock_load_users, mock_save_users
    ):
        mock_verify.return_value = self._fake_idinfo()
        mock_load_users.return_value = {}

        result = google_auth.verify_and_get_user("fake-credential")

        mock_save_users.assert_called_once()
        saved_users = mock_save_users.call_args[0][0]
        created = saved_users["newuser@example.com"]
        self.assertEqual(created["first_name"], "New")
        self.assertEqual(created["last_name"], "User")
        self.assertEqual(created["email"], "newuser@example.com")
        self.assertEqual(created["phone"], "")
        self.assertEqual(created["picture"], "https://example.com/photo.jpg")
        self.assertEqual(created["password_hash"], "")
        self.assertEqual(created["watchlist"], "Tesla,Apple,Google")
        self.assertEqual(created["subscription"]["plan_id"], "free")
        self.assertNotIn("password_hash", result)
        self.assertEqual(result["email"], "newuser@example.com")

    @patch("google_auth.database.save_users")
    @patch("google_auth.database.load_users")
    @patch("google_auth.id_token.verify_oauth2_token")
    def test_existing_user_logs_in_without_being_overwritten(
        self, mock_verify, mock_load_users, mock_save_users
    ):
        mock_verify.return_value = self._fake_idinfo(
            email="existing@example.com", given_name="Ignored", family_name="Ignored"
        )
        mock_load_users.return_value = {
            "existing@example.com": {
                "first_name": "Original",
                "last_name": "Name",
                "email": "existing@example.com",
                "phone": "555-1234",
                "picture": "https://example.com/already-set.jpg",
                "password_hash": "some-hash",
                "watchlist": "Tesla",
                "subscription": {"plan_id": "pro"},
            }
        }

        result = google_auth.verify_and_get_user("fake-credential")

        mock_save_users.assert_not_called()
        self.assertEqual(result["first_name"], "Original")
        self.assertEqual(result["picture"], "https://example.com/already-set.jpg")
        self.assertNotIn("password_hash", result)

    @patch("google_auth.database.save_users")
    @patch("google_auth.database.load_users")
    @patch("google_auth.id_token.verify_oauth2_token")
    def test_backfills_picture_when_existing_user_has_none(
        self, mock_verify, mock_load_users, mock_save_users
    ):
        mock_verify.return_value = self._fake_idinfo(
            email="existing@example.com", picture="https://example.com/new-photo.jpg"
        )
        mock_load_users.return_value = {
            "existing@example.com": {
                "first_name": "Original",
                "last_name": "Name",
                "email": "existing@example.com",
                "phone": "",
                "picture": "",
                "password_hash": "some-hash",
                "watchlist": "Tesla",
                "subscription": {"plan_id": "pro"},
            }
        }

        result = google_auth.verify_and_get_user("fake-credential")

        mock_save_users.assert_called_once()
        saved_users = mock_save_users.call_args[0][0]
        self.assertEqual(
            saved_users["existing@example.com"]["picture"],
            "https://example.com/new-photo.jpg",
        )
        self.assertEqual(result["picture"], "https://example.com/new-photo.jpg")

    @patch("google_auth.id_token.verify_oauth2_token")
    def test_invalid_token_raises_value_error(self, mock_verify):
        mock_verify.side_effect = ValueError("Token used too late")

        with self.assertRaises(ValueError):
            google_auth.verify_and_get_user("fake-credential")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 4: Run the test to verify it fails**

Run (from `backend/`): `python3 -m unittest test_google_auth -v`
Expected: `ModuleNotFoundError: No module named 'google_auth'` (the module doesn't exist yet).

- [ ] **Step 5: Create `backend/google_auth.py`**

```python
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

import database
from config import settings


def verify_and_get_user(credential: str) -> dict:
    """Verifies a Google ID token and returns the corresponding user record,
    creating one on first sign-in or auto-linking by email if one already
    exists. Raises ValueError if the token is invalid — the caller (main.py)
    turns that into a 401.
    """
    idinfo = id_token.verify_oauth2_token(
        credential, google_requests.Request(), settings.google_client_id
    )

    email_key = idinfo["email"].lower()
    users = database.load_users()

    if email_key not in users:
        users[email_key] = {
            "first_name": idinfo.get("given_name", ""),
            "last_name": idinfo.get("family_name", ""),
            "email": idinfo["email"],
            "phone": "",
            "picture": idinfo.get("picture", ""),
            "password_hash": "",
            "watchlist": "Tesla,Apple,Google",
            "subscription": {
                "plan_id": "free",
                "plan_name": "Starter",
                "status": "active",
                "badge": "FREE",
            },
        }
        database.save_users(users)
    elif not users[email_key].get("picture"):
        users[email_key]["picture"] = idinfo.get("picture", "")
        database.save_users(users)

    user = dict(users[email_key])
    user.pop("password_hash", None)
    return user
```

- [ ] **Step 6: Run the tests to verify they pass**

Run (from `backend/`): `python3 -m unittest test_google_auth -v`
Expected: all 4 tests pass (`OK`).

- [ ] **Step 7: Commit**

```bash
git add backend/google_auth.py backend/test_google_auth.py backend/config.py backend/requirements.txt
git commit -m "feat(auth): add Google ID-token verification module"
```

---

### Task 2: Backend — wire the `/api/auth/google` route into `main.py`

**Files:**
- Modify: `backend/main.py`

**Interfaces:**
- Consumes: `google_auth.verify_and_get_user` (Task 1).
- Produces: `POST /api/auth/google` endpoint, consumed by Task 4's `GoogleSignInButton.tsx`.

- [ ] **Step 1: Add the import**

In `backend/main.py`, the current import block (lines 1-19) ends with:

```python
import database
import functions
import pipeline
import subscription
import config
from config import settings
from google.antigravity import Agent, LocalAgentConfig
from backend.agents.orchestrator import orchestrator_config
```

Add `import google_auth as google_auth_module` after `from config import settings`:

```python
import database
import functions
import pipeline
import subscription
import config
from config import settings
import google_auth as google_auth_module
from google.antigravity import Agent, LocalAgentConfig
from backend.agents.orchestrator import orchestrator_config
```

(Imported `as google_auth_module` to avoid any ambiguity with the `google_auth` module name inside `main.py`'s own namespace, matching this file's existing explicit-alias style for its `google.*` imports.)

- [ ] **Step 2: Add the request model**

In `backend/main.py`'s `# --- Pydantic Request Models ---` section, the current text is:

```python
# --- Pydantic Request Models ---
class LoginRequest(BaseModel):
    email: str
    password: str

class SignupRequest(BaseModel):
    first_name: str
    last_name: Optional[str] = ""
    email: str
    password: str
    phone: Optional[str] = ""
```

Add `GoogleAuthRequest` right after `LoginRequest` (grouping the two auth-entry models together, before `SignupRequest`):

```python
# --- Pydantic Request Models ---
class LoginRequest(BaseModel):
    email: str
    password: str

class GoogleAuthRequest(BaseModel):
    credential: str  # the ID token JWT from Google's Sign In button

class SignupRequest(BaseModel):
    first_name: str
    last_name: Optional[str] = ""
    email: str
    password: str
    phone: Optional[str] = ""
```

- [ ] **Step 3: Add the route**

The existing `/api/login` route currently ends with:

```python
    return {
        "email": req.email,
        "first_name": user_info.get("first_name"),
        "last_name": user_info.get("last_name"),
        "watchlist": watchlist,
        "subscription": sub_info
    }
```

Insert the new route immediately after that closing `}` (and before the next route, `/api/watchlist`):

```python
    return {
        "email": req.email,
        "first_name": user_info.get("first_name"),
        "last_name": user_info.get("last_name"),
        "watchlist": watchlist,
        "subscription": sub_info
    }

@app.post("/api/auth/google")
def google_auth(req: GoogleAuthRequest):
    try:
        user_info = google_auth_module.verify_and_get_user(req.credential)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    watchlist_str = user_info.get("watchlist", "")
    watchlist = [t.strip() for t in watchlist_str.split(",") if t.strip()]

    return {
        "email": user_info.get("email"),
        "first_name": user_info.get("first_name"),
        "last_name": user_info.get("last_name"),
        "watchlist": watchlist,
        "subscription": user_info.get("subscription"),
        "picture": user_info.get("picture", ""),
    }
```

> **Ruling (recorded during Task 1's review, before this task was dispatched):**
> `google_auth.verify_and_get_user()` deliberately returns the *raw* stored
> record (minus `password_hash`) — `watchlist` as the comma-joined string
> Firestore actually stores, plus a `phone` key. `/api/login` (the function
> right above this route) parses `watchlist` into a list before returning
> it and never includes `phone`. The design spec's original sketch for this
> route was a bare `return google_auth_module.verify_and_get_user(...)`
> passthrough — Task 1's reviewer caught that shipping that literally would
> hand the frontend `watchlist` as a raw string instead of an array (a
> silent bug: `.map()` over a string iterates its characters). The route
> above fixes this by reshaping the dict into `/api/login`'s exact shape
> plus the new optional `picture` field, which the frontend's `UserInfo`
> type already expects as optional. Do **not** implement the bare
> passthrough shown in the design spec — the code block above is correct,
> the design spec is stale on this one detail.

- [ ] **Step 4: Verify syntax**

Run (from `backend/`): `python3 -m py_compile main.py`
Expected: no output, exit code 0. (Per Global Constraints — never try to import `main.py` directly, it hangs.)

- [ ] **Step 5: Commit**

```bash
git add backend/main.py
git commit -m "feat(auth): wire POST /api/auth/google into main.py"
```

---

### Task 3: Frontend — Google Identity Services plumbing (script, config, button component)

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/src/config.ts`
- Create: `frontend/src/components/GoogleSignInButton.tsx`

**Interfaces:**
- Produces: `GOOGLE_CLIENT_ID` exported from `config.ts`; `<GoogleSignInButton onLoginSuccess={...} />` component, props `{ onLoginSuccess: (user: UserInfo) => void }` where `UserInfo` matches the shape already used in `AuthForms.tsx` (`email`, `first_name`, `last_name`, `watchlist`, plus a new optional `picture?: string` added in Task 4).
- Consumes: `API_URL` from `config.ts` (existing).

- [ ] **Step 1: Add the Google Identity Services script tag**

Current `frontend/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MarketWave - Agentic Financial Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Add the script tag before `</head>`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MarketWave - Agentic Financial Dashboard</title>
    <script src="https://accounts.google.com/gsi/client" async defer></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Add `GOOGLE_CLIENT_ID` to `config.ts`**

Current `frontend/src/config.ts`:

```typescript
const hostname = window.location.hostname || 'localhost';
const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

export const API_URL = import.meta.env.VITE_API_URL || `${protocol}//${hostname}:8000`;
export const WS_URL = import.meta.env.VITE_WS_URL || `${wsProtocol}//${hostname}:8000`;
```

Add `GOOGLE_CLIENT_ID`:

```typescript
const hostname = window.location.hostname || 'localhost';
const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

export const API_URL = import.meta.env.VITE_API_URL || `${protocol}//${hostname}:8000`;
export const WS_URL = import.meta.env.VITE_WS_URL || `${wsProtocol}//${hostname}:8000`;
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
```

- [ ] **Step 3: Create `frontend/src/components/GoogleSignInButton.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { API_URL, GOOGLE_CLIENT_ID } from '../config';

interface UserInfo {
  email: string;
  first_name: string;
  last_name: string;
  watchlist: string[];
  picture?: string;
}

declare global {
  interface Window {
    google?: any;
  }
}

interface GoogleSignInButtonProps {
  onLoginSuccess: (user: UserInfo) => void;
}

export function GoogleSignInButton({ onLoginSuccess }: GoogleSignInButtonProps) {
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !window.google) return;

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response: { credential: string }) => {
        try {
          const res = await fetch(`${API_URL}/api/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: response.credential }),
          });
          if (res.ok) {
            onLoginSuccess(await res.json());
          }
        } catch (e) {
          // Network error — the existing email/password form remains usable.
        }
      },
    });

    if (buttonRef.current) {
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        width: 320,
      });
    }
  }, []);

  if (!GOOGLE_CLIENT_ID) return null;

  return <div ref={buttonRef} />;
}
```

- [ ] **Step 4: Verify it compiles**

Run (from `frontend/`): `npm run build`
Expected: succeeds with no TypeScript errors (exit code 0). This won't render the button in a browser (that needs Task 4's wiring plus a real `GOOGLE_CLIENT_ID`), but it proves the component compiles cleanly against the existing `tsconfig`.

- [ ] **Step 5: Commit**

```bash
git add frontend/index.html frontend/src/config.ts frontend/src/components/GoogleSignInButton.tsx
git commit -m "feat(auth): add Google Identity Services script, config, and button component"
```

---

### Task 4: Frontend — wire the Google button into SignIn/SignUp and App.tsx

**Files:**
- Modify: `frontend/src/components/AuthForms.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `GoogleSignInButton` (Task 3).
- Produces: nothing new consumed by later tasks — this is the last code task.

- [ ] **Step 1: Add `picture` to the `UserInfo` interface in `AuthForms.tsx`**

Current (`frontend/src/components/AuthForms.tsx:5-9`):

```typescript
interface UserInfo {
  email: string;
  first_name: string;
  last_name: string;
  watchlist: string[];
}
```

Change to:

```typescript
interface UserInfo {
  email: string;
  first_name: string;
  last_name: string;
  watchlist: string[];
  picture?: string;
}
```

- [ ] **Step 2: Import `GoogleSignInButton` in `AuthForms.tsx`**

Current top of file:

```typescript
import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, User, Phone, AlertTriangle } from 'lucide-react';
import { API_URL } from '../config';
```

Add the import:

```typescript
import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, User, Phone, AlertTriangle } from 'lucide-react';
import { API_URL } from '../config';
import { GoogleSignInButton } from './GoogleSignInButton';
```

- [ ] **Step 3: Render the button in `SignIn`**

In `SignIn`'s returned JSX, the `{errorMsg && (...)}` block is immediately followed by:

```tsx
      <form className="w-full space-y-4 text-left" onSubmit={handleSubmit}>
        <div className="space-y-1.5">
          <label className="text-xs dark:text-white/80 text-slate-700 font-bold uppercase tracking-widest">Email Address *</label>
```

Insert the Google button and a divider immediately before that `<form>` line:

```tsx
      <GoogleSignInButton onLoginSuccess={onLoginSuccess} />
      <div className="flex items-center gap-3 my-4 w-full">
        <div className="flex-1 h-px bg-slate-300 dark:bg-slate-700" />
        <span className="text-[11px] uppercase tracking-widest text-slate-400">or continue with email</span>
        <div className="flex-1 h-px bg-slate-300 dark:bg-slate-700" />
      </div>

      <form className="w-full space-y-4 text-left" onSubmit={handleSubmit}>
        <div className="space-y-1.5">
          <label className="text-xs dark:text-white/80 text-slate-700 font-bold uppercase tracking-widest">Email Address *</label>
```

Do not change anything else about the existing form.

- [ ] **Step 4: Add `onLoginSuccess` to `SignUpProps` and render the button in `SignUp`**

Current (`frontend/src/components/AuthForms.tsx`):

```typescript
interface SignUpProps {
  onToggleMode: () => void;
  onSignupSuccess: () => void;
}

export function SignUp({ onToggleMode, onSignupSuccess }: SignUpProps) {
```

Change to:

```typescript
interface SignUpProps {
  onToggleMode: () => void;
  onSignupSuccess: () => void;
  onLoginSuccess: (user: UserInfo) => void;
}

export function SignUp({ onToggleMode, onSignupSuccess, onLoginSuccess }: SignUpProps) {
```

In `SignUp`'s returned JSX, the `{errorMsg && (...)}` block is immediately followed by:

```tsx
      <form className="w-full space-y-4 text-left" onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] dark:text-white/80 text-slate-700 font-bold uppercase tracking-widest">First Name *</label>
```

Insert the same button + divider immediately before that `<form>` line:

```tsx
      <GoogleSignInButton onLoginSuccess={onLoginSuccess} />
      <div className="flex items-center gap-3 my-4 w-full">
        <div className="flex-1 h-px bg-slate-300 dark:bg-slate-700" />
        <span className="text-[11px] uppercase tracking-widest text-slate-400">or continue with email</span>
        <div className="flex-1 h-px bg-slate-300 dark:bg-slate-700" />
      </div>

      <form className="w-full space-y-4 text-left" onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] dark:text-white/80 text-slate-700 font-bold uppercase tracking-widest">First Name *</label>
```

Do not change anything else about the existing form.

- [ ] **Step 5: Thread `handleLoginSuccess` into `SignUp` from `App.tsx`**

Current (`frontend/src/App.tsx:94`):

```tsx
return <SignUp onToggleMode={() => setView('signin')} onSignupSuccess={() => setView('signin')} />;
```

Change to:

```tsx
return <SignUp onToggleMode={() => setView('signin')} onSignupSuccess={() => setView('signin')} onLoginSuccess={handleLoginSuccess} />;
```

- [ ] **Step 6: Verify it compiles**

Run (from `frontend/`): `npm run build`
Expected: succeeds with no TypeScript errors (exit code 0) — in particular, no "missing prop" error on the `SignUp` call site, and no "unused import" warning on `GoogleSignInButton` in either `SignIn` or `SignUp`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/AuthForms.tsx frontend/src/App.tsx
git commit -m "feat(auth): wire Google Sign-In button into SignIn and SignUp forms"
```

---

### Task 5: Frontend Dockerfile — new build arg

**Files:**
- Modify: `frontend/Dockerfile`

**Interfaces:**
- Consumes: `VITE_GOOGLE_CLIENT_ID` (build arg, passed at `docker build --build-arg` time during deployment — not exercised by this task's own verification, which uses a placeholder value).

- [ ] **Step 1: Add the build arg**

Current `frontend/Dockerfile`:

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

Add `VITE_GOOGLE_CLIENT_ID` alongside the other two:

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL
ARG VITE_WS_URL
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_WS_URL=${VITE_WS_URL}
ENV VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

- [ ] **Step 2: Verify with a real Docker build — confirm the build arg reaches the bundle**

This repo's established lesson (hit twice during the Cloud Run deploy): a clean `docker build` exit code does not prove a `VITE_*` build arg actually reached the bundle — always grep the built output for the value.

Run (from `frontend/`):

```bash
docker build \
  --build-arg VITE_API_URL=https://api.example.com \
  --build-arg VITE_WS_URL=wss://api.example.com \
  --build-arg VITE_GOOGLE_CLIENT_ID=test-client-id-12345 \
  -t globepulse-frontend-signin-test .
docker run --rm -d -p 8085:8080 --name gp-frontend-signin-test globepulse-frontend-signin-test
sleep 2
JS_FILE=$(curl -s http://localhost:8085/ | grep -oE '/assets/index-[^"]+\.js' | head -1)
curl -s "http://localhost:8085${JS_FILE}" | grep -c "test-client-id-12345"
docker stop gp-frontend-signin-test
docker rmi globepulse-frontend-signin-test
```

Expected: the `grep -c` line prints `1` or more (the test Client ID string is present in the built bundle), proving the build arg reached the bundle. If it prints `0`, stop and investigate before continuing — don't proceed with a build arg that isn't actually wired through.

- [ ] **Step 3: Commit**

```bash
git add frontend/Dockerfile
git commit -m "feat(auth): add VITE_GOOGLE_CLIENT_ID build arg to frontend Dockerfile"
```

## After this plan

This plan does not include: provisioning the real OAuth Client ID (manual Console step, documented in the spec's Provisioning section), setting `GOOGLE_CLIENT_ID`/`VITE_GOOGLE_CLIENT_ID` on the live Cloud Run services, or the manual browser click-through verification against a real Google account. Those happen directly in conversation after this plan's code is merged, the same way the Cloud Run provisioning runbook was executed after the Phase 2 code plan finished.
