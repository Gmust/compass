import { writeFileSync } from "node:fs";
import type { GapAnalysis } from "../analysis/analyzer.js";
import type { GithubFile } from "../collectors/githubCollector.js";
import type { JiraTicket } from "../collectors/jiraCollector.js";
import { logger } from "../utils/logger.js";

export interface ReportData {
  generatedAt: string;
  tickets: JiraTicket[];
  files: GithubFile[];
  analysis: GapAnalysis;
}

function buildMarkdown(data: ReportData): string {
  const { generatedAt, tickets, files, analysis } = data;
  const lines: string[] = [];

  lines.push(`# Compass Audit Report`);
  lines.push(`Generated: ${generatedAt}`);
  lines.push(``);
  lines.push(`## Summary`);
  lines.push(`| | Count |`);
  lines.push(`|---|---|`);
  lines.push(`| Jira tickets scanned | ${tickets.length} |`);
  lines.push(`| Files scanned | ${files.length} |`);
  lines.push(`| Code gaps | ${analysis.gapsInCode.length} |`);
  lines.push(`| Doc gaps | ${analysis.gapsInDocs.length} |`);
  lines.push(`| Inconsistencies | ${analysis.inconsistencies.length} |`);
  lines.push(`| Suggested tasks | ${analysis.suggestions.length} |`);
  lines.push(``);

  if (analysis.gapsInCode.length > 0) {
    lines.push(`## Code Gaps`);
    lines.push(`> Tickets with no matching implementation found in the codebase`);
    lines.push(``);
    for (const gap of analysis.gapsInCode) {
      lines.push(`### ${gap.title}`);
      lines.push(`- **Detail:** ${gap.detail}`);
      if (gap.relatedTicket) lines.push(`- **Ticket:** ${gap.relatedTicket}`);
      if (gap.relatedFile) lines.push(`- **File:** \`${gap.relatedFile}\``);
      lines.push(``);
    }
  }

  if (analysis.gapsInDocs.length > 0) {
    lines.push(`## Documentation Gaps`);
    lines.push(`> Code or features with no documentation`);
    lines.push(``);
    for (const gap of analysis.gapsInDocs) {
      lines.push(`### ${gap.title}`);
      lines.push(`- **Detail:** ${gap.detail}`);
      if (gap.relatedFile) lines.push(`- **File:** \`${gap.relatedFile}\``);
      lines.push(``);
    }
  }

  if (analysis.inconsistencies.length > 0) {
    lines.push(`## Inconsistencies`);
    lines.push(`> Code that doesn't match what the Jira ticket describes`);
    lines.push(``);
    for (const gap of analysis.inconsistencies) {
      lines.push(`### ${gap.title}`);
      lines.push(`- **Detail:** ${gap.detail}`);
      if (gap.relatedTicket) lines.push(`- **Ticket:** ${gap.relatedTicket}`);
      if (gap.relatedFile) lines.push(`- **File:** \`${gap.relatedFile}\``);
      lines.push(``);
    }
  }

  if (analysis.suggestions.length > 0) {
    lines.push(`## 💡 Suggested Tasks`);
    lines.push(`> New tasks recommended by AI based on the audit`);
    lines.push(``);
    for (const suggestion of analysis.suggestions) {
      lines.push(`- ${suggestion}`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}

export function generateAuditReport(
  analysis: GapAnalysis,
  tickets: JiraTicket[],
  files: GithubFile[]
): string {
  const data: ReportData = {
    generatedAt: new Date().toLocaleString(),
    tickets,
    files,
    analysis,
  };

  const markdown = buildMarkdown(data);
  const outputPath = `compass-report-${Date.now()}.md`;

  writeFileSync(outputPath, markdown, "utf-8");
  logger.success(`Report saved to ${outputPath}`);

  return outputPath;
}
