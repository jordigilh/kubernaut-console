#!/usr/bin/env bash
set -euo pipefail

# Full end-to-end demo setup: Kind cluster + Kubernaut + crash-loop scenario + Console
#
# Prerequisites:
#   - kind, kubectl, helm installed
#   - kubernaut-demo-scenarios repo at ../kubernaut-demo-scenarios
#   - KUBERNAUT_LLM_PROVIDER and API key env vars set
#
# Usage:
#   ./scripts/setup-demo.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEMO_SCENARIOS_DIR="${KUBERNAUT_DEMO_SCENARIOS_DIR:-$(cd "$PROJECT_DIR/../kubernaut-demo-scenarios" && pwd)}"

echo "=============================================="
echo "  Kubernaut Console Demo Setup"
echo "=============================================="
echo ""

# Step 1: Check prerequisites
echo "==> Checking prerequisites..."
for cmd in kind kubectl helm npm; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: $cmd not found. Please install it first."
    exit 1
  fi
done

if [ ! -d "$DEMO_SCENARIOS_DIR" ]; then
  echo "ERROR: kubernaut-demo-scenarios not found at $DEMO_SCENARIOS_DIR"
  echo "       Clone it: git clone https://github.com/jordigilh/kubernaut-demo-scenarios ../kubernaut-demo-scenarios"
  exit 1
fi

# Step 2: Create Kind cluster with Console port mapping
echo ""
echo "==> Creating Kind cluster..."
if kind get clusters | grep -q kubernaut-demo; then
  echo "    Cluster 'kubernaut-demo' already exists. Reusing."
else
  kind create cluster --name kubernaut-demo --config "$PROJECT_DIR/deploy/kind-config.yaml"
fi
kubectl cluster-info --context kind-kubernaut-demo

# Step 3: Deploy Kubernaut via demo-scenarios
echo ""
echo "==> Deploying Kubernaut stack..."
cd "$DEMO_SCENARIOS_DIR"
if [ -f scripts/deploy-kubernaut.sh ]; then
  ./scripts/deploy-kubernaut.sh
elif [ -f deploy/deploy.sh ]; then
  ./deploy/deploy.sh
else
  echo "    WARNING: No automated deploy script found."
  echo "    Deploy Kubernaut manually, then re-run this script."
  exit 1
fi

# Step 4: Inject crash-loop scenario
echo ""
echo "==> Injecting crash-loop scenario..."
cd "$DEMO_SCENARIOS_DIR/scenarios/crashloop"
if [ -f run.sh ]; then
  ./run.sh
else
  kubectl apply -f manifests/ || true
fi

# Step 5: Build Console SPA
echo ""
echo "==> Building Console SPA..."
cd "$PROJECT_DIR"
npm ci
npm run build

# Step 6: Deploy Console + OAuth2 Proxy
echo ""
echo "==> Deploying Console + OAuth2 Proxy..."
./deploy/deploy-console.sh

echo ""
echo "=============================================="
echo "  Demo Ready!"
echo "=============================================="
echo ""
echo "  Console:  http://localhost:4180"
echo "  Login:    e2e-user@kubernaut.ai"
echo "  API:      http://localhost:8443"
echo "  Dex:      http://localhost:5556/dex"
echo ""
echo "  Try: 'What's happening with the payments namespace?'"
echo ""
