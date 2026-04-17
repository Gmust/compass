/* eslint-disable no-console */
type LogLevel = "info" | "success" | "warn" | "error";

interface Logger {
  info: (msg: string) => void;
  success: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
  section: (msg: string) => void;
}

const colors: Record<string, string> = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

const timeStamp = () => new Date().toLocaleDateString();

const log = (level: LogLevel, color: string, label: string, msg: string) => {
  const prefix = `${color}[${label}]${colors.reset}`.padEnd(16);
  console.log(`${prefix} ${colors.gray}${timeStamp()}${colors.reset} ${msg}`);
};

export const logger: Logger = {
  info: (msg) => log("info", colors.cyan, "INFO", msg),
  success: (msg) => log("success", colors.green, "OK", msg),
  warn: (msg) => log("warn", colors.yellow, "WARN", msg),
  error: (msg) => log("error", colors.red, "ERROR", msg),
  section: (msg) => console.log(`\n${colors.cyan}━━━ ${msg} ━━━${colors.reset}\n`),
};

logger.section("Compass");
logger.info("Starting analysis...");
logger.success("Jira tickets fetched");
logger.warn("2 tickets missing description");
logger.error("GitHub token invalid");
