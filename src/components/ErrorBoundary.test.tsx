import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("Test explosion");
  return <div>All good</div>;
}

// SI-17: Fail-Safe Procedures
// Proves that component-level failures are contained and do not cascade to
// render the entire operator console inoperable.

describe("SI-17: Error boundary prevents cascading UI failure", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("IT-CONSOLE-EB-001: normal operation — children render without interference", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("IT-CONSOLE-EB-002: SI-17 containment — component failure shows recovery UI, not blank screen", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Test explosion")).toBeInTheDocument();
  });

  it("IT-CONSOLE-EB-003: CP-10 recovery — operator can restore functionality after failure", () => {
    let shouldThrow = true;
    function MaybeThrow() {
      if (shouldThrow) throw new Error("Test explosion");
      return <div>All good</div>;
    }

    const { rerender } = render(
      <ErrorBoundary>
        <MaybeThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByText("Try Again"));

    rerender(
      <ErrorBoundary>
        <MaybeThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("IT-CONSOLE-EB-004: telemetry — sends beacon with error details on crash", () => {
    const beaconSpy = vi.fn();
    Object.defineProperty(navigator, "sendBeacon", { value: beaconSpy, writable: true });

    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(beaconSpy).toHaveBeenCalledTimes(1);
    expect(beaconSpy).toHaveBeenCalledWith("/a2a/telemetry/error", expect.any(String));
    const payload = JSON.parse(beaconSpy.mock.calls[0][1]);
    expect(payload.message).toBe("Test explosion");
    expect(payload.ts).toBeGreaterThan(0);
  });
});
