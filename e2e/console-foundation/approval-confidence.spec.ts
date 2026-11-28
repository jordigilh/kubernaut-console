import { expect, test, type Page } from "@playwright/test";

// #180 / kubernaut #2586: the approval review surface must display RCA
// confidence and workflow-selection confidence as distinct labeled values,
// with missing RCA confidence ("Unknown") visually and semantically distinct
// from an explicit zero ("0%"). This is the mocked (PR-blocking) lane: the
// fixture adapter supplies the agreed backend contract; no backend requests
// are made. The browser computes no score.

const fixture = "/e2e/console-foundation/fixture.html";

async function noBackendRequests(page: Page) {
  const unexpected: string[] = [];
  const origin = new URL(test.info().project.use.baseURL!).origin;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== origin || /^\/(api|a2a|mcp)(\/|$)/.test(url.pathname)) unexpected.push(request.url());
  });
  return () => expect(unexpected).toEqual([]);
}

test("review page labels RCA and workflow-selection confidence separately", async ({ page }) => {
  const assertNoBackend = await noBackendRequests(page);
  await page.goto(`${fixture}?view=approvals&requestId=rar-demo-02`);

  const rca = page.getByTestId("kn-approval-rca-confidence");
  const workflow = page.getByTestId("kn-approval-workflow-confidence");
  await expect(rca).toContainText("RCA confidence");
  await expect(rca).toContainText("42%");
  await expect(workflow).toContainText("Workflow-selection confidence");
  await expect(workflow).toContainText("90%");
  await expect(page.getByTestId("kn-approval-confidence-level")).toContainText("qualifies workflow selection");
  await assertNoBackend();
});

test("missing RCA confidence reads as unknown, never 0%", async ({ page }) => {
  const assertNoBackend = await noBackendRequests(page);
  await page.goto(`${fixture}?view=approvals&requestId=rar-demo-03`);

  const rca = page.getByTestId("kn-approval-rca-confidence");
  await expect(rca).toContainText("RCA confidence");
  await expect(rca).toContainText("Unknown");
  await expect(rca).not.toContainText("0%");
  await expect(page.getByTestId("kn-approval-workflow-confidence")).toContainText("76%");
  await assertNoBackend();
});

test("explicit zero RCA confidence reads as 0%, distinct from unknown", async ({ page }) => {
  const assertNoBackend = await noBackendRequests(page);
  await page.goto(`${fixture}?view=approvals&requestId=rar-demo-04`);

  const rca = page.getByTestId("kn-approval-rca-confidence");
  await expect(rca).toContainText("RCA confidence");
  await expect(rca).toContainText("0%");
  await expect(rca).not.toContainText("Unknown");
  await expect(page.getByTestId("kn-approval-workflow-confidence")).toContainText("88%");
  await assertNoBackend();
});

test("review page states that interactive selection does not bypass policy evaluation", async ({ page }) => {
  await page.goto(`${fixture}?view=approvals&requestId=rar-demo-02`);
  await expect(page.getByText(/does not bypass policy evaluation/i)).toBeVisible();
});
