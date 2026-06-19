import { test, expect } from "@playwright/test";

const STORYBOOK_URL = process.env.STORYBOOK_URL ?? "http://localhost:6006";

const COMPONENTS = [
  { story: "components-agentbubble--text-only", name: "AgentBubble-text" },
  { story: "components-agentbubble--with-rca", name: "AgentBubble-rca" },
  { story: "components-agentbubble--with-workflows", name: "AgentBubble-workflows" },
  { story: "components-agentbubble--streaming", name: "AgentBubble-streaming" },
  { story: "components-approvalcard--active", name: "ApprovalCard-active" },
  { story: "components-approvalcard--expired", name: "ApprovalCard-expired" },
  { story: "components-approvalcard--approved", name: "ApprovalCard-approved" },
  { story: "components-approvalcard--declined", name: "ApprovalCard-declined" },
  { story: "components-chatcontainer--empty", name: "ChatContainer-empty" },
  { story: "components-chatcontainer--with-error", name: "ChatContainer-error" },
  { story: "components-investigationcontext--all-fields", name: "InvestigationContext-all" },
  { story: "components-investigationcontext--minimal-fields", name: "InvestigationContext-minimal" },
  { story: "components-investigationcontext--idle", name: "InvestigationContext-idle" },
  { story: "components-rcacard--critical", name: "RCACard-critical" },
  { story: "components-rcacard--low", name: "RCACard-low" },
  { story: "components-rcacard--long-chain", name: "RCACard-long-chain" },
  { story: "components-thinkingpanel--collapsed", name: "ThinkingPanel-collapsed" },
  { story: "components-thinkingpanel--expanded", name: "ThinkingPanel-expanded" },
  { story: "components-thinkingpanel--streaming", name: "ThinkingPanel-streaming" },
  { story: "components-userbubble--short-message", name: "UserBubble-short" },
  { story: "components-userbubble--long-message", name: "UserBubble-long" },
  { story: "components-verificationtimer--early", name: "VerificationTimer-early" },
  { story: "components-verificationtimer--mid", name: "VerificationTimer-mid" },
  { story: "components-verificationtimer--near-complete", name: "VerificationTimer-near-complete" },
  { story: "components-welcomestate--default", name: "WelcomeState-default" },
  { story: "components-workflowcards--recommended", name: "WorkflowCards-recommended" },
  { story: "components-workflowcards--no-workflows", name: "WorkflowCards-no-workflows" },
  { story: "components-workflowcards--with-recovery-resolved", name: "WorkflowCards-recovery-resolved" },
  { story: "components-workflowcards--with-alignment-failed", name: "WorkflowCards-alignment-failed" },
  { story: "components-workflowcards--with-alignment-verdict", name: "WorkflowCards-alignment-verdict" },
  { story: "components-workflowcards--with-target-divergence", name: "WorkflowCards-target-divergence" },
];

const FREEZE_STYLES = `
  *, *::before, *::after {
    animation: none !important;
    animation-delay: 0s !important;
    animation-duration: 0s !important;
    transition: none !important;
    transition-delay: 0s !important;
    transition-duration: 0s !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
  }
`;

for (const { story, name } of COMPONENTS) {
  test(`visual: ${name}`, async ({ page }) => {
    // Inject motion-freezing styles before page load
    await page.addInitScript(() => {
      const style = document.createElement("style");
      style.textContent = `
        *, *::before, *::after {
          animation: none !important;
          animation-delay: 0s !important;
          animation-duration: 0s !important;
          transition: none !important;
          transition-delay: 0s !important;
          transition-duration: 0s !important;
          caret-color: transparent !important;
          scroll-behavior: auto !important;
        }
      `;
      if (document.head) {
        document.head.appendChild(style);
      } else {
        document.addEventListener("DOMContentLoaded", () =>
          document.head.appendChild(style),
        );
      }
    });

    await page.goto(`${STORYBOOK_URL}/iframe.html?id=${story}&viewMode=story`);
    await page.waitForLoadState("networkidle");

    // Re-inject styles in case Storybook cleared them during hydration
    await page.addStyleTag({ content: FREEZE_STYLES });

    const root = page.locator("#storybook-root");

    // Wait for the component to render with non-zero dimensions
    await root.waitFor({ state: "visible", timeout: 15000 });
    await expect(root).not.toBeEmpty({ timeout: 10000 });

    // Brief settle time for PatternFly layout computations
    await page.waitForTimeout(500);

    await expect(root).toHaveScreenshot(`${name}.png`, {
      maxDiffPixelRatio: 0.05,
      animations: "disabled",
      timeout: 15000,
    });
  });
}
