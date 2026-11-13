#!/usr/bin/env bash
# Deploy the verified, deterministic mock-LLM after the upstream catalog seed.
set -euo pipefail

: "${MODE:?MODE is required}"
: "${HUB_KUBECONFIG:?HUB_KUBECONFIG is required}"
: "${HUB_CLUSTER_NAME:?HUB_CLUSTER_NAME is required}"
: "${ARTIFACT_TAG:?ARTIFACT_TAG is required}"
: "${KUBERNAUT_MOCK_LLM_IMAGE:?KUBERNAUT_MOCK_LLM_IMAGE is required}"
: "${KUBERNAUT_MOCK_LLM_IMAGE_TAR:?KUBERNAUT_MOCK_LLM_IMAGE_TAR is required}"
: "${LIVE_E2E_ROOT:?LIVE_E2E_ROOT is required}"
: "${LIVE_E2E_NS_SUFFIX:?LIVE_E2E_NS_SUFFIX is required}"

e2e/live/scripts/kind-setup-mock-llm.sh \
  --mode "${MODE}" \
  --hub-kubeconfig "${HUB_KUBECONFIG}" \
  --hub-cluster-name "${HUB_CLUSTER_NAME}" \
  --artifact-tag "${ARTIFACT_TAG}" \
  --image "${KUBERNAUT_MOCK_LLM_IMAGE}" \
  --image-archive "${KUBERNAUT_MOCK_LLM_IMAGE_TAR}" \
  --suffix "${LIVE_E2E_NS_SUFFIX}" \
  --fixtures-list "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/fixtures.list" \
  --scenario-generator "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/generate-mock-llm-scenarios.py" \
  --output-root "${LIVE_E2E_ROOT}"
