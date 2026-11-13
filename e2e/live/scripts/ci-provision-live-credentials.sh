#!/usr/bin/env bash
# Write the deterministic mock-LLM credential to a mode-local,
# permission-restricted file without printing its contents.
set -euo pipefail

: "${LIVE_E2E_ROOT:?LIVE_E2E_ROOT is required}"
: "${GITHUB_ENV:?GITHUB_ENV is required}"

readonly provider="openai"
readonly model="mock-model"
readonly endpoint="http://mock-llm:8080"
readonly credential="mock-api-key-for-e2e"

credential_file="${LIVE_E2E_ROOT}/llm-credentials"
umask 077
printf '%s' "${credential}" > "${credential_file}"
chmod 600 "${credential_file}"
{
  echo "LLM_PROVIDER=${provider}"
  echo "LLM_MODEL=${model}"
  echo "LLM_ENDPOINT=${endpoint}"
  echo "LLM_CREDENTIAL_FILE=${credential_file}"
  echo "LIVE_E2E_LLM_CREDENTIAL_FILE=${credential_file}"
} >> "${GITHUB_ENV}"
