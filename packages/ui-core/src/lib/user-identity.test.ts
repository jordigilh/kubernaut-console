import { describe, expect, it } from "vitest";
import { formatUserIdentity } from "./user-identity";

describe("formatUserIdentity", () => {
  it("UT-CONSOLE-AUTH-007 [FedRAMP AC-2/AC-6; SOC 2 CC6.1; OWASP ASVS V7.2.1]: exposes username and email together", () => {
    expect(formatUserIdentity("sre-user", "sre-user@kubernaut.ai")).toBe(
      "sre-user (sre-user@kubernaut.ai)",
    );
  });

  it("preserves the available identity when one claim is missing", () => {
    expect(formatUserIdentity("sre-user", "")).toBe("sre-user");
    expect(formatUserIdentity("", "sre-user@kubernaut.ai")).toBe("sre-user@kubernaut.ai");
  });

  it("does not duplicate an identity when both claims have the same value", () => {
    expect(formatUserIdentity("sre-user@kubernaut.ai", "sre-user@kubernaut.ai")).toBe(
      "sre-user@kubernaut.ai",
    );
  });

  it("fails closed to a non-empty label when both claims are unavailable", () => {
    expect(formatUserIdentity("", "")).toBe("Unknown user");
  });
});
