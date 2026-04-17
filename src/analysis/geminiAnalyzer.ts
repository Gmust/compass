import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "../utils/logger.js";
import "dotenv/config";
import type { JiraTicket } from "../collectors/jiraCollector.js";
import type { GithubFile } from "../collectors/githubCollector.js";

interface Gap {
  title: string;
  detail: string;
  relatedTicket?: string;
  relatedFile?: string;
}

export interface GapAnalysis {
  gapsInCode: Gap[];
  gapsInDocs: Gap[];
  inconsistencies: Gap[];
  suggestions: string[];
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  systemInstruction:
    "You are a senior engineering PM auditor. Your job is to compare Jira tickets against actual repository code and documentation to find mismatches, gaps, and missing coverage. Be concise and precise. Always respond with only a valid JSON object — no explanation, no markdown fences.",
});

function buildPrompt(tickets: JiraTicket[], files: GithubFile[]) {
  const ticketSummary = tickets.map((t) => `[${t.key}] ${t.status} - ${t.summary}`).join("\n");

  const fileSummary = files
    .map((f) => `${f.type.toUpperCase()}: ${f.path}\n${f.content.slice(0, 500)}`)
    .join("\n\n");

  return [
    "Analyze the following Jira tickets and repository files for inconsistencies and gaps.",
    "",
    "## Jira Tickets",
    ticketSummary,
    "",
    "## Repository Files",
    fileSummary,
    "",
    "Respond with a JSON object that exactly matches this shape:",
    "{",
    '  "gapsInCode": [{ "title": "", "detail": "", "relatedTicket": "", "relatedFile": "" }],',
    '  "gapsInDocs": [{ "title": "", "detail": "", "relatedTicket": "", "relatedFile": "" }],',
    '  "inconsistencies": [{ "title": "", "detail": "", "relatedTicket": "", "relatedFile": "" }],',
    '  "suggestions": ["string"]',
    "}",
    "",
    "Rules:",
    "- gapsInCode: tickets that have no corresponding implementation found in the code files",
    "- gapsInDocs: code files or features that have no documentation",
    "- inconsistencies: cases where the code clearly does something different from what the ticket describes",
    "- suggestions: titles of new Jira tickets you recommend creating based on what you see in the code",
    "- relatedTicket and relatedFile are optional - only include them when you have a specific match",
    "- Return empty arrays if nothing is found for a category",
    "- Do not include any text outside the JSON object",
  ].join("\n");
}

export async function analyzeGaps(
  tickets: JiraTicket[],
  files: GithubFile[]
): Promise<GapAnalysis> {
  logger.info("Running Gemini gap analysis...");

  const prompt = buildPrompt(tickets, files);
  const result = await model.generateContent(prompt);
  const text = result.response.text();

  try {
    const clean = text
      .replace(/^```json\n?/, "")
      .replace(/\n?```$/, "")
      .trim();

    const analysis: GapAnalysis = JSON.parse(clean);
    logger.success("Gap analysis complete");
    return analysis;
  } catch {
    logger.error("Failed to parse Gemini response");
    logger.error(text);
    throw new Error("Invalid JSON from Gemini");
  }
}
