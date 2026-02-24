import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  ListToolsResultSchema,
  CallToolResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { registerTools } from "../../src/tools.js";
import * as confluenceModule from "../../src/confluence.js";
import * as jiraModule from "../../src/jira.js";
import type { ConfluenceConfig, JiraConfig } from "../../src/config.js";
import type { AxiosInstance } from "axios";

// ---------------------------------------------------------------------------
// Mock the confluence module — we never hit real Confluence in these tests
// ---------------------------------------------------------------------------
vi.mock("../../src/confluence.js", () => ({
  searchConfluence: vi.fn(),
  getConfluencePage: vi.fn(),
  createConfluencePage: vi.fn(),
  updateConfluencePage: vi.fn(),
  addConfluenceComment: vi.fn(),
  getConfluencePageVersions: vi.fn(),
  checkPermissions: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock the jira module — we never hit real Jira in these tests
// ---------------------------------------------------------------------------
vi.mock("../../src/jira.js", () => ({
  searchJira: vi.fn(),
  getJiraIssue: vi.fn(),
  createJiraIssue: vi.fn(),
  updateJiraIssue: vi.fn(),
  transitionJiraIssue: vi.fn(),
  getJiraIssueTransitions: vi.fn(),
}));

const mockedSearch = vi.mocked(confluenceModule.searchConfluence);
const mockedGetPage = vi.mocked(confluenceModule.getConfluencePage);
const mockedUpdate = vi.mocked(confluenceModule.updateConfluencePage);
const mockedCheckPermissions = vi.mocked(confluenceModule.checkPermissions);

const mockedJiraSearch = vi.mocked(jiraModule.searchJira);
const mockedJiraGetIssue = vi.mocked(jiraModule.getJiraIssue);
const mockedJiraCreate = vi.mocked(jiraModule.createJiraIssue);
const mockedJiraUpdate = vi.mocked(jiraModule.updateJiraIssue);
const mockedJiraTransition = vi.mocked(jiraModule.transitionJiraIssue);
const mockedJiraGetTransitions = vi.mocked(jiraModule.getJiraIssueTransitions);

// ---------------------------------------------------------------------------
// Helper: minimal mock AxiosInstance
// ---------------------------------------------------------------------------
function createMockClient(): AxiosInstance {
  return {
    defaults: {
      baseURL: "https://integration-test.atlassian.net",
      headers: {} as any,
    },
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
    head: vi.fn(),
    options: vi.fn(),
    request: vi.fn(),
  } as unknown as AxiosInstance;
}

function createMockConfig(overrides: Partial<ConfluenceConfig> = {}): ConfluenceConfig {
  return {
    baseUrl: "https://integration-test.atlassian.net",
    email: "test@example.com",
    apiToken: "test-token",
    ignoreTlsErrors: false,
    spaceKey: undefined,
    ...overrides,
  };
}

function createMockJiraConfig(overrides: Partial<JiraConfig> = {}): JiraConfig {
  return {
    baseUrl: "https://integration-test.atlassian.net",
    email: "test@example.com",
    apiToken: "test-token",
    ignoreTlsErrors: false,
    projectKey: undefined,
    ...overrides,
  };
}

// ===========================================================================
// Integration tests — full Client ↔ Server via InMemoryTransport
// ===========================================================================
describe("integration — MCP Client ↔ Server", () => {
  let server: Server;
  let client: Client;
  let axiosClient: AxiosInstance;

  beforeEach(async () => {
    vi.clearAllMocks();

    // 1. Create the MCP server
    server = new Server(
      { name: "mcp-jira-confluence", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );

    // 2. Wire up tools with mock axios clients (Confluence + Jira)
    axiosClient = createMockClient();
    const jiraClient = createMockClient();
    registerTools(server, axiosClient, createMockConfig(), jiraClient, createMockJiraConfig());

    // 3. Create the MCP client
    client = new Client(
      { name: "integration-test-client", version: "1.0.0" },
      { capabilities: {} }
    );

    // 4. Connect via in-memory transport
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  // =========================================================================
  // tools/list
  // =========================================================================
  describe("tools/list", () => {
    it("returns the tool list through the full MCP protocol", async () => {
      const result = await client.request(
        { method: "tools/list", params: {} },
        ListToolsResultSchema
      );

      expect(result.tools).toBeDefined();
      expect(Array.isArray(result.tools)).toBe(true);
    });

    it("exposes exactly thirteen tools", async () => {
      const result = await client.request(
        { method: "tools/list", params: {} },
        ListToolsResultSchema
      );

      expect(result.tools).toHaveLength(13);
    });

    it("exposes search_confluence with the correct schema", async () => {
      const result = await client.request(
        { method: "tools/list", params: {} },
        ListToolsResultSchema
      );

      const searchTool = result.tools.find((t) => t.name === "search_confluence");
      expect(searchTool).toBeDefined();
      expect(searchTool!.description).toBeTruthy();
      expect(searchTool!.inputSchema).toBeDefined();
      expect(searchTool!.inputSchema.type).toBe("object");
      expect(searchTool!.inputSchema.properties).toHaveProperty("cql");
      expect(searchTool!.inputSchema.properties).toHaveProperty("limit");
      expect(searchTool!.inputSchema.required).toContain("cql");
    });

    it("exposes update_confluence_page with the correct schema", async () => {
      const result = await client.request(
        { method: "tools/list", params: {} },
        ListToolsResultSchema
      );

      const updateTool = result.tools.find((t) => t.name === "update_confluence_page");
      expect(updateTool).toBeDefined();
      expect(updateTool!.description).toBeTruthy();
      expect(updateTool!.inputSchema).toBeDefined();
      expect(updateTool!.inputSchema.type).toBe("object");
      expect(updateTool!.inputSchema.properties).toHaveProperty("pageId");
      expect(updateTool!.inputSchema.properties).toHaveProperty("title");
      expect(updateTool!.inputSchema.properties).toHaveProperty("markdownContent");
      expect(updateTool!.inputSchema.required).toEqual(
        expect.arrayContaining(["pageId", "title", "markdownContent"])
      );
    });

    it("exposes check_confluence_permissions with the correct schema", async () => {
      const result = await client.request(
        { method: "tools/list", params: {} },
        ListToolsResultSchema
      );

      const permTool = result.tools.find((t) => t.name === "check_confluence_permissions");
      expect(permTool).toBeDefined();
      expect(permTool!.description).toBeTruthy();
      expect(permTool!.inputSchema).toBeDefined();
      expect(permTool!.inputSchema.type).toBe("object");
      expect(permTool!.inputSchema.properties).toHaveProperty("pageId");
      expect(permTool!.inputSchema.required).toEqual([]);
    });

    it("exposes get_confluence_page with the correct schema", async () => {
      const result = await client.request(
        { method: "tools/list", params: {} },
        ListToolsResultSchema
      );

      const getTool = result.tools.find((t) => t.name === "get_confluence_page");
      expect(getTool).toBeDefined();
      expect(getTool!.description).toBeTruthy();
      expect(getTool!.inputSchema).toBeDefined();
      expect(getTool!.inputSchema.type).toBe("object");
      expect(getTool!.inputSchema.properties).toHaveProperty("pageId");
      expect(getTool!.inputSchema.required).toContain("pageId");
    });

    it("does NOT expose delete tools", async () => {
      const result = await client.request(
        { method: "tools/list", params: {} },
        ListToolsResultSchema
      );

      const names = result.tools.map((t) => t.name);
      expect(names).not.toContain("delete_confluence_page");
      expect(names).not.toContain("delete_jira_issue");
    });

    it("exposes all Jira tools", async () => {
      const result = await client.request(
        { method: "tools/list", params: {} },
        ListToolsResultSchema
      );

      const names = result.tools.map((t) => t.name);
      expect(names).toContain("jira_search");
      expect(names).toContain("jira_get_issue");
      expect(names).toContain("jira_create_issue");
      expect(names).toContain("jira_update_issue");
      expect(names).toContain("jira_transition_issue");
      expect(names).toContain("jira_get_transitions");
    });
  });

  // =========================================================================
  // tools/call — search_confluence (success)
  // =========================================================================
  describe("tools/call — search_confluence (success)", () => {
    it("returns search results through the full MCP protocol", async () => {
      mockedSearch.mockResolvedValue({
        results: [
          {
            id: "10001",
            title: "Architecture Overview",
            url: "https://integration-test.atlassian.net/wiki/spaces/ENG/pages/10001",
          },
          {
            id: "10002",
            title: "API Reference",
            url: "https://integration-test.atlassian.net/wiki/spaces/ENG/pages/10002",
          },
        ],
        totalSize: 2,
      });

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "search_confluence",
            arguments: { cql: 'type=page AND space="ENG"', limit: 10 },
          },
        },
        CallToolResultSchema
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");

      const parsed = JSON.parse((result.content[0] as { type: "text"; text: string }).text);
      expect(parsed.results).toHaveLength(2);
      expect(parsed.results[0].id).toBe("10001");
      expect(parsed.results[0].title).toBe("Architecture Overview");
      expect(parsed.results[1].id).toBe("10002");
      expect(parsed.totalSize).toBe(2);
    });

    it("passes cql and limit correctly to the underlying function", async () => {
      mockedSearch.mockResolvedValue({ results: [], totalSize: 0 });

      await client.request(
        {
          method: "tools/call",
          params: {
            name: "search_confluence",
            arguments: { cql: "type=blogpost", limit: 50 },
          },
        },
        CallToolResultSchema
      );

      expect(mockedSearch).toHaveBeenCalledOnce();
      expect(mockedSearch).toHaveBeenCalledWith(axiosClient, "type=blogpost", 50, undefined);
    });

    it("defaults limit to 25 when omitted", async () => {
      mockedSearch.mockResolvedValue({ results: [], totalSize: 0 });

      await client.request(
        {
          method: "tools/call",
          params: {
            name: "search_confluence",
            arguments: { cql: "type=page" },
          },
        },
        CallToolResultSchema
      );

      expect(mockedSearch).toHaveBeenCalledWith(axiosClient, "type=page", 25, undefined);
    });

    it("returns empty results for a query with no matches", async () => {
      mockedSearch.mockResolvedValue({ results: [], totalSize: 0 });

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "search_confluence",
            arguments: { cql: 'type=page AND title="nonexistent-xyz"' },
          },
        },
        CallToolResultSchema
      );

      const parsed = JSON.parse((result.content[0] as { type: "text"; text: string }).text);
      expect(parsed.results).toEqual([]);
      expect(parsed.totalSize).toBe(0);
    });
  });

  // =========================================================================
  // tools/call — search_confluence (error)
  // =========================================================================
  describe("tools/call — search_confluence (error)", () => {
    it("returns isError=true when the search function throws", async () => {
      mockedSearch.mockRejectedValue(new Error("CQL query string must not be empty"));

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "search_confluence",
            arguments: { cql: "" },
          },
        },
        CallToolResultSchema
      );

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);

      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("Error searching Confluence");
      expect(text).toContain("CQL query string must not be empty");
    });

    it("returns isError=true when a network error occurs", async () => {
      mockedSearch.mockRejectedValue(new Error("Network Error: ECONNREFUSED"));

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "search_confluence",
            arguments: { cql: "type=page" },
          },
        },
        CallToolResultSchema
      );

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("ECONNREFUSED");
    });

    it("returns isError=true for authentication failures", async () => {
      mockedSearch.mockRejectedValue(new Error("Request failed with status code 401"));

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "search_confluence",
            arguments: { cql: "type=page" },
          },
        },
        CallToolResultSchema
      );

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("401");
    });
  });

  // =========================================================================
  // tools/call — update_confluence_page (success)
  // =========================================================================
  describe("tools/call — update_confluence_page (success)", () => {
    it("returns a success response through the full MCP protocol", async () => {
      mockedUpdate.mockResolvedValue({
        id: "20001",
        title: "Release Notes v2.0",
        version: 5,
        url: "https://integration-test.atlassian.net/wiki/spaces/REL/pages/20001",
      });

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "update_confluence_page",
            arguments: {
              pageId: "20001",
              title: "Release Notes v2.0",
              markdownContent: "# Release Notes\n\n- Feature X\n- Bug fix Y",
            },
          },
        },
        CallToolResultSchema
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");

      const parsed = JSON.parse((result.content[0] as { type: "text"; text: string }).text);
      expect(parsed.message).toContain("Release Notes v2.0");
      expect(parsed.message).toContain("updated successfully");
      expect(parsed.message).toContain("version 5");
      expect(parsed.id).toBe("20001");
      expect(parsed.title).toBe("Release Notes v2.0");
      expect(parsed.version).toBe(5);
      expect(parsed.url).toContain("20001");
    });

    it("passes all arguments correctly to the underlying function", async () => {
      mockedUpdate.mockResolvedValue({
        id: "30001",
        title: "New Title",
        version: 3,
        url: "https://integration-test.atlassian.net/wiki/pages/30001",
      });

      await client.request(
        {
          method: "tools/call",
          params: {
            name: "update_confluence_page",
            arguments: {
              pageId: "30001",
              title: "New Title",
              markdownContent: "## Updated Content\n\nParagraph here.",
            },
          },
        },
        CallToolResultSchema
      );

      expect(mockedUpdate).toHaveBeenCalledOnce();
      expect(mockedUpdate).toHaveBeenCalledWith(
        axiosClient,
        "30001",
        "New Title",
        "## Updated Content\n\nParagraph here.",
        undefined  // spaceKey from config (not set in createMockConfig default)
      );
    });

    it("does not set isError on a successful update", async () => {
      mockedUpdate.mockResolvedValue({
        id: "1",
        title: "T",
        version: 2,
        url: "https://x.com",
      });

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "update_confluence_page",
            arguments: {
              pageId: "1",
              title: "T",
              markdownContent: "c",
            },
          },
        },
        CallToolResultSchema
      );

      expect(result.isError).toBeUndefined();
    });
  });

  // =========================================================================
  // tools/call — update_confluence_page (error)
  // =========================================================================
  describe("tools/call — update_confluence_page (error)", () => {
    it("returns isError=true when the update function throws", async () => {
      mockedUpdate.mockRejectedValue(new Error("Page ID must not be empty"));

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "update_confluence_page",
            arguments: {
              pageId: "",
              title: "Foo",
              markdownContent: "bar",
            },
          },
        },
        CallToolResultSchema
      );

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("Error updating Confluence page");
      expect(text).toContain("Page ID must not be empty");
    });

    it("returns isError=true when a version conflict occurs", async () => {
      mockedUpdate.mockRejectedValue(
        new Error("Request failed with status code 409: Version conflict")
      );

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "update_confluence_page",
            arguments: {
              pageId: "12345",
              title: "Conflicting Page",
              markdownContent: "# Retry this",
            },
          },
        },
        CallToolResultSchema
      );

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("409");
      expect(text).toContain("Version conflict");
    });

    it("returns isError=true when the page is not found", async () => {
      mockedUpdate.mockRejectedValue(
        new Error("Request failed with status code 404")
      );

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "update_confluence_page",
            arguments: {
              pageId: "99999",
              title: "Ghost Page",
              markdownContent: "# Does not exist",
            },
          },
        },
        CallToolResultSchema
      );

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("404");
    });

    it("returns isError=true when unable to determine version", async () => {
      mockedUpdate.mockRejectedValue(
        new Error("Unable to determine current version for page 55555")
      );

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "update_confluence_page",
            arguments: {
              pageId: "55555",
              title: "Bad Version",
              markdownContent: "# Broken",
            },
          },
        },
        CallToolResultSchema
      );

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("Unable to determine current version");
      expect(text).toContain("55555");
    });
  });

  // =========================================================================
  // tools/call — unknown tool
  // =========================================================================
  describe("tools/call — unknown tool", () => {
    it("returns isError=true for an unrecognized tool name", async () => {
      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "delete_confluence_page",
            arguments: { pageId: "12345" },
          },
        },
        CallToolResultSchema
      );

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("Unknown tool");
      expect(text).toContain("delete_confluence_page");
    });

    it("does not invoke search, getPage, update, or checkPermissions for unknown tools", async () => {
      await client.request(
        {
          method: "tools/call",
          params: {
            name: "create_confluence_page",
            arguments: { title: "New" },
          },
        },
        CallToolResultSchema
      );

      expect(mockedSearch).not.toHaveBeenCalled();
      expect(mockedGetPage).not.toHaveBeenCalled();
      expect(mockedUpdate).not.toHaveBeenCalled();
      expect(mockedCheckPermissions).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // tools/call — get_confluence_page (success)
  // =========================================================================
  describe("tools/call — get_confluence_page (success)", () => {
    it("returns page content through the full MCP protocol", async () => {
      mockedGetPage.mockResolvedValue({
        id: "12345",
        title: "Architecture Overview",
        spaceKey: "ENG",
        version: 5,
        url: "https://integration-test.atlassian.net/wiki/spaces/ENG/pages/12345/Architecture+Overview",
        content: "<h1>Architecture</h1><p>Details here.</p>",
      });

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "get_confluence_page",
            arguments: { pageId: "12345" },
          },
        },
        CallToolResultSchema
      );

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");

      const parsed = JSON.parse((result.content[0] as { type: "text"; text: string }).text);
      expect(parsed.id).toBe("12345");
      expect(parsed.title).toBe("Architecture Overview");
      expect(parsed.spaceKey).toBe("ENG");
      expect(parsed.version).toBe(5);
      expect(parsed.content).toBe("<h1>Architecture</h1><p>Details here.</p>");
    });

    it("passes pageId correctly to the underlying function", async () => {
      mockedGetPage.mockResolvedValue({
        id: "99999",
        title: "Test Page",
        spaceKey: "TEST",
        version: 2,
        url: "https://integration-test.atlassian.net/wiki/spaces/TEST/pages/99999/Test+Page",
        content: "<p>Test content.</p>",
      });

      await client.request(
        {
          method: "tools/call",
          params: {
            name: "get_confluence_page",
            arguments: { pageId: "99999" },
          },
        },
        CallToolResultSchema
      );

      expect(mockedGetPage).toHaveBeenCalledWith(
        expect.anything(),
        "99999",
        undefined
      );
    });

    it("does not set isError on a successful read", async () => {
      mockedGetPage.mockResolvedValue({
        id: "12345",
        title: "Test Page",
        spaceKey: "ENG",
        version: 1,
        url: "https://integration-test.atlassian.net/wiki/spaces/ENG/pages/12345/Test+Page",
        content: "<p>Hi</p>",
      });

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "get_confluence_page",
            arguments: { pageId: "12345" },
          },
        },
        CallToolResultSchema
      );

      expect(result.isError).toBeFalsy();
    });
  });

  // =========================================================================
  // tools/call — get_confluence_page (error)
  // =========================================================================
  describe("tools/call — get_confluence_page (error)", () => {
    it("returns isError=true when the page is not found", async () => {
      mockedGetPage.mockRejectedValue(new Error("Request failed with status code 404"));

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "get_confluence_page",
            arguments: { pageId: "00000" },
          },
        },
        CallToolResultSchema
      );

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("Error reading Confluence page");
      expect(text).toContain("404");
    });

    it("returns isError=true when the space-guard rejects the read", async () => {
      mockedGetPage.mockRejectedValue(
        new Error('Page 12345 belongs to space "OTHER" but this server is scoped to space "ENG". Read rejected.')
      );

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "get_confluence_page",
            arguments: { pageId: "12345" },
          },
        },
        CallToolResultSchema
      );

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("Error reading Confluence page");
      expect(text).toContain("Read rejected");
    });

    it("returns isError=true when a network error occurs", async () => {
      mockedGetPage.mockRejectedValue(new Error("Network Error"));

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "get_confluence_page",
            arguments: { pageId: "12345" },
          },
        },
        CallToolResultSchema
      );

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("Network Error");
    });
  });

  // =========================================================================
  // tools/call — check_confluence_permissions (success)
  // =========================================================================
  describe("tools/call — check_confluence_permissions (success)", () => {
    it("returns a full permissions report through the MCP protocol", async () => {
      mockedCheckPermissions.mockResolvedValue({
        authenticated: true,
        user: { displayName: "Alice Smith", email: "alice@example.com", accountId: "acc-001" },
        readAccess: true,
        accessibleSpaces: [
          { key: "ENG", name: "Engineering" },
          { key: "OPS", name: "Operations" },
        ],
        writeAccess: true,
        writeCheckPageId: "10001",
        errors: [],
      });

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "check_confluence_permissions",
            arguments: { pageId: "10001" },
          },
        },
        CallToolResultSchema
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");

      const parsed = JSON.parse((result.content[0] as { type: "text"; text: string }).text);
      expect(parsed.summary).toContain("✅ Authentication: Valid");
      expect(parsed.summary).toContain("Alice Smith");
      expect(parsed.summary).toContain("✅ Read Access: Confirmed");
      expect(parsed.summary).toContain("Engineering (ENG)");
      expect(parsed.summary).toContain("Operations (OPS)");
      expect(parsed.summary).toContain("✅ Write Access: Confirmed for page 10001");
      expect(parsed.authenticated).toBe(true);
      expect(parsed.readAccess).toBe(true);
      expect(parsed.writeAccess).toBe(true);
      expect(parsed.accessibleSpaces).toHaveLength(2);
    });

    it("passes pageId to the underlying function when provided", async () => {
      mockedCheckPermissions.mockResolvedValue({
        authenticated: true,
        user: { displayName: "U", email: "u@e.com", accountId: "a" },
        readAccess: true,
        accessibleSpaces: [],
        writeAccess: true,
        writeCheckPageId: "55555",
        errors: [],
      });

      await client.request(
        {
          method: "tools/call",
          params: {
            name: "check_confluence_permissions",
            arguments: { pageId: "55555" },
          },
        },
        CallToolResultSchema
      );

      expect(mockedCheckPermissions).toHaveBeenCalledOnce();
      expect(mockedCheckPermissions).toHaveBeenCalledWith(axiosClient, "55555");
    });

    it("passes undefined pageId when omitted", async () => {
      mockedCheckPermissions.mockResolvedValue({
        authenticated: true,
        user: { displayName: "U", email: "u@e.com", accountId: "a" },
        readAccess: true,
        accessibleSpaces: [],
        writeAccess: null,
        writeCheckPageId: null,
        errors: [],
      });

      await client.request(
        {
          method: "tools/call",
          params: {
            name: "check_confluence_permissions",
            arguments: {},
          },
        },
        CallToolResultSchema
      );

      expect(mockedCheckPermissions).toHaveBeenCalledWith(axiosClient, undefined);
    });

    it("does not set isError on a successful check", async () => {
      mockedCheckPermissions.mockResolvedValue({
        authenticated: true,
        user: { displayName: "U", email: "u@e.com", accountId: "a" },
        readAccess: true,
        accessibleSpaces: [],
        writeAccess: null,
        writeCheckPageId: null,
        errors: [],
      });

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "check_confluence_permissions",
            arguments: {},
          },
        },
        CallToolResultSchema
      );

      expect(result.isError).toBeUndefined();
    });

    it("shows write access not checked when no pageId provided", async () => {
      mockedCheckPermissions.mockResolvedValue({
        authenticated: true,
        user: { displayName: "U", email: "u@e.com", accountId: "a" },
        readAccess: true,
        accessibleSpaces: [],
        writeAccess: null,
        writeCheckPageId: null,
        errors: [],
      });

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "check_confluence_permissions",
            arguments: {},
          },
        },
        CallToolResultSchema
      );

      const parsed = JSON.parse((result.content[0] as { type: "text"; text: string }).text);
      expect(parsed.summary).toContain("ℹ️ Write Access: Not checked (no pageId provided)");
    });
  });

  // =========================================================================
  // tools/call — check_confluence_permissions (failure scenarios)
  // =========================================================================
  describe("tools/call — check_confluence_permissions (failure scenarios)", () => {
    it("returns failed auth summary when authentication fails", async () => {
      mockedCheckPermissions.mockResolvedValue({
        authenticated: false,
        user: null,
        readAccess: false,
        accessibleSpaces: [],
        writeAccess: null,
        writeCheckPageId: null,
        errors: ["Authentication failed: Invalid email or API token (401 Unauthorized)"],
      });

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "check_confluence_permissions",
            arguments: {},
          },
        },
        CallToolResultSchema
      );

      const parsed = JSON.parse((result.content[0] as { type: "text"; text: string }).text);
      expect(parsed.summary).toContain("❌ Authentication: Failed");
      expect(parsed.summary).toContain("❌ Read Access: Not confirmed");
      expect(parsed.summary).toContain("⚠️ Errors:");
      expect(parsed.summary).toContain("401 Unauthorized");
      expect(parsed.authenticated).toBe(false);
    });

    it("returns write access denied for a specific page", async () => {
      mockedCheckPermissions.mockResolvedValue({
        authenticated: true,
        user: { displayName: "Bob", email: "bob@e.com", accountId: "b" },
        readAccess: true,
        accessibleSpaces: [{ key: "DEV", name: "Development" }],
        writeAccess: false,
        writeCheckPageId: "99999",
        errors: ["Write access check failed: No permission to access page 99999 (403 Forbidden)"],
      });

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "check_confluence_permissions",
            arguments: { pageId: "99999" },
          },
        },
        CallToolResultSchema
      );

      const parsed = JSON.parse((result.content[0] as { type: "text"; text: string }).text);
      expect(parsed.summary).toContain("✅ Authentication: Valid");
      expect(parsed.summary).toContain("✅ Read Access: Confirmed");
      expect(parsed.summary).toContain("❌ Write Access: Not confirmed for page 99999");
      expect(parsed.summary).toContain("⚠️ Errors:");
      expect(parsed.writeAccess).toBe(false);
    });

    it("returns isError=true when checkPermissions throws unexpectedly", async () => {
      mockedCheckPermissions.mockRejectedValue(new Error("Unexpected catastrophic failure"));

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "check_confluence_permissions",
            arguments: {},
          },
        },
        CallToolResultSchema
      );

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("Error checking permissions");
      expect(text).toContain("Unexpected catastrophic failure");
    });
  });

  // =========================================================================
  // End-to-end workflow: list → search → update
  // =========================================================================
  describe("end-to-end workflow: list → search → update", () => {
    it("completes a full discover → search → update workflow", async () => {
      // Step 1: Discover available tools
      const listResult = await client.request(
        { method: "tools/list", params: {} },
        ListToolsResultSchema
      );

      expect(listResult.tools).toHaveLength(13);
      const toolNames = listResult.tools.map((t) => t.name);
      expect(toolNames).toContain("search_confluence");
      expect(toolNames).toContain("get_confluence_page");
      expect(toolNames).toContain("update_confluence_page");
      expect(toolNames).toContain("check_confluence_permissions");

      // Step 2: Search for a page
      mockedSearch.mockResolvedValue({
        results: [
          {
            id: "77777",
            title: "Deployment Guide",
            url: "https://integration-test.atlassian.net/wiki/spaces/OPS/pages/77777",
          },
        ],
        totalSize: 1,
      });

      const searchResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "search_confluence",
            arguments: { cql: 'type=page AND title="Deployment Guide"' },
          },
        },
        CallToolResultSchema
      );

      const searchParsed = JSON.parse(
        (searchResult.content[0] as { type: "text"; text: string }).text
      );
      expect(searchParsed.results).toHaveLength(1);
      const foundPageId = searchParsed.results[0].id;
      expect(foundPageId).toBe("77777");

      // Step 3: Update the page found in the search
      mockedUpdate.mockResolvedValue({
        id: foundPageId,
        title: "Deployment Guide (Updated)",
        version: 12,
        url: "https://integration-test.atlassian.net/wiki/spaces/OPS/pages/77777",
      });

      const updateResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "update_confluence_page",
            arguments: {
              pageId: foundPageId,
              title: "Deployment Guide (Updated)",
              markdownContent:
                "# Deployment Guide\n\n## Prerequisites\n\n- Docker\n- Kubernetes\n\n## Steps\n\n1. Pull the image\n2. Deploy to cluster",
            },
          },
        },
        CallToolResultSchema
      );

      const updateParsed = JSON.parse(
        (updateResult.content[0] as { type: "text"; text: string }).text
      );
      expect(updateParsed.message).toContain("Deployment Guide (Updated)");
      expect(updateParsed.message).toContain("updated successfully");
      expect(updateParsed.message).toContain("version 12");
      expect(updateParsed.id).toBe("77777");
      expect(updateParsed.version).toBe(12);

      // Verify the update function was called with the correct page ID from search
      expect(mockedUpdate).toHaveBeenCalledWith(
        axiosClient,
        "77777",
        "Deployment Guide (Updated)",
        expect.stringContaining("# Deployment Guide"),
        undefined  // spaceKey from config (not set in createMockConfig default)
      );
    });
  });

  // =========================================================================
  // Multiple sequential operations
  // =========================================================================
  describe("multiple sequential operations", () => {
    it("handles multiple search calls in sequence", async () => {
      mockedSearch
        .mockResolvedValueOnce({
          results: [{ id: "1", title: "First", url: "https://x.com/1" }],
          totalSize: 1,
        })
        .mockResolvedValueOnce({
          results: [
            { id: "2", title: "Second", url: "https://x.com/2" },
            { id: "3", title: "Third", url: "https://x.com/3" },
          ],
          totalSize: 2,
        });

      const first = await client.request(
        {
          method: "tools/call",
          params: {
            name: "search_confluence",
            arguments: { cql: "type=page AND space=A" },
          },
        },
        CallToolResultSchema
      );

      const second = await client.request(
        {
          method: "tools/call",
          params: {
            name: "search_confluence",
            arguments: { cql: "type=page AND space=B" },
          },
        },
        CallToolResultSchema
      );

      const firstParsed = JSON.parse(
        (first.content[0] as { type: "text"; text: string }).text
      );
      const secondParsed = JSON.parse(
        (second.content[0] as { type: "text"; text: string }).text
      );

      expect(firstParsed.results).toHaveLength(1);
      expect(secondParsed.results).toHaveLength(2);
      expect(mockedSearch).toHaveBeenCalledTimes(2);
    });

    it("handles multiple update calls in sequence", async () => {
      mockedUpdate
        .mockResolvedValueOnce({
          id: "100",
          title: "Page A",
          version: 3,
          url: "https://x.com/100",
        })
        .mockResolvedValueOnce({
          id: "200",
          title: "Page B",
          version: 7,
          url: "https://x.com/200",
        });

      const firstUpdate = await client.request(
        {
          method: "tools/call",
          params: {
            name: "update_confluence_page",
            arguments: {
              pageId: "100",
              title: "Page A",
              markdownContent: "# A",
            },
          },
        },
        CallToolResultSchema
      );

      const secondUpdate = await client.request(
        {
          method: "tools/call",
          params: {
            name: "update_confluence_page",
            arguments: {
              pageId: "200",
              title: "Page B",
              markdownContent: "# B",
            },
          },
        },
        CallToolResultSchema
      );

      const firstParsed = JSON.parse(
        (firstUpdate.content[0] as { type: "text"; text: string }).text
      );
      const secondParsed = JSON.parse(
        (secondUpdate.content[0] as { type: "text"; text: string }).text
      );

      expect(firstParsed.version).toBe(3);
      expect(secondParsed.version).toBe(7);
      expect(mockedUpdate).toHaveBeenCalledTimes(2);
    });

    it("continues working after an error in a previous call", async () => {
      // First call fails
      mockedSearch.mockRejectedValueOnce(new Error("Temporary failure"));

      const failedResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "search_confluence",
            arguments: { cql: "type=page" },
          },
        },
        CallToolResultSchema
      );

      expect(failedResult.isError).toBe(true);

      // Second call succeeds — server should still be healthy
      mockedSearch.mockResolvedValueOnce({
        results: [{ id: "42", title: "Recovery", url: "https://x.com/42" }],
        totalSize: 1,
      });

      const successResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "search_confluence",
            arguments: { cql: "type=page" },
          },
        },
        CallToolResultSchema
      );

      expect(successResult.isError).toBeUndefined();
      const parsed = JSON.parse(
        (successResult.content[0] as { type: "text"; text: string }).text
      );
      expect(parsed.results[0].title).toBe("Recovery");
    });
  });

  // =========================================================================
  // Protocol-level behavior
  // =========================================================================
  describe("protocol-level behavior", () => {
    it("returns well-formed JSON in all success responses", async () => {
      mockedSearch.mockResolvedValue({ results: [], totalSize: 0 });

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "search_confluence",
            arguments: { cql: "type=page" },
          },
        },
        CallToolResultSchema
      );

      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(() => JSON.parse(text)).not.toThrow();
    });

    it("returns text/plain error messages (not JSON) for error responses", async () => {
      mockedSearch.mockRejectedValue(new Error("Something went wrong"));

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "search_confluence",
            arguments: { cql: "bad" },
          },
        },
        CallToolResultSchema
      );

      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toMatch(/^Error searching Confluence:/);
    });
  });
});