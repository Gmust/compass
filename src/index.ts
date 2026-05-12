import "dotenv/config";
import { analyzeGaps } from "./analysis/analyzer.js";
import { applyJiraActions } from "./actions/jiraActions.js";
import { generateAuditReport } from "./actions/reporter.js";
import { fetchGithubFiles } from "./collectors/githubCollector.js";
import { fetchJiraTickets } from "./collectors/jiraCollector.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  logger.section("Compass Audit");

  try {
    const jiraTickets = await fetchJiraTickets();
    const githubFiles = await fetchGithubFiles();
    const analysis = await analyzeGaps(jiraTickets, githubFiles);

    await applyJiraActions(analysis, jiraTickets);
    const reportPath = await generateAuditReport(analysis, jiraTickets, githubFiles);

    logger.section("Summary");
    logger.info(`Jira tickets analyzed: ${jiraTickets.length}`);
    logger.info(`Repository files analyzed: ${githubFiles.length}`);
    logger.info(`Gaps in code: ${analysis.gapsInCode.length}`);
    logger.info(`Gaps in docs: ${analysis.gapsInDocs.length}`);
    logger.info(`Inconsistencies: ${analysis.inconsistencies.length}`);
    logger.info(`Suggested new tickets: ${analysis.suggestions.length}`);
    logger.success(`Audit report generated at ${reportPath}`);
  } catch (err) {
    if (err instanceof Error) {
      logger.error(`Pipeline failed: ${err.message}`);
    } else {
      logger.error("Pipeline failed with an unknown error");
    }

    process.exitCode = 1;
  }
}

void main();
