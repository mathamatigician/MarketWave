# Google Sign-In Architecture with Firebase Auth & Firestore

This document describes the design and flow for implementing **Google Sign-In** as the primary authentication mechanism for MarketWave, using **Firebase Authentication** on the client side and verifying identities securely on the **FastAPI backend**.

---

## 🏛️ Authentication & Authorization Flow

Using Google Login eliminates the need for managing password hashes, sign-up forms, and registration forms on the server. The workflow split between client, authentication provider, and backend server is structured as follows:

```
+--------------------+        Popup Consent        +--------------------+
|   React Frontend   | <=========================> |    Google OAuth    |
| (Vite Dashboard)   |                             +---------+----------+
+---------+----------+                                       | (Auth Success)
          |                                                  v
          | (Obtains Firebase ID Token / JWT)      +---------+----------+
          +--------------------------------------> |    Firebase Auth   |
          |                                        +--------------------+
          |
          | (Sends ID Token in header: "Authorization: Bearer <Token>")
          v
+---------+----------+        Verifies Token       +--------------------+
|   FastAPI Backend  | <=========================> | Firebase Admin SDK |
| (Uvicorn Service)  |                             +--------------------+
+---------+----------+
          |
          | (Reads / Writes user watchlist based on verified UID)
          v
+---------+----------+
|  Cloud Firestore   |
+--------------------+
```

---

## 🛠️ Step-by-Step Implementation Guide

### 1. Client-Side Authentication (React)
Using the Firebase Web SDK, we handle Google Sign-In directly on the client.

#### A. Initialize Firebase Auth
Create `frontend/src/firebase.ts`:
```typescript
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
```

#### B. Trigger Google Login Popup
In the Login UI component:
```typescript
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../firebase";

const handleGoogleLogin = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // Get JWT token to authenticate HTTP/WS API calls with FastAPI
    const idToken = await user.getIdToken(true);
    
    console.log("Logged in user:", user.displayName, user.email);
    console.log("JWT Auth Token:", idToken);
  } catch (error) {
    console.error("Google sign in failed:", error);
  }
};
```

---

### 2. Backend Token Verification (FastAPI)
Rather than trusting client-reported emails, the FastAPI backend verifies the Firebase ID Token using the `firebase-admin` SDK.

#### A. Setup Admin SDK
Add `firebase-admin` to `backend/requirements.txt` and initialize it:
```python
import firebase_admin
from firebase_admin import credentials, auth as admin_auth

# Automatically uses Application Default Credentials on GCP
# Or loads local JSON key in development
cred = credentials.Certificate("google-credentials.json")
firebase_admin.initialize_app(cred)
```

#### B. Verify Token in Routes
Create a dependency helper in `backend/main.py` to intercept and verify the token:
```python
from fastapi import Header, HTTPException, Depends

async def get_current_user(authorization: str = Header(...)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    
    id_token = authorization.split("Bearer ")[1]
    try:
        # Decodes the JWT token and verifies it against Firebase Auth servers
        decoded_token = admin_auth.verify_id_token(id_token)
        return decoded_token  # Contains 'uid', 'email', 'name', etc.
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid or expired token: {str(e)}")

@app.get("/api/watchlist")
def get_watchlist(user = Depends(get_current_user)):
    email = user["email"]
    uid = user["uid"]
    # Fetch watchlist from Firestore using the user's secure UID
    ...
```

---

### 3. Linking with Firestore
Once the user's Identity is verified on the backend:
1.  **Watchlist Association**: We save the watchlist in the `users` collection in Firestore. The Document ID is set to the user's verified Firebase `uid` (or `email`).
2.  **Schema**:
    ```
    /users/{uid}
      - email: "name@company.com"
      - name: "Google Username"
      - watchlist: ["Tesla", "Apple"]
    ```
3.  **Firestore Security Rules**: If we need direct read/write access from the client, we can lock down Firestore collections so a user can only access their own document:
    ```javascript
    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {
        match /users/{userId} {
          allow read, write: if request.auth != null && request.auth.uid == userId;
        }
      }
    }
    ```

---

## 📈 Architecture Benefits

1.  **Fully Serverless**: No hosting of auth databases or hashing routines. Firebase Auth takes care of scaling.
2.  **Multi-Platform Ready**: If MarketWave expands to mobile apps (iOS/Android), the same Firebase Auth backend handles authentication seamlessly.
3.  **Password Security Compliance**: Offloading authentication to Google ensures industry-standard MFA (Multi-Factor Authentication), account recovery, and security compliance.
