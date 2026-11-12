#!/usr/bin/env bash
# Resolve workflow inputs to the immutable source/artifact contract consumed by
# every build and Live E2E job.
set -euo pipefail

console_sha="${REQUESTED_CONSOLE_REF:-${GITHUB_SHA}}"
kubernaut_sha="${REQUESTED_KUBERNAUT_REF:-397fc2b70eabc8932176aa10729ced1e8a6c5b5d}"
operator_sha="${REQUESTED_OPERATOR_REF:-ad80481c3fb7cd1ea3c9d29c26b3d9a36a360906}"
scenarios_sha="${REQUESTED_SCENARIOS_REF:-0af47027d654bc5bf9ed055790c0311642b43be1}"
lifecycle_contract="${REQUESTED_LIFECYCLE_CONTRACT:-existing}"

for pair in \
  "console:${console_sha}" \
  "kubernaut:${kubernaut_sha}" \
  "operator:${operator_sha}" \
  "demo-scenarios:${scenarios_sha}"; do
  name="${pair%%:*}"
  sha="${pair#*:}"
  if [[ ! "${sha}" =~ ^[0-9a-f]{40}$ ]]; then
    echo "::error::${name} must be a lowercase 40-character commit SHA: ${sha}"
    exit 1
  fi
done

case "${lifecycle_contract}" in
  existing) ;;
  pr-2621)
    if [[ "${kubernaut_sha}" != "77c4da0c68f86f91cf5c3c84a1d2207c9f4df797" ]]; then
      echo "::error::lifecycle_contract=pr-2621 requires Kubernaut PR #2621 head 77c4da0c68f86f91cf5c3c84a1d2207c9f4df797"
      exit 1
    fi
    ;;
  *)
    echo "::error::unsupported lifecycle contract: ${lifecycle_contract}"
    exit 1
    ;;
esac

{
  echo "console_sha=${console_sha}"
  echo "kubernaut_sha=${kubernaut_sha}"
  echo "operator_sha=${operator_sha}"
  echo "scenarios_sha=${scenarios_sha}"
  echo "lifecycle_contract=${lifecycle_contract}"
  echo "artifact_tag=${ARTIFACT_TAG}"
} >> "${GITHUB_OUTPUT}"

echo "Console: ${console_sha}"
echo "Kubernaut: ${kubernaut_sha}"
echo "Operator: ${operator_sha}"
echo "Demo scenarios: ${scenarios_sha}"
echo "Lifecycle contract: ${lifecycle_contract}"
echo "Artifact tag: ${ARTIFACT_TAG}"
