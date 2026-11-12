#!/usr/bin/env bash
# Package only the pinned scenario source required by the live lanes.
set -euo pipefail

: "${SOURCE_SHA:?SOURCE_SHA is required}"
mkdir -p artifact

# Never package the scenarios repository's credentials directory or workspace
# environment files into a GitHub Actions artifact.
tar -czf artifact/demo-scenarios.tar.gz \
  -C kubernaut-demo-scenarios \
  base deploy docs golden-transcripts helm overlays scenarios scripts tools README.md LICENSE
if tar -tzf artifact/demo-scenarios.tar.gz | grep -E '(^|/)(credentials|\.git)(/|$)|(^|/)\.env($|\.)' >/dev/null; then
  echo "::error::scenario artifact contains a credentials or environment-file path"
  exit 1
fi
archive_sha="$(sha256sum artifact/demo-scenarios.tar.gz | awk '{print $1}')"
jq -n \
  --arg source_sha "${SOURCE_SHA}" \
  --arg archive_sha "${archive_sha}" \
  '{kind:"fixture-source",repository:"jordigilh/kubernaut-demo-scenarios",sourceSHA:$source_sha,archive:"demo-scenarios.tar.gz",archiveSHA256:$archive_sha}' \
  > artifact/demo-scenarios.json
