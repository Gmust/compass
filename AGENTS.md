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

## Environment Setup
Copy `.env.example` to `.env` and fill in all values before running anything.

```
GEMINI_API_KEY=           # Google AI Studio free key
GITHUB_TOKEN=             # GitHub personal access token (repo, read:org scopes)
GITHUB_REPO=              # Format: owner/repo-name
JIRA_BASE_URL=            # e.g. https://your-workspace.atlassian.net
JIRA_EMAIL=               # Atlassian account email
JIRA_API_TOKEN=           # Atlassian API token (from id.atlassian.com/manage-profile/security/api-tokens)
JIRA_PROJECT_KEY=KAN      # Jira project key
```

Never commit `.env`. It is listed in `.gitignore`.

## Running the Project
```bash
# Install dependencies
npm install

# Run a specific module for testing
npx tsx src/collectors/jiraCollector.ts
npx tsx src/collectors/githubCollector.ts

# Run the full pipeline (once index.ts is complete)
npx tsx src/index.ts

# Type check (run after every edit to a .ts file)
npx tsc --noEmit

# Lint
npx eslint .

# Format
npx prettier --write .
```

## Code Style & Conventions

### TypeScript
- Strict mode is enabled — no `any` types, ever. Always define interfaces for external API responses.
- Use `?.` optional chaining and `?? null` nullish coalescing throughout.
- All files use ES module imports (`import/export`), no CommonJS (`require`).
- `dotenv/config` must be imported at the top of any entry point file.
- After editing any `.ts` file, always run `npx tsc --noEmit` and fix all errors before considering the task done.

### Error Handling
- All async functions must be wrapped in `try/catch`.
- Use `axios.isAxiosError(err)` for typed Axios error handling.
- Log errors via `logger.error()`, never `console.error()`.

### Exports
- Export interfaces that are shared across modules (e.g. `JiraTicket`, `GithubFile`).
- Keep each file focused on a single responsibility — collectors collect, actions act, analysis analyses.

### Naming
- Variables and functions: `camelCase`
- Interfaces and types: `PascalCase`
- Files: `camelCase.ts`

## Key Types

### JiraTicket (from `src/collectors/jiraCollector.ts`)
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

### GithubFile (from `src/collectors/githubCollector.ts`)
```ts
interface GithubFile {
  path: string;
  content: string;
  type: 'code' | 'doc';
}
```

### Gap (used inside GapAnalysis)
```ts
interface Gap {
  title: string;
  detail: string;
  relatedTicket?: string;   // e.g. "KAN-6"
  relatedFile?: string;     // e.g. "src/collectors/jiraCollector.ts"
}
```

### GapAnalysis (from `src/analysis/geminiAnalyzer.ts`)
```ts
interface GapAnalysis {
  gapsInCode: Gap[];        // tickets with no matching code
  gapsInDocs: Gap[];        // code with no documentation
  inconsistencies: Gap[];   // code doesn't match ticket description
  suggestions: string[];    // new ticket titles Gemini recommends creating
}
```

## API Notes

### Jira REST API v3
- Base URL: `{JIRA_BASE_URL}/rest/api/3`
- Auth: HTTP Basic — username is the account email, password is the API token.
- **Search**: use `POST /search/jql` with a JSON body — the old `GET /search` is deprecated as of 2025.
- Ticket descriptions come back in Atlassian Document Format (ADF). Use the `parseDescription()` helper in `jiraCollector.ts` to extract plain text from ADF before passing it to Gemini.
- Project key: `KAN`

### GitHub REST API
- Auth: `Authorization: Bearer {GITHUB_TOKEN}` header.
- Browse files with `GET /repos/{owner}/{repo}/contents/{path}` — returns an array of items for directories, a single object for files.
- File content is base64 encoded. Decode with `Buffer.from(content.replace(/\n/g, ''), 'base64').toString('utf-8')`.
- Focus only on: `README.md`, `/docs`, `/src`.
- Skip: `node_modules`, `dist`, `.env`, lock files, and binary file extensions (`.png`, `.jpg`, `.svg`, `.zip`, etc.).

### Gemini (Google Generative AI)
- Model: `gemini-2.5-flash`
- Always request JSON output and parse it — wrap the parse in `try/catch` because Gemini sometimes wraps responses in markdown fences (` ```json ... ``` `).
- Send compact summaries to Gemini, not full file contents, to stay within token limits.
- System instruction should frame Gemini as a senior engineering PM auditor.

## Current Implementation Status
- [x] `src/utils/logger.ts` — complete
- [x] `src/collectors/jiraCollector.ts` — complete
- [x] `src/collectors/githubCollector.ts` — complete
- [ ] `src/analysis/geminiAnalyzer.ts` — pending
- [ ] `src/actions/jiraActions.ts` — pending
- [ ] `src/actions/reporter.ts` — pending
- [ ] `src/index.ts` — pending (orchestration)

## Agent Instructions

When implementing a new module:
1. Read the existing completed modules first (`jiraCollector.ts`, `githubCollector.ts`) to match the style.
2. Define all interfaces for external data at the top of the file.
3. Create a named Axios client or use the `@google/generative-ai` SDK — do not use `fetch()`.
4. Export the main function and any interfaces needed by other modules.
5. Run `npx tsc --noEmit` after writing the file and fix any type errors before finishing.

When asked to implement `index.ts`:
- Import `fetchJiraTickets` from `collectors/jiraCollector.js`
- Import `fetchGithubFiles` from `collectors/githubCollector.js`
- Import `analyzeGaps` from `analysis/geminiAnalyzer.js`
- Import action functions from `actions/jiraActions.js` and `actions/reporter.js`
- Use `dotenv/config` as the very first import
- Wrap the entire pipeline in a top-level `try/catch` and log a clean summary at the end
