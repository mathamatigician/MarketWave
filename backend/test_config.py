import os
import sys
import unittest
from unittest.mock import patch

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import config


class TestGetAllowedOrigins(unittest.TestCase):
    def test_default_matches_todays_localhost_list(self):
        default_origins = (
            "http://localhost:5173,http://localhost:5174,"
            "http://127.0.0.1:5173,http://127.0.0.1:5174,"
            "http://localhost:8000,http://127.0.0.1:8000"
        )
        with patch.object(config.settings, "allowed_origins", default_origins):
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
