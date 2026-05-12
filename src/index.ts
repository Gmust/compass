import "dotenv/config";
import { analyzeGaps } from "./analysis/analyzer.js";
import { applyJiraActions } from "./actions/jiraActions.js";
import { generateAuditReport } from "./actions/reporter.js";
import { fetchGithubFiles } from "./collectors/githubCollector.js";
import { fetchJiraTickets } from "./collectors/jiraCollector.js";
import { logger } from "./utils/logger.js";
import {
  savePendingActions,
  loadPendingActions,
  clearPendingActions,
  filterApprovedActions,
} from "./approval/pendingActions.js";
import { sendTelegramNotification } from "./approval/telegramNotifier.js";
import type { GapAnalysis } from "./analysis/analyzer.js";
import type { JiraTicket } from "./collectors/jiraCollector.js";

// Parses --apply flag from CLI args:
//   --apply       → approve all
//   --apply all   → approve all
//   --apply none  → reject all
//   --apply 1,3,5 → approve specific IDs
function parseApplyArg(): "all" | "none" | number[] | null {
  const idx = process.argv.indexOf("--apply");
  if (idx === -1) return null;

  const val = process.argv[idx + 1];
  if (!val || val.startsWith("--")) return "all";
  if (val === "all") return "all";
  if (val === "none") return "none";

  const ids = val
    .split(",")
    .map(Number)
    .filter((n) => !isNaN(n));
  return ids.length > 0 ? ids : "all";
}

// Applies only the approved actions to Jira
async function applyApprovedActions(
  approved: ReturnType<typeof filterApprovedActions>,
  tickets: JiraTicket[],
  analysis: GapAnalysis
): Promise<void> {
  const { createJiraIssue, updateJiraIssueDescription } = await import("./actions/jiraActions.js");

  for (const action of approved) {
    if (action.type === "create" && action.suggestion) {
      await createJiraIssue(action.suggestion, action.description);
    } else if (action.type === "update" && action.ticketKey) {
      await updateJiraIssueDescription(action.ticketKey, action.description);
    }
  }
}

async function analyze(): Promise<void> {
  logger.section("Compass — Analyze");

  const tickets = await fetchJiraTickets();
  const files = await fetchGithubFiles();
  const analysis = await analyzeGaps(tickets, files);

  const actions = savePendingActions(analysis, tickets, files);
  await sendTelegramNotification(analysis, actions);

  logger.section("Summary");
  logger.info(`Tickets analyzed: ${tickets.length}`);
  logger.info(`Files analyzed: ${files.length}`);
  logger.info(`Code gaps: ${analysis.gapsInCode.length}`);
  logger.info(`Doc gaps: ${analysis.gapsInDocs.length}`);
  logger.info(`Inconsistencies: ${analysis.inconsistencies.length}`);
  logger.info(`Pending actions: ${actions.length}`);
  logger.success(`Review compass-pending.json then run:`);
  logger.info(`  npx tsx src/index.ts --apply all      (approve all)`);
  logger.info(`  npx tsx src/index.ts --apply 1,3,5    (approve specific)`);
  logger.info(`  npx tsx src/index.ts --apply none     (reject all)`);
}

async function apply(approved: "all" | "none" | number[]): Promise<void> {
  logger.section("Compass — Apply");

  const pending = loadPendingActions();
  if (!pending) return;

  const approvedActions = filterApprovedActions(pending.actions, approved);

  if (approvedActions.length === 0) {
    logger.warn("No actions approved — nothing to apply");
    clearPendingActions();
    return;
  }

  logger.info(`Applying ${approvedActions.length} of ${pending.actions.length} actions...`);

  await applyApprovedActions(approvedActions, pending.tickets, pending.analysis);
  const reportPath = generateAuditReport(pending.analysis, pending.tickets, pending.files);

  clearPendingActions();

  logger.section("Done");
  logger.success(`Applied ${approvedActions.length} actions`);
  logger.success(`Report saved to ${reportPath}`);
}

async function main(): Promise<void> {
  try {
    const applyArg = parseApplyArg();

    if (applyArg !== null) {
      await apply(applyArg);
    } else {
      await analyze();
    }
  } catch (err) {
    if (err instanceof Error) {
      logger.error(`Pipeline failed: ${err.message}`);
    }
    process.exitCode = 1;
  }
}

void main();
