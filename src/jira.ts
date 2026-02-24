import { AxiosInstance, AxiosError } from "axios";
import { markdownToAdf } from "./jira-markdown.js";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface JiraIssue {
  id: string;
  key: string;
  summary: string;
  status: string;
  issueType: string;
  priority: string | null;
  assignee: string | null;
  reporter: string | null;
  description: string | null;
  labels: string[];
  project: { key: string; name: string };
  url: string;
  created: string;
  updated: string;
}

export interface JiraSearchResponse {
  issues: JiraIssue[];
  total: number;
  maxResults: number;
  startAt: number;
}

export interface CreateJiraIssueResponse {
  id: string;
  key: string;
  url: string;
}

export interface UpdateJiraIssueResponse {
  id: string;
  key: string;
  url: string;
}

export interface JiraTransition {
  id: string;
  name: string;
}

export interface TransitionJiraIssueResponse {
  issueKey: string;
  transitionId: string;
  transitionName: string;
  url: string;
}

export interface JiraIssueFields {
  summary?: string;
  description?: string;
  assignee?: string | null;
  priority?: string;
  labels?: string[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract a plain-text description from a Jira issue's description field.
 * Jira Cloud uses Atlassian Document Format (ADF), a nested JSON structure.
 * This helper walks the ADF tree and collects all text nodes.
 */
function extractTextFromAdf(node: unknown): string {
  if (!node || typeof node !== "object") return "";

  const n = node as Record<string, unknown>;

  // Leaf text node
  if (n.type === "text" && typeof n.text === "string") {
    return n.text;
  }

  // Recurse into content array
  if (Array.isArray(n.content)) {
    return (n.content as unknown[])
      .map(extractTextFromAdf)
      .filter(Boolean)
      .join(" ");
  }

  return "";
}

/**
 * Build an ADF (Atlassian Document Format) doc node from markdown text.
 * Used when creating/updating issue descriptions.
 * Now supports markdown syntax including headers, lists, bold, italic, code, etc.
 */
function buildAdfDocument(text: string): Record<string, unknown> {
  return markdownToAdf(text);
}

/**
 * Map a raw Jira issue object from the REST API to our clean JiraIssue shape.
 */
function mapIssue(
  raw: Record<string, unknown>,
  baseUrl: string
): JiraIssue {
  const fields = (raw.fields ?? {}) as Record<string, unknown>;

  const assigneeObj = fields.assignee as Record<string, unknown> | null;
  const reporterObj = fields.reporter as Record<string, unknown> | null;
  const statusObj = fields.status as Record<string, unknown> | null;
  const issueTypeObj = fields.issuetype as Record<string, unknown> | null;
  const priorityObj = fields.priority as Record<string, unknown> | null;
  const projectObj = fields.project as Record<string, unknown> | null;

  const descriptionRaw = fields.description;
  let description: string | null = null;
  if (typeof descriptionRaw === "string") {
    description = descriptionRaw;
  } else if (descriptionRaw !== null && descriptionRaw !== undefined) {
    const extracted = extractTextFromAdf(descriptionRaw);
    description = extracted.length > 0 ? extracted : null;
  }

  return {
    id: String(raw.id ?? ""),
    key: String(raw.key ?? ""),
    summary: typeof fields.summary === "string" ? fields.summary : "",
    status: typeof statusObj?.name === "string" ? statusObj.name : "Unknown",
    issueType:
      typeof issueTypeObj?.name === "string" ? issueTypeObj.name : "Unknown",
    priority:
      typeof priorityObj?.name === "string" ? priorityObj.name : null,
    assignee:
      typeof assigneeObj?.displayName === "string"
        ? assigneeObj.displayName
        : null,
    reporter:
      typeof reporterObj?.displayName === "string"
        ? reporterObj.displayName
        : null,
    description,
    labels: Array.isArray(fields.labels)
      ? (fields.labels as unknown[])
          .filter((l) => typeof l === "string")
          .map(String)
      : [],
    project: {
      key:
        typeof projectObj?.key === "string" ? projectObj.key : "Unknown",
      name:
        typeof projectObj?.name === "string" ? projectObj.name : "Unknown",
    },
    url: `${baseUrl}/browse/${raw.key}`,
    created: typeof fields.created === "string" ? fields.created : "",
    updated: typeof fields.updated === "string" ? fields.updated : "",
  };
}

// ---------------------------------------------------------------------------
// Public API functions
// ---------------------------------------------------------------------------

/**
 * Search Jira issues using a JQL query string.
 *
 * @param client       Axios instance configured for Jira.
 * @param jql          The JQL query to execute.
 * @param limit        Maximum number of results (1–100, default 25).
 * @param startAt      Pagination offset (default 0).
 * @param projectKey   Optional project key to auto-scope the JQL query.
 */
export async function searchJira(
  client: AxiosInstance,
  jql: string,
  limit: number = 25,
  startAt: number = 0,
  projectKey?: string
): Promise<JiraSearchResponse> {
  if (!jql || jql.trim().length === 0) {
    throw new Error("JQL query string must not be empty");
  }

  if (limit < 1 || limit > 100) {
    throw new Error("Limit must be between 1 and 100");
  }

  if (startAt < 0) {
    throw new Error("startAt must be 0 or greater");
  }

  // Auto-scope to configured project if projectKey is set and not already in the JQL
  let scopedJql = jql;
  if (projectKey && !/\bproject\s*=/i.test(jql)) {
    scopedJql = `project="${projectKey}" AND ${jql}`;
  }

  const response = await client.get("/rest/api/3/search/jql", {
    params: {
      jql: scopedJql,
      maxResults: limit,
      startAt,
      fields:
        "summary,status,issuetype,priority,assignee,reporter,description,labels,project,created,updated",
    },
  });

  const data = response.data as Record<string, unknown>;
  const baseUrl = client.defaults.baseURL ?? "";

  const rawIssues = Array.isArray(data.issues)
    ? (data.issues as Record<string, unknown>[])
    : [];

  const issues: JiraIssue[] = rawIssues.map((raw) => mapIssue(raw, baseUrl));

  return {
    issues,
    total: typeof data.total === "number" ? data.total : issues.length,
    maxResults:
      typeof data.maxResults === "number" ? data.maxResults : limit,
    startAt: typeof data.startAt === "number" ? data.startAt : startAt,
  };
}

/**
 * Get details of a single Jira issue by its key or numeric ID.
 *
 * @param client        Axios instance configured for Jira.
 * @param issueIdOrKey  Issue key (e.g. "PROJ-123") or numeric ID.
 */
export async function getJiraIssue(
  client: AxiosInstance,
  issueIdOrKey: string
): Promise<JiraIssue> {
  if (!issueIdOrKey || issueIdOrKey.trim().length === 0) {
    throw new Error("Issue ID or key must not be empty");
  }

  const response = await client.get(
    `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}`,
    {
      params: {
        fields:
          "summary,status,issuetype,priority,assignee,reporter,description,labels,project,created,updated",
      },
    }
  );

  const baseUrl = client.defaults.baseURL ?? "";
  return mapIssue(response.data as Record<string, unknown>, baseUrl);
}

/**
 * Create a new Jira issue.
 *
 * @param client               Axios instance configured for Jira.
 * @param projectKey           The project key to create the issue in (e.g. "PROJ").
 * @param issueType            Issue type name (e.g. "Story", "Bug", "Task").
 * @param summary              The issue summary / title.
 * @param description          Optional plain-text description.
 * @param assigneeAccountId    Optional Atlassian account ID of the assignee.
 * @param priority             Optional priority name (e.g. "High", "Medium").
 * @param labels               Optional list of labels.
 * @param configuredProjectKey Optional server-level project scope guard. If set,
 *                             creation in a different project is rejected.
 */
export async function createJiraIssue(
  client: AxiosInstance,
  projectKey: string,
  issueType: string,
  summary: string,
  description?: string,
  assigneeAccountId?: string,
  priority?: string,
  labels?: string[],
  configuredProjectKey?: string
): Promise<CreateJiraIssueResponse> {
  if (!projectKey || projectKey.trim().length === 0) {
    throw new Error("Project key must not be empty");
  }

  if (!issueType || issueType.trim().length === 0) {
    throw new Error("Issue type must not be empty");
  }

  if (!summary || summary.trim().length === 0) {
    throw new Error("Summary must not be empty");
  }

  // Project-scoping guard — reject creation outside the configured project
  if (configuredProjectKey && configuredProjectKey.trim().length > 0) {
    if (projectKey.trim().toUpperCase() !== configuredProjectKey.trim().toUpperCase()) {
      throw new Error(
        `Cannot create issue in project "${projectKey}" — this server is scoped to project "${configuredProjectKey}". Creation rejected.`
      );
    }
  }

  const fields: Record<string, unknown> = {
    project: { key: projectKey },
    issuetype: { name: issueType },
    summary,
  };

  if (description && description.trim().length > 0) {
    fields.description = buildAdfDocument(description);
  }

  if (assigneeAccountId && assigneeAccountId.trim().length > 0) {
    fields.assignee = { accountId: assigneeAccountId };
  }

  if (priority && priority.trim().length > 0) {
    fields.priority = { name: priority };
  }

  if (Array.isArray(labels) && labels.length > 0) {
    fields.labels = labels;
  }

  const response = await client.post("/rest/api/3/issue", { fields });

  const data = response.data as Record<string, unknown>;
  const baseUrl = client.defaults.baseURL ?? "";

  return {
    id: String(data.id ?? ""),
    key: String(data.key ?? ""),
    url: `${baseUrl}/browse/${data.key}`,
  };
}

/**
 * Update fields on an existing Jira issue.
 *
 * Accepts a flexible `fields` map — any Jira field name supported by the
 * REST API can be included. Well-known convenience fields are handled:
 *  - `summary`           → string
 *  - `description`       → plain text, auto-converted to ADF
 *  - `assignee`          → Atlassian account ID string (or null to unassign)
 *  - `priority`          → priority name string
 *  - `labels`            → string[]
 *
 * @param client        Axios instance configured for Jira.
 * @param issueIdOrKey  Issue key (e.g. "PROJ-123") or numeric ID.
 * @param fields        Map of fields to update.
 */
export async function updateJiraIssue(
  client: AxiosInstance,
  issueIdOrKey: string,
  fields: JiraIssueFields
): Promise<UpdateJiraIssueResponse> {
  if (!issueIdOrKey || issueIdOrKey.trim().length === 0) {
    throw new Error("Issue ID or key must not be empty");
  }

  if (!fields || Object.keys(fields).length === 0) {
    throw new Error("At least one field must be provided to update");
  }

  // Build the payload, converting convenience fields to their API shapes
  const apiFields: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fields)) {
    switch (key) {
      case "summary":
        if (typeof value === "string") {
          apiFields.summary = value;
        }
        break;

      case "description":
        if (value === null || value === undefined) {
          apiFields.description = null;
        } else if (typeof value === "string") {
          apiFields.description =
            value.trim().length > 0 ? buildAdfDocument(value) : null;
        } else {
          // Already ADF or another object — pass through
          apiFields.description = value;
        }
        break;

      case "assignee":
        if (value === null) {
          apiFields.assignee = null;
        } else if (typeof value === "string" && value.trim().length > 0) {
          apiFields.assignee = { accountId: value };
        }
        break;

      case "priority":
        if (typeof value === "string" && value.trim().length > 0) {
          apiFields.priority = { name: value };
        }
        break;

      case "labels":
        if (Array.isArray(value)) {
          apiFields.labels = value;
        }
        break;

      default:
        // Pass all other fields through unmodified
        apiFields[key] = value;
        break;
    }
  }

  await client.put(
    `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}`,
    { fields: apiFields }
  );

  // Jira returns 204 No Content on success, so we reconstruct the response
  const baseUrl = client.defaults.baseURL ?? "";

  return {
    id: issueIdOrKey,
    key: issueIdOrKey,
    url: `${baseUrl}/browse/${issueIdOrKey}`,
  };
}

/**
 * Transition a Jira issue to a new status.
 *
 * Accepts either a numeric transition ID (string) or a transition name
 * (case-insensitive). When a name is supplied the function first fetches the
 * available transitions for the issue and resolves the name to an ID.
 *
 * @param client           Axios instance configured for Jira.
 * @param issueIdOrKey     Issue key (e.g. "PROJ-123") or numeric ID.
 * @param transitionIdOrName  Numeric transition ID or transition name (e.g. "In Progress").
 */
export async function transitionJiraIssue(
  client: AxiosInstance,
  issueIdOrKey: string,
  transitionIdOrName: string
): Promise<TransitionJiraIssueResponse> {
  if (!issueIdOrKey || issueIdOrKey.trim().length === 0) {
    throw new Error("Issue ID or key must not be empty");
  }

  if (!transitionIdOrName || transitionIdOrName.trim().length === 0) {
    throw new Error("Transition ID or name must not be empty");
  }

  // Step 1: Fetch available transitions for the issue
  const transitionsResponse = await client.get(
    `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/transitions`
  );

  const transitionsData = transitionsResponse.data as Record<string, unknown>;
  const rawTransitions = Array.isArray(transitionsData.transitions)
    ? (transitionsData.transitions as Record<string, unknown>[])
    : [];

  const transitions: JiraTransition[] = rawTransitions.map((t) => ({
    id: String(t.id ?? ""),
    name: typeof t.name === "string" ? t.name : "",
  }));

  // Step 2: Resolve the transition ID
  // If the input looks like a numeric ID, try exact match first
  let resolvedTransition: JiraTransition | undefined;

  const isNumeric = /^\d+$/.test(transitionIdOrName.trim());

  if (isNumeric) {
    resolvedTransition = transitions.find(
      (t) => t.id === transitionIdOrName.trim()
    );
  }

  // Fall back to name matching (case-insensitive)
  if (!resolvedTransition) {
    const lowerInput = transitionIdOrName.trim().toLowerCase();
    resolvedTransition = transitions.find(
      (t) => t.name.toLowerCase() === lowerInput
    );
  }

  if (!resolvedTransition) {
    const available = transitions.map((t) => `"${t.name}" (id: ${t.id})`).join(", ");
    throw new Error(
      `Transition "${transitionIdOrName}" not found for issue ${issueIdOrKey}. ` +
        `Available transitions: ${available || "none"}`
    );
  }

  // Step 3: POST the transition
  await client.post(
    `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/transitions`,
    {
      transition: { id: resolvedTransition.id },
    }
  );

  const baseUrl = client.defaults.baseURL ?? "";

  return {
    issueKey: issueIdOrKey,
    transitionId: resolvedTransition.id,
    transitionName: resolvedTransition.name,
    url: `${baseUrl}/browse/${issueIdOrKey}`,
  };
}

/**
 * Fetch the list of available transitions for a given issue.
 * Useful for letting the AI client discover valid status names before calling
 * transitionJiraIssue.
 *
 * @param client        Axios instance configured for Jira.
 * @param issueIdOrKey  Issue key (e.g. "PROJ-123") or numeric ID.
 */
export async function getJiraIssueTransitions(
  client: AxiosInstance,
  issueIdOrKey: string
): Promise<JiraTransition[]> {
  if (!issueIdOrKey || issueIdOrKey.trim().length === 0) {
    throw new Error("Issue ID or key must not be empty");
  }

  const response = await client.get(
    `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/transitions`
  );

  const data = response.data as Record<string, unknown>;
  const rawTransitions = Array.isArray(data.transitions)
    ? (data.transitions as Record<string, unknown>[])
    : [];

  return rawTransitions.map((t) => ({
    id: String(t.id ?? ""),
    name: typeof t.name === "string" ? t.name : "",
  }));
}

// Re-export AxiosError so callers can distinguish HTTP errors if needed
export { AxiosError };