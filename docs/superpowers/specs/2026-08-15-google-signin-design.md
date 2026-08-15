# Google Sign-In Design

## Summary

Add "Sign in with Google" as an additional login method, alongside the
existing email/password forms (not a replacement). Uses Google Identity
Services' ID-token flow: the frontend gets a signed JWT directly from
Google, sends it to a new backend endpoint, and the backend verifies the
token's signature and extracts the user's verified email/name. Accounts
are auto-linked by email — if a Google sign-in's email already has a
password-based account, it logs into that same account rather than
creating a duplicate.

## Context

Today's auth (`backend/main.py`'s `/api/signup` and `/api/login`) is
deliberately lightweight: no session tokens or JWTs, no per-request auth
checks on other endpoints (e.g. `/api/watchlist` trusts whatever `email`
the client sends). Login returns a JSON user object; the frontend stores
it directly in `localStorage` (`App.tsx`, key `globepulse_user`) and passes
it to `onLoginSuccess`. This design does not change that pattern — Google
Sign-In slots into the exact same `onLoginSuccess` path so the rest of the
app (session persistence, logout, per-request identification) needs zero
changes.

## Decisions

- **Account linking:** auto-link by email. Google has already verified
  the user owns that email address, which is at least as strong a proof
  as this app's own password system, so no extra friction is added.
- **Coexistence:** Google Sign-In is added alongside the existing
  email/password forms, not a replacement. Zero risk to the two existing
  demo accounts and any real signups.
- **Approach:** Google Identity Services (GIS) ID-token verification —
  not a full OAuth Authorization Code redirect flow (unneeded — we only
  want identity, not ongoing API access), and not a migration to Firebase
  Authentication (a much larger, separate change that would also require
  migrating the existing password-hashed accounts).
- **Field gap:** the signup form's `phone` field has no Google equivalent
  and stays blank for Google-created accounts — already optional today
  (the frontend's own required-field check omits it:
  `!firstName || !lastName || !email || !password`). Google supplies one
  field the form doesn't collect at all — a profile picture URL — stored
  for possible future use, not required by anything yet.

## Architecture / Data Flow

```
User clicks "Sign in with Google" button (Google Identity Services widget)
        │
        ▼
Google shows its own account picker/consent (no redirect away from our page)
        │
        ▼
Google returns a signed JWT ("credential") directly to our frontend JS
        │
        ▼
Frontend POSTs { credential } to new backend endpoint: /api/auth/google
        │
        ▼
Backend verifies the JWT signature + audience against Google's public keys
(google-auth's id_token.verify_oauth2_token — keys cached, no per-request
network round-trip to Google)
        │
        ▼
Backend extracts verified email/first_name/last_name/picture from the token
        │
        ▼
Look up users[email] in Firestore:
  - exists (password or prior Google account) → log them in, return their
    existing profile (auto-link), backfilling `picture` if not yet set
  - doesn't exist → create a new user record (same defaults as today's
    signup: watchlist=Tesla/Apple/Google, plan=free), password_hash=""
        │
        ▼
Backend returns the same UserInfo JSON shape /api/login already returns
        │
        ▼
Frontend calls the existing onLoginSuccess(user) — same localStorage
session handling as today
```

## Code Changes

### 1. `backend/config.py` — new setting (both `Settings` classes)

Add `google_client_id: str = ""` to both the `pydantic_settings` and the
`pydantic` v1 fallback `Settings` classes (existing dual-branch pattern —
every setting must be added to both bodies identically):

```python
        google_client_id: str = ""
```

Not a secret — Google OAuth Client IDs are meant to be public (embedded in
frontend JS by design). Plain env var, no Secret Manager entry.

### 2. `backend/requirements.txt` — new dependency

Add `google-auth` (verifies the ID token's signature against Google's
published public keys; likely already present transitively via
`google-cloud-firestore`/`google-genai`, but per this repo's established
pattern, a direct import gets a direct dependency):

```
google-auth
```

### 3. `backend/google_auth.py` (new) — verification + user lookup logic

Kept in its own module rather than inline in `main.py`, same reason
`config.py`'s `get_allowed_origins()` isn't inline in `main.py`: importing
`main.py` directly hangs in this environment (its top-level
`google.antigravity`/orchestrator imports attempt network/credential
resolution), so anything that needs a unit test has to live somewhere
importable without dragging `main.py` in.

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

### 4. `backend/main.py` — new imports + thin route

Add to the imports section (after the existing `from google.antigravity...`
imports, `main.py:18-19`):

```python
import google_auth as google_auth_module
```

Add a new Pydantic request model next to the existing ones
(`main.py`'s `# --- Pydantic Request Models ---` section, after
`SignupRequest`):

```python
class GoogleAuthRequest(BaseModel):
    credential: str  # the ID token JWT from Google's Sign In button
```

Add a new route next to `/api/signup`/`/api/login` — deliberately thin,
all logic lives in `google_auth.py` (see above) so it stays testable:

```python
@app.post("/api/auth/google")
def google_auth(req: GoogleAuthRequest):
    try:
        return google_auth_module.verify_and_get_user(req.credential)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google token")
```

This mirrors `/api/login`'s existing response shape (dict-minus-
`password_hash`), matching the pattern already used there (`main.py:120-140`
region) so the frontend's `onLoginSuccess` needs no changes. Firestore
read/write goes through the existing `database.load_users`/`save_users` —
no new error-handling pattern needed; Phase 1's hard-fail-in-cloud-mode
behavior already applies.

### 5. `frontend/index.html` — Google Identity Services script

Add before the closing `</head>`:

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

### 6. `frontend/src/config.ts` — new public config value

Add alongside `API_URL`/`WS_URL`:

```typescript
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
```

### 7. `frontend/Dockerfile` — new build arg

Add alongside the existing `VITE_API_URL`/`VITE_WS_URL` args:

```dockerfile
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}
```

### 8. `frontend/src/components/GoogleSignInButton.tsx` (new)

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

Rendering nothing when `GOOGLE_CLIENT_ID` is unset (e.g. before the OAuth
client is provisioned, or in an environment that hasn't set the build arg)
keeps local dev and any partial deploy safe — the email/password form is
unaffected either way.

### 9. `frontend/src/components/AuthForms.tsx` — wire the button in

In both `SignIn` and `SignUp`, render `<GoogleSignInButton onLoginSuccess={onLoginSuccess} />`
(for `SignUp`, this needs `onLoginSuccess` threaded through the same way
`SignIn` already receives it — currently `SignUp` only takes
`onSignupSuccess`, a no-payload callback that shows an alert and switches
to the sign-in view; Google-completed signups skip that entirely and log
the user in directly, so `SignUp`'s props gain an `onLoginSuccess` callback
alongside its existing `onSignupSuccess`) above the existing form, with a
simple divider between them (e.g. a `<div>` with "or continue with email"
text — styling detail left to implementation, matching the existing
form's Tailwind conventions).

Also add the optional `picture` field to the `UserInfo` interface
(`AuthForms.tsx:5-9`) so it round-trips through `onLoginSuccess` without
TypeScript complaints.

### 10. `frontend/src/App.tsx` — thread `handleLoginSuccess` into `SignUp`

`App.tsx` already defines `handleLoginSuccess` and passes it to `SignIn`
(`App.tsx:88,92`). `SignUp`'s render call (`App.tsx:94`) currently only
passes `onSignupSuccess` — add `onLoginSuccess={handleLoginSuccess}`
alongside it:

```tsx
return <SignUp onToggleMode={() => setView('signin')} onSignupSuccess={() => setView('signin')} onLoginSuccess={handleLoginSuccess} />;
```

## Error Handling

- Invalid/tampered/expired token → `401 Invalid Google token`
- Google's script blocked or fails to load → `GoogleSignInButton` renders
  nothing (no `window.google`), existing email/password form is an
  automatic fallback
- Firestore write failure → existing hard-fail-in-cloud-mode behavior from
  Phase 1 applies unchanged (no new pattern)
- CORS → already covered by the existing `ALLOWED_ORIGINS` middleware,
  since `/api/auth/google` is just another route on the same FastAPI app

## Testing

- New `backend/test_google_auth.py` (same style as `test_config.py`,
  targeting `google_auth.py` directly — never imports `main.py`): mock
  `google.oauth2.id_token.verify_oauth2_token` to return a fake payload
  dict, then verify:
  - a new user is created with the correct defaults when the email isn't
    in `users` yet
  - an existing user (by email) logs in and is NOT overwritten, except
    `picture` gets backfilled if it was empty
  - an invalid token (mocked to raise `ValueError`) propagates that
    `ValueError` out of `verify_and_get_user` — `main.py`'s thin route is
    what turns it into a 401, but that route itself isn't unit-testable
    for the same import-hang reason (verified by reading the code, not by
    an automated test)
- The real Google flow (actual button click, actual Google account) can
  only be verified by hand in a browser after deploy — not automatable in
  this environment. Call this out explicitly as a manual post-deploy step.

## Provisioning (manual, one-time, Console UI)

Not automatable via `gcloud` (checked — no scriptable path found for
OAuth consent screen / client creation at the time of this design):

1. Configure the OAuth consent screen in Google Cloud Console
   (APIs & Services → OAuth consent screen): app name, support email,
   authorized domain `globepulseai.com`.
2. Create an OAuth 2.0 Client ID (APIs & Services → Credentials →
   Create Credentials → OAuth client ID → Web application). Authorized
   JavaScript origins: `https://globepulseai.com`,
   `https://www.globepulseai.com`, plus `http://localhost:5173` and
   `http://localhost:5174` for local dev. No redirect URI needed (the GIS
   button flow doesn't redirect).
3. The resulting Client ID is public. Set it as:
   - `VITE_GOOGLE_CLIENT_ID` — frontend build arg (same deploy pattern as
     `VITE_API_URL`)
   - `GOOGLE_CLIENT_ID` — backend env var (`--set-env-vars`, alongside the
     existing `FIRESTORE_PROJECT_ID`/`ALLOWED_ORIGINS`), used for the
     token's audience check

## Explicitly Out of Scope

- Migrating existing password-hashed accounts to any unified auth system
  (Firebase Auth or otherwise) — Approach C, not chosen.
- Any server-side session/JWT mechanism for the app generally — out of
  scope for this change; Google Sign-In plugs into the existing
  `localStorage`-based session pattern as-is.
- Other OAuth providers (GitHub, Microsoft, etc.) — not requested.
- Phone-number collection for Google-created accounts — already optional
  app-wide, no new prompt added.
- Requesting any Google API scopes beyond basic identity (email, name,
  picture) — no Gmail/Calendar/Drive access.

## Global Constraints

- No secret values handled in this plan or by the implementing agent —
  the OAuth Client ID is the only new credential-like value, and it is
  public by design, not a secret.
- Google Sign-In must not affect the existing email/password flow —
  `GoogleSignInButton` renders nothing if `GOOGLE_CLIENT_ID` is unset,
  and no existing endpoint or component is modified in a way that changes
  its current behavior when Google Sign-In isn't used.
- Follows the existing dual-`Settings`-class pattern in `config.py` (every
  new setting added identically to both branches).
- Follows the existing Dockerfile build-arg pattern for public,
  build-time frontend config (`VITE_GOOGLE_CLIENT_ID` alongside
  `VITE_API_URL`/`VITE_WS_URL`).
