#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="${1:-$PLUGIN_DIR/dist-dynamic}"

echo "Building dynamic plugin bundle..."
cd "$PLUGIN_DIR"

# Build the module federation output
npx backstage-cli package build --module-federation

# Create the bundle directory
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Copy dist (remoteEntry.js, chunks, etc.)
cp -r dist "$OUTPUT_DIR/"

# Generate a minimal package.json for the dynamic plugin loader
node -e "
const pkg = require('./package.json');
const out = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  backstage: pkg.backstage,
  main: 'dist/remoteEntry.js',
  types: 'dist/@mf-types/index.d.ts',
  dependencies: {},
  peerDependencies: pkg.peerDependencies || {},
  configSchema: pkg.configSchema,
};
require('fs').writeFileSync('$OUTPUT_DIR/package.json', JSON.stringify(out, null, 2));
"

# Copy config schema
cp config.d.ts "$OUTPUT_DIR/"

echo "Bundle created at: $OUTPUT_DIR"
echo "Contents:"
ls -la "$OUTPUT_DIR"
echo ""
echo "To push as OCI image:"
echo "  podman build -t ghcr.io/jordigilh/kubernaut-backstage-plugin:\$(jq -r .version $OUTPUT_DIR/package.json) -f Containerfile.dynamic ."
echo "  podman push ghcr.io/jordigilh/kubernaut-backstage-plugin:\$(jq -r .version $OUTPUT_DIR/package.json)"
