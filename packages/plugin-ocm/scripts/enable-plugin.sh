#!/usr/bin/env bash
set -euo pipefail

PLUGIN_NAME="kubernaut-console-plugin"

echo "Enabling console plugin: $PLUGIN_NAME"

# Check if already enabled
CURRENT=$(oc get console.operator.openshift.io cluster -o jsonpath='{.spec.plugins}' 2>/dev/null || echo "[]")
if echo "$CURRENT" | grep -q "$PLUGIN_NAME"; then
  echo "Plugin already enabled"
  exit 0
fi

# Enable the plugin
oc patch console.operator.openshift.io cluster \
  --type=json \
  -p "[{\"op\": \"add\", \"path\": \"/spec/plugins/-\", \"value\": \"$PLUGIN_NAME\"}]"

echo "Plugin enabled. It may take a moment to appear in the console."
