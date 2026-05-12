import axios from "axios";
import "dotenv/config";
import type { GapAnalysis } from "../analysis/analyzer.js";
import type { JiraTicket } from "../collectors/jiraCollector.js";
import { logger } from "../utils/logger.js";

// Jira doesn't accept plain text — descriptions must be in ADF (Atlassian Document Format)
interface JiraAdfTextNode {
  type: "text";
  text: string;
}

interface JiraAdfParagraphNode {
  type: "paragraph";
  content?: JiraAdfTextNode[];
}

interface JiraAdfDocument {
  type: "doc";
  version: 1;
  content: JiraAdfParagraphNode[];
}

interface JiraCreateIssueResponse {
  id: string;
  key: string;
  self: string;
}

interface JiraCreateIssuePayload {
  fields: {
    project: { key: string };
    summary: string;
    issuetype: { name: string };
    description: JiraAdfDocument;
    labels: string[];
  };
}

interface JiraUpdateIssuePayload {
  fields: {
    description: JiraAdfDocument;
  };
}

type AnalysisGap = GapAnalysis["gapsInCode"][number];

const jiraClient = axios.create({
  baseURL: `${process.env.JIRA_BASE_URL}/rest/api/3`,
  auth: {
    username: process.env.JIRA_EMAIL ?? "",
    password: process.env.JIRA_API_TOKEN ?? "",
  },
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

function toAdfDocument(text: string): JiraAdfDocument {
  const content = text.split("\n").map((line) => {
    if (line.trim().length === 0) {
      return { type: "paragraph" } satisfies JiraAdfParagraphNode;
    }

    return {
      type: "paragraph",
      content: [{ type: "text", text: line }],
    } satisfies JiraAdfParagraphNode;
  });

  return {
    type: "doc",
    version: 1,
    content,
  };
}

function formatGapLine(prefix: string, gap: AnalysisGap): string {
  const relatedFile = gap.relatedFile ? ` (${gap.relatedFile})` : "";
  return `- ${prefix}: ${gap.title} - ${gap.detail}${relatedFile}`;
}

function buildSuggestionDescription(summary: string): string {
  return [
    "Created by Compass based on repository audit findings.",
    "",
    `Suggested follow-up task: ${summary}`,
  ].join("\n");
}

function buildTicketUpdateText(ticket: JiraTicket, analysis: GapAnalysis): string | null {
  const relatedGaps = analysis.gapsInCode.filter((gap) => gap.relatedTicket === ticket.key);
  const relatedInconsistencies = analysis.inconsistencies.filter(
    (gap) => gap.relatedTicket === ticket.key
  );

  if (relatedGaps.length === 0 && relatedInconsistencies.length === 0) {
    return null;
  }

  const auditLines = [
    `Compass sync audit for ${ticket.key}`,
    "",
    "Detected findings:",
    ...relatedGaps.map((gap) => formatGapLine("Missing implementation", gap)),
    ...relatedInconsistencies.map((gap) => formatGapLine("Inconsistency", gap)),
  ];

  if (ticket.description?.trim()) {
    return [ticket.description.trim(), "", "---", "", ...auditLines].join("\n");
  }

  return auditLines.join("\n");
}

export async function createJiraIssue(
  summary: string,
  description: string
): Promise<string | null> {
  const safeSummary = summary.slice(0, 255);

  try {
    const payload: JiraCreateIssuePayload = {
      fields: {
        project: { key: process.env.JIRA_PROJECT_KEY ?? "" },
        summary: safeSummary,
        issuetype: { name: "Task" },
        description: toAdfDocument(description),
        labels: ["compass-generated"],
      },
    };

    const response = await jiraClient.post<JiraCreateIssueResponse>("/issue", payload);
    logger.success(`Created Jira issue ${response.data.key}`);
    return response.data.key;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      logger.error(
        `Failed to create Jira issue "${summary}": ${err.response?.status} - ${JSON.stringify(err.response?.data)}`
      );
    } else if (err instanceof Error) {
      logger.error(`Failed to create Jira issue "${summary}": ${err.message}`);
    }

    return null;
  }
}

export async function updateJiraIssueDescription(
  issueKey: string,
  description: string
): Promise<boolean> {
  try {
    const payload: JiraUpdateIssuePayload = {
      fields: {
        description: toAdfDocument(description),
      },
    };

    await jiraClient.put(`/issue/${issueKey}`, payload);
    logger.success(`Updated Jira issue ${issueKey}`);
    return true;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      logger.error(
        `Failed to update Jira issue ${issueKey}: ${err.response?.status} - ${JSON.stringify(err.response?.data)}`
      );
    } else if (err instanceof Error) {
      logger.error(`Failed to update Jira issue ${issueKey}: ${err.message}`);
    }

    return false;
  }
}

export async function applyJiraActions(
  analysis: GapAnalysis,
  tickets: JiraTicket[]
): Promise<void> {
  logger.info("Applying Jira actions...");

  for (const suggestion of analysis.suggestions) {
    await createJiraIssue(suggestion, buildSuggestionDescription(suggestion));
  }

  for (const ticket of tickets) {
    const updatedDescription = buildTicketUpdateText(ticket, analysis);

    if (updatedDescription === null) {
      continue;
    }

    await updateJiraIssueDescription(ticket.key, updatedDescription);
  }

  logger.success("Finished Jira actions");
}
