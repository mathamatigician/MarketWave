import importlib
import os
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import config
import database


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

        self._users_file_path = os.path.join(self._tmp_dir.name, "users.json")

    def _reload_in_mode(self, firestore_emulator_host):
        os.environ.pop("FIRESTORE_EMULATOR_HOST", None)
        if firestore_emulator_host:
            os.environ["FIRESTORE_EMULATOR_HOST"] = firestore_emulator_host
        importlib.reload(config)
        importlib.reload(database)

        # get_users_file_path() falls back to an *absolute* path (derived from
        # database.py's own file location) when no relative users.json exists
        # in cwd, so chdir alone doesn't isolate it. Pin it inside the tmp dir
        # so these tests never touch the real repo's users.json. Must be
        # patched *after* reload -- reload() redefines the function fresh,
        # which would otherwise wipe out a patch applied beforehand.
        users_path_patcher = patch.object(
            database, "get_users_file_path", return_value=self._users_file_path
        )
        users_path_patcher.start()
        self.addCleanup(users_path_patcher.stop)

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


if __name__ == "__main__":
    unittest.main()
