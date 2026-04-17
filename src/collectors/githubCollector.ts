import axios from "axios";
import { logger } from "../utils/logger.js";
import "dotenv/config";

interface GithubContentItem {
  type: "file" | "dir" | "symlink" | "submodule";
  name: string;
  path: string;
  encoding?: string;
  content?: string;
}

export interface GithubFile {
  path: string;
  content: string;
  type: "code" | "doc";
}

const IGNORED_PATHS = new Set([
  "node_modules",
  "dist",
  ".env",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  ".git",
]);

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".zip",
  ".tar",
  ".gz",
  ".pdf",
  ".mp4",
  ".mp3",
]);

const TARGET_ROOTS = ["README.md", "docs", "src"];

const githubClient = axios.create({
  baseURL: "https://api.github.com",
  headers: {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  },
});

function classifyFile(path: string): "code" | "doc" {
  const lower = path.toLowerCase();
  if (
    lower.endsWith(".md") ||
    lower.endsWith(".mdx") ||
    lower.endsWith(".txt") ||
    lower.includes("/docs/")
  ) {
    return "doc";
  }
  return "code";
}

function isBinary(path: string): boolean {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

function shouldIgnore(path: string): boolean {
  return path.split("/").some((segment) => IGNORED_PATHS.has(segment));
}

async function fetchFileContent(repo: string, path: string): Promise<string | null> {
  try {
    const response = await githubClient.get<GithubContentItem>(`/repos/${repo}/contents/${path}`);
    const { content, encoding } = response.data;

    if (encoding !== "base64" || !content) {
      return null;
    }

    return Buffer.from(content.replace(/\n/g, ""), "base64").toString("utf-8");
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) {
      return null;
    }
    throw err;
  }
}

async function fetchDirectory(repo: string, path: string): Promise<GithubFile[]> {
  const results: GithubFile[] = [];

  let items: GithubContentItem[];
  try {
    const response = await githubClient.get<GithubContentItem[]>(`/repos/${repo}/contents/${path}`);
    items = response.data;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) {
      return [];
    }
    throw err;
  }

  for (const item of items) {
    if (shouldIgnore(item.path)) continue;

    if (item.type === "dir") {
      results.push(...(await fetchDirectory(repo, item.path)));
      continue;
    }

    if (item.type !== "file" || isBinary(item.path)) continue;

    const content = await fetchFileContent(repo, item.path);
    if (content === null) continue;

    results.push({
      path: item.path,
      content,
      type: classifyFile(item.path),
    });
  }

  return results;
}

async function fetchTarget(repo: string, target: string): Promise<GithubFile[]> {
  if (target === "README.md") {
    const content = await fetchFileContent(repo, target);

    if (content === null) {
      return [];
    }

    logger.info("Fetched README.md");
    return [{ path: target, content, type: "doc" }];
  }

  const files = await fetchDirectory(repo, target);
  logger.info(`Fetched ${files.length} files from /${target}`);
  return files;
}

export async function fetchGithubFiles(): Promise<GithubFile[]> {
  const repo = process.env.GITHUB_REPO!;
  logger.info(`Fetching GitHub files from ${repo}...`);

  const allFiles: GithubFile[] = [];

  for (const target of TARGET_ROOTS) {
    try {
      const files = await fetchTarget(repo, target);
      allFiles.push(...files);
    } catch (err) {
      if (err instanceof Error) {
        logger.error(`Failed to fetch ${target}: ${err.message}`);
      }
    }
  }

  logger.success(`Fetched ${allFiles.length} total files from GitHub`);
  return allFiles;
}
