#!/usr/bin/env bash
# Load and deploy the verified mock-LLM image in the hub Kind cluster.
#
# This is deliberately Console-owned setup. Upstream Make bootstraps the
# application and its Keycloak/Traefik topology, but it does not own the
# Console lane's mock service or scenario ConfigMap.
set -euo pipefail

MODE=""
HUB_KUBECONFIG=""
HUB_CLUSTER_NAME=""
ARTIFACT_TAG=""
IMAGE=""
IMAGE_ARCHIVE=""
SUFFIX=""
FIXTURES_LIST=""
SCENARIO_GENERATOR=""
OUTPUT_ROOT=""

usage() {
  echo "usage: $0 --mode local|fleet|fullpipeline --hub-kubeconfig PATH --hub-cluster-name NAME --artifact-tag TAG --image IMAGE --image-archive PATH --suffix SUFFIX --fixtures-list PATH --scenario-generator PATH --output-root PATH" >&2
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="${2:-}"; shift 2 ;;
    --hub-kubeconfig) HUB_KUBECONFIG="${2:-}"; shift 2 ;;
    --hub-cluster-name) HUB_CLUSTER_NAME="${2:-}"; shift 2 ;;
    --artifact-tag) ARTIFACT_TAG="${2:-}"; shift 2 ;;
    --image) IMAGE="${2:-}"; shift 2 ;;
    --image-archive) IMAGE_ARCHIVE="${2:-}"; shift 2 ;;
    --suffix) SUFFIX="${2:-}"; shift 2 ;;
    --fixtures-list) FIXTURES_LIST="${2:-}"; shift 2 ;;
    --scenario-generator) SCENARIO_GENERATOR="${2:-}"; shift 2 ;;
    --output-root) OUTPUT_ROOT="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done

[[ "$MODE" == "local" || "$MODE" == "fleet" || "$MODE" == "fullpipeline" ]] || usage
[[ -s "$HUB_KUBECONFIG" ]] || { echo "error: hub kubeconfig is missing" >&2; exit 1; }
[[ "$HUB_CLUSTER_NAME" =~ ^[a-z0-9-]+$ ]] || { echo "error: invalid hub cluster name" >&2; exit 1; }
[[ "$IMAGE" == "localhost/mock-llm:${ARTIFACT_TAG}" ]] || {
  echo "error: mock-LLM image must be localhost/mock-llm:${ARTIFACT_TAG}" >&2
  exit 1
}
[[ -f "$IMAGE_ARCHIVE" ]] || { echo "error: verified mock-LLM image archive is missing" >&2; exit 1; }
[[ -x "$SCENARIO_GENERATOR" || -f "$SCENARIO_GENERATOR" ]] || { echo "error: scenario generator is missing" >&2; exit 1; }
[[ -f "$FIXTURES_LIST" ]] || { echo "error: fixtures list is missing" >&2; exit 1; }

for command in kind kubectl jq python3; do
  command -v "$command" >/dev/null 2>&1 || { echo "error: $command is required" >&2; exit 1; }
done

export KIND_EXPERIMENTAL_PROVIDER="${KIND_EXPERIMENTAL_PROVIDER:-podman}"
echo "==> Loading verified mock-LLM archive into Kind cluster ${HUB_CLUSTER_NAME}"
kind load image-archive "$IMAGE_ARCHIVE" --name "$HUB_CLUSTER_NAME"

catalog_json="$(mktemp)"
scenario_file="${OUTPUT_ROOT}/runtime/mock-llm-scenarios.yaml"
trap 'rm -f "$catalog_json"' EXIT
mkdir -p "$(dirname "$scenario_file")"
chmod 700 "$(dirname "$scenario_file")"

kubectl --kubeconfig "$HUB_KUBECONFIG" get remediationworkflows -n kubernaut-system -o json >"$catalog_json"
python3 "$SCENARIO_GENERATOR" \
  --catalog-json "$catalog_json" \
  --fixtures-list "$FIXTURES_LIST" \
  --suffix "$SUFFIX" \
  --output "$scenario_file"
chmod 600 "$scenario_file"

echo "==> Applying catalog-derived mock-LLM scenarios"
kubectl --kubeconfig "$HUB_KUBECONFIG" -n kubernaut-system create configmap mock-llm-scenarios \
  --from-file=scenarios.yaml="$scenario_file" \
  --dry-run=client -o yaml \
  | kubectl --kubeconfig "$HUB_KUBECONFIG" apply -f - >/dev/null

cat <<EOF | kubectl --kubeconfig "$HUB_KUBECONFIG" apply -f - >/dev/null
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mock-llm
  namespace: kubernaut-system
  labels:
    app: mock-llm
    component: console-live-e2e
spec:
  replicas: 1
  selector:
    matchLabels:
      app: mock-llm
  template:
    metadata:
      labels:
        app: mock-llm
        component: console-live-e2e
    spec:
      containers:
        - name: mock-llm
          image: ${IMAGE}
          imagePullPolicy: IfNotPresent
          ports:
            - name: http
              containerPort: 8080
              protocol: TCP
          env:
            - name: MOCK_LLM_HOST
              value: "0.0.0.0"
            - name: MOCK_LLM_PORT
              value: "8080"
            - name: MOCK_LLM_MODE
              value: "full"
            - name: MOCK_LLM_FORCE_TEXT
              value: "true"
            - name: MOCK_LLM_CONFIG_PATH
              value: "/config/scenarios.yaml"
          volumeMounts:
            - name: scenarios-config
              mountPath: /config/scenarios.yaml
              subPath: scenarios.yaml
              readOnly: true
          livenessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 10
            periodSeconds: 10
            timeoutSeconds: 3
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 5
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 3
          resources:
            requests:
              cpu: 100m
              memory: 64Mi
            limits:
              cpu: 200m
              memory: 128Mi
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: [ALL]
            runAsNonRoot: true
            runAsUser: 1001
      volumes:
        - name: scenarios-config
          configMap:
            name: mock-llm-scenarios
            items:
              - key: scenarios.yaml
                path: scenarios.yaml
      securityContext:
        fsGroup: 1001
      restartPolicy: Always
---
apiVersion: v1
kind: Service
metadata:
  name: mock-llm
  namespace: kubernaut-system
  labels:
    app: mock-llm
    component: console-live-e2e
spec:
  type: ClusterIP
  selector:
    app: mock-llm
  ports:
    - name: http
      port: 8080
      targetPort: http
      protocol: TCP
EOF

kubectl --kubeconfig "$HUB_KUBECONFIG" -n kubernaut-system rollout restart deployment/mock-llm >/dev/null
kubectl --kubeconfig "$HUB_KUBECONFIG" -n kubernaut-system rollout status deployment/mock-llm --timeout=180s
kubectl --kubeconfig "$HUB_KUBECONFIG" -n kubernaut-system wait --for=condition=ready pod -l app=mock-llm --timeout=60s >/dev/null
echo "Mock-LLM ready on ${MODE} hub: ${IMAGE}"
