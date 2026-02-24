import dotenv from "dotenv";

dotenv.config();

export interface ConfluenceConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  ignoreTlsErrors: boolean;
  spaceKey: string | undefined;
}

export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  ignoreTlsErrors: boolean;
  projectKey: string | undefined;
}

/**
 * Load Confluence configuration from environment variables.
 *
 * Priority order:
 * 1. CONFLUENCE_URL / CONFLUENCE_EMAIL / CONFLUENCE_API_TOKEN (Confluence-specific)
 * 2. ATLASSIAN_URL / ATLASSIAN_EMAIL / ATLASSIAN_API_TOKEN (Common/shared)
 *
 * This allows both individual service configs and a shared Atlassian config.
 *
 * Environment variables:
 *   ATLASSIAN_URL       — Common Atlassian base URL (used by both services)
 *   ATLASSIAN_EMAIL     — Common Atlassian account email
 *   ATLASSIAN_API_TOKEN — Common Atlassian API token
 *   CONFLUENCE_URL      — Confluence-specific URL (overrides ATLASSIAN_URL)
 *   CONFLUENCE_EMAIL    — Confluence-specific email (overrides ATLASSIAN_EMAIL)
 *   CONFLUENCE_API_TOKEN — Confluence-specific token (overrides ATLASSIAN_API_TOKEN)
 *   CONFLUENCE_SPACE_KEY — Optional space key scope
 *   IGNORE_TLS_ERRORS   — TLS override flag ("true" / "1")
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): ConfluenceConfig {
  const baseUrl = env.CONFLUENCE_URL ?? env.ATLASSIAN_URL;
  const email = env.CONFLUENCE_EMAIL ?? env.ATLASSIAN_EMAIL;
  const apiToken = env.CONFLUENCE_API_TOKEN ?? env.ATLASSIAN_API_TOKEN;
  const ignoreTlsErrorsRaw = env.IGNORE_TLS_ERRORS;
  const spaceKey = env.CONFLUENCE_SPACE_KEY?.trim() || undefined;

  const missing: string[] = [];

  if (!baseUrl) missing.push("CONFLUENCE_URL or ATLASSIAN_URL");
  if (!email) missing.push("CONFLUENCE_EMAIL or ATLASSIAN_EMAIL");
  if (!apiToken) missing.push("CONFLUENCE_API_TOKEN or ATLASSIAN_API_TOKEN");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }

  const ignoreTlsErrors =
    ignoreTlsErrorsRaw?.toLowerCase() === "true" ||
    ignoreTlsErrorsRaw === "1";

  return {
    baseUrl: baseUrl!.replace(/\/+$/, ""),
    email: email!,
    apiToken: apiToken!,
    ignoreTlsErrors,
    spaceKey,
  };
}

/**
 * Load Jira configuration from environment variables.
 *
 * Priority order:
 * 1. JIRA_URL / JIRA_EMAIL / JIRA_API_TOKEN (Jira-specific)
 * 2. ATLASSIAN_URL / ATLASSIAN_EMAIL / ATLASSIAN_API_TOKEN (Common/shared)
 * 3. CONFLUENCE_URL / CONFLUENCE_EMAIL / CONFLUENCE_API_TOKEN (Legacy fallback)
 *
 * This allows both individual service configs and a shared Atlassian config.
 *
 * Environment variables:
 *   ATLASSIAN_URL       — Common Atlassian base URL (used by both services)
 *   ATLASSIAN_EMAIL     — Common Atlassian account email
 *   ATLASSIAN_API_TOKEN — Common Atlassian API token
 *   JIRA_URL            — Jira-specific URL (overrides ATLASSIAN_URL)
 *   JIRA_EMAIL          — Jira-specific email (overrides ATLASSIAN_EMAIL)
 *   JIRA_API_TOKEN      — Jira-specific token (overrides ATLASSIAN_API_TOKEN)
 *   JIRA_PROJECT_KEY    — Optional project key scope (e.g. "PROJ")
 *   IGNORE_TLS_ERRORS   — Shared TLS override flag ("true" / "1")
 */
export function loadJiraConfig(env: Record<string, string | undefined> = process.env): JiraConfig {
  // Priority: JIRA_* > ATLASSIAN_* > CONFLUENCE_* (legacy fallback)
  const baseUrl = env.JIRA_URL ?? env.ATLASSIAN_URL ?? env.CONFLUENCE_URL;
  const email = env.JIRA_EMAIL ?? env.ATLASSIAN_EMAIL ?? env.CONFLUENCE_EMAIL;
  const apiToken = env.JIRA_API_TOKEN ?? env.ATLASSIAN_API_TOKEN ?? env.CONFLUENCE_API_TOKEN;
  const ignoreTlsErrorsRaw = env.IGNORE_TLS_ERRORS;
  const projectKey = env.JIRA_PROJECT_KEY?.trim() || undefined;

  const missing: string[] = [];

  if (!baseUrl) missing.push("JIRA_URL or ATLASSIAN_URL");
  if (!email) missing.push("JIRA_EMAIL or ATLASSIAN_EMAIL");
  if (!apiToken) missing.push("JIRA_API_TOKEN or ATLASSIAN_API_TOKEN");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables for Jira: ${missing.join(", ")}`
    );
  }

  const ignoreTlsErrors =
    ignoreTlsErrorsRaw?.toLowerCase() === "true" ||
    ignoreTlsErrorsRaw === "1";

  return {
    baseUrl: baseUrl!.replace(/\/+$/, ""),
    email: email!,
    apiToken: apiToken!,
    ignoreTlsErrors,
    projectKey,
  };
}
