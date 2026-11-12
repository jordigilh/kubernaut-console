#!/usr/bin/env bash
# Write the approved real-LLM credential to a mode-local, permission-restricted
# file without printing its contents.
set -euo pipefail

: "${LLM_PROVIDER:?LLM_PROVIDER is required}"
: "${LLM_MODEL:?LLM_MODEL is required}"
: "${LLM_CREDENTIAL:?LLM_CREDENTIAL is required}"

[[ -n "${LLM_PROVIDER}" ]] || { echo "::error::Configure LIVE_E2E_LLM_PROVIDER or workflow_dispatch llm_provider"; exit 1; }
[[ -n "${LLM_MODEL}" ]] || { echo "::error::Configure LIVE_E2E_LLM_MODEL or workflow_dispatch llm_model"; exit 1; }
if [[ "${LLM_PROVIDER}" == "vertex_ai" ]]; then
  [[ -n "${VERTEX_PROJECT:-}" ]] || { echo "::error::Vertex AI requires LIVE_E2E_VERTEX_PROJECT"; exit 1; }
  [[ -n "${VERTEX_LOCATION:-}" ]] || { echo "::error::Vertex AI requires LIVE_E2E_VERTEX_LOCATION"; exit 1; }
else
  [[ -n "${LLM_ENDPOINT:-}" ]] || { echo "::error::Configure LIVE_E2E_LLM_ENDPOINT or workflow_dispatch llm_endpoint"; exit 1; }
fi

credential_file="${LIVE_E2E_ROOT}/llm-credentials"
umask 077
printf '%s' "${LLM_CREDENTIAL}" > "${credential_file}"
chmod 600 "${credential_file}"
echo "LIVE_E2E_LLM_CREDENTIAL_FILE=${credential_file}" >> "${GITHUB_ENV}"
