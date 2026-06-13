import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownContent } from "./MarkdownContent";

describe("MarkdownContent", () => {
  it("UT-CONSOLE-XSS-001: SI-10 — strips inline script from markdown", () => {
    render(<MarkdownContent text={'Hello <script>alert("xss")</script> world'} />);
    expect(screen.getByText(/Hello/)).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
  });

  it("UT-CONSOLE-XSS-002: SI-10 — strips onerror event handlers from images", () => {
    render(<MarkdownContent text={'<img src="x" onerror="alert(1)" />'} />);
    const img = document.querySelector("img");
    if (img) {
      expect(img.hasAttribute("onerror")).toBe(false);
    }
  });

  it("UT-CONSOLE-XSS-003: SI-10 — strips javascript: protocol from links", () => {
    render(<MarkdownContent text={'[click](javascript:alert(1))'} />);
    const link = document.querySelector("a");
    if (link) {
      const href = link.getAttribute("href") ?? "";
      expect(href).not.toContain("javascript:");
    }
  });

  it("UT-CONSOLE-XSS-004: renders standard markdown safely", () => {
    render(<MarkdownContent text="**bold** and `code`" />);
    expect(screen.getByText("bold")).toBeInTheDocument();
    expect(screen.getByText("code")).toBeInTheDocument();
  });

  it("UT-CONSOLE-XSS-005: renders tables from GFM", () => {
    const table = "| A | B |\n|---|---|\n| 1 | 2 |";
    render(<MarkdownContent text={table} />);
    expect(document.querySelector("table")).not.toBeNull();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("UT-CONSOLE-XSS-006: links open in new tab with noopener", () => {
    render(<MarkdownContent text="[docs](https://example.com)" />);
    const link = document.querySelector("a");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toContain("noopener");
  });
});
