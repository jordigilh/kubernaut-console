# Test Plan: Issue #98

## Objective

Verify that the kind console deployment enforces a read-only root filesystem
for Nginx without breaking the console's user-facing static serving or proxy
behavior.

## Control objectives

- FedRAMP CM-6: enforce documented security configuration.
- FedRAMP AC-6: minimize container filesystem privileges.
- OWASP ASVS V13: validate secure deployment configuration.

## Pyramid coverage

- Configuration validation: assert the Nginx container has
  `readOnlyRootFilesystem: true` and that every required writable Nginx path
  is an explicit volume mount.
- Deployment smoke: deploy the manifest to kind and verify health, static
  assets, A2A proxying, and MCP proxying.
- No application unit test is needed for a declarative Kubernetes field; the
  deployment smoke test proves the business-level outcome that the console
  remains usable under the hardening control.

## RED

Run the configuration assertion against the current manifest and confirm it
fails because the Nginx container does not yet set
`readOnlyRootFilesystem: true`.

## GREEN

Add the security-context field and keep `/tmp`, `/var/cache/nginx`, and
`/var/run` backed by explicit writable `emptyDir` mounts.

## Verification

- Render/validate the Kubernetes manifest.
- Deploy the kind stack.
- Verify `/healthz` returns `200`.
- Verify the console HTML and static assets load.
- Verify authenticated `/a2a/` and `/mcp` proxy requests still reach API
  Frontend.
- Confirm Nginx starts without writes to its read-only root filesystem.
