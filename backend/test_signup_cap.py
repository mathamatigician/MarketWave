import os
import sys
import unittest
from unittest.mock import patch

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
# Also add the repo root (parent of backend/) so main.py's own
# `from backend.agents.orchestrator import ...` resolves `backend` as a
# top-level (namespace) package -- same fix as test_pipeline_cooldown.py.
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import HTTPException

import main
import google_auth
from config import settings, SIGNUP_CLOSED_MESSAGE


def _users(n: int) -> dict:
    """Builds a fake existing-users dict with n already-registered users."""
    return {f"user{i}@example.com": {"password_hash": "x"} for i in range(n)}


class TestSignupCap(unittest.TestCase):
    """POST /api/signup should stop creating new users once
    settings.max_total_users is reached, without touching the existing
    'user already exists' behavior."""

    @patch("main.database.save_users")
    @patch("main.database.load_users")
    def test_signup_allowed_when_under_cap(self, mock_load_users, mock_save_users):
        mock_load_users.return_value = _users(settings.max_total_users - 1)
        req = main.SignupRequest(
            first_name="New", last_name="User", email="brand-new@example.com", password="pw123456"
        )

        result = main.signup(req)

        self.assertEqual(result["message"], "Signup successful")
        mock_save_users.assert_called_once()

    @patch("main.database.save_users")
    @patch("main.database.load_users")
    def test_signup_rejected_at_cap(self, mock_load_users, mock_save_users):
        mock_load_users.return_value = _users(settings.max_total_users)
        req = main.SignupRequest(
            first_name="New", last_name="User", email="one-too-many@example.com", password="pw123456"
        )

        with self.assertRaises(HTTPException) as ctx:
            main.signup(req)

        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail, SIGNUP_CLOSED_MESSAGE)
        mock_save_users.assert_not_called()

    @patch("main.database.save_users")
    @patch("main.database.load_users")
    def test_existing_user_error_takes_priority_over_cap(self, mock_load_users, mock_save_users):
        users = _users(settings.max_total_users)
        users["dupe@example.com"] = {"password_hash": "x"}
        mock_load_users.return_value = users
        req = main.SignupRequest(
            first_name="Dup", last_name="User", email="dupe@example.com", password="pw123456"
        )

        with self.assertRaises(HTTPException) as ctx:
            main.signup(req)

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "User already exists")
        mock_save_users.assert_not_called()


class TestGoogleAuthSignupCap(unittest.TestCase):
    """Google Sign-In auto-creates a new user on first login -- that
    creation path should respect the same cap. An existing Google user
    logging back in must be unaffected."""

    def _fake_idinfo(self, **overrides):
        idinfo = {
            "email": "new-google-user@example.com",
            "email_verified": True,
            "given_name": "New",
            "family_name": "User",
            "picture": "",
        }
        idinfo.update(overrides)
        return idinfo

    @patch("google_auth.database.save_users")
    @patch("google_auth.database.load_users")
    @patch("google_auth.id_token.verify_oauth2_token")
    def test_new_google_user_rejected_at_cap(self, mock_verify, mock_load_users, mock_save_users):
        mock_verify.return_value = self._fake_idinfo()
        mock_load_users.return_value = _users(settings.max_total_users)

        with self.assertRaises(google_auth.SignupCapReached):
            google_auth.verify_and_get_user("fake-credential")

        mock_save_users.assert_not_called()

    @patch("google_auth.database.save_users")
    @patch("google_auth.database.load_users")
    @patch("google_auth.id_token.verify_oauth2_token")
    def test_existing_google_user_login_unaffected_by_cap(self, mock_verify, mock_load_users, mock_save_users):
        mock_verify.return_value = self._fake_idinfo(email="existing@example.com")
        users = _users(settings.max_total_users)
        users["existing@example.com"] = {
            "first_name": "Existing", "last_name": "User", "email": "existing@example.com",
            "phone": "", "picture": "", "password_hash": "",
            "watchlist": "Tesla", "subscription": {"plan_id": "free"},
        }
        mock_load_users.return_value = users

        result = google_auth.verify_and_get_user("fake-credential")

        self.assertEqual(result["email"], "existing@example.com")
        mock_save_users.assert_not_called()

    @patch("main.google_auth_module.verify_and_get_user")
    def test_google_auth_route_maps_cap_reached_to_403(self, mock_verify):
        mock_verify.side_effect = google_auth.SignupCapReached()

        with self.assertRaises(HTTPException) as ctx:
            main.google_auth(main.GoogleAuthRequest(credential="fake"))

        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail, SIGNUP_CLOSED_MESSAGE)


if __name__ == "__main__":
    unittest.main()
