/**
 * Spike: PF6 token override validation
 * 
 * Tests that PF6 components accept className prop and that CSS custom properties
 * can be used to override default PF6 colors for brand customization.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Button, Card, CardBody, CardHeader, CardTitle, Alert, Page, PageSection } from "@patternfly/react-core";
import { CheckCircleIcon } from "@patternfly/react-icons";

import "@patternfly/react-core/dist/styles/base.css";

describe("PF6 Token Overrides Spike", () => {
  it("Button accepts className for color override", () => {
    const { container } = render(
      <Button variant="primary" className="kubernaut-approve-btn">
        Approve
      </Button>
    );
    const btn = container.querySelector(".kubernaut-approve-btn");
    expect(btn).toBeTruthy();
    expect(btn?.classList.contains("pf-v6-c-button")).toBeTruthy();
  });

  it("Card renders with custom className for brand styling", () => {
    const { container } = render(
      <Card className="kubernaut-rca-card">
        <CardHeader>
          <CardTitle>Root Cause Analysis</CardTitle>
        </CardHeader>
        <CardBody>Content here</CardBody>
      </Card>
    );
    const card = container.querySelector(".kubernaut-rca-card");
    expect(card).toBeTruthy();
    expect(card?.classList.contains("pf-v6-c-card")).toBeTruthy();
  });

  it("Alert variants map to current severity levels", () => {
    const variants = ["danger", "warning", "info", "success"] as const;
    for (const variant of variants) {
      const { container } = render(
        <Alert variant={variant} title={`${variant} alert`} isInline />
      );
      expect(container.querySelector(`.pf-v6-c-alert`)).toBeTruthy();
    }
  });

  it("Page + PageSection provide layout structure", () => {
    const { container } = render(
      <Page>
        <PageSection>
          <div>Chat content area</div>
        </PageSection>
      </Page>
    );
    expect(container.querySelector(".pf-v6-c-page")).toBeTruthy();
    expect(container.querySelector(".pf-v6-c-page__main-section")).toBeTruthy();
  });

  it("PF6 icons render as SVG elements", () => {
    const { container } = render(<CheckCircleIcon />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("Card with inline style for accent bar pattern", () => {
    const { container } = render(
      <Card className="kubernaut-approval-card" style={{ position: "relative" }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 8,
            bottom: 8,
            width: 4,
            borderRadius: "0 4px 4px 0",
            backgroundColor: "#f59e0b",
          }}
        />
        <CardBody>Approval request content</CardBody>
      </Card>
    );
    const card = container.querySelector(".kubernaut-approval-card");
    expect(card).toBeTruthy();
    const accentBar = card?.querySelector("div[style]");
    expect(accentBar).toBeTruthy();
  });
});
