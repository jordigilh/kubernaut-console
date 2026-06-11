#!/usr/bin/env bash
set -euo pipefail

# Kubernaut Console Demo Setup
#
# Prerequisites:
#   - Kind cluster with Kubernaut services deployed
#   - kubernaut-demo-scenarios repo at ../kubernaut-demo-scenarios
#   - Console built: npm run build
#
# Usage:
#   ./scripts/demo-setup.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SCENARIOS_DIR="${KUBERNAUT_DEMO_SCENARIOS:-$(dirname "$PROJECT_DIR")/kubernaut-demo-scenarios}"
NAMESPACE="kubernaut-system"
CONSOLE_NS="kubernaut-console"
DEX_NS="${DEX_NAMESPACE:-dex}"
CONSOLE_CLIENT_ID="kubernaut-console"
CONSOLE_REDIRECT_URL="http://localhost:4180/oauth2/callback"

echo "=== Kubernaut Console Demo Setup ==="
echo ""
echo "Scenarios repo: $SCENARIOS_DIR"
echo ""

if [ ! -d "$SCENARIOS_DIR/scenarios/crashloop" ]; then
  echo "ERROR: kubernaut-demo-scenarios repo not found at $SCENARIOS_DIR"
  echo "Set KUBERNAUT_DEMO_SCENARIOS environment variable to override."
  exit 1
fi

# Step 1: Auto-patch Dex with Console OIDC client
echo "Step 1: Patching Dex ConfigMap with Console client..."
DEX_CM=$(kubectl get configmap -n "$DEX_NS" -l app.kubernetes.io/name=dex -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "dex")

CURRENT_CONFIG=$(kubectl get configmap "$DEX_CM" -n "$DEX_NS" -o jsonpath='{.data.config\.yaml}' 2>/dev/null || echo "")
if [ -z "$CURRENT_CONFIG" ]; then
  echo "WARNING: Could not read Dex config. Skipping Dex patch."
else
  if echo "$CURRENT_CONFIG" | grep -q "$CONSOLE_CLIENT_ID"; then
    echo "  Dex already has kubernaut-console client. Skipping."
  else
    CLIENT_BLOCK="
  - id: $CONSOLE_CLIENT_ID
    redirectURIs:
      - '$CONSOLE_REDIRECT_URL'
    name: 'Kubernaut Console'
    public: true"

    PATCHED=$(echo "$CURRENT_CONFIG" | sed "/staticClients:/a\\
$CLIENT_BLOCK")

    kubectl create configmap "$DEX_CM" -n "$DEX_NS" --from-literal="config.yaml=$PATCHED" --dry-run=client -o yaml | kubectl apply -f -
    kubectl rollout restart deployment/dex -n "$DEX_NS" 2>/dev/null || true
    echo "  Dex patched and restarted."
  fi
fi

# Step 2: Create OIDC secret and deploy Console via Helm
echo ""
echo "Step 2: Deploying Console via Helm chart..."
COOKIE_SECRET=$(openssl rand -base64 32 | tr -d '\n')
CLIENT_SECRET=""  # Public client for Dex (no secret required)

kubectl create namespace "$CONSOLE_NS" 2>/dev/null || true

kubectl create secret generic kubernaut-console-oidc \
  --from-literal=client-id="$CONSOLE_CLIENT_ID" \
  --from-literal=client-secret="$CLIENT_SECRET" \
  --from-literal=cookie-secret="$COOKIE_SECRET" \
  -n "$CONSOLE_NS" --dry-run=client -o yaml | kubectl apply -f -

helm upgrade --install console "$PROJECT_DIR/chart" \
  -n "$CONSOLE_NS" \
  --set auth.issuerUrl="http://dex.${DEX_NS}.svc:5556/dex" \
  --set auth.redirectUrl="$CONSOLE_REDIRECT_URL" \
  --set apiFrontend.url="http://apifrontend-service.${NAMESPACE}.svc:8443" \
  --wait --timeout=120s

# Step 3: Copy Console static files
echo ""
echo "Step 3: Copy Console static files..."
if [ -d "$PROJECT_DIR/dist" ]; then
  CONSOLE_POD=$(kubectl get pods -n "$CONSOLE_NS" -l app.kubernetes.io/name=kubernaut-console -o jsonpath='{.items[0].metadata.name}')
  kubectl cp "$PROJECT_DIR/dist/" "$CONSOLE_NS/$CONSOLE_POD:/opt/app-root/src/" -c nginx
else
  echo "WARNING: dist/ not found. Run 'npm run build' first."
fi

# Step 4: Inject crash-loop scenario
echo ""
echo "Step 4: Inject crash-loop scenario..."
cd "$SCENARIOS_DIR/scenarios/crashloop"
if [ -f inject-bad-release.sh ]; then
  bash inject-bad-release.sh
else
  echo "WARNING: No inject script found. Inject manually."
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Console URL: http://localhost:4180"
echo "Login:       e2e-user@kubernaut.ai"
echo ""
echo "Demo flow:"
echo "  1. Open http://localhost:4180 in browser"
echo "  2. Login via Dex"
echo "  3. Wait for alert banner (CrashLoopBackOff)"
echo "  4. Ask: 'What's happening with the payments pods?'"
echo "  5. Watch: Thinking panel shows investigation steps"
echo "  6. See: Workflow cards appear with rollback option"
echo "  7. Click: Recommended workflow card"
echo "  8. Watch: Execution progress block shows remediation"
echo ""
