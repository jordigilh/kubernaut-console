#!/bin/bash
# Setup script for sensitive data detection git hooks

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 Setting up sensitive data detection git hooks"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Get the git root directory
GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")

# Configure git to use .githooks directory
echo "📂 Configuring git hooks path..."
git config core.hooksPath "$GIT_ROOT/.githooks"

# Make hooks executable
echo "🔐 Making hooks executable..."
chmod +x "$GIT_ROOT/.githooks/pre-commit"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Git hooks configured successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Pre-commit hook will now detect:"
echo "   • Cloud provider API endpoint URLs"
echo "   • Cloud project/account/subscription identifiers"
echo "   • Well-known API key formats (sk-, ghp_, AKIA, xox)"
echo "   • Absolute paths to credential files"
echo "   • .env files (excluding .env.example)"
echo "   • Base64-encoded secrets in YAML (cookie-secret, client-secret)"
echo "   • JWT tokens (eyJ...)"
echo "   • Private keys (BEGIN RSA/EC/PRIVATE KEY)"
echo "   • High-entropy secret/password/token/key assignments"
echo ""
echo "   Override: add '# pre-commit:allow-sensitive' on a flagged line"
echo ""
echo "🧪 Test the hook with: git commit (after staging changes)"
echo ""
