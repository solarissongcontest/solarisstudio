"""Transport isolation proof; does not start Docker or contact Supabase."""
import importlib.util
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import tomllib
import unittest

sys.dont_write_bytecode = True

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/prepare-archive-local-config.py"
spec = importlib.util.spec_from_file_location("archive_config", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ArchiveLocalConfigTest(unittest.TestCase):
    def test_ci_bootstrap_namespaces_before_starting_and_never_stops_an_unrelated_stack(self):
        helper = SCRIPT.parent / "v3-start-disposable-supabase.sh"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "supabase").mkdir()
            config = root / "supabase/config.toml"
            config.write_text('project_id = "shared-default"\n')
            binary = root / "bin"
            binary.mkdir()
            fake = binary / "supabase"
            fake.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$MOCK_SUPABASE_LOG"\nexit 0\n')
            fake.chmod(0o755)
            log = root / "calls.log"
            env = dict(os.environ, PATH=f"{binary}:{os.environ['PATH']}", MOCK_SUPABASE_LOG=str(log),
                       GITHUB_ACTIONS="true", GITHUB_RUN_ID="12345", GITHUB_RUN_ATTEMPT="2", GITHUB_JOB="clean_replay")
            subprocess.run(["bash", str(helper)], cwd=root, env=env, check=True, capture_output=True)
            self.assertEqual(tomllib.loads(config.read_text())["project_id"], "archive-v3-12345-2-clean-replay")
            self.assertEqual(log.read_text().splitlines(), ["start"])
            env["GITHUB_RUN_ID"] = "invalid"
            original = config.read_text()
            result = subprocess.run(["bash", str(helper)], cwd=root, env=env, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(config.read_text(), original)
            self.assertEqual(log.read_text().splitlines(), ["start"])

    def test_existing_listener_is_preserved_and_all_stack_ports_are_distinct(self):
        with tempfile.TemporaryDirectory() as directory, socket.socket() as occupied:
            occupied.bind(("0.0.0.0", 0))
            occupied.listen()
            port = occupied.getsockname()[1]
            path = Path(directory) / "config.toml"
            path.write_text(f'project_id = "hosted-ref"\n\n[api]\nport = {port}\n\n[db]\nport = {port}\nmajor_version = 17\n\n[functions.example]\nverify_jwt = false\n')
            module.prepare(path, "archive-123-1-clean")
            config = tomllib.loads(path.read_text())
            ports = []
            for section, key in module.PORTS:
                node = config
                for name in section.split("."):
                    node = node[name]
                ports.append(node[key])
            self.assertEqual(len(set(ports)), len(module.PORTS))
            self.assertNotIn(port, ports)
            self.assertEqual(config["project_id"], "archive-123-1-clean")
            self.assertEqual(config["db"]["major_version"], 17)
            self.assertFalse(config["functions"]["example"]["verify_jwt"])
            # The helper neither stops nor repurposes the occupied listener.
            self.assertEqual(occupied.getsockname()[1], port)

    def test_upgrade_and_clean_have_separate_project_identities(self):
        with tempfile.TemporaryDirectory() as directory:
            for mode in ("clean", "upgrade"):
                path = Path(directory) / f"{mode}.toml"
                path.write_text('project_id = "same-legacy-ref"\n')
                module.prepare(path, f"archive-456-2-{mode}")
                self.assertEqual(tomllib.loads(path.read_text())["project_id"], f"archive-456-2-{mode}")

    def test_rejects_non_disposable_namespace_before_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "config.toml"
            original = 'project_id = "unchanged"\n'
            path.write_text(original)
            with self.assertRaises(ValueError):
                module.prepare(path, "production")
            self.assertEqual(path.read_text(), original)


if __name__ == "__main__":
    unittest.main()
