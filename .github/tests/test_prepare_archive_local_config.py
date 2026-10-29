"""Transport isolation proof; does not start Docker or contact Supabase."""
import importlib.util
from pathlib import Path
import socket
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
