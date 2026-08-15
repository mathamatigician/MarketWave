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
