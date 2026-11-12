import type { FetchFn } from "../providers/config";

export const CONSOLE_CONTRACT_PATH = "/.well-known/kubernaut-console-contract.json";

const INCARNATION_PATTERN = /^[A-Za-z0-9._~-]{1,256}$/;
const DEFAULT_CONTRACT_TIMEOUT_MS = 10_000;

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
  timeoutMs?: number;
} = {}): Promise<string> {
  const controller = new AbortController();
  const timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_CONTRACT_TIMEOUT_MS);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeoutError = new BackendContractUnavailableError("Backend lifecycle check timed out");
  const deadline = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(timeoutError);
    }, timeoutMs);
  });

  try {
    let response: Response;
    try {
      response = await Promise.race([
        (options.fetchFn ?? fetch)(`${options.baseUrl || ""}${CONSOLE_CONTRACT_PATH}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        }),
        deadline,
      ]);
    } catch (error) {
      if (timedOut) throw timeoutError;
      if (error instanceof BackendContractUnavailableError) throw error;
      throw new BackendContractUnavailableError();
    }

    if (!response.ok) {
      throw new BackendContractUnavailableError(`Backend lifecycle check returned HTTP ${response.status}`);
    }

    let body: unknown;
    try {
      body = await Promise.race([response.json(), deadline]);
    } catch (error) {
      if (timedOut) throw timeoutError;
      if (error instanceof BackendContractUnavailableError) throw error;
      throw new BackendContractUnavailableError("Backend lifecycle check returned invalid JSON");
    }

    const record = body && typeof body === "object" ? body as Record<string, unknown> : undefined;
    const incarnation = record?.backend_incarnation ?? record?.backendIncarnation;
    if (!isValidBackendIncarnation(incarnation)) {
      throw new BackendContractUnavailableError("Backend lifecycle check returned an invalid incarnation");
    }
    return incarnation;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
