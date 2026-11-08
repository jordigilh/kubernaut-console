import type { FetchFn } from "../providers/config";

export const CONSOLE_CONTRACT_PATH = "/.well-known/kubernaut-console-contract.json";

const INCARNATION_PATTERN = /^[A-Za-z0-9._~-]{1,256}$/;

export class BackendContractUnavailableError extends Error {
  constructor(message = "Unable to verify backend lifecycle") {
    super(message);
    this.name = "BackendContractUnavailableError";
  }
}

export function isValidBackendIncarnation(value: unknown): value is string {
  return typeof value === "string" && INCARNATION_PATTERN.test(value);
}

export async function readBackendIncarnation(options: {
  baseUrl?: string;
  fetchFn?: FetchFn;
} = {}): Promise<string> {
  let response: Response;
  try {
    response = await (options.fetchFn ?? fetch)(`${options.baseUrl || ""}${CONSOLE_CONTRACT_PATH}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new BackendContractUnavailableError();
  }

  if (!response.ok) {
    throw new BackendContractUnavailableError(`Backend lifecycle check returned HTTP ${response.status}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new BackendContractUnavailableError("Backend lifecycle check returned invalid JSON");
  }

  const record = body && typeof body === "object" ? body as Record<string, unknown> : undefined;
  const incarnation = record?.backend_incarnation ?? record?.backendIncarnation;
  if (!isValidBackendIncarnation(incarnation)) {
    throw new BackendContractUnavailableError("Backend lifecycle check returned an invalid incarnation");
  }
  return incarnation;
}
