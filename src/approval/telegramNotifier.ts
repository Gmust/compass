import axios from "axios";
import type { GapAnalysis } from "../analysis/analyzer.js";
import type { PendingAction } from "./pendingActions.js";
import { logger } from "../utils/logger.js";

// Builds a Telegram message listing every action individually so the user
// can reply with specific IDs to approve rather than all-or-nothing
function buildMessage(analysis: GapAnalysis, actions: PendingAction[]): string {
  const { gapsInCode, gapsInDocs, inconsistencies } = analysis;

  const createActions = actions.filter((a) => a.type === "create");
  const updateActions = actions.filter((a) => a.type === "update");

  const lines = [
    `*Compass Audit Complete*`,
    ``,
    `*Findings:*`,
    `Code gaps: ${gapsInCode.length}`,
    `Doc gaps: ${gapsInDocs.length}`,
    `Inconsistencies: ${inconsistencies.length}`,
    ``,
  ];

  if (createActions.length > 0) {
    lines.push(`*New tasks to create (${createActions.length}):*`);
    for (const action of createActions) {
      lines.push(`${action.id}. ${action.summary}`);
    }
    lines.push(``);
  }

  if (updateActions.length > 0) {
    lines.push(`*Tickets to update (${updateActions.length}):*`);
    for (const action of updateActions) {
      lines.push(`${action.id}. ${action.summary}`);
    }
    lines.push(``);
  }

  lines.push(`*Reply with:*`);
  lines.push(`\`all\` — approve everything`);
  lines.push(`\`none\` — reject everything`);
  lines.push(`\`1,3,5\` — approve specific IDs`);
  lines.push(``);
  lines.push(`Then run: \`npx tsx src/index.ts --apply <your reply>\``);
  lines.push(`Example: \`npx tsx src/index.ts --apply 1,3,5\``);

  return lines.join("\n");
}

export async function sendTelegramNotification(
  analysis: GapAnalysis,
  actions: PendingAction[]
): Promise<void> {
  const webhookUrl = process.env.OPENCLAW_WEBHOOK_URL;

  // Skip silently if not configured — Telegram is optional
  if (!webhookUrl) {
    logger.warn("OPENCLAW_WEBHOOK_URL not set — skipping Telegram notification");
    return;
  }

  try {
    await axios.post(webhookUrl, {
      message: buildMessage(analysis, actions),
    });
    logger.success("Telegram notification sent via OpenClaw");
  } catch (err) {
    if (err instanceof Error) {
      logger.error(`Failed to send Telegram notification: ${err.message}`);
    }
  }
}
