#!/usr/bin/env bash
set -euo pipefail

echo "=== Bundle Size Report ==="
echo ""

BUDGET_KB=150
PASS=0
FAIL=0

check_size() {
  local label="$1"
  local file="$2"
  local budget="$3"

  if [ ! -f "$file" ]; then
    echo "  SKIP: $label (not built)"
    return
  fi

  local raw_kb
  raw_kb=$(du -k "$file" | cut -f1)
  local gzip_bytes
  gzip_bytes=$(gzip -c "$file" | wc -c | tr -d ' ')
  local gzip_kb
  gzip_kb=$(echo "scale=1; $gzip_bytes / 1024" | bc)

  local status="✓"
  local result
  result=$(echo "$gzip_kb < $budget" | bc)
  if [ "$result" -eq 0 ]; then
    status="✗"
    FAIL=$((FAIL + 1))
  else
    PASS=$((PASS + 1))
  fi

  printf "  %s %-35s %6s KB raw → %6s KB gzip (budget: %s KB)\n" \
    "$status" "$label" "$raw_kb" "$gzip_kb" "$budget"
}

echo "Core library (ui-core):"
check_size "@kubernaut/ui-core" "packages/ui-core/dist/index.js" "$BUDGET_KB"
echo ""

echo "Platform plugins:"
check_size "plugin-backstage (remoteEntry)" "packages/plugin-backstage/dist/remoteEntry.js" "200"
check_size "plugin-ocm (plugin-entry)" "packages/plugin-ocm/dist/plugin-entry.js" "50"
echo ""

echo "Applications:"
STANDALONE_JS=$(find packages/standalone/dist/assets -name "*.js" 2>/dev/null | head -1)
if [ -n "$STANDALONE_JS" ]; then
  check_size "standalone (full app)" "$STANDALONE_JS" "500"
fi
echo ""

echo "---"
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  echo "⚠️  Some bundles exceed their size budget!"
  exit 1
fi
echo "✓ All bundles within budget"
