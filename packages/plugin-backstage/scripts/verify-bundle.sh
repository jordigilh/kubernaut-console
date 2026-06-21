#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"
BUNDLE_DIR="$PLUGIN_DIR/dist-dynamic"
DIST_DIR="$PLUGIN_DIR/dist"

echo "=== Kubernaut Plugin Bundle Verification ==="
echo ""

PASS=0
FAIL=0

check() {
  local desc="$1"
  local test_cmd="$2"
  if eval "$test_cmd" >/dev/null 2>&1; then
    echo "  [PASS] $desc"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $desc"
    FAIL=$((FAIL + 1))
  fi
}

echo "--- Module Federation Build (upstream Backstage 1.49+) ---"
check "remoteEntry.js exists" "test -f '$DIST_DIR/remoteEntry.js'"
check "mf-manifest.json exists" "test -f '$DIST_DIR/mf-manifest.json'"
check "static chunks directory exists" "test -d '$DIST_DIR/static'"
check "remoteEntry.js is non-empty" "test -s '$DIST_DIR/remoteEntry.js'"
check "remoteEntry.js contains module federation" "grep -q '__federation' '$DIST_DIR/remoteEntry.js'"
check "alpha extension exposed" "ls '$DIST_DIR/static'/*federation_expose_alpha* 2>/dev/null"

echo ""
echo "--- Dynamic Plugin Bundle (RHDH 1.9/1.10 OCI) ---"
check "bundle directory exists" "test -d '$BUNDLE_DIR'"
check "bundle/package.json exists" "test -f '$BUNDLE_DIR/package.json'"
check "bundle/dist/remoteEntry.js exists" "test -f '$BUNDLE_DIR/dist/remoteEntry.js'"
check "bundle/config.d.ts exists" "test -f '$BUNDLE_DIR/config.d.ts'"
check "package.json has backstage role" "grep -q 'frontend-plugin' '$BUNDLE_DIR/package.json'"
check "package.json main points to remoteEntry" "grep -q 'remoteEntry.js' '$BUNDLE_DIR/package.json'"

echo ""
echo "--- Configuration Schema ---"
check "config.d.ts defines kubernaut namespace" "grep -q 'kubernaut' '$PLUGIN_DIR/config.d.ts'"
check "app-config example exists" "test -f '$PLUGIN_DIR/app-config.kubernaut.yaml'"

echo ""
echo "--- Dual Entry Points ---"
check "Legacy entry (src/index.ts) exports plugin" "grep -q 'kubernautPlugin' '$PLUGIN_DIR/src/index.ts'"
check "NFS entry (src/alpha.tsx) exists" "test -f '$PLUGIN_DIR/src/alpha.tsx'"
check "NFS entry exports createFrontendPlugin" "grep -q 'createFrontendPlugin' '$PLUGIN_DIR/src/alpha.tsx'"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "BUNDLE VERIFICATION FAILED"
  exit 1
fi

echo ""
echo "Bundle is ready for deployment:"
echo "  - Upstream Backstage: Copy dist/ to dynamicPlugins.rootDirectory"
echo "  - RHDH OCI: Build and push Containerfile.dynamic"
echo ""
echo "RHDH dynamic-plugins.yaml example:"
echo "  plugins:"
echo "    - package: oci://ghcr.io/jordigilh/kubernaut-backstage-plugin:$(jq -r .version "$BUNDLE_DIR/package.json")"
echo "      integrity: sha256:<hash>"
echo "      pluginConfig:"
echo "        dynamicPlugins:"
echo "          frontend:"
echo "            kubernaut.plugin-backstage:"
echo "              dynamicRoutes:"
echo "                - path: /kubernaut"
echo "                  importName: KubernautPage"
