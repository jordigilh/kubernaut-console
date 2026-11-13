#!/usr/bin/env python3
"""Focused regression tests for live-E2E credential boundaries and cleanup."""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).parent
COLLECT = SCRIPT_DIR / "collect-kind-diagnostics.sh"
SCANNER = SCRIPT_DIR / "scan-live-artifacts.py"
TEARDOWN = SCRIPT_DIR / "kind-teardown.sh"
SECRET = b"long-token-value"
ADDITIONAL_SECRETS = (b"single-token-value", b"bare-token-value", b"api-key-value")


def make_executable(path: Path, contents: str) -> None:
    path.write_text(contents)
    path.chmod(0o700)


class ArtifactSecurityTests(unittest.TestCase):
    def scan(self, artifact: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCANNER), str(artifact)],
            check=False,
            capture_output=True,
            text=True,
        )

    def test_scanner_rejects_unquoted_camel_case_auth_token(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            artifact = Path(directory) / "diagnostic.txt"
            artifact.write_text('authToken: "long-token-value"\n')

            result = self.scan(artifact)

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("credential assignment", result.stdout)
            self.assertNotIn(SECRET.decode(), result.stdout + result.stderr)

    def test_scanner_accepts_redacted_camel_case_auth_token(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            artifact = Path(directory) / "diagnostic.txt"
            artifact.write_text('authToken: "<REDACTED>"\n')

            result = self.scan(artifact)

            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_collector_redacts_unquoted_camel_case_auth_token(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fake_bin = root / "bin"
            fake_bin.mkdir()
            make_executable(
                fake_bin / "kubectl",
                "#!/usr/bin/env python3\n"
                "print('authToken: \"long-token-value\"')\n"
                "print(\"authToken: 'single-token-value'\")\n"
                "print('authToken: bare-token-value')\n"
                "print('apiKey: \"api-key-value\"')\n",
            )
            output = root / "diagnostics"
            result = subprocess.run(
                [
                    str(COLLECT),
                    "--mode",
                    "local",
                    "--hub-kubeconfig",
                    str(root / "hub.config"),
                    "--output",
                    str(output),
                ],
                check=False,
                capture_output=True,
                text=True,
                env={**os.environ, "PATH": f"{fake_bin}:{os.environ['PATH']}"},
            )

            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            captured = b"\n".join(path.read_bytes() for path in output.rglob("*") if path.is_file())
            self.assertNotIn(SECRET, captured)
            for secret in ADDITIONAL_SECRETS:
                self.assertNotIn(secret, captured)
            self.assertIn(b"authToken: <REDACTED>", captured)


class TeardownTests(unittest.TestCase):
    def test_local_kind_failure_is_nonzero_and_preserves_state(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fake_bin = root / "bin"
            fake_bin.mkdir()
            make_executable(fake_bin / "kind", "#!/usr/bin/env sh\nexit 42\n")
            state_file = root / "fixtures.env"
            state_file.write_text("export LIVE_E2E_NS_SUFFIX=r123\n")

            result = subprocess.run(
                [
                    str(TEARDOWN),
                    "--mode",
                    "local",
                    "--hub-kubeconfig",
                    str(root / "hub.config"),
                    "--hub-cluster-name",
                    "kubernaut-live-local-123",
                    "--state-file",
                    str(state_file),
                ],
                check=False,
                capture_output=True,
                text=True,
                env={**os.environ, "PATH": f"{fake_bin}:{os.environ['PATH']}"},
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertTrue(state_file.exists())
            self.assertIn("failed to delete run-owned hub Kind cluster", result.stderr)
            self.assertNotIn("resources removed", result.stdout)

    def test_fleet_teardown_attempts_spoke_after_hub_failure(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fake_bin = root / "bin"
            fake_bin.mkdir()
            log = root / "kind.log"
            make_executable(
                fake_bin / "kind",
                "#!/usr/bin/env sh\n"
                f"printf '%s\\n' \"$*\" >> {log}\n"
                "case \"$*\" in *kubernaut-live-fleet-123*) exit 42;; esac\n",
            )
            state_file = root / "fixtures.env"
            state_file.write_text("export LIVE_E2E_NS_SUFFIX=r123\n")

            result = subprocess.run(
                [
                    str(TEARDOWN),
                    "--mode",
                    "fleet",
                    "--hub-kubeconfig",
                    str(root / "hub.config"),
                    "--spoke-kubeconfig",
                    str(root / "spoke.config"),
                    "--hub-cluster-name",
                    "kubernaut-live-fleet-123",
                    "--spoke-cluster-name",
                    "kubernaut-live-fleet-spoke-123",
                    "--state-file",
                    str(state_file),
                ],
                check=False,
                capture_output=True,
                text=True,
                env={**os.environ, "PATH": f"{fake_bin}:{os.environ['PATH']}"},
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertTrue(state_file.exists())
            self.assertEqual(log.read_text().splitlines(), [
                "delete cluster --name kubernaut-live-fleet-123",
                "delete cluster --name kubernaut-live-fleet-spoke-123",
            ])

    def test_fullpipeline_teardown_uses_run_owned_cluster(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fake_bin = root / "bin"
            fake_bin.mkdir()
            make_executable(fake_bin / "kind", "#!/usr/bin/env sh\nexit 42\n")
            state_file = root / "fixtures.env"
            state_file.write_text("export LIVE_E2E_NS_SUFFIX=r123\n")

            result = subprocess.run(
                [
                    str(TEARDOWN),
                    "--mode",
                    "fullpipeline",
                    "--hub-cluster-name",
                    "kubernaut-live-fullpipeline-123",
                    "--state-file",
                    str(state_file),
                ],
                check=False,
                capture_output=True,
                text=True,
                env={**os.environ, "PATH": f"{fake_bin}:{os.environ['PATH']}"},
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertTrue(state_file.exists())
            self.assertIn("failed to delete run-owned hub Kind cluster", result.stderr)
            self.assertIn("kubernaut-live-fullpipeline-123", result.stderr)


if __name__ == "__main__":
    unittest.main()
