import os
import re
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
            "https://marketwaveai.com, https://www.marketwaveai.com",
        ):
            origins = config.get_allowed_origins()

        self.assertEqual(origins, [
            "https://marketwaveai.com",
            "https://www.marketwaveai.com",
        ])

    def test_ignores_empty_entries(self):
        with patch.object(config.settings, "allowed_origins", "https://a.com,,https://b.com,"):
            origins = config.get_allowed_origins()

        self.assertEqual(origins, ["https://a.com", "https://b.com"])


class TestGetLanOriginRegex(unittest.TestCase):
    """Regression coverage for a real bug: the LAN-dev CORS regex's 172.x
    branch matched any 172.x.x.x address instead of only the private
    172.16.0.0/12 range, so public IPs (Google, Cloudflare, Linode, ...)
    were being accepted as valid CORS origins against the live backend."""

    def test_returns_none_when_running_on_cloud_run(self):
        with patch.dict(os.environ, {"K_SERVICE": "marketwave-backend"}):
            self.assertIsNone(config.get_lan_origin_regex())

    def test_returns_regex_string_when_not_on_cloud_run(self):
        env = dict(os.environ)
        env.pop("K_SERVICE", None)
        with patch.dict(os.environ, env, clear=True):
            self.assertIsInstance(config.get_lan_origin_regex(), str)

    def _match(self, origin):
        env = dict(os.environ)
        env.pop("K_SERVICE", None)
        with patch.dict(os.environ, env, clear=True):
            regex = config.get_lan_origin_regex()
        return bool(re.match(regex, origin))

    def test_matches_real_private_lan_ranges(self):
        for origin in (
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://192.168.1.42:5173",
            "http://10.0.0.5:5173",
            "http://172.16.0.5:5173",
            "http://172.31.255.1:5173",
        ):
            with self.subTest(origin=origin):
                self.assertTrue(self._match(origin))

    def test_rejects_public_ips_outside_the_private_172_range(self):
        for origin in (
            "http://172.217.14.196",  # Google public IP
            "http://172.104.20.11",  # Linode public range
            "https://172.67.1.1",  # Cloudflare-fronted
            "http://172.15.0.1",  # just below the private 172.16/12 range
            "http://172.32.0.1",  # just above the private 172.16/12 range
        ):
            with self.subTest(origin=origin):
                self.assertFalse(self._match(origin))

    def test_does_not_match_production_domain(self):
        # marketwaveai.com is trusted solely via get_allowed_origins();
        # this regex must never also match it.
        self.assertFalse(self._match("https://marketwaveai.com"))


if __name__ == "__main__":
    unittest.main()
