import { writeFile } from "node:fs/promises";
import type { GapAnalysis } from "../analysis/geminiAnalyzer.js";
import type { GithubFile } from "../collectors/githubCollector.js";
import type { JiraTicket } from "../collectors/jiraCollector.js";
import { logger } from "../utils/logger.js";

export async function generateAuditReport(
  analysis: GapAnalysis,
  tickets: JiraTicket[],
  files: GithubFile[]
): Promise<string> {
  logger.info("Generating audit report...");

  try {
    const reportPath = "audit-report.md";
    const markdown = buildReportMarkdown(analysis, tickets, files);

    await writeFile(reportPath, markdown, "utf-8");

    logger.success(`Audit report written to ${reportPath}`);
    return reportPath;
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Failed to write audit report: ${error.message}`);
    }

    throw error;
  }
}

function buildReportMarkdown(
  analysis: GapAnalysis,
  tickets: JiraTicket[],
  files: GithubFile[]
): string {
  return [
    "# Compass Audit Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- Jira tickets analyzed: ${tickets.length}`,
    `- Repository files analyzed: ${files.length}`,
    `- Gaps in code: ${analysis.gapsInCode.length}`,
    `- Gaps in docs: ${analysis.gapsInDocs.length}`,
    `- Inconsistencies: ${analysis.inconsistencies.length}`,
    `- Suggested new tickets: ${analysis.suggestions.length}`,
    "",
    formatGapSection("Gaps In Code", analysis.gapsInCode),
    "",
    formatGapSection("Gaps In Docs", analysis.gapsInDocs),
    "",
    formatGapSection("Inconsistencies", analysis.inconsistencies),
    "",
    formatSuggestionsSection(analysis.suggestions),
    "",
  ].join("\n");
}

function formatSuggestionsSection(suggestions: string[]) {
  if (suggestions.length === 0) {
    return "## Suggested New Tickets\n\nNone.";
  }

  const lines = suggestions.map((suggestion, index) => `${index + 1}. ${suggestion}`);
  return ["## Suggested New Tickets", "", ...lines].join("\n");
}

function formatGapSection(title: string, gaps: GapAnalysis["gapsInCode"]) {
  if (gaps.length === 0) return `## ${title}\n\nNone.`;

  const entries = gaps.map((gap, index) => {
    const lines = [`### ${index + 1}. ${gap.title}`, gap.detail];

    if (gap.relatedTicket) {
      lines.push(`- Related ticket: ${gap.relatedTicket}`);
    }

    if (gap.relatedFile) {
      lines.push(`- Related file: ${gap.relatedFile}`);
    }

    return lines.join("\n");
  });

  return [`## ${title}`, ...entries].join("\n\n");
}
