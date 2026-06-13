import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Modal } from "./Modal";

describe("Modal", () => {
  it("UT-CONSOLE-MODAL-001: renders nothing when closed", () => {
    render(<Modal open={false} onClose={() => {}} title="Test">Content</Modal>);
    expect(screen.queryByText("Test")).toBeNull();
  });

  it("UT-CONSOLE-MODAL-002: renders dialog with title when open", () => {
    render(<Modal open={true} onClose={() => {}} title="Confirm Action">Body text</Modal>);
    expect(screen.getByText("Confirm Action")).toBeInTheDocument();
    expect(screen.getByText("Body text")).toBeInTheDocument();
  });

  it("UT-CONSOLE-MODAL-003: dialog has aria-labelledby", () => {
    render(<Modal open={true} onClose={() => {}} title="Dialog Title">Content</Modal>);
    const dialog = document.querySelector("dialog");
    expect(dialog?.getAttribute("aria-labelledby")).toBe("modal-title");
  });
});
