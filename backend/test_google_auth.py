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
