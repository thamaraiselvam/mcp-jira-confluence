import { loadConfig, loadJiraConfig } from "./config.js";
import { createConfluenceClient, createJiraClient } from "./client.js";
import { searchConfluence } from "./confluence.js";
import { AxiosInstance, AxiosError } from "axios";

function maskToken(token: string): string {
  if (token.length <= 8) return "****";
  return token.slice(0, 4) + "****" + token.slice(-4);
}

function elapsed(start: number): string {
  return `${(Date.now() - start)}ms`;
}

function separator(): void {
  console.log("─".repeat(60));
}

async function validateAuthentication(client: AxiosInstance): Promise<boolean> {
  const endpoint = "/wiki/rest/api/user/current";

  separator();
  console.log("📡 Step 1: Validate Authentication");
  console.log(`   → GET ${endpoint}`);

  const start = Date.now();

  try {
    const response = await client.get(endpoint);
    const userData = response.data;

    console.log(`   ← ${response.status} ${response.statusText} (${elapsed(start)})`);
    console.log(`   Response body keys: [${Object.keys(userData).join(", ")}]`);
    console.log(`   User: ${userData.displayName ?? "N/A"}`);
    console.log(`   Email: ${userData.email ?? "N/A"}`);
    console.log(`   Account ID: ${userData.accountId ?? userData.userKey ?? "N/A"}`);
    console.log(`   Account Type: ${userData.type ?? "N/A"}`);
    console.log(`   ✅ Authentication successful`);
    return true;
  } catch (error: unknown) {
    const axiosErr = error as AxiosError;
    const status = axiosErr?.response?.status;
    const statusText = axiosErr?.response?.statusText ?? "Unknown";
    const responseData = axiosErr?.response?.data;

    console.log(`   ← ${status ?? "NO RESPONSE"} ${statusText} (${elapsed(start)})`);

    if (responseData) {
      console.log(`   Response body: ${JSON.stringify(responseData, null, 2).split("\n").join("\n   ")}`);
    }

    if (status === 401) {
      console.log(`   ❌ Authentication failed: Invalid email or API token (401 Unauthorized)`);
    } else if (status === 403) {
      console.log(`   ❌ Authentication failed: Access denied (403 Forbidden)`);
    } else if (axiosErr.code === "ECONNREFUSED") {
      console.log(`   ❌ Connection refused — is the Confluence URL correct?`);
    } else if (axiosErr.code === "ENOTFOUND") {
      console.log(`   ❌ DNS lookup failed — hostname not found`);
    } else if (axiosErr.code === "ETIMEDOUT" || axiosErr.code === "ECONNABORTED") {
      console.log(`   ❌ Request timed out`);
    } else {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`   ❌ Authentication check failed: ${message}`);
    }

    return false;
  }
}

async function validateReadAccess(client: AxiosInstance): Promise<boolean> {
  const endpoint = "/wiki/rest/api/space";

  separator();
  console.log("📡 Step 2: Validate Read/Search Access");
  console.log(`   → GET ${endpoint}?limit=5`);

  const start = Date.now();

  try {
    const response = await client.get(endpoint, { params: { limit: 5 } });
    const data = response.data;
    const spaces = data.results ?? [];

    console.log(`   ← ${response.status} ${response.statusText} (${elapsed(start)})`);
    console.log(`   Total spaces visible: ${data.size ?? spaces.length}`);

    if (spaces.length > 0) {
      console.log(`   Accessible spaces (up to 5):`);
      for (const space of spaces) {
        console.log(`     • ${space.name} (key: ${space.key}, type: ${space.type ?? "N/A"})`);
      }
    } else {
      console.log(`   ⚠️  No spaces returned — token may have very limited access`);
    }

    console.log(`   ✅ Read/Search access confirmed`);
    return true;
  } catch (error: unknown) {
    const axiosErr = error as AxiosError;
    const status = axiosErr?.response?.status;
    const statusText = axiosErr?.response?.statusText ?? "Unknown";
    const responseData = axiosErr?.response?.data;

    console.log(`   ← ${status ?? "NO RESPONSE"} ${statusText} (${elapsed(start)})`);

    if (responseData) {
      console.log(`   Response body: ${JSON.stringify(responseData, null, 2).split("\n").join("\n   ")}`);
    }

    const message = error instanceof Error ? error.message : String(error);
    console.log(`   ❌ Read access check failed: ${message}`);
    return false;
  }
}

async function validateSearchAccess(client: AxiosInstance, spaceKey?: string): Promise<boolean> {
  const baseCql = "type=page";
  const cql = spaceKey ? `space="${spaceKey}" AND ${baseCql}` : baseCql;
  const endpoint = "/wiki/rest/api/content/search";

  separator();
  console.log("📡 Step 3: Validate Search (CQL) Access");
  if (spaceKey) {
    console.log(`   Space key: ${spaceKey}`);
  }
  console.log(`   → GET ${endpoint}?cql=${encodeURIComponent(cql)}&limit=1`);

  const start = Date.now();

  try {
    const response = await client.get(endpoint, {
      params: { cql, limit: 1 },
    });
    const data = response.data;
    const results = data.results ?? [];

    console.log(`   ← ${response.status} ${response.statusText} (${elapsed(start)})`);
    console.log(`   CQL query: "${cql}"`);
    console.log(`   Total results matched: ${data.totalSize ?? "N/A"}`);

    if (results.length > 0) {
      const page = results[0];
      console.log(`   Sample result: "${page.title}" (id: ${page.id})`);
    } else {
      console.log(`   ⚠️  No pages returned — the instance may be empty or access is limited`);
    }

    console.log(`   ✅ Search access confirmed`);
    return true;
  } catch (error: unknown) {
    const axiosErr = error as AxiosError;
    const status = axiosErr?.response?.status;
    const statusText = axiosErr?.response?.statusText ?? "Unknown";
    const responseData = axiosErr?.response?.data;

    console.log(`   ← ${status ?? "NO RESPONSE"} ${statusText} (${elapsed(start)})`);

    if (responseData) {
      console.log(`   Response body: ${JSON.stringify(responseData, null, 2).split("\n").join("\n   ")}`);
    }

    const message = error instanceof Error ? error.message : String(error);
    console.log(`   ❌ Search access check failed: ${message}`);
    return false;
  }
}

async function validateWriteAccess(
  client: AxiosInstance,
  pageId: string
): Promise<boolean> {
  const endpoint = `/wiki/rest/api/content/${pageId}`;

  separator();
  console.log(`📡 Step 4: Validate Write/Update Access (page: ${pageId})`);
  console.log(`   → GET ${endpoint}?expand=version,space,body.storage`);

  const start = Date.now();

  try {
    const response = await client.get(endpoint, {
      params: { expand: "version,space,body.storage" },
    });
    const data = response.data;

    console.log(`   ← ${response.status} ${response.statusText} (${elapsed(start)})`);
    console.log(`   Page title: "${data.title}"`);
    console.log(`   Space: ${data.space?.name ?? "N/A"} (${data.space?.key ?? "N/A"})`);
    console.log(`   Current version: ${data.version?.number ?? "N/A"}`);
    console.log(`   Last updated by: ${data.version?.by?.displayName ?? "N/A"}`);
    console.log(`   Last updated at: ${data.version?.when ?? "N/A"}`);

    const bodyLength = data.body?.storage?.value?.length ?? 0;
    console.log(`   Body size: ${bodyLength} characters`);

    const version = data.version?.number;
    if (typeof version === "number") {
      console.log(`   ✅ Write/Update access confirmed — page is readable and version (${version}) is available for update`);
      return true;
    } else {
      console.log(`   ❌ Page exists but version info is unavailable — cannot safely update`);
      return false;
    }
  } catch (error: unknown) {
    const axiosErr = error as AxiosError;
    const status = axiosErr?.response?.status;
    const statusText = axiosErr?.response?.statusText ?? "Unknown";
    const responseData = axiosErr?.response?.data;

    console.log(`   ← ${status ?? "NO RESPONSE"} ${statusText} (${elapsed(start)})`);

    if (responseData) {
      console.log(`   Response body: ${JSON.stringify(responseData, null, 2).split("\n").join("\n   ")}`);
    }

    if (status === 404) {
      console.log(`   ❌ Page ${pageId} not found (404)`);
    } else if (status === 403) {
      console.log(`   ❌ No permission to access page ${pageId} (403 Forbidden)`);
    } else {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`   ❌ Write access check failed: ${message}`);
    }

    return false;
  }
}

function printSearchResults(
  client: AxiosInstance,
  results: any[],
  isSiteSearch: boolean
): void {
  console.log(`\n   📄 Search Results:`);
  console.log(`   ${"─".repeat(50)}`);
  for (let i = 0; i < results.length; i++) {
    const item = isSiteSearch ? results[i] : results[i];
    const page = isSiteSearch ? item.content ?? item : item;
    const baseUrl = client.defaults.baseURL ?? "";

    const title = page.title ?? item.title ?? "N/A";
    const id = page.id ?? item.id ?? "N/A";
    const spaceName = page.space?.name ?? item.resultGlobalContainer?.title ?? "N/A";
    const spaceKeyVal = page.space?.key ?? "N/A";
    const version = page.version?.number ?? "N/A";
    const webui = page._links?.webui ?? item.url ?? "";
    const webUrl = webui ? `${baseUrl}${webui.startsWith("/wiki") ? "" : "/wiki"}${webui}` : "N/A";
    const excerpt = item.excerpt ?? item.bodyTextHighlights ?? "";

    console.log(`   [${i + 1}] "${title}"`);
    console.log(`       ID:      ${id}`);
    console.log(`       Space:   ${spaceName} (${spaceKeyVal})`);
    console.log(`       Version: ${version}`);
    console.log(`       URL:     ${webUrl}`);
    if (excerpt) {
      const cleanExcerpt = String(excerpt).replace(/<[^>]*>/g, "").substring(0, 200);
      if (cleanExcerpt.trim().length > 0) {
        console.log(`       Excerpt: ${cleanExcerpt}...`);
      }
    }
    if (i < results.length - 1) {
      console.log(`   `);
    }
  }
  console.log(`   ${"─".repeat(50)}`);
}

interface SearchAttempt {
  name: string;
  endpoint: string;
  params: Record<string, any>;
  isSiteSearch: boolean;
}

async function validateKeywordSearch(
  client: AxiosInstance,
  keyword: string,
  spaceKey?: string
): Promise<boolean> {
  separator();
  console.log(`📡 Step 5: Keyword Search — "${keyword}"`);
  if (spaceKey) {
    console.log(`   Space key: ${spaceKey}`);
  }

  // Define multiple search strategies to try
  const attempts: SearchAttempt[] = [
    {
      name: "Strategy A: /rest/api/search with siteSearch CQL",
      endpoint: "/wiki/rest/api/search",
      params: {
        cql: spaceKey
          ? `siteSearch ~ "${keyword}" AND space = "${spaceKey}"`
          : `siteSearch ~ "${keyword}"`,
        limit: 10,
      },
      isSiteSearch: true,
    },
    {
      name: "Strategy B: /rest/api/search with type=page AND text~ CQL",
      endpoint: "/wiki/rest/api/search",
      params: {
        cql: spaceKey
          ? `type=page AND text ~ "${keyword}" AND space = "${spaceKey}"`
          : `type=page AND text ~ "${keyword}"`,
        limit: 10,
      },
      isSiteSearch: true,
    },
    {
      name: "Strategy C: /rest/api/content/search with text~ CQL",
      endpoint: "/wiki/rest/api/content/search",
      params: {
        cql: spaceKey
          ? `space="${spaceKey}" AND type=page AND text~"${keyword}"`
          : `type=page AND text~"${keyword}"`,
        limit: 10,
        expand: "version,space",
      },
      isSiteSearch: false,
    },
    {
      name: "Strategy D: /rest/api/search with title~ CQL",
      endpoint: "/wiki/rest/api/search",
      params: {
        cql: spaceKey
          ? `type=page AND title ~ "${keyword}" AND space = "${spaceKey}"`
          : `type=page AND title ~ "${keyword}"`,
        limit: 10,
      },
      isSiteSearch: true,
    },
    {
      name: "Strategy E: /rest/api/content/search with title~ CQL",
      endpoint: "/wiki/rest/api/content/search",
      params: {
        cql: spaceKey
          ? `space="${spaceKey}" AND type=page AND title~"${keyword}"`
          : `type=page AND title~"${keyword}"`,
        limit: 10,
        expand: "version,space",
      },
      isSiteSearch: false,
    },
  ];

  let anySucceeded = false;

  for (const attempt of attempts) {
    console.log(`\n   🔎 ${attempt.name}`);
    console.log(`   → GET ${attempt.endpoint}?cql=${encodeURIComponent(attempt.params.cql)}&limit=${attempt.params.limit}`);

    const start = Date.now();

    try {
      const response = await client.get(attempt.endpoint, {
        params: attempt.params,
      });
      const data = response.data;
      const results = data.results ?? [];

      console.log(`   ← ${response.status} ${response.statusText} (${elapsed(start)})`);
      console.log(`   CQL: "${attempt.params.cql}"`);
      console.log(`   Total matched: ${data.totalSize ?? data.size ?? "N/A"}`);
      console.log(`   Returned: ${results.length}`);

      if (results.length > 0) {
        printSearchResults(client, results, attempt.isSiteSearch);
        console.log(`   ✅ ${attempt.name} — returned ${results.length} result(s)`);
        anySucceeded = true;
        // Found results, no need to try more strategies
        break;
      } else {
        console.log(`   ⚠️  No results from this strategy`);
      }
    } catch (error: unknown) {
      const axiosErr = error as AxiosError;
      const status = axiosErr?.response?.status;
      const statusText = axiosErr?.response?.statusText ?? "Unknown";
      const responseData = axiosErr?.response?.data;

      console.log(`   ← ${status ?? "NO RESPONSE"} ${statusText} (${elapsed(start)})`);

      if (responseData) {
        const body = typeof responseData === "string"
          ? responseData.substring(0, 300)
          : JSON.stringify(responseData, null, 2).substring(0, 300);
        console.log(`   Response: ${body.split("\n").join("\n   ")}`);
      }

      const message = error instanceof Error ? error.message : String(error);
      console.log(`   ⚠️  ${attempt.name} failed: ${message}`);
    }
  }

  if (!anySucceeded) {
    console.log(`\n   ❌ All search strategies returned no results for "${keyword}"`);
    console.log(`   Possible causes:`);
    console.log(`   • The API token doesn't have access to the space containing the page`);
    console.log(`   • The search index may not include this content for the API user`);
    if (spaceKey) {
      console.log(`   • The page may not be in space "${spaceKey}"`);
    }
    console.log(`   • Try the browser search to compare: ${client.defaults.baseURL}/wiki/search?text=${encodeURIComponent(keyword)}`);
  }

  return anySucceeded;
}

async function validateJiraAuthentication(client: AxiosInstance): Promise<boolean> {
  const endpoint = "/rest/api/3/myself";

  separator();
  console.log("📡 Jira Step 1: Validate Authentication");
  console.log(`   → GET ${endpoint}`);

  const start = Date.now();

  try {
    const response = await client.get(endpoint);
    const userData = response.data;

    console.log(`   ← ${response.status} ${response.statusText} (${elapsed(start)})`);
    console.log(`   Response body keys: [${Object.keys(userData).join(", ")}]`);
    console.log(`   User: ${userData.displayName ?? "N/A"}`);
    console.log(`   Email: ${userData.emailAddress ?? "N/A"}`);
    console.log(`   Account ID: ${userData.accountId ?? "N/A"}`);
    console.log(`   Account Type: ${userData.accountType ?? "N/A"}`);
    console.log(`   ✅ Jira authentication successful`);
    return true;
  } catch (error: unknown) {
    const axiosErr = error as AxiosError;
    const status = axiosErr?.response?.status;
    const statusText = axiosErr?.response?.statusText ?? "Unknown";
    const responseData = axiosErr?.response?.data;

    console.log(`   ← ${status ?? "NO RESPONSE"} ${statusText} (${elapsed(start)})`);

    if (responseData) {
      console.log(`   Response body: ${JSON.stringify(responseData, null, 2).split("\n").join("\n   ")}`);
    }

    if (status === 401) {
      console.log(`   ❌ Jira authentication failed: Invalid email or API token (401 Unauthorized)`);
    } else if (status === 403) {
      console.log(`   ❌ Jira authentication failed: Access denied (403 Forbidden)`);
    } else if (axiosErr.code === "ECONNREFUSED") {
      console.log(`   ❌ Connection refused — is the Jira URL correct?`);
    } else if (axiosErr.code === "ENOTFOUND") {
      console.log(`   ❌ DNS lookup failed — hostname not found`);
    } else if (axiosErr.code === "ETIMEDOUT" || axiosErr.code === "ECONNABORTED") {
      console.log(`   ❌ Request timed out`);
    } else {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`   ❌ Jira authentication check failed: ${message}`);
    }

    return false;
  }
}

async function validateJiraProjects(client: AxiosInstance): Promise<boolean> {
  const endpoint = "/rest/api/3/project/search";

  separator();
  console.log("📡 Jira Step 2: Validate Project Access");
  console.log(`   → GET ${endpoint}?maxResults=10`);

  const start = Date.now();

  try {
    const response = await client.get(endpoint, { params: { maxResults: 10 } });
    const data = response.data;
    const projects = data.values ?? [];

    console.log(`   ← ${response.status} ${response.statusText} (${elapsed(start)})`);
    console.log(`   Total projects visible: ${data.total ?? projects.length}`);

    if (projects.length > 0) {
      console.log(`   Accessible projects (up to 10):`);
      for (const project of projects) {
        console.log(`     • ${project.name} (key: ${project.key}, type: ${project.projectTypeKey ?? "N/A"})`);
      }
    } else {
      console.log(`   ⚠️  No projects returned — token may have very limited access`);
    }

    console.log(`   ✅ Project access confirmed`);
    return true;
  } catch (error: unknown) {
    const axiosErr = error as AxiosError;
    const status = axiosErr?.response?.status;
    const statusText = axiosErr?.response?.statusText ?? "Unknown";
    const responseData = axiosErr?.response?.data;

    console.log(`   ← ${status ?? "NO RESPONSE"} ${statusText} (${elapsed(start)})`);

    if (responseData) {
      console.log(`   Response body: ${JSON.stringify(responseData, null, 2).split("\n").join("\n   ")}`);
    }

    const message = error instanceof Error ? error.message : String(error);
    console.log(`   ❌ Project access check failed: ${message}`);
    return false;
  }
}

async function validateJiraSearch(client: AxiosInstance, projectKey?: string): Promise<boolean> {
  const baseJql = "ORDER BY updated DESC";
  const jql = projectKey 
    ? `project="${projectKey}" ${baseJql}` 
    : `updated >= -30d ${baseJql}`;
  const endpoint = "/rest/api/3/search/jql";

  separator();
  console.log("📡 Jira Step 3: Validate Search (JQL) Access");
  if (projectKey) {
    console.log(`   Project key: ${projectKey}`);
  }
  console.log(`   → GET ${endpoint}?jql=${encodeURIComponent(jql)}`);

  const start = Date.now();

  try {
    const response = await client.get(endpoint, {
      params: {
        jql,
        maxResults: 5,
        fields: "summary,status,issuetype,created",
      },
    });
    const data = response.data;
    const issues = data.issues ?? [];

    console.log(`   ← ${response.status} ${response.statusText} (${elapsed(start)})`);
    console.log(`   JQL query: "${jql}"`);
    console.log(`   Total results matched: ${data.total ?? "N/A"}`);

    if (issues.length > 0) {
      console.log(`   Sample issues (up to 5):`);
      for (const issue of issues) {
        console.log(`     • ${issue.key}: ${issue.fields?.summary ?? "N/A"} (${issue.fields?.status?.name ?? "N/A"})`);
      }
    } else {
      console.log(`   ⚠️  No issues returned — the project may be empty or access is limited`);
    }

    console.log(`   ✅ Jira search access confirmed`);
    return true;
  } catch (error: unknown) {
    const axiosErr = error as AxiosError;
    const status = axiosErr?.response?.status;
    const statusText = axiosErr?.response?.statusText ?? "Unknown";
    const responseData = axiosErr?.response?.data;

    console.log(`   ← ${status ?? "NO RESPONSE"} ${statusText} (${elapsed(start)})`);

    if (responseData) {
      console.log(`   Response body: ${JSON.stringify(responseData, null, 2).split("\n").join("\n   ")}`);
    }

    const message = error instanceof Error ? error.message : String(error);
    console.log(`   ❌ Jira search access check failed: ${message}`);
    return false;
  }
}

async function validateJiraIssueAccess(
  client: AxiosInstance,
  issueKey: string
): Promise<boolean> {
  const endpoint = `/rest/api/3/issue/${issueKey}`;

  separator();
  console.log(`📡 Jira Step 4: Validate Issue Read Access (issue: ${issueKey})`);
  console.log(`   → GET ${endpoint}`);

  const start = Date.now();

  try {
    const response = await client.get(endpoint);
    const data = response.data;

    console.log(`   ← ${response.status} ${response.statusText} (${elapsed(start)})`);
    console.log(`   Issue key: ${data.key}`);
    console.log(`   Summary: "${data.fields?.summary ?? "N/A"}"`);
    console.log(`   Status: ${data.fields?.status?.name ?? "N/A"}`);
    console.log(`   Issue Type: ${data.fields?.issuetype?.name ?? "N/A"}`);
    console.log(`   Project: ${data.fields?.project?.name ?? "N/A"} (${data.fields?.project?.key ?? "N/A"})`);
    console.log(`   Assignee: ${data.fields?.assignee?.displayName ?? "Unassigned"}`);
    console.log(`   ✅ Issue read access confirmed`);
    return true;
  } catch (error: unknown) {
    const axiosErr = error as AxiosError;
    const status = axiosErr?.response?.status;
    const statusText = axiosErr?.response?.statusText ?? "Unknown";
    const responseData = axiosErr?.response?.data;

    console.log(`   ← ${status ?? "NO RESPONSE"} ${statusText} (${elapsed(start)})`);

    if (responseData) {
      console.log(`   Response body: ${JSON.stringify(responseData, null, 2).split("\n").join("\n   ")}`);
    }

    if (status === 404) {
      console.log(`   ❌ Issue ${issueKey} not found (404)`);
    } else if (status === 403) {
      console.log(`   ❌ No permission to access issue ${issueKey} (403 Forbidden)`);
    } else {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`   ❌ Issue access check failed: ${message}`);
    }

    return false;
  }
}

async function main(): Promise<void> {
  const totalStart = Date.now();

  console.log("");
  console.log("🔍 MCP Jira & Confluence — Token Permission Validator");
  console.log("   Validates both Confluence and Jira connections");
  separator();

  // Load Confluence config
  console.log("📋 Confluence Configuration:");

  let config;
  try {
    config = loadConfig();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`   ❌ ${message}`);
    console.log(`\n   Set the required Confluence environment variables and try again.`);
    process.exit(1);
  }

  console.log(`   Base URL:        ${config.baseUrl}`);
  console.log(`   Email:           ${config.email}`);
  console.log(`   API Token:       ${maskToken(config.apiToken)}`);
  console.log(`   Ignore TLS:      ${config.ignoreTlsErrors}`);
  console.log(`   Space Key:       ${config.spaceKey ?? "(not set — searches all accessible spaces)"}`);

  const client = createConfluenceClient(config);

  // Load Jira config
  separator();
  console.log("📋 Jira Configuration:");

  let jiraConfig;
  let jiraClient;
  let skipJira = false;

  try {
    jiraConfig = loadJiraConfig();
    console.log(`   Base URL:        ${jiraConfig.baseUrl}`);
    console.log(`   Email:           ${jiraConfig.email}`);
    console.log(`   API Token:       ${maskToken(jiraConfig.apiToken)}`);
    console.log(`   Ignore TLS:      ${jiraConfig.ignoreTlsErrors}`);
    console.log(`   Project Key:     ${jiraConfig.projectKey ?? "(not set — searches all accessible projects)"}`);
    jiraClient = createJiraClient(jiraConfig);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`   ⚠️  ${message}`);
    console.log(`   Jira validation will be skipped.`);
    skipJira = true;
  }

  const pageId = process.argv[2] || undefined;
  const issueKey = process.argv[3] || undefined;

  if (pageId) {
    console.log(`   Confluence write check page: ${pageId}`);
  }
  if (issueKey) {
    console.log(`   Jira issue check: ${issueKey}`);
  }

  // ========== CONFLUENCE CHECKS ==========
  console.log("\n");
  console.log("════════════════════════════════════════════════════════════");
  console.log("  CONFLUENCE VALIDATION");
  console.log("════════════════════════════════════════════════════════════");

  const authOk = await validateAuthentication(client);

  if (!authOk) {
    separator();
    console.log("\n⛔ Confluence authentication failed — skipping remaining Confluence checks.\n");
    console.log("   Common causes:");
    console.log("   • Incorrect CONFLUENCE_EMAIL");
    console.log("   • Invalid or expired CONFLUENCE_API_TOKEN");
    console.log("   • Wrong CONFLUENCE_URL (should be the base Atlassian URL, e.g. https://mysite.atlassian.net)");
    console.log("");
  }

  const readOk = authOk ? await validateReadAccess(client) : false;
  const searchOk = authOk ? await validateSearchAccess(client, config.spaceKey) : false;

  // Step 5: Keyword search for "test"
  const keywordSearchOk = authOk ? await validateKeywordSearch(client, "test", config.spaceKey) : false;

  let writeOk: boolean | null = null;
  if (pageId && authOk) {
    writeOk = await validateWriteAccess(client, pageId);
  }

  // ========== JIRA CHECKS ==========
  let jiraAuthOk: boolean | null = null;
  let jiraProjectsOk: boolean | null = null;
  let jiraSearchOk: boolean | null = null;
  let jiraIssueOk: boolean | null = null;

  if (!skipJira && jiraClient && jiraConfig) {
    console.log("\n");
    console.log("════════════════════════════════════════════════════════════");
    console.log("  JIRA VALIDATION");
    console.log("════════════════════════════════════════════════════════════");

    jiraAuthOk = await validateJiraAuthentication(jiraClient);

    if (!jiraAuthOk) {
      separator();
      console.log("\n⛔ Jira authentication failed — skipping remaining Jira checks.\n");
      console.log("   Common causes:");
      console.log("   • Incorrect JIRA_EMAIL (or CONFLUENCE_EMAIL if using fallback)");
      console.log("   • Invalid or expired JIRA_API_TOKEN (or CONFLUENCE_API_TOKEN if using fallback)");
      console.log("   • Wrong JIRA_URL (should be the base Atlassian URL, e.g. https://mysite.atlassian.net)");
      console.log("");
    } else {
      jiraProjectsOk = await validateJiraProjects(jiraClient);
      jiraSearchOk = await validateJiraSearch(jiraClient, jiraConfig.projectKey);

      if (issueKey) {
        jiraIssueOk = await validateJiraIssueAccess(jiraClient, issueKey);
      }
    }
  }

  // ========== SUMMARY ==========
  console.log("\n");
  console.log("════════════════════════════════════════════════════════════");
  console.log("  SUMMARY");
  console.log("════════════════════════════════════════════════════════════");
  separator();
  console.log("\n📊 Confluence Results:");
  console.log(`   Authentication:    ${authOk ? "✅ Passed" : "❌ Failed"}`);
  console.log(`   Read Access:       ${readOk ? "✅ Passed" : "❌ Failed"}`);
  console.log(`   Search Access:     ${searchOk ? "✅ Passed" : "❌ Failed"}`);
  console.log(`   Keyword Search:    ${keywordSearchOk ? "✅ Passed" : "❌ Failed"} (keyword: "test")`);

  if (pageId) {
    console.log(`   Write Access:      ${writeOk ? "✅ Passed" : "❌ Failed"} (page: ${pageId})`);
  } else {
    console.log(`   Write Access:      ⏭️  Skipped (pass a page ID as 1st arg, e.g. npm run validate -- 123456)`);
  }

  console.log("\n📊 Jira Results:");
  if (skipJira) {
    console.log(`   ⏭️  Jira validation skipped (missing Jira configuration)`);
  } else {
    console.log(`   Authentication:    ${jiraAuthOk ? "✅ Passed" : jiraAuthOk === null ? "⏭️  Skipped" : "❌ Failed"}`);
    console.log(`   Project Access:    ${jiraProjectsOk ? "✅ Passed" : jiraProjectsOk === null ? "⏭️  Skipped" : "❌ Failed"}`);
    console.log(`   Search Access:     ${jiraSearchOk ? "✅ Passed" : jiraSearchOk === null ? "⏭️  Skipped" : "❌ Failed"}`);
    
    if (issueKey) {
      console.log(`   Issue Access:      ${jiraIssueOk ? "✅ Passed" : jiraIssueOk === null ? "⏭️  Skipped" : "❌ Failed"} (issue: ${issueKey})`);
    } else {
      console.log(`   Issue Access:      ⏭️  Skipped (pass an issue key as 2nd arg, e.g. npm run validate -- 123456 PROJ-123)`);
    }
  }

  console.log(`\n   Total time: ${elapsed(totalStart)}`);

  const confluencePassed = authOk && readOk && searchOk && keywordSearchOk && (writeOk === null || writeOk === true);
  const jiraPassed = skipJira || (jiraAuthOk && jiraProjectsOk && jiraSearchOk && (jiraIssueOk === null || jiraIssueOk === true));
  const allPassed = confluencePassed && jiraPassed;

  if (allPassed) {
    console.log("\n🎉 All permission checks passed.\n");
    process.exit(0);
  } else {
    if (!confluencePassed) {
      console.log("\n💥 Confluence permission checks failed.\n");
    }
    if (!jiraPassed) {
      console.log("\n💥 Jira permission checks failed.\n");
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error during validation:", error.message ?? error);
  process.exit(1);
});