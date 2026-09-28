import { render, screen } from "@testing-library/react";
import { beforeAll } from "vitest";
import { ChatContainer } from "./ChatContainer";
import { AuthContext, type AuthContextValue } from "../providers/auth";

const authValue: AuthContextValue = {
  provider: {
    getToken: async () => "",
    getUser: async () => ({
      name: "sre-user",
      email: "sre-user@kubernaut.ai",
      initials: "SR",
    }),
  },
  user: {
    name: "sre-user",
    email: "sre-user@kubernaut.ai",
    initials: "SR",
  },
  isLoading: false,
  error: null,
};

beforeAll(() => {
  Element.prototype.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("ChatContainer authentication control", () => {
  it("IT-CONSOLE-AUTH-002 [FedRAMP AC-2/AC-6; SOC 2 CC6.1; OWASP ASVS V7.2.1]: exposes the authenticated username and email", () => {
    render(
      <AuthContext.Provider value={authValue}>
        <ChatContainer />
      </AuthContext.Provider>,
    );

    const profile = screen.getByRole("link", {
      name: "Sign out as sre-user (sre-user@kubernaut.ai)",
    });
    expect(profile).toHaveAttribute("title", "sre-user (sre-user@kubernaut.ai)");
    expect(profile).toHaveAttribute("href", "/oauth2/sign_out");
  });
});
