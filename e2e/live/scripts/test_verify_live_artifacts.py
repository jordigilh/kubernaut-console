#!/usr/bin/env python3
"""Focused regression tests for docker-save image identity handling."""

from __future__ import annotations

import hashlib
import importlib.util
import io
import json
import tarfile
import tempfile
import unittest
from pathlib import Path
from typing import Optional


SCRIPT = Path(__file__).with_name("verify-live-artifacts.py")
SPEC = importlib.util.spec_from_file_location("verify_live_artifacts", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
VERIFY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFY)


def write_image_archive(path: Path, config: bytes, config_digest: Optional[str] = None) -> str:
    digest = config_digest or hashlib.sha256(config).hexdigest()
    config_path = f"blobs/sha256/{digest}"
    with tarfile.open(path, "w") as archive:
        manifest = json.dumps([{"Config": config_path, "Layers": []}]).encode()
        for name, contents in (("manifest.json", manifest), (config_path, config)):
            member = tarfile.TarInfo(name)
            member.size = len(contents)
            archive.addfile(member, io.BytesIO(contents))
    return digest


class ArchiveImageIDTests(unittest.TestCase):
    def test_uses_saved_config_digest_not_registry_manifest_digest(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "oauth2-proxy.tar"
            config_digest = write_image_archive(archive, b'{"architecture":"amd64"}')

            self.assertEqual(f"sha256:{config_digest}", VERIFY.archive_image_id(archive))

    def test_rejects_config_path_digest_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "invalid.tar"
            write_image_archive(archive, b"actual config", "0" * 64)

            with self.assertRaisesRegex(ValueError, "config digest mismatch"):
                VERIFY.archive_image_id(archive)


class ArchiveExtractionTests(unittest.TestCase):
    def test_allows_internal_relative_symlinks(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "scenarios.tar"
            with tarfile.open(archive, "w") as stream:
                target = b"kind: Cluster\n"
                target_member = tarfile.TarInfo("scenarios/kind-config-singlenode.yaml")
                target_member.size = len(target)
                stream.addfile(target_member, io.BytesIO(target))
                link_member = tarfile.TarInfo("scenarios/gitops-drift/kind-config.yaml")
                link_member.type = tarfile.SYMTYPE
                link_member.linkname = "../kind-config-singlenode.yaml"
                stream.addfile(link_member)

            destination = Path(directory) / "extracted"
            VERIFY.extract_archive(archive, destination)

            link = destination / "scenarios/gitops-drift/kind-config.yaml"
            self.assertTrue(link.is_symlink())
            self.assertEqual(b"kind: Cluster\n", link.read_bytes())

    def test_rejects_symlink_that_escapes_destination(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "unsafe.tar"
            with tarfile.open(archive, "w") as stream:
                link_member = tarfile.TarInfo("scenarios/kind-config.yaml")
                link_member.type = tarfile.SYMTYPE
                link_member.linkname = "../../outside"
                stream.addfile(link_member)

            with self.assertRaisesRegex(SystemExit, "symlink escapes"):
                VERIFY.extract_archive(archive, Path(directory) / "extracted")

    def test_rejects_members_beneath_symlink_paths(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "unsafe-nested.tar"
            with tarfile.open(archive, "w") as stream:
                target_member = tarfile.TarInfo("target")
                target_member.type = tarfile.DIRTYPE
                stream.addfile(target_member)
                link_member = tarfile.TarInfo("alias")
                link_member.type = tarfile.SYMTYPE
                link_member.linkname = "target"
                stream.addfile(link_member)
                nested_member = tarfile.TarInfo("alias/file.txt")
                nested_member.size = 1
                stream.addfile(nested_member, io.BytesIO(b"x"))

            with self.assertRaisesRegex(SystemExit, "beneath a symlink"):
                VERIFY.extract_archive(archive, Path(directory) / "extracted")


if __name__ == "__main__":
    unittest.main()
