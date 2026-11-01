import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(process.cwd(), "src/styles/approval-console.css"), "utf8");

describe("approval console public CSS boundary", () => {
  it("keeps fields paired with theme-specific background and foreground tokens", () => {
    expect(css).toContain("--kn-approval-input-background");
    expect(css).toContain("--kn-approval-input-foreground");
    expect(css).toMatch(/\.kn-approval-toolbar input,\s*\.kn-approval-toolbar select,\s*\.kn-approval-decision-form textarea\s*\{[\s\S]*background: var\(--kn-approval-input-background\);[\s\S]*color: var\(--kn-approval-input-foreground\);/);
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\)[\s\S]*--kn-approval-input-background:\s*#0F1724[\s\S]*--kn-approval-input-foreground:\s*#E8F0F9/);
  });

  it("lets the enclosing foundation theme override the operating system preference", () => {
    expect(css).toContain('.kn-foundation[data-theme="light"] .kn-approval-console');
    expect(css).toContain('.kn-foundation[data-theme="dark"] .kn-approval-console');
    expect(css).toMatch(/\.kn-foundation\[data-theme="light"\] \.kn-approval-console[\s\S]*--kn-approval-canvas:\s*#F4F7FB[\s\S]*color-scheme:\s*light;/);
    expect(css).toMatch(/\.kn-foundation\[data-theme="dark"\] \.kn-approval-console[\s\S]*--kn-approval-canvas:\s*#0F1724[\s\S]*color-scheme:\s*dark;/);
  });

  it("uses the accepted 699px navigation breakpoint and scopes selectors to the approval shell", () => {
    expect(css).toContain("@media (max-width: 699px)");
    expect(css).not.toContain("@media (max-width: 900px)");
    expect(css).not.toMatch(/(^|\n)\s*(button|input|textarea|body|header)\s*\{/);
  });
});
