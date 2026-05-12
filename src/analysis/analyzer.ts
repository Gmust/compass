import { logger } from "../utils/logger.js";
import "dotenv/config";
import type { JiraTicket } from "../collectors/jiraCollector.js";
import type { GithubFile } from "../collectors/githubCollector.js";
import { createAiProvider } from "../ai/factory.js";

interface Gap {
  title: string;
  detail: string;
  relatedTicket?: string;
  relatedFile?: string;
}

export interface GapAnalysis {
  gapsInCode: Gap[];        // tickets with no matching code implementation
  gapsInDocs: Gap[];        // code that has no documentation
  inconsistencies: Gap[];   // code that doesn't match what the ticket describes
  suggestions: string[];    // new tasks the AI recommends creating
}

// Keeping system prompt separate from user prompt makes it easier to tune independently
const SYSTEM_PROMPT = `You are Compass, a senior engineering PM auditor.
Your job is to compare Jira tickets, source code, and documentation to find inconsistencies and gaps.
Always respond with valid JSON only. No markdown, no explanation outside the JSON.`;

function buildPrompt(tickets: JiraTicket[], files: GithubFile[]): string {
  const ticketSummary = tickets
    .map((t) => `[${t.key}] ${t.status} - ${t.description ?? "no description"}`)
    .join("\n");

  // Slice file contents to 500 chars to avoid hitting token limits
  const codeSummary = files
    .filter((f) => f.type === "code")
    .map((f) => `FILE: ${f.path}\n${f.content.slice(0, 500)}`)
    .join("\n---\n");

  const docSummary = files
    .filter((f) => f.type === "doc")
    .map((f) => `DOC: ${f.path}\n${f.content.slice(0, 500)}`)
    .join("\n---\n");

  return `
Analyze the following project data and return a JSON gap analysis.

## Jira Tickets
${ticketSummary}

## Source Code (summaries)
${codeSummary}

## Documentation
${docSummary}

## Instructions
Find:
1. Tickets that have no matching code implementation (gapsInCode)
2. Code or features with no documentation (gapsInDocs)
3. Cases where code doesn't match what the ticket describes (inconsistencies)
4. New tasks you recommend creating (suggestions)

Respond with this exact JSON structure:
{
  "gapsInCode": [
    { "title": "...", "detail": "...", "relatedTicket": "KAN-X", "relatedFile": "src/..." }
  ],
  "gapsInDocs": [
    { "title": "...", "detail": "...", "relatedFile": "src/..." }
  ],
  "inconsistencies": [
    { "title": "...", "detail": "...", "relatedTicket": "KAN-X", "relatedFile": "src/..." }
  ],
  "suggestions": ["suggestion 1", "suggestion 2"]
}`;
}

// AI providers sometimes wrap JSON in markdown fences — strip them before parsing
function parseResponse(raw: string): GapAnalysis {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  return JSON.parse(cleaned) as GapAnalysis;
}

export async function analyzeGaps(
  tickets: JiraTicket[],
  files: GithubFile[]
): Promise<GapAnalysis> {
  logger.info("Running AI analysis...");

  const provider = createAiProvider();
  const prompt = buildPrompt(tickets, files);

  try {
    const raw = await provider.analyze(prompt, SYSTEM_PROMPT);
    const analysis: GapAnalysis = parseResponse(raw);

    logger.success(
      `Analysis complete — ${analysis.gapsInCode.length} code gaps, ` +
        `${analysis.gapsInDocs.length} doc gaps, ` +
        `${analysis.inconsistencies.length} inconsistencies, ` +
        `${analysis.suggestions.length} suggestions`
    );

    return analysis;
  } catch (err) {
    // SyntaxError means the AI returned something that isn't valid JSON
    if (err instanceof SyntaxError) {
      logger.error("AI returned invalid JSON — try again or switch provider");
    } else if (err instanceof Error) {
      logger.error(`Analysis failed: ${err.message}`);
    }

    // Return empty result so the rest of the pipeline doesn't crash
    return { gapsInCode: [], gapsInDocs: [], inconsistencies: [], suggestions: [] };
  }
}
