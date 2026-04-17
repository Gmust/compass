import axios from "axios";
import { logger } from "../utils/logger.js";
import "dotenv/config";
interface JiraTextContent {
  text?: string;
  type: string;
}

interface JiraDescriptionBlock {
  content?: JiraTextContent[];
  type: string;
}

interface JiraDescription {
  content?: JiraDescriptionBlock[];
  type: string;
}

interface JiraRawIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description: JiraDescription | null;
    status: { name: string };
    issuetype: { name: string };
    priority: { name: string } | null;
    assignee: { displayName: string } | null;
    labels: string[];
  };
}

interface JiraSearchResponse {
  issues: JiraRawIssue[];
}

export interface JiraTicket {
  id: string;
  key: string;
  summary: string;
  description: string | null;
  status: string;
  issueType: string;
  priority: string | null;
  assignee: string | null;
  labels: string[];
}

const jiraClient = axios.create({
  baseURL: `${process.env.JIRA_BASE_URL}/rest/api/3`,
  auth: {
    username: process.env.JIRA_EMAIL!,
    password: process.env.JIRA_API_TOKEN!,
  },
  headers: { Accept: "application/json" },
});

function parseDescription(description: JiraDescription | null): string | null {
  if (!description?.content) return null;

  return (
    description.content
      .map((block) => block.content?.map((c) => c.text ?? "").join("") ?? "")
      .join("\n")
      .trim() || null
  );
}

export async function fetchJiraTickets(): Promise<JiraTicket[]> {
  logger.info("Fetching Jira tickets...");

  try {
    const response = await jiraClient.post<JiraSearchResponse>("/search/jql", {
      jql: `project = ${process.env.JIRA_PROJECT_KEY} ORDER BY created DESC`,
      maxResults: 100,
      fields: ["summary", "description", "status", "issuetype", "priority", "assignee", "labels"],
    });

    const tickets: JiraTicket[] = response.data.issues.map((issue) => ({
      id: issue.id,
      key: issue.key,
      summary: issue.fields.summary,
      description: parseDescription(issue.fields.description),
      status: issue.fields.status.name,
      issueType: issue.fields.issuetype.name,
      priority: issue.fields.priority?.name ?? null,
      assignee: issue.fields.assignee?.displayName ?? null,
      labels: issue.fields.labels ?? [],
    }));

    logger.success(`Fetched ${tickets.length} tickets`);
    return tickets;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      logger.error(
        `Jira API error: ${err.response?.status} — ${JSON.stringify(err.response?.data?.errorMessages)}`
      );
    } else if (err instanceof Error) {
      logger.error(`Unexpected error: ${err.message}`);
    }
    return [];
  }
}
