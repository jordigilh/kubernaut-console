#!/usr/bin/env python3
"""Fail closed if a live-E2E upload contains credential material.

The workflow never uploads the kubeconfig, LLM credential, or browser auth
state. This scanner is a second boundary for sanitized diagnostics, the JSON
report, and any opt-in Playwright artifacts left under test-results.
It reports only the file and rule that matched, never the matched bytes.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path
from typing import Iterable


RULES: tuple[tuple[str, re.Pattern[bytes]], ...] = (
    (
        "authorization header",
        re.compile(rb"(?i)\b(?:authorization|proxy-authorization)\s*[:=]\s*(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{12,}"),
    ),
    (
        "bearer token",
        re.compile(rb"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{16,}"),
    ),
    (
        "cookie header",
        re.compile(rb"(?i)\b(?:set-cookie|cookie)\s*[:=]\s*(?!\s*(?:\[\]|\{\}|null|<REDACTED>))(?:[^\r\n]{3,})"),
    ),
    (
        "JWT-like token",
        re.compile(rb"[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}"),
    ),
    (
        "credential assignment",
        re.compile(
            rb"(?i)\b(?:password|passwd|secret|token|api[_-]?key|client[_-]?secret|private[_-]?key|credential(?:s)?|access[_-]?token|refresh[_-]?token|id[_-]?token)\b"
            rb"\s*[:=]\s*[\"']?(?!<REDACTED>|null|none|true|false|\[\]|\{\})[A-Za-z0-9._~+/=-]{8,}"
        ),
    ),
    (
        "kubeconfig credential field",
        re.compile(rb"(?im)^\s*(?:token|client-key-data|client-certificate-data|certificate-authority-data)\s*:"),
    ),
    (
        "Kubernetes Secret object",
        re.compile(rb"(?im)^\s*kind\s*:\s*Secret\s*$"),
    ),
)

FORBIDDEN_NAME_PARTS = {
    "credentials",
    "credential",
    "kubeconfig",
    "auth-state",
    "storage-state",
}


def iter_files(paths: Iterable[Path]) -> Iterable[Path]:
    for path in paths:
        if not path.exists():
            raise SystemExit(f"artifact scan input does not exist: {path}")
        if path.is_symlink():
            raise SystemExit(f"artifact scan input is a symlink: {path}")
        if path.is_file():
            yield path
            continue
        for child in sorted(path.rglob("*")):
            if child.is_symlink():
                raise SystemExit(f"artifact scan found a symlink: {child}")
            if child.is_file():
                yield child


def read_secret_files(paths: Iterable[Path]) -> list[bytes]:
    secrets: list[bytes] = []
    for path in paths:
        if not path.is_file():
            raise SystemExit(f"secret scan input is not a file: {path}")
        value = path.read_bytes()
        if value:
            secrets.append(value.rstrip(b"\r\n"))
    return secrets


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="+", type=Path)
    parser.add_argument("--secret-file", action="append", type=Path, default=[])
    args = parser.parse_args()

    secret_values = read_secret_files(args.secret_file)
    violations: list[tuple[Path, str]] = []
    seen: set[Path] = set()

    for path in iter_files(args.paths):
        resolved = path.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)

        name_parts = {part.lower() for part in path.parts}
        forbidden_parts = sorted(name_parts & FORBIDDEN_NAME_PARTS)
        if forbidden_parts:
            violations.append((path, "credential-bearing filename/path"))

        data = path.read_bytes()
        for secret in secret_values:
            if len(secret) >= 6 and secret in data:
                violations.append((path, "configured secret value"))
                break

        for label, pattern in RULES:
            if pattern.search(data):
                violations.append((path, label))

    if violations:
        print("Live-E2E artifact security scan failed:")
        for path, rule in sorted(set(violations), key=lambda item: (str(item[0]), item[1])):
            print(f" - {path}: {rule}")
        raise SystemExit(1)

    print(f"Live-E2E artifact security scan passed: {len(seen)} file(s)")


if __name__ == "__main__":
    main()
