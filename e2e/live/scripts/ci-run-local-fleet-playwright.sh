#!/usr/bin/env bash
# Run the local/fleet Console suite and, for fleet, the concurrent spoke proof.
set +e

proof_pid=""
proof_log="${LIVE_E2E_DIAGNOSTICS_ROOT}/fleet-spoke-proof.log"
if [[ "${MODE}" == "fleet" ]]; then
  e2e/live/scripts/assert-fleet-spoke-execution.sh \
    --hub-kubeconfig "${HUB_KUBECONFIG}" \
    --spoke-kubeconfig "${SPOKE_KUBECONFIG}" \
    --suffix "${LIVE_E2E_NS_SUFFIX}" \
    --cluster-id "${LIVE_E2E_FLEET_CLUSTER_ID}" \
    --timeout-seconds 5400 \
    --output "${LIVE_E2E_DIAGNOSTICS_ROOT}/fleet-spoke-proof.json" \
    >"${proof_log}" 2>&1 &
  proof_pid=$!
fi

pnpm exec playwright test --config=playwright.live-kind.config.ts
playwright_status=$?
proof_status=0
if [[ -n "${proof_pid}" ]]; then
  if [[ "${playwright_status}" -eq 0 ]]; then
    wait "${proof_pid}"
    proof_status=$?
  else
    kill "${proof_pid}" 2>/dev/null || true
    wait "${proof_pid}" 2>/dev/null || true
  fi
fi
echo "status=${playwright_status}" >> "${GITHUB_OUTPUT}"
if [[ "${playwright_status}" -ne 0 ]]; then
  exit "${playwright_status}"
fi
if [[ "${proof_status}" -ne 0 ]]; then
  echo "Fleet spoke proof failed:" >&2
  cat "${proof_log}" >&2
  exit "${proof_status}"
fi
