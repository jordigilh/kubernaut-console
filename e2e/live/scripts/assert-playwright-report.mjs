#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const reportPath = process.argv[2];
const allowlistPath = process.argv[3] ?? "e2e/live/skip-allowlist.json";

if (!reportPath) {
  console.error("usage: assert-playwright-report.mjs <json-report> [skip-allowlist]");
  process.exit(2);
}

const report = JSON.parse(await readFile(reportPath, "utf8"));
const allowlist = JSON.parse(await readFile(allowlistPath, "utf8"));
const allowed = new Set(
  (Array.isArray(allowlist.allowed) ? allowlist.allowed : []).map((entry) =>
    typeof entry === "string" ? entry : entry?.id,
  ),
);

const tests = [];

function visitSuite(suite, parents = []) {
  const scope = suite.title ? [...parents, suite.title] : parents;
  for (const spec of suite.specs ?? []) {
    const title = [...scope, spec.title].filter(Boolean).join(" › ");
    for (const test of spec.tests ?? []) {
      const project = test.projectName ?? "unknown-project";
      const id = `${project}:${title}`;
      const results = Array.isArray(test.results) ? test.results : [];
      const finalResult = results.at(-1);
      const status =
        test.status === "skipped" || finalResult?.status === "skipped"
          ? "skipped"
          : test.status ?? finalResult?.status ?? test.expectedStatus;
      const skipped = status === "skipped" || test.expectedStatus === "skipped";
      tests.push({ id, title, project, skipped });
    }
  }
  for (const child of suite.suites ?? []) visitSuite(child, scope);
}

for (const suite of report.suites ?? []) visitSuite(suite);

if (tests.length === 0) {
  console.error("::error::Playwright JSON report contains zero tests");
  process.exit(1);
}

const skipped = tests.filter((test) => test.skipped);
const unexpected = skipped.filter((test) => !allowed.has(test.id) && !allowed.has(test.title));

console.log(`Playwright tests discovered: ${tests.length}`);
console.log(`Playwright tests skipped: ${skipped.length}`);

if (unexpected.length > 0) {
  console.error("::error::Playwright contains unallowlisted skipped tests:");
  for (const test of unexpected) console.error(` - ${test.id}`);
  process.exit(1);
}

console.log("Playwright skip gate passed");
