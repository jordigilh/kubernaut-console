import { fireEvent, render, screen } from "@testing-library/react";
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
  it("IT-CONSOLE-168-005: storage cleanup failure prevents sign-out navigation and is visible", () => {
    const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("denied"); });
    try {
      render(<AuthContext.Provider value={authValue}><ChatContainer /></AuthContext.Provider>);
      const link = screen.getByRole("link", { name: /sign out as/i });
      const click = new MouseEvent("click", { bubbles: true, cancelable: true });
      fireEvent(link, click);
      expect(click.defaultPrevented).toBe(true);
      expect(screen.getByText(/unable to clear console session storage/i)).toBeInTheDocument();
    } finally {
      remove.mockRestore();
    }
  });
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
