# Compass — AI Project Sync Agent

## What is this project?
Compass is an AI-powered project management sync agent. It pulls data from three sources — Jira tickets, GitHub repository code, and repository documentation — then uses Google Gemini to compare them and detect inconsistencies. Based on the analysis it:
- Creates new Jira tasks for detected gaps
- Updates existing Jira ticket descriptions with context from the code
- Generates a markdown audit report
- Sends a digest alert via Telegram/Slack

## Tech Stack
- **Runtime**: Node.js with TypeScript (strict mode)
- **AI**: Google Gemini 2.5 Flash via `@google/generative-ai`
- **HTTP**: Axios for Jira and GitHub REST API calls
- **Environment**: dotenv for config
- **Dev runner**: tsx (no build step during development)

## Project Structure
```
compass/
├── src/
│   ├── index.ts                  # Orchestrates the full analysis pipeline
│   ├── collectors/
│   │   ├── jiraCollector.ts      # Fetches Jira tickets via REST API v3
│   │   └── githubCollector.ts    # Fetches repo file tree, code, and docs
│   ├── analysis/
│   │   └── geminiAnalyzer.ts     # Sends data to Gemini, parses gap analysis
│   ├── actions/
│   │   ├── jiraActions.ts        # Creates and updates Jira issues
│   │   └── reporter.ts           # Generates markdown audit report
│   └── utils/
│       └── logger.ts             # Colored terminal logger (ANSI)
├── .env                          # Never commit this
├── .gitignore
├── package.json
└── tsconfig.json
```

## Environment Variables
```
GEMINI_API_KEY=           # Google AI Studio free key
GITHUB_TOKEN=             # GitHub personal access token (repo, read:org scopes)
GITHUB_REPO=              # Format: owner/repo-name
JIRA_BASE_URL=            # e.g. https://dimploma-work.atlassian.net
JIRA_EMAIL=               # Atlassian account email
JIRA_API_TOKEN=           # Atlassian API token
JIRA_PROJECT_KEY=KAN      # Jira project key
```

## Code Style & Conventions
- **No `any` types** — always define interfaces for external API responses
- Use `axios.isAxiosError(err)` for typed Axios error handling
- All async functions wrapped in try/catch, errors logged via `logger.error()`
- Export interfaces that are reused across modules (e.g. `JiraTicket`, `GithubFile`)
- Use `?.` optional chaining and `?? null` nullish coalescing throughout
- All files use ES module imports (`import/export`), no CommonJS (`require`)
- Dotenv must be imported first in any entry point file

## Key Types

### JiraTicket (from jiraCollector.ts)
```ts
interface JiraTicket {
  id: string;
  key: string;           // e.g. "KAN-6"
  summary: string;       // ticket title
  description: string | null;
  status: string;        // "To Do" | "In Progress" | "In Review" etc.
  issueType: string;     // "Story" | "Task" | "Bug" | "Epic"
  priority: string | null;
  assignee: string | null;
  labels: string[];
}
```

### GithubFile (from githubCollector.ts) — to be implemented
```ts
interface GithubFile {
  path: string;
  content: string;
  type: 'code' | 'doc';
}
```

### GapAnalysis (from geminiAnalyzer.ts) — to be implemented
```ts
interface GapAnalysis {
  gapsInCode: Gap[];        // tickets with no matching code
  gapsInDocs: Gap[];        // code with no documentation
  inconsistencies: Gap[];   // code doesn't match ticket description
  suggestions: string[];    // new tickets Gemini recommends creating
}
```

## Jira API Notes
- Base URL: `https://dimploma-work.atlassian.net/rest/api/3`
- Auth: Basic auth with email + API token
- Search endpoint: `POST /search/jql` (the old `GET /search` is deprecated as of 2025)
- Fields come back in Atlassian Document Format (ADF) — use the `parseDescription()` helper in jiraCollector.ts to extract plain text
- Project key: `KAN`
- Cloud ID: `b79e21ea-56a1-4e53-a544-eb658ffc6c32`

## GitHub API Notes
- Use the `GET /repos/{owner}/{repo}/contents/{path}` endpoint to browse files
- File content comes back base64 encoded — decode with `Buffer.from(content, 'base64').toString('utf-8')`
- Focus on: README.md, /docs folder, /src folder
- Ignore: node_modules, dist, .env, lock files, binary files

## Gemini Integration Notes
- Model: `gemini-2.5-flash` (free tier, 1500 req/day)
- Always ask for JSON responses and parse them — wrap in try/catch in case Gemini adds markdown fences
- Keep prompts focused: send Jira tickets + file summaries, not full file contents (token limits)
- System instruction: act as a senior engineering PM auditor

## Current Status
- [x] logger.ts — complete
- [x] jiraCollector.ts — complete (using POST /search/jql)
- [ ] githubCollector.ts — next to implement
- [ ] geminiAnalyzer.ts — pending
- [ ] jiraActions.ts — pending
- [ ] reporter.ts — pending
- [ ] index.ts — pending (orchestration)

## Running the Project
```bash
# Run a specific module for testing
npx tsx src/collectors/jiraCollector.ts

# Run the full pipeline (once index.ts is complete)
npx tsx src/index.ts

# Type check
npx tsc --noEmit
```
