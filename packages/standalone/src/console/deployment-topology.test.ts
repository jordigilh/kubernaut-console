import { describe, expect, it } from "vitest";
import { currentDeploymentTopology, deploymentTopology } from "./deployment-topology";

describe("UT-CONSOLE-169-040: deployment topology fails closed (N04)", () => {
  it("keeps an explicit fleet authoritative even with one visible cluster", () => {
    expect(deploymentTopology("fleet")).toBe("fleet");
  });

  it("only local mode is local", () => {
    expect(deploymentTopology("local")).toBe("local");
  });

  it("unknown or absent mode never silently becomes local", () => {
    expect(deploymentTopology(undefined)).toBe("unknown");
    expect(deploymentTopology(null)).toBe("unknown");
  });

  it("the host has no authoritative mode source yet, so current topology is unknown", () => {
    expect(currentDeploymentTopology()).toBe("unknown");
  });
});
