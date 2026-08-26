const GENERIC_ERROR_MESSAGE = "An unexpected error occurred.";

export function generateCorrelationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// kubernaut-console#97 (F-19): a caught render error's raw `.message` can
// echo internal detail (file paths, prop values, stack-like fragments) --
// there was previously no deliberate policy on whether that's safe to show
// a user, just always-verbatim rendering. Dev builds keep showing the raw
// message (today's DX, and useful for local debugging); production builds
// show a fixed, generic message plus a correlation ID that also appears in
// the telemetry beacon payload, so a user can reference it without ever
// seeing the message/stack itself.
//
// Extracted to its own module (rather than living in ErrorBoundary.tsx)
// because `import.meta.env.DEV` is statically `true` in every Vitest run in
// this repo and does not respond to runtime env stubbing (Vite bakes it in
// at transform time) -- the *policy* needs to be unit-testable for both dev
// and prod regardless of that constraint. A second, unrelated reason to
// keep it out of ErrorBoundary.tsx: `react-refresh/only-export-components`
// forbids a component file from also exporting plain functions/constants.
export function formatErrorBoundaryMessage(
  error: Error | null,
  correlationId: string,
  isDev: boolean,
): string {
  if (isDev) {
    return error?.message || GENERIC_ERROR_MESSAGE;
  }
  return `${GENERIC_ERROR_MESSAGE} If this keeps happening, contact support and reference ID ${correlationId}.`;
}
