#!/usr/bin/env python3
"""Verify and consume the immutable live-E2E artifact manifest.

The workflow downloads every artifact from the build phase into one directory.
This script verifies the published hashes before loading any image into Podman,
then extracts only the signed-by-hash chart and scenario archives into a fresh
runtime directory. It never reads or prints credential material.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import tarfile
from pathlib import Path
from typing import Any, NoReturn


def fail(message: str) -> NoReturn:
    raise SystemExit(f"artifact verification failed: {message}")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_member_path(member: tarfile.TarInfo, destination: Path) -> Path:
    if member.islnk() or member.issym():
        fail(f"archive contains a link: {member.name}")
    relative = Path(member.name)
    if relative.is_absolute() or ".." in relative.parts:
        fail(f"archive contains an unsafe path: {member.name}")
    target = (destination / relative).resolve()
    if destination.resolve() not in target.parents and target != destination.resolve():
        fail(f"archive escapes extraction directory: {member.name}")
    return target


def sidecar_archive_path(sidecar_path: Path, archive_name: str, root: Path) -> Path:
    archive = (sidecar_path.parent / archive_name).resolve()
    try:
        archive.relative_to(root)
    except ValueError:
        fail(f"sidecar archive escapes artifact root: {sidecar_path}")
    return archive


def extract_archive(archive: Path, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive, "r:*") as stream:
        members = stream.getmembers()
        for member in members:
            safe_member_path(member, destination)
        stream.extractall(destination, filter="data")


def sidecars(root: Path) -> list[tuple[Path, dict[str, Any]]]:
    result: list[tuple[Path, dict[str, Any]]] = []
    for path in root.rglob("*.json"):
        if path.name == "manifest.json":
            continue
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(value, dict) and value.get("kind"):
            result.append((path, value))
    return result


def load_image(archive: Path) -> None:
    subprocess.run(["podman", "load", "--input", str(archive)], check=True)


def archive_image_id(archive: Path) -> str:
    """Return the image ID Podman assigns when loading a docker-save archive.

    Docker's local ``image inspect .Id`` is not a stable archive identity: for
    registry-pinned images it can be the registry manifest digest, while
    ``podman load`` addresses the image by the archive's config digest. The
    config bytes and their digest are checked here so the sidecar cannot point
    at a different object than the verified archive.
    """

    try:
        with tarfile.open(archive, "r:*") as stream:
            manifest_member = stream.getmember("manifest.json")
            if not manifest_member.isfile():
                raise ValueError("manifest.json is not a regular file")
            manifest_stream = stream.extractfile(manifest_member)
            if manifest_stream is None:
                raise ValueError("manifest.json cannot be read")
            manifest = json.load(manifest_stream)
            if not isinstance(manifest, list) or len(manifest) != 1 or not isinstance(manifest[0], dict):
                raise ValueError("image archive must contain exactly one manifest entry")
            config_path = manifest[0].get("Config")
            if not isinstance(config_path, str):
                raise ValueError(f"image archive has an invalid config path: {config_path!r}")
            match = re.fullmatch(r"blobs/sha256/([0-9a-f]{64})", config_path)
            if match is None:
                raise ValueError(f"image archive has an invalid config path: {config_path!r}")
            config_member = stream.getmember(config_path)
            if not config_member.isfile():
                raise ValueError("image config is not a regular file")
            config_stream = stream.extractfile(config_member)
            if config_stream is None:
                raise ValueError("image config cannot be read")
            digest = hashlib.sha256()
            for chunk in iter(lambda: config_stream.read(1024 * 1024), b""):
                digest.update(chunk)
    except ValueError:
        raise
    except (KeyError, OSError, tarfile.TarError, json.JSONDecodeError) as error:
        raise ValueError(f"cannot inspect image archive {archive}: {error}") from error

    expected_digest = match.group(1)
    actual_digest = digest.hexdigest()
    if actual_digest != expected_digest:
        raise ValueError(
            f"image config digest mismatch for {archive}: got {actual_digest}, expected {expected_digest}"
        )
    return f"sha256:{actual_digest}"


def image_exists(reference: str) -> bool:
    return subprocess.run(
        ["podman", "image", "exists", reference],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    ).returncode == 0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--console-sha", required=True)
    parser.add_argument("--kubernaut-sha", required=True)
    parser.add_argument("--operator-sha", required=True)
    parser.add_argument("--scenarios-sha", required=True)
    args = parser.parse_args()

    root = args.root.resolve()
    manifest_path = args.manifest.resolve()
    if not root.is_dir() or not manifest_path.is_file():
        fail("artifact root or manifest does not exist")
    try:
        manifest_path.relative_to(root)
    except ValueError:
        fail("manifest must be below the downloaded artifact root")

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"cannot read manifest: {error}")

    if manifest.get("kind") != "kubernaut-console-live-e2e-artifacts":
        fail(f"unexpected manifest kind: {manifest.get('kind')!r}")
    if manifest.get("schemaVersion") != 1:
        fail(f"unsupported manifest schema: {manifest.get('schemaVersion')!r}")

    expected_sources = {
        "console": args.console_sha,
        "kubernaut": args.kubernaut_sha,
        "operator": args.operator_sha,
        "demoScenarios": args.scenarios_sha,
    }
    for source_name, source_sha in expected_sources.items():
        if not isinstance(source_sha, str) or not re.fullmatch(r"[0-9a-f]{40}", source_sha):
            fail(f"invalid expected source SHA for {source_name}")
    sources = manifest.get("sources", {})
    for name, expected in expected_sources.items():
        actual = sources.get(name, {}).get("sha")
        if actual != expected:
            fail(f"source SHA mismatch for {name}: manifest={actual!r}, expected={expected!r}")

    entries = manifest.get("artifacts")
    if not isinstance(entries, list) or not entries:
        fail("manifest has no artifact entries")

    files_by_name: dict[str, list[Path]] = {}
    for entry in entries:
        if not isinstance(entry, dict) or not isinstance(entry.get("path"), str):
            fail("manifest contains a malformed artifact entry")
        path = (root / entry["path"]).resolve()
        try:
            path.relative_to(root)
        except ValueError:
            fail(f"artifact path escapes root: {entry['path']}")
        if not path.is_file():
            fail(f"manifest artifact is missing: {entry['path']}")
        actual = sha256(path)
        if actual != entry.get("sha256"):
            fail(f"SHA-256 mismatch for {entry['path']}: got {actual}, expected {entry.get('sha256')}")
        files_by_name.setdefault(path.name, []).append(path)

    required = manifest.get("requiredArchiveNames", [])
    if not isinstance(required, list) or not all(isinstance(name, str) for name in required):
        fail("manifest requiredArchiveNames is not a list")
    missing = sorted(name for name in required if name not in files_by_name)
    if missing:
        fail("required archives are missing: " + ", ".join(missing))

    metadata = sidecars(root)
    archives: list[Path] = []
    image_metadata: list[tuple[dict[str, Any], Path]] = []
    scenario_archive: Path | None = None
    chart_archive: Path | None = None
    for sidecar_path, value in metadata:
        archive: Path | None = None
        archive_name = value.get("archive")
        if isinstance(archive_name, str):
            archive = sidecar_archive_path(sidecar_path, archive_name, root)
            if not archive.is_file():
                fail(f"sidecar points to missing archive: {sidecar_path}")
            expected = value.get("archiveSHA256")
            if not isinstance(expected, str) or not re.fullmatch(r"[0-9a-f]{64}", expected):
                fail(f"sidecar has no valid archive SHA-256: {sidecar_path}")
            if sha256(archive) != expected:
                fail(f"sidecar SHA-256 mismatch for {archive}")
            archives.append(archive)
        kind = value.get("kind")
        if kind in {"container-image", "auxiliary-image"}:
            if archive is None:
                fail(f"image sidecar has no archive: {sidecar_path}")
            image_metadata.append((value, archive))
        elif kind == "operator-qualification-input":
            charts = value.get("charts")
            if not isinstance(charts, dict):
                fail(f"operator provenance has no chart metadata: {sidecar_path}")
            image = value.get("image")
            if not isinstance(image, dict):
                fail(f"operator provenance has no image metadata: {sidecar_path}")
            image_archive_name = image.get("archive")
            if not isinstance(image_archive_name, str):
                fail(f"operator provenance has no image archive: {sidecar_path}")
            archive = sidecar_archive_path(sidecar_path, image_archive_name, root)
            if not archive.is_file():
                fail(f"operator image archive is missing: {archive}")
            image_archive_sha = image.get("archiveSHA256")
            if not isinstance(image_archive_sha, str) or not re.fullmatch(r"[0-9a-f]{64}", image_archive_sha) or sha256(archive) != image_archive_sha:
                fail(f"operator image sidecar SHA-256 mismatch for {archive}")
            archives.append(archive)
            image_metadata.append(
                (
                    {
                        "kind": "container-image",
                        "name": "operator",
                        "sourceSHA": value.get("sourceSHA"),
                        "reference": image.get("reference"),
                        "imageID": image.get("imageID"),
                    },
                    archive,
                )
            )
            chart_name = charts.get("archive")
            if not isinstance(chart_name, str) or not chart_name:
                fail(f"operator provenance has no chart archive: {sidecar_path}")
            chart_archive = sidecar_archive_path(sidecar_path, chart_name, root)
            if not chart_archive.is_file():
                fail(f"operator chart archive is missing: {chart_archive}")
            chart_sha = charts.get("archiveSHA256")
            if not isinstance(chart_sha, str) or not re.fullmatch(r"[0-9a-f]{64}", chart_sha) or sha256(chart_archive) != chart_sha:
                fail(f"operator chart sidecar SHA-256 mismatch for {chart_archive}")
        elif kind == "fixture-source":
            if archive is None:
                fail(f"fixture-source sidecar has no archive: {sidecar_path}")
            scenario_archive = archive
        source_sha = value.get("sourceSHA")
        if isinstance(source_sha, str):
            if kind == "fixture-source":
                expected_source = expected_sources["demoScenarios"]
            elif kind == "operator-qualification-input":
                expected_source = expected_sources["operator"]
            elif kind == "container-image":
                expected_source = expected_sources["console"] if value.get("name") == "console" else expected_sources["kubernaut"]
            else:
                expected_source = None
            if expected_source is not None and source_sha != expected_source:
                fail(f"sidecar source SHA mismatch for {sidecar_path}")

    if scenario_archive is None or not scenario_archive.is_file():
        fail("fixture-source archive was not found")
    if chart_archive is None or not chart_archive.is_file():
        fail("operator chart archive was not found")

    output = args.output.resolve()
    if output.exists() and any(output.iterdir()):
        fail(f"runtime output directory is not empty: {output}")
    output.mkdir(parents=True, exist_ok=True)

    # Load every image only after all manifest and sidecar hashes have passed.
    for archive in sorted(set(archives)):
        if archive.name.endswith(".tar"):
            load_image(archive)

    for value, archive in image_metadata:
        try:
            archive_id = archive_image_id(archive)
        except ValueError as error:
            fail(str(error))
        reference = value.get("reference")
        image_id = value.get("imageID")
        if image_id != archive_id:
            fail(f"image ID mismatch for {archive}: sidecar={image_id!r}, archive={archive_id!r}")
        if not isinstance(reference, str) or not (
            image_exists(reference) or image_exists(archive_id)
        ):
            fail(f"loaded image is not available: {reference!r}")

    scenario_root = output / "demo-scenarios"
    chart_root = output / "operator-charts"
    extract_archive(scenario_archive, scenario_root)
    extract_archive(chart_archive, chart_root)

    # The scenario archive is a runtime input, not a credential bundle. Check
    # its extracted names as a second boundary after tar extraction.
    forbidden = []
    for path in scenario_root.rglob("*"):
        relative = path.relative_to(scenario_root).as_posix()
        parts = set(path.parts)
        if "credentials" in parts or ".git" in parts or path.name == ".env" or path.name.startswith(".env."):
            forbidden.append(relative)
    if forbidden:
        fail("scenario archive contains forbidden paths: " + ", ".join(sorted(forbidden)))

    runtime = {
        "schemaVersion": 1,
        "artifactTag": manifest.get("artifactTag"),
        "lifecycleContract": manifest.get("lifecycleContract"),
        "sources": expected_sources,
        "scenarioRoot": str(scenario_root),
        "operatorChartPath": str(chart_root / "charts" / "kubernaut-operator"),
        "dependencyChartPath": str(chart_root / "charts" / "kubernaut-development-dependencies"),
        "operatorImage": manifest.get("imageContract", {}).get("operatorImage"),
        "consoleImage": manifest.get("imageContract", {}).get("consoleImage"),
        "requiredArchiveNames": sorted(required),
    }
    runtime_path = output / "runtime.json"
    runtime_path.write_text(json.dumps(runtime, indent=2) + "\n", encoding="utf-8")
    os.chmod(runtime_path, 0o600)
    print(json.dumps(runtime, indent=2))


if __name__ == "__main__":
    main()
