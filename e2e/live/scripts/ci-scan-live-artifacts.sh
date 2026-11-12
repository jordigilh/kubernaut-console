#!/usr/bin/env bash
# Scan all produced live-E2E output before it can be uploaded.
set -euo pipefail

: "${MODE:?MODE is required}"
scan_paths=()
[[ -d "${LIVE_E2E_DIAGNOSTICS_ROOT}" ]] && scan_paths+=("${LIVE_E2E_DIAGNOSTICS_ROOT}")
[[ -f "${LIVE_E2E_SETUP_MANIFEST}" ]] && scan_paths+=("${LIVE_E2E_SETUP_MANIFEST}")
[[ -f "${LIVE_E2E_REPORT}" ]] && scan_paths+=("${LIVE_E2E_REPORT}")
[[ -d "test-results" ]] && scan_paths+=("test-results")
[[ "${#scan_paths[@]}" -gt 0 ]] || {
  echo "error: no live-E2E output exists to scan" >&2
  exit 1
}

secret_args=()
if [[ "${MODE}" != "fullpipeline" && -n "${LIVE_E2E_LLM_CREDENTIAL_FILE:-}" && -f "${LIVE_E2E_LLM_CREDENTIAL_FILE}" ]]; then
  secret_args+=(--secret-file "${LIVE_E2E_LLM_CREDENTIAL_FILE}")
fi
python3 e2e/live/scripts/scan-live-artifacts.py "${secret_args[@]}" "${scan_paths[@]}"
