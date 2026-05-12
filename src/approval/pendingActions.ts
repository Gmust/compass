import { existsSync, readFileSync, writeFileSync } from "fs";
import type { GapAnalysis } from "../analysis/analyzer.js";
import type { GithubFile } from "../collectors/githubCollector.js";
import type { JiraTicket } from "../collectors/jiraCollector.js";
import { logger } from "../utils/logger.js";

const PENDING_FILE = "compass-pending.json";

export type ActionType = "create" | "update";

export interface PendingAction {
  id: number;
  type: ActionType;
  summary: string; // human-readable label shown in Telegram and terminal
  ticketKey?: string; // only for "update" actions
  suggestion?: string; // only for "create" actions
  description: string; // content that will be written to Jira
}

export interface PendingActionsFile {
  createdAt: string;
  tickets: JiraTicket[];
  files: GithubFile[];
  analysis: GapAnalysis;
  actions: PendingAction[];
}

// Converts raw GapAnalysis into a flat list of individual approvable actions
export function buildActions(analysis: GapAnalysis, tickets: JiraTicket[]): PendingAction[] {
  const actions: PendingAction[] = [];
  let id = 1;

  for (const suggestion of analysis.suggestions) {
    actions.push({
      id: id++,
      type: "create",
      summary: suggestion.slice(0, 80) + (suggestion.length > 80 ? "..." : ""),
      suggestion,
      description: [
        "Created by Compass based on repository audit findings.",
        "",
        `Suggested follow-up task: ${suggestion}`,
      ].join("\n"),
    });
  }

  for (const ticket of tickets) {
    const relatedGaps = analysis.gapsInCode.filter((g) => g.relatedTicket === ticket.key);
    const relatedInconsistencies = analysis.inconsistencies.filter(
      (g) => g.relatedTicket === ticket.key
    );

    if (relatedGaps.length === 0 && relatedInconsistencies.length === 0) continue;

    const findings = [
      ...relatedGaps.map((g) => `- Missing implementation: ${g.title} — ${g.detail}`),
      ...relatedInconsistencies.map((g) => `- Inconsistency: ${g.title} — ${g.detail}`),
    ];

    const description = [
      ticket.description?.trim() ?? "",
      ticket.description?.trim() ? "\n---\n" : "",
      `Compass sync audit for ${ticket.key}`,
      "",
      "Detected findings:",
      ...findings,
    ]
      .join("\n")
      .trim();

    actions.push({
      id: id++,
      type: "update",
      summary: `Update ${ticket.key}: ${ticket.summary.slice(0, 60)}`,
      ticketKey: ticket.key,
      description,
    });
  }

  return actions;
}

export function savePendingActions(
  analysis: GapAnalysis,
  tickets: JiraTicket[],
  files: GithubFile[]
): PendingAction[] {
  const actions = buildActions(analysis, tickets);

  const pending: PendingActionsFile = {
    createdAt: new Date().toISOString(),
    tickets,
    files,
    analysis,
    actions,
  };

  writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2), "utf-8");
  logger.success(`${actions.length} pending actions saved to ${PENDING_FILE}`);

  return actions;
}

export function loadPendingActions(): PendingActionsFile | null {
  if (!existsSync(PENDING_FILE)) {
    logger.error("No pending actions found. Run without --apply first.");
    return null;
  }

  const raw = readFileSync(PENDING_FILE, "utf-8");
  const pending = JSON.parse(raw) as PendingActionsFile;

  logger.info(`Loaded ${pending.actions.length} pending actions from ${pending.createdAt}`);
  return pending;
}

export function filterApprovedActions(
  actions: PendingAction[],
  approved: number[] | "all" | "none"
): PendingAction[] {
  if (approved === "none") return [];
  if (approved === "all") return actions;
  return actions.filter((a) => approved.includes(a.id));
}

export function clearPendingActions(): void {
  if (existsSync(PENDING_FILE)) {
    writeFileSync(PENDING_FILE, "", "utf-8");
    logger.info("Pending actions cleared");
  }
}
