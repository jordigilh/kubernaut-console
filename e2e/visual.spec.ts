import { test, expect } from "@playwright/test";

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
  { story: "components-investigationcontext--investigation-phase", name: "InvestigationContext-investigation" },
  { story: "components-investigationcontext--decision-phase", name: "InvestigationContext-decision" },
  { story: "components-investigationcontext--remediation-phase", name: "InvestigationContext-remediation" },
  { story: "components-investigationcontext--verifying-phase", name: "InvestigationContext-verifying" },
  { story: "components-investigationcontext--complete-phase", name: "InvestigationContext-complete" },
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

for (const { story, name } of COMPONENTS) {
  test(`visual: ${name}`, async ({ page }) => {
    await page.goto(`/iframe.html?id=${story}&viewMode=story`);
    await page.waitForLoadState("networkidle");
    await page.addStyleTag({
      content: "*, *::before, *::after { animation: none !important; transition: none !important; }",
    });
    const root = page.locator("#storybook-root");
    await expect(root).toHaveScreenshot(`${name}.png`, {
      maxDiffPixelRatio: 0.05,
      animations: "disabled",
    });
  });
}
