#!/usr/bin/env bash
# Collect failure diagnostics without reading Kubernetes Secret data or the
# runner's credential file. Every text stream is redacted before it is written.
set -uo pipefail

MODE=""
HUB_KUBECONFIG=""
SPOKE_KUBECONFIG=""
OUTPUT=""
NATIVE_LOG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="${2:-}"; shift 2 ;;
    --hub-kubeconfig) HUB_KUBECONFIG="${2:-}"; shift 2 ;;
    --spoke-kubeconfig) SPOKE_KUBECONFIG="${2:-}"; shift 2 ;;
    --output) OUTPUT="${2:-}"; shift 2 ;;
    --native-log) NATIVE_LOG="${2:-}"; shift 2 ;;
    *) echo "error: unknown argument $1" >&2; exit 2 ;;
  esac
done

[[ "$MODE" == "local" || "$MODE" == "fleet" || "$MODE" == "fullpipeline" ]] || { echo "error: invalid mode" >&2; exit 2; }
[[ -n "$OUTPUT" ]] || { echo "error: --output is required" >&2; exit 2; }
mkdir -p "$OUTPUT"
chmod 700 "$OUTPUT"

redact() {
  sed -E \
    -e 's/((api[_-]?key|password|passwd|secret|token|client[_-]?secret|authorization|auth[_-]?token)[[:space:]]*[:=][[:space:]]*)("[^"]*")/\1<REDACTED>/Ig' \
    -e "s/((api[_-]?key|password|passwd|secret|token|client[_-]?secret|authorization|auth[_-]?token)[[:space:]]*[:=][[:space:]]*)('[^']*')/\1<REDACTED>/Ig" \
    -e "s/((auth[_-]?token)[[:space:]]*[:=][[:space:]]*)[^,[:space:]}'\"]+/\\1<REDACTED>/Ig" \
    -e 's/((private[_-]?key|credentials?)[[:space:]]*[[:punct:]]?[[:space:]]*[:=][[:space:]]*)[[:punct:]]?[^[:space:],}]+/\1<REDACTED>/Ig' \
    -e 's/(Basic[[:space:]]+)[-A-Za-z0-9._~+\/=]+/\1<REDACTED>/Ig' \
    -e 's/(Bearer[[:space:]]+)[A-Za-z0-9._~+\/-]+/\1<REDACTED>/Ig' \
    -e 's/((api[_-]?key|password|passwd|secret|token|client[_-]?secret|authorization)[[:space:]]*[:=][[:space:]]*)[^,[:space:]}"'"'"']+/\1<REDACTED>/Ig' \
    -e 's/("[A-Za-z0-9_-]*(api[_-]?key|password|passwd|secret|token|client[_-]?secret|authorization)"[[:space:]]*:[[:space:]]*")[^"]*(")/\1<REDACTED>\3/Ig'
}

capture() {
  local output_file="$1"; shift
  local temp_file
  temp_file="$(mktemp)"
  "$@" >"$temp_file" 2>&1 || echo "command exited non-zero: $*" >>"$temp_file"
  redact <"$temp_file" >"$output_file"
  rm -f "$temp_file"
}

capture_kube() {
  local kubeconfig="$1" output_file="$2"; shift 2
  capture "$output_file" kubectl --kubeconfig "$kubeconfig" "$@"
}

collect_cluster() {
  local cluster_name="$1" kubeconfig="$2"
  local directory="$OUTPUT/$cluster_name"
  mkdir -p "$directory"
  capture_kube "$kubeconfig" "$directory/client-version.txt" version --client=true
  capture_kube "$kubeconfig" "$directory/cluster-info.txt" cluster-info
  capture_kube "$kubeconfig" "$directory/nodes.txt" get nodes -o wide
  capture_kube "$kubeconfig" "$directory/pods.txt" get pods --all-namespaces -o wide
  capture_kube "$kubeconfig" "$directory/deployments.txt" get deployments --all-namespaces
  capture_kube "$kubeconfig" "$directory/statefulsets.txt" get statefulsets --all-namespaces
  capture_kube "$kubeconfig" "$directory/jobs.txt" get jobs --all-namespaces -o json
  capture_kube "$kubeconfig" "$directory/events.txt" get events --all-namespaces --sort-by=.lastTimestamp
  capture_kube "$kubeconfig" "$directory/secrets-names.txt" get secrets --all-namespaces -o name
  capture_kube "$kubeconfig" "$directory/kubernaut-cr.json" get kubernaut kubernaut -n kubernaut-system -o json
  capture_kube "$kubeconfig" "$directory/remediationrequests.json" get remediationrequests -n kubernaut-system -o json
  capture_kube "$kubeconfig" "$directory/workflowexecutions.json" get workflowexecutions -n kubernaut-system -o json
  capture_kube "$kubeconfig" "$directory/investigationsessions.json" get investigationsessions -n kubernaut-system -o json
  if [[ "$MODE" == "fullpipeline" ]]; then
    capture_kube "$kubeconfig" "$directory/mock-llm-scenarios.json" get configmap mock-llm-scenarios -n kubernaut-system -o json
  fi

  # Logs are useful for controller failures but are the highest-risk diagnostic
  # stream. Restrict collection to platform pods and redact before persistence.
  local pods pod
  pods="$(kubectl --kubeconfig "$kubeconfig" get pods -n kubernaut-system -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>/dev/null || true)"
  while IFS= read -r pod; do
    [[ -z "$pod" || "$pod" =~ [^a-zA-Z0-9.-] ]] && continue
    capture_kube "$kubeconfig" "$directory/log-${pod}.txt" logs "$pod" --all-containers=true --tail=250 --timestamps=true
  done <<<"$pods"
}

cluster_label="hub"
[[ "$MODE" == "fullpipeline" ]] && cluster_label="fullpipeline-e2e"
collect_cluster "$cluster_label" "$HUB_KUBECONFIG"
if [[ "$MODE" == "fleet" && -s "$SPOKE_KUBECONFIG" ]]; then
  collect_cluster spoke "$SPOKE_KUBECONFIG"
fi

if command -v podman >/dev/null 2>&1; then
  capture "$OUTPUT/podman-containers.txt" podman ps -a
  capture "$OUTPUT/podman-images.txt" podman images --format '{{.Repository}}:{{.Tag}} {{.ID}}'
fi
if command -v kind >/dev/null 2>&1; then
  capture "$OUTPUT/kind-clusters.txt" kind get clusters
fi

if [[ "$MODE" == "fullpipeline" && -n "$NATIVE_LOG" && -f "$NATIVE_LOG" ]]; then
  redact <"$NATIVE_LOG" >"$OUTPUT/upstream-fullpipeline.log"
fi

cat >"$OUTPUT/README.txt" <<EOF
Diagnostics are sanitized and contain no Kubernetes Secret values.
Mode: ${MODE}
Hub kubeconfig: ${HUB_KUBECONFIG}
EOF
if [[ "$MODE" == "fleet" ]]; then
  echo "Spoke kubeconfig: ${SPOKE_KUBECONFIG}" >>"$OUTPUT/README.txt"
fi
if [[ "$MODE" == "fullpipeline" ]]; then
  echo "Native upstream log: ${NATIVE_LOG:-not provided}" >>"$OUTPUT/README.txt"
fi
chmod -R go-rwx "$OUTPUT"
