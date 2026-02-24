import { describe, it, expect, vi, beforeEach } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { registerTools } from "../../src/tools.js";
import * as confluenceModule from "../../src/confluence.js";
import * as jiraModule from "../../src/jira.js";
import type { ConfluenceConfig, JiraConfig } from "../../src/config.js";
import type { AxiosInstance } from "axios";

// ---------------------------------------------------------------------------
// Mock the confluence module so we can control search/update behavior
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
// Mock the jira module
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
const mockedAddComment = vi.mocked(confluenceModule.addConfluenceComment);
const mockedGetVersions = vi.mocked(confluenceModule.getConfluencePageVersions);
const mockedCheckPermissions = vi.mocked(confluenceModule.checkPermissions);

const mockedJiraSearch = vi.mocked(jiraModule.searchJira);
const mockedJiraGetIssue = vi.mocked(jiraModule.getJiraIssue);
const mockedJiraCreateIssue = vi.mocked(jiraModule.createJiraIssue);
const mockedJiraUpdateIssue = vi.mocked(jiraModule.updateJiraIssue);
const mockedJiraTransitionIssue = vi.mocked(jiraModule.transitionJiraIssue);
const mockedJiraGetTransitions = vi.mocked(jiraModule.getJiraIssueTransitions);

// ---------------------------------------------------------------------------
// Helper: build a mock AxiosInstance
// ---------------------------------------------------------------------------
function createMockClient(): AxiosInstance {
  return {
    defaults: {
      baseURL: "https://my-org.atlassian.net",
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
    baseUrl: "https://my-org.atlassian.net",
    email: "test@example.com",
    apiToken: "test-token",
    ignoreTlsErrors: false,
    projectKey: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper: capture registered request handlers from the MCP Server
// ---------------------------------------------------------------------------
// The Server.setRequestHandler() method registers handlers for specific
// schemas. We spy on it to capture the handlers so we can invoke them
// directly in our tests without needing a transport layer.
// ---------------------------------------------------------------------------
interface CapturedHandlers {
  listTools: (() => Promise<any>) | null;
  callTool: ((request: any) => Promise<any>) | null;
}

function setupServerAndCapture(): { server: Server; client: AxiosInstance; jiraClient: AxiosInstance; handlers: CapturedHandlers } {
  const server = new Server(
    { name: "test-server", version: "0.0.1" },
    { capabilities: { tools: {} } }
  );

  const handlers: CapturedHandlers = {
    listTools: null,
    callTool: null,
  };

  const originalSetRequestHandler = server.setRequestHandler.bind(server);
  let callCount = 0;

  vi.spyOn(server, "setRequestHandler").mockImplementation((schema: any, handler: any) => {
    // The first call is ListToolsRequestSchema, the second is CallToolRequestSchema
    // We detect by the call order since registerTools always registers them in order.
    callCount++;
    if (callCount === 1) {
      handlers.listTools = handler;
    } else if (callCount === 2) {
      handlers.callTool = handler;
    }
    // Still register on the real server
    return originalSetRequestHandler(schema, handler);
  });

  const client = createMockClient();
  const config = createMockConfig();
  const jiraClient = createMockClient();
  const jiraConfig = createMockJiraConfig();
  registerTools(server, client, config, jiraClient, jiraConfig);

  return { server, client, jiraClient, handlers };
}

// ===========================================================================
// Tests
// ===========================================================================
describe("tools — registerTools()", () => {
  let server: Server;
  let client: AxiosInstance;
  let jiraClient: AxiosInstance;
  let handlers: CapturedHandlers;

  beforeEach(() => {
    vi.clearAllMocks();
    const result = setupServerAndCapture();
    server = result.server;
    client = result.client;
    jiraClient = result.jiraClient;
    handlers = result.handlers;
  });

  // -------------------------------------------------------
  // Handler registration
  // -------------------------------------------------------
  describe("handler registration", () => {
    it("calls setRequestHandler exactly twice (ListTools + CallTool)", () => {
      expect(server.setRequestHandler).toHaveBeenCalledTimes(2);
    });

    it("registers a ListTools handler", () => {
      expect(handlers.listTools).toBeTypeOf("function");
    });

    it("registers a CallTool handler", () => {
      expect(handlers.callTool).toBeTypeOf("function");
    });
  });

  // -------------------------------------------------------
  // ListTools handler
  // -------------------------------------------------------
  describe("ListTools handler", () => {
    it("returns exactly thirteen tools", async () => {
      const result = await handlers.listTools!();
      expect(result.tools).toHaveLength(13);
    });

    it("returns search_confluence as the first tool", async () => {
      const result = await handlers.listTools!();
      expect(result.tools[0].name).toBe("search_confluence");
    });

    it("returns get_confluence_page as the second tool", async () => {
      const result = await handlers.listTools!();
      expect(result.tools[1].name).toBe("get_confluence_page");
    });

    it("returns update_confluence_page in the Confluence tools section", async () => {
      const result = await handlers.listTools!();
      const names = result.tools.map((t: any) => t.name);
      expect(names).toContain("update_confluence_page");
    });

    it("does NOT include any delete tools", async () => {
      const result = await handlers.listTools!();
      const names = result.tools.map((t: any) => t.name);

      expect(names).not.toContain("delete_confluence_page");
      expect(names).not.toContain("delete_jira_issue");
    });

    it("includes all expected Confluence tools", async () => {
      const result = await handlers.listTools!();
      const names = result.tools.map((t: any) => t.name);
      expect(names).toContain("search_confluence");
      expect(names).toContain("get_confluence_page");
      expect(names).toContain("create_confluence_page");
      expect(names).toContain("update_confluence_page");
      expect(names).toContain("add_confluence_comment");
      expect(names).toContain("get_confluence_page_versions");
      expect(names).toContain("check_confluence_permissions");
    });

    it("includes all expected Jira tools", async () => {
      const result = await handlers.listTools!();
      const names = result.tools.map((t: any) => t.name);
      expect(names).toContain("jira_search");
      expect(names).toContain("jira_get_issue");
      expect(names).toContain("jira_create_issue");
      expect(names).toContain("jira_update_issue");
      expect(names).toContain("jira_transition_issue");
      expect(names).toContain("jira_get_transitions");
    });

    it("returns check_confluence_permissions tool", async () => {
      const result = await handlers.listTools!();
      const names = result.tools.map((t: any) => t.name);
      expect(names).toContain("check_confluence_permissions");
    });

    // --- get_confluence_page schema ---
    describe("get_confluence_page tool definition", () => {
      it("has a description", async () => {
        const result = await handlers.listTools!();
        const tool = result.tools.find((t: any) => t.name === "get_confluence_page");
        expect(tool.description).toBeTruthy();
      });

      it("defines an inputSchema of type 'object'", async () => {
        const result = await handlers.listTools!();
        const schema = result.tools.find((t: any) => t.name === "get_confluence_page").inputSchema;
        expect(schema.type).toBe("object");
      });

      it("requires 'pageId' property", async () => {
        const result = await handlers.listTools!();
        const schema = result.tools.find((t: any) => t.name === "get_confluence_page").inputSchema;
        expect(schema.required).toEqual(["pageId"]);
      });

      it("defines 'pageId' as a string", async () => {
        const result = await handlers.listTools!();
        const schema = result.tools.find((t: any) => t.name === "get_confluence_page").inputSchema;
        expect(schema.properties.pageId.type).toBe("string");
      });

      it("has a description for pageId", async () => {
        const result = await handlers.listTools!();
        const schema = result.tools.find((t: any) => t.name === "get_confluence_page").inputSchema;
        expect(schema.properties.pageId.description).toBeTruthy();
      });
    });

    // --- check_confluence_permissions schema ---
    describe("check_confluence_permissions tool definition", () => {
      it("has a description", async () => {
        const result = await handlers.listTools!();
        const tool = result.tools.find((t: any) => t.name === "check_confluence_permissions");
        expect(tool.description).toBeTruthy();
        expect(typeof tool.description).toBe("string");
      });

      it("defines an inputSchema of type 'object'", async () => {
        const result = await handlers.listTools!();
        const schema = result.tools.find((t: any) => t.name === "check_confluence_permissions").inputSchema;
        expect(schema.type).toBe("object");
      });

      it("defines 'pageId' as an optional string", async () => {
        const result = await handlers.listTools!();
        const schema = result.tools.find((t: any) => t.name === "check_confluence_permissions").inputSchema;
        expect(schema.properties.pageId.type).toBe("string");
        expect(schema.required).not.toContain("pageId");
      });

      it("has no required properties", async () => {
        const result = await handlers.listTools!();
        const schema = result.tools.find((t: any) => t.name === "check_confluence_permissions").inputSchema;
        expect(schema.required).toEqual([]);
      });

      it("has a description for pageId", async () => {
        const result = await handlers.listTools!();
        const schema = result.tools.find((t: any) => t.name === "check_confluence_permissions").inputSchema;
        expect(schema.properties.pageId.description).toBeTruthy();
      });
    });

    // --- search_confluence schema ---
    describe("search_confluence tool definition", () => {
      it("has a description", async () => {
        const result = await handlers.listTools!();
        const tool = result.tools[0];
        expect(tool.description).toBeTruthy();
        expect(typeof tool.description).toBe("string");
      });

      it("defines an inputSchema of type 'object'", async () => {
        const result = await handlers.listTools!();
        const schema = result.tools[0].inputSchema;
        expect(schema.type).toBe("object");
      });

      it("requires 'cql' property", async () => {
        const result = await handlers.listTools!();
        const schema = result.tools[0].inputSchema;
        expect(schema.required).toContain("cql");
      });

      it("defines 'cql' as a string", async () => {
        const result = await handlers.listTools!();
        const schema = result.tools[0].inputSchema;
        expect(schema.properties.cql.type).toBe("string");
      });

      it("defines 'limit' as a number", async () => {
        const result = await handlers.listTools!();
        const schema = result.tools[0].inputSchema;
        expect(schema.properties.limit.type).toBe("number");
      });

      it("does not require 'limit'", async () => {
        const result = await handlers.listTools!();
        const schema = result.tools[0].inputSchema;
        expect(schema.required).not.toContain("limit");
      });

      it("has descriptions for cql and limit", async () => {
        const result = await handlers.listTools!();
        const schema = result.tools[0].inputSchema;
        expect(schema.properties.cql.description).toBeTruthy();
        expect(schema.properties.limit.description).toBeTruthy();
      });
    });

    // --- update_confluence_page schema ---
    describe("update_confluence_page tool definition", () => {
      it("has a description", async () => {
        const result = await handlers.listTools!();
        const tool = result.tools.find((t: any) => t.name === "update_confluence_page");
        expect(tool.description).toBeTruthy();
        expect(typeof tool.description).toBe("string");
      });

      it("defines an inputSchema of type 'object'", async () => {
        const result = await handlers.listTools!();
        const schema = result.tools.find((t: any) => t.name === "update_confluence_page").inputSchema;
        expect(schema.type).toBe("object");
      });

      it("requires 'pageId', 'title', and 'markdownContent'", async () => {
        const result = await handlers.listTools!();
        const schema = result.tools.find((t: any) => t.name === "update_confluence_page").inputSchema;
        expect(schema.required).toContain("pageId");
        expect(schema.required).toContain("title");
        expect(schema.required).toContain("markdownContent");
      });

      it("defines 'pageId' as a string", async () => {
        const result = await handlers.listTools!();
        const schema = result.tools.find((t: any) => t.name === "update_confluence_page").inputSchema;
        expect(schema.properties.pageId.type).toBe("string");
      });

      it("defines 'title' as a string", async () => {
        const result = await handlers.listTools!();
        const schema = result.tools.find((t: any) => t.name === "update_confluence_page").inputSchema;
        expect(schema.properties.title.type).toBe("string");
      });

      it("defines 'markdownContent' as a string", async () => {
        const result = await handlers.listTools!();
        const schema = result.tools.find((t: any) => t.name === "update_confluence_page").inputSchema;
        expect(schema.properties.markdownContent.type).toBe("string");
      });

      it("has descriptions for all three properties", async () => {
        const result = await handlers.listTools!();
        const schema = result.tools.find((t: any) => t.name === "update_confluence_page").inputSchema;
        expect(schema.properties.pageId.description).toBeTruthy();
        expect(schema.properties.title.description).toBeTruthy();
        expect(schema.properties.markdownContent.description).toBeTruthy();
      });
    });
  });

  // -------------------------------------------------------
  // CallTool handler — search_confluence
  // -------------------------------------------------------
  describe("CallTool handler — search_confluence", () => {
    it("calls searchConfluence with the client, cql, and limit", async () => {
      mockedSearch.mockResolvedValue({
        results: [],
        totalSize: 0,
      });

      await handlers.callTool!({
        params: {
          name: "search_confluence",
          arguments: { cql: "type=page", limit: 10 },
        },
      });

      expect(mockedSearch).toHaveBeenCalledOnce();
      expect(mockedSearch).toHaveBeenCalledWith(client, "type=page", 10, undefined);
    });

    it("defaults limit to 25 when not provided", async () => {
      mockedSearch.mockResolvedValue({
        results: [],
        totalSize: 0,
      });

      await handlers.callTool!({
        params: {
          name: "search_confluence",
          arguments: { cql: "type=page" },
        },
      });

      expect(mockedSearch).toHaveBeenCalledWith(client, "type=page", 25, undefined);
    });

    it("returns search results as JSON text content on success", async () => {
      mockedSearch.mockResolvedValue({
        results: [
          { id: "123", title: "Test Page", url: "https://example.com/wiki/page" },
        ],
        totalSize: 1,
      });

      const result = await handlers.callTool!({
        params: {
          name: "search_confluence",
          arguments: { cql: "type=page" },
        },
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results).toHaveLength(1);
      expect(parsed.results[0].id).toBe("123");
      expect(parsed.results[0].title).toBe("Test Page");
      expect(parsed.totalSize).toBe(1);
    });

    it("does not set isError on success", async () => {
      mockedSearch.mockResolvedValue({ results: [], totalSize: 0 });

      const result = await handlers.callTool!({
        params: {
          name: "search_confluence",
          arguments: { cql: "type=page" },
        },
      });

      expect(result.isError).toBeUndefined();
    });

    it("returns an error response when searchConfluence throws", async () => {
      mockedSearch.mockRejectedValue(new Error("CQL syntax error"));

      const result = await handlers.callTool!({
        params: {
          name: "search_confluence",
          arguments: { cql: "invalid!!!cql" },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("Error searching Confluence");
      expect(result.content[0].text).toContain("CQL syntax error");
    });

    it("handles non-Error thrown values gracefully", async () => {
      mockedSearch.mockRejectedValue("raw string error");

      const result = await handlers.callTool!({
        params: {
          name: "search_confluence",
          arguments: { cql: "type=page" },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("raw string error");
    });

    it("returns pretty-printed JSON (indented with 2 spaces)", async () => {
      mockedSearch.mockResolvedValue({
        results: [{ id: "1", title: "Page", url: "https://x.com" }],
        totalSize: 1,
      });

      const result = await handlers.callTool!({
        params: {
          name: "search_confluence",
          arguments: { cql: "type=page" },
        },
      });

      const text = result.content[0].text;
      // Pretty-printed JSON has newlines and indentation
      expect(text).toContain("\n");
      expect(text).toContain("  ");
    });
  });

  // -------------------------------------------------------
  // CallTool handler — update_confluence_page
  // -------------------------------------------------------
  describe("CallTool handler — update_confluence_page", () => {
    it("calls updateConfluencePage with the client, pageId, title, and markdownContent", async () => {
      mockedUpdate.mockResolvedValue({
        id: "12345",
        title: "My Page",
        version: 6,
        url: "https://example.com/wiki/pages/12345",
      });

      await handlers.callTool!({
        params: {
          name: "update_confluence_page",
          arguments: {
            pageId: "12345",
            title: "My Page",
            markdownContent: "# Hello World",
          },
        },
      });

      expect(mockedUpdate).toHaveBeenCalledOnce();
      expect(mockedUpdate).toHaveBeenCalledWith(
        client,
        "12345",
        "My Page",
        "# Hello World",
        undefined  // spaceKey from config (not set in createMockConfig default)
      );
    });

    it("returns a success message with the new version number", async () => {
      mockedUpdate.mockResolvedValue({
        id: "12345",
        title: "Updated Page",
        version: 8,
        url: "https://example.com/wiki/pages/12345",
      });

      const result = await handlers.callTool!({
        params: {
          name: "update_confluence_page",
          arguments: {
            pageId: "12345",
            title: "Updated Page",
            markdownContent: "# Updated",
          },
        },
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.message).toContain("Updated Page");
      expect(parsed.message).toContain("version 8");
      expect(parsed.id).toBe("12345");
      expect(parsed.title).toBe("Updated Page");
      expect(parsed.version).toBe(8);
      expect(parsed.url).toBe("https://example.com/wiki/pages/12345");
    });

    it("includes 'updated successfully' in the success message", async () => {
      mockedUpdate.mockResolvedValue({
        id: "1",
        title: "T",
        version: 2,
        url: "https://x.com",
      });

      const result = await handlers.callTool!({
        params: {
          name: "update_confluence_page",
          arguments: {
            pageId: "1",
            title: "T",
            markdownContent: "c",
          },
        },
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.message).toContain("updated successfully");
    });

    it("does not set isError on success", async () => {
      mockedUpdate.mockResolvedValue({
        id: "1",
        title: "T",
        version: 2,
        url: "https://x.com",
      });

      const result = await handlers.callTool!({
        params: {
          name: "update_confluence_page",
          arguments: {
            pageId: "1",
            title: "T",
            markdownContent: "c",
          },
        },
      });

      expect(result.isError).toBeUndefined();
    });

    it("returns an error response when updateConfluencePage throws a space-guard rejection", async () => {
      mockedUpdate.mockRejectedValue(
        new Error(
          `Page 99999 belongs to space "OTHER" but this server is scoped to space "PROJ". Update rejected to prevent unintended modification.`
        )
      );

      const result = await handlers.callTool!({
        params: {
          name: "update_confluence_page",
          arguments: {
            pageId: "99999",
            title: "Sneaky Page",
            markdownContent: "# Should not land",
          },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error updating Confluence page");
      expect(result.content[0].text).toContain("Update rejected to prevent unintended modification");
    });

    it("passes the configured spaceKey to updateConfluencePage", async () => {
      // Build a fresh server+handlers pair with a non-undefined spaceKey
      const { handlers: h, client: c } = (() => {
        const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
        const srv = new Server(
          { name: "test-spacekey", version: "0.0.1" },
          { capabilities: { tools: {} } }
        );
        const caps: CapturedHandlers = { listTools: null, callTool: null };
        let n = 0;
        vi.spyOn(srv, "setRequestHandler").mockImplementation((schema: any, handler: any) => {
          n++;
          if (n === 2) caps.callTool = handler;
        });
        const cl = createMockClient();
        const cfg = createMockConfig({ spaceKey: "PROJ" });
        registerTools(srv, cl, cfg);
        return { handlers: caps, client: cl };
      })();

      mockedUpdate.mockResolvedValue({ id: "1", title: "T", version: 2, url: "https://x.com" });

      await h.callTool!({
        params: {
          name: "update_confluence_page",
          arguments: { pageId: "1", title: "T", markdownContent: "c" },
        },
      });

      expect(mockedUpdate).toHaveBeenCalledWith(c, "1", "T", "c", "PROJ");
    });

    it("returns an error response when updateConfluencePage throws", async () => {
      mockedUpdate.mockRejectedValue(new Error("409 Version conflict"));

      const result = await handlers.callTool!({
        params: {
          name: "update_confluence_page",
          arguments: {
            pageId: "12345",
            title: "Conflicting",
            markdownContent: "# Oops",
          },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("Error updating Confluence page");
      expect(result.content[0].text).toContain("409 Version conflict");
    });

    it("handles non-Error thrown values gracefully", async () => {
      mockedUpdate.mockRejectedValue(42);

      const result = await handlers.callTool!({
        params: {
          name: "update_confluence_page",
          arguments: {
            pageId: "1",
            title: "T",
            markdownContent: "c",
          },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("42");
    });

    it("returns pretty-printed JSON on success", async () => {
      mockedUpdate.mockResolvedValue({
        id: "1",
        title: "T",
        version: 2,
        url: "https://x.com",
      });

      const result = await handlers.callTool!({
        params: {
          name: "update_confluence_page",
          arguments: {
            pageId: "1",
            title: "T",
            markdownContent: "c",
          },
        },
      });

      const text = result.content[0].text;
      expect(text).toContain("\n");
      expect(text).toContain("  ");
    });
  });

  // -------------------------------------------------------
  // CallTool handler — get_confluence_page
  // -------------------------------------------------------
  describe("CallTool handler — get_confluence_page", () => {
    it("calls getConfluencePage with the client and pageId", async () => {
      mockedGetPage.mockResolvedValue({
        id: "12345",
        title: "Test Page",
        spaceKey: "ENG",
        version: 3,
        url: "https://my-org.atlassian.net/wiki/spaces/ENG/pages/12345/Test+Page",
        content: "<h1>Hello</h1>",
      });

      await handlers.callTool!({
        params: {
          name: "get_confluence_page",
          arguments: { pageId: "12345" },
        },
      });

      expect(mockedGetPage).toHaveBeenCalledWith(client, "12345", undefined);
    });

    it("returns page content as JSON text content on success", async () => {
      mockedGetPage.mockResolvedValue({
        id: "12345",
        title: "Architecture Overview",
        spaceKey: "ENG",
        version: 5,
        url: "https://my-org.atlassian.net/wiki/spaces/ENG/pages/12345/Architecture+Overview",
        content: "<h1>Architecture</h1><p>Details here.</p>",
      });

      const result = await handlers.callTool!({
        params: {
          name: "get_confluence_page",
          arguments: { pageId: "12345" },
        },
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.id).toBe("12345");
      expect(parsed.title).toBe("Architecture Overview");
      expect(parsed.spaceKey).toBe("ENG");
      expect(parsed.version).toBe(5);
      expect(parsed.content).toBe("<h1>Architecture</h1><p>Details here.</p>");
    });

    it("does not set isError on success", async () => {
      mockedGetPage.mockResolvedValue({
        id: "12345",
        title: "Test",
        spaceKey: "ENG",
        version: 1,
        url: "https://my-org.atlassian.net/wiki/spaces/ENG/pages/12345/Test",
        content: "<p>Hi</p>",
      });

      const result = await handlers.callTool!({
        params: {
          name: "get_confluence_page",
          arguments: { pageId: "12345" },
        },
      });

      expect(result.isError).toBeUndefined();
    });

    it("returns an error response when getConfluencePage throws", async () => {
      mockedGetPage.mockRejectedValue(new Error("Page not found (404)"));

      const result = await handlers.callTool!({
        params: {
          name: "get_confluence_page",
          arguments: { pageId: "99999" },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error reading Confluence page");
      expect(result.content[0].text).toContain("Page not found (404)");
    });

    it("returns an error response when space-guard rejects", async () => {
      mockedGetPage.mockRejectedValue(
        new Error('Page 12345 belongs to space "OTHER" but this server is scoped to space "ENG". Read rejected.')
      );

      const result = await handlers.callTool!({
        params: {
          name: "get_confluence_page",
          arguments: { pageId: "12345" },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Read rejected");
    });

    it("handles non-Error thrown values gracefully", async () => {
      mockedGetPage.mockRejectedValue("something went wrong");

      const result = await handlers.callTool!({
        params: {
          name: "get_confluence_page",
          arguments: { pageId: "12345" },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("something went wrong");
    });

    it("returns pretty-printed JSON on success", async () => {
      mockedGetPage.mockResolvedValue({
        id: "12345",
        title: "Test",
        spaceKey: "ENG",
        version: 1,
        url: "https://my-org.atlassian.net/wiki/spaces/ENG/pages/12345/Test",
        content: "<p>Hi</p>",
      });

      const result = await handlers.callTool!({
        params: {
          name: "get_confluence_page",
          arguments: { pageId: "12345" },
        },
      });

      const text = result.content[0].text;
      expect(text).toContain("\n");
      expect(text).toContain("  ");
    });

    it("passes the configured spaceKey to getConfluencePage", async () => {
      const { handlers: h, client: c } = (() => {
        const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
        const srv = new Server(
          { name: "test-spacekey-get", version: "0.0.1" },
          { capabilities: { tools: {} } }
        );
        const caps: CapturedHandlers = { listTools: null, callTool: null };
        let n = 0;
        vi.spyOn(srv, "setRequestHandler").mockImplementation((schema: any, handler: any) => {
          n++;
          if (n === 2) caps.callTool = handler;
        });
        const cl = createMockClient();
        const cfg = createMockConfig({ spaceKey: "MYSPACE" });
        registerTools(srv, cl, cfg);
        return { handlers: caps, client: cl };
      })();

      mockedGetPage.mockResolvedValue({
        id: "12345", title: "T", spaceKey: "MYSPACE", version: 1,
        url: "https://my-org.atlassian.net/wiki/spaces/MYSPACE/pages/12345/T",
        content: "<p>Hi</p>",
      });

      await h.callTool!({
        params: {
          name: "get_confluence_page",
          arguments: { pageId: "12345" },
        },
      });

      expect(mockedGetPage).toHaveBeenCalledWith(c, "12345", "MYSPACE");
    });
  });

  // -------------------------------------------------------
  // CallTool handler — unknown tool
  // -------------------------------------------------------
  describe("CallTool handler — unknown tool", () => {
    it("returns an error for an unrecognized tool name", async () => {
      const result = await handlers.callTool!({
        params: {
          name: "delete_confluence_page",
          arguments: { pageId: "12345" },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("Unknown tool");
      expect(result.content[0].text).toContain("delete_confluence_page");
    });

    it("does not return an error for create_confluence_page (now supported)", async () => {
      // create_confluence_page is now a registered tool — it should NOT fall through to unknown
      // A missing spaceKey will cause a validation error from the function, not "Unknown tool"
      const result = await handlers.callTool!({
        params: {
          name: "create_confluence_page",
          arguments: { spaceKey: "PROJ", title: "New Page", markdownContent: "content" },
        },
      });

      // The result may be an error (e.g. from the mocked function) but NOT "Unknown tool"
      expect(result.content[0].text).not.toContain("Unknown tool");
    });

    it("returns an error for a completely arbitrary tool name", async () => {
      const result = await handlers.callTool!({
        params: {
          name: "foo_bar_baz",
          arguments: {},
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Unknown tool: foo_bar_baz");
    });

    it("does not call any Confluence or Jira functions for unknown tools", async () => {
      await handlers.callTool!({
        params: {
          name: "unknown_tool",
          arguments: {},
        },
      });

      expect(mockedSearch).not.toHaveBeenCalled();
      expect(mockedGetPage).not.toHaveBeenCalled();
      expect(mockedUpdate).not.toHaveBeenCalled();
      expect(mockedCheckPermissions).not.toHaveBeenCalled();
      expect(mockedJiraSearch).not.toHaveBeenCalled();
      expect(mockedJiraGetIssue).not.toHaveBeenCalled();
      expect(mockedJiraCreateIssue).not.toHaveBeenCalled();
      expect(mockedJiraUpdateIssue).not.toHaveBeenCalled();
      expect(mockedJiraTransitionIssue).not.toHaveBeenCalled();
      expect(mockedJiraGetTransitions).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------
  // CallTool handler — check_confluence_permissions
  // -------------------------------------------------------
  describe("CallTool handler — check_confluence_permissions", () => {
    it("calls checkPermissions with the client and no pageId when omitted", async () => {
      mockedCheckPermissions.mockResolvedValue({
        authenticated: true,
        user: { displayName: "Test User", email: "test@example.com", accountId: "abc123" },
        readAccess: true,
        accessibleSpaces: [{ key: "ENG", name: "Engineering" }],
        writeAccess: null,
        writeCheckPageId: null,
        errors: [],
      });

      await handlers.callTool!({
        params: {
          name: "check_confluence_permissions",
          arguments: {},
        },
      });

      expect(mockedCheckPermissions).toHaveBeenCalledOnce();
      expect(mockedCheckPermissions).toHaveBeenCalledWith(client, undefined);
    });

    it("calls checkPermissions with the client and pageId when provided", async () => {
      mockedCheckPermissions.mockResolvedValue({
        authenticated: true,
        user: { displayName: "Test User", email: "test@example.com", accountId: "abc123" },
        readAccess: true,
        accessibleSpaces: [{ key: "ENG", name: "Engineering" }],
        writeAccess: true,
        writeCheckPageId: "12345",
        errors: [],
      });

      await handlers.callTool!({
        params: {
          name: "check_confluence_permissions",
          arguments: { pageId: "12345" },
        },
      });

      expect(mockedCheckPermissions).toHaveBeenCalledOnce();
      expect(mockedCheckPermissions).toHaveBeenCalledWith(client, "12345");
    });

    it("returns a success response with summary when fully authenticated", async () => {
      mockedCheckPermissions.mockResolvedValue({
        authenticated: true,
        user: { displayName: "Alice", email: "alice@example.com", accountId: "acc-001" },
        readAccess: true,
        accessibleSpaces: [{ key: "DEV", name: "Development" }],
        writeAccess: true,
        writeCheckPageId: "99999",
        errors: [],
      });

      const result = await handlers.callTool!({
        params: {
          name: "check_confluence_permissions",
          arguments: { pageId: "99999" },
        },
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain("✅ Authentication: Valid");
      expect(parsed.summary).toContain("Alice");
      expect(parsed.summary).toContain("✅ Read Access: Confirmed");
      expect(parsed.summary).toContain("Development (DEV)");
      expect(parsed.summary).toContain("✅ Write Access: Confirmed for page 99999");
      expect(parsed.authenticated).toBe(true);
      expect(parsed.readAccess).toBe(true);
      expect(parsed.writeAccess).toBe(true);
    });

    it("returns a summary with failed authentication", async () => {
      mockedCheckPermissions.mockResolvedValue({
        authenticated: false,
        user: null,
        readAccess: false,
        accessibleSpaces: [],
        writeAccess: null,
        writeCheckPageId: null,
        errors: ["Authentication failed: Invalid email or API token (401 Unauthorized)"],
      });

      const result = await handlers.callTool!({
        params: {
          name: "check_confluence_permissions",
          arguments: {},
        },
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain("❌ Authentication: Failed");
      expect(parsed.summary).toContain("❌ Read Access: Not confirmed");
      expect(parsed.summary).toContain("⚠️ Errors:");
      expect(parsed.summary).toContain("401 Unauthorized");
    });

    it("returns write access not confirmed when writeAccess is false", async () => {
      mockedCheckPermissions.mockResolvedValue({
        authenticated: true,
        user: { displayName: "Bob", email: "bob@example.com", accountId: "acc-002" },
        readAccess: true,
        accessibleSpaces: [],
        writeAccess: false,
        writeCheckPageId: "55555",
        errors: ["Write access check failed: No permission to access page 55555 (403 Forbidden)"],
      });

      const result = await handlers.callTool!({
        params: {
          name: "check_confluence_permissions",
          arguments: { pageId: "55555" },
        },
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain("❌ Write Access: Not confirmed for page 55555");
    });

    it("shows info message when no pageId is provided for write check", async () => {
      mockedCheckPermissions.mockResolvedValue({
        authenticated: true,
        user: { displayName: "Carol", email: "carol@example.com", accountId: "acc-003" },
        readAccess: true,
        accessibleSpaces: [{ key: "OPS", name: "Operations" }],
        writeAccess: null,
        writeCheckPageId: null,
        errors: [],
      });

      const result = await handlers.callTool!({
        params: {
          name: "check_confluence_permissions",
          arguments: {},
        },
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain("ℹ️ Write Access: Not checked (no pageId provided)");
    });

    it("does not set isError on success", async () => {
      mockedCheckPermissions.mockResolvedValue({
        authenticated: true,
        user: { displayName: "User", email: "u@e.com", accountId: "a" },
        readAccess: true,
        accessibleSpaces: [],
        writeAccess: null,
        writeCheckPageId: null,
        errors: [],
      });

      const result = await handlers.callTool!({
        params: {
          name: "check_confluence_permissions",
          arguments: {},
        },
      });

      expect(result.isError).toBeUndefined();
    });

    it("returns an error response when checkPermissions throws", async () => {
      mockedCheckPermissions.mockRejectedValue(new Error("Unexpected network failure"));

      const result = await handlers.callTool!({
        params: {
          name: "check_confluence_permissions",
          arguments: {},
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("Error checking permissions");
      expect(result.content[0].text).toContain("Unexpected network failure");
    });

    it("handles non-Error thrown values gracefully", async () => {
      mockedCheckPermissions.mockRejectedValue("raw error string");

      const result = await handlers.callTool!({
        params: {
          name: "check_confluence_permissions",
          arguments: {},
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("raw error string");
    });

    it("returns pretty-printed JSON on success", async () => {
      mockedCheckPermissions.mockResolvedValue({
        authenticated: true,
        user: { displayName: "User", email: "u@e.com", accountId: "a" },
        readAccess: true,
        accessibleSpaces: [],
        writeAccess: null,
        writeCheckPageId: null,
        errors: [],
      });

      const result = await handlers.callTool!({
        params: {
          name: "check_confluence_permissions",
          arguments: {},
        },
      });

      const text = result.content[0].text;
      expect(text).toContain("\n");
      expect(text).toContain("  ");
    });

    it("shows 'none listed' when accessibleSpaces is empty but readAccess is true", async () => {
      mockedCheckPermissions.mockResolvedValue({
        authenticated: true,
        user: { displayName: "User", email: "u@e.com", accountId: "a" },
        readAccess: true,
        accessibleSpaces: [],
        writeAccess: null,
        writeCheckPageId: null,
        errors: [],
      });

      const result = await handlers.callTool!({
        params: {
          name: "check_confluence_permissions",
          arguments: {},
        },
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain("none listed");
    });
  });

  // -------------------------------------------------------
  // Response structure consistency
  // -------------------------------------------------------
  describe("response structure consistency", () => {
    it("always returns a content array with at least one item", async () => {
      // Success case
      mockedSearch.mockResolvedValue({ results: [], totalSize: 0 });
      const successResult = await handlers.callTool!({
        params: { name: "search_confluence", arguments: { cql: "type=page" } },
      });
      expect(Array.isArray(successResult.content)).toBe(true);
      expect(successResult.content.length).toBeGreaterThanOrEqual(1);

      // Error case
      mockedSearch.mockRejectedValue(new Error("fail"));
      const errorResult = await handlers.callTool!({
        params: { name: "search_confluence", arguments: { cql: "bad" } },
      });
      expect(Array.isArray(errorResult.content)).toBe(true);
      expect(errorResult.content.length).toBeGreaterThanOrEqual(1);

      // Unknown tool case
      const unknownResult = await handlers.callTool!({
        params: { name: "nope", arguments: {} },
      });
      expect(Array.isArray(unknownResult.content)).toBe(true);
      expect(unknownResult.content.length).toBeGreaterThanOrEqual(1);
    });

    it("always returns content items with type 'text'", async () => {
      mockedSearch.mockResolvedValue({ results: [], totalSize: 0 });
      const result = await handlers.callTool!({
        params: { name: "search_confluence", arguments: { cql: "type=page" } },
      });

      for (const item of result.content) {
        expect(item.type).toBe("text");
      }
    });

    it("always returns content items with a string 'text' field", async () => {
      mockedUpdate.mockResolvedValue({
        id: "1",
        title: "T",
        version: 2,
        url: "https://x.com",
      });

      const result = await handlers.callTool!({
        params: {
          name: "update_confluence_page",
          arguments: { pageId: "1", title: "T", markdownContent: "c" },
        },
      });

      for (const item of result.content) {
        expect(typeof item.text).toBe("string");
      }
    });
  });

  // ===========================================================================
  // create_confluence_page
  // ===========================================================================
  describe("create_confluence_page", () => {
    it("calls createConfluencePage and returns success response", async () => {
      const mockedCreatePage = vi.mocked(confluenceModule.createConfluencePage);
      mockedCreatePage.mockResolvedValue({
        id: "88888",
        title: "New Page",
        spaceKey: "ENG",
        version: 1,
        url: "https://x.com/wiki/pages/88888",
      });

      const result = await handlers.callTool!({
        params: {
          name: "create_confluence_page",
          arguments: {
            spaceKey: "ENG",
            title: "New Page",
            markdownContent: "# Content",
            parentPageId: "12345",
          },
        },
      });

      expect(mockedCreatePage).toHaveBeenCalledWith(
        client,
        "ENG",
        "New Page",
        "# Content",
        "12345",
        undefined
      );
      expect(result.isError).toBeUndefined();
      const text = result.content[0].text as string;
      expect(text).toContain("created successfully");
      expect(text).toContain("New Page");
    });

    it("returns error response when createConfluencePage throws", async () => {
      const mockedCreatePage = vi.mocked(confluenceModule.createConfluencePage);
      mockedCreatePage.mockRejectedValue(new Error("Creation failed"));

      const result = await handlers.callTool!({
        params: {
          name: "create_confluence_page",
          arguments: {
            spaceKey: "ENG",
            title: "New Page",
            markdownContent: "Content",
          },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error creating Confluence page");
    });

    it("handles non-Error thrown values gracefully", async () => {
      const mockedCreatePage = vi.mocked(confluenceModule.createConfluencePage);
      mockedCreatePage.mockRejectedValue({ weird: "object" });

      const result = await handlers.callTool!({
        params: {
          name: "create_confluence_page",
          arguments: {
            spaceKey: "ENG",
            title: "Test",
            markdownContent: "Content",
          },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error creating Confluence page");
    });
  });

  // ===========================================================================
  // add_confluence_comment
  // ===========================================================================
  describe("add_confluence_comment", () => {
    it("calls addConfluenceComment and returns success response", async () => {
      mockedAddComment.mockResolvedValue({
        id: "999",
        pageId: "12345",
        url: "https://x.com/wiki/pages/999",
      });

      const result = await handlers.callTool!({
        params: {
          name: "add_confluence_comment",
          arguments: { pageId: "12345", markdownContent: "Test comment" },
        },
      });

      expect(mockedAddComment).toHaveBeenCalledWith(
        client,
        "12345",
        "Test comment",
        undefined
      );
      expect(result.isError).toBeUndefined();
      const text = result.content[0].text as string;
      expect(text).toContain("Comment added successfully");
    });

    it("returns error response when addConfluenceComment throws", async () => {
      mockedAddComment.mockRejectedValue(new Error("Comment failed"));

      const result = await handlers.callTool!({
        params: {
          name: "add_confluence_comment",
          arguments: { pageId: "12345", markdownContent: "Test" },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error adding comment");
    });

    it("handles non-Error thrown values gracefully", async () => {
      mockedAddComment.mockRejectedValue({ weird: "object" });

      const result = await handlers.callTool!({
        params: {
          name: "add_confluence_comment",
          arguments: { pageId: "12345", markdownContent: "Test" },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error adding comment");
    });
  });

  // ===========================================================================
  // get_confluence_page_versions
  // ===========================================================================
  describe("get_confluence_page_versions", () => {
    it("calls getConfluencePageVersions and returns version history", async () => {
      mockedGetVersions.mockResolvedValue({
        pageId: "12345",
        versions: [
          { number: 2, when: "2024-01-02", by: { displayName: "Alice", email: "a@e.com" }, message: "Updated" },
          { number: 1, when: "2024-01-01", by: null, message: "" },
        ],
      });

      const result = await handlers.callTool!({
        params: {
          name: "get_confluence_page_versions",
          arguments: { pageId: "12345", limit: 50 },
        },
      });

      expect(mockedGetVersions).toHaveBeenCalledWith(client, "12345", 50, undefined);
      expect(result.isError).toBeUndefined();
      const text = result.content[0].text as string;
      expect(text).toContain("12345");
    });

    it("uses default limit of 25 when not provided", async () => {
      mockedGetVersions.mockResolvedValue({ pageId: "12345", versions: [] });

      await handlers.callTool!({
        params: {
          name: "get_confluence_page_versions",
          arguments: { pageId: "12345" },
        },
      });

      expect(mockedGetVersions).toHaveBeenCalledWith(client, "12345", 25, undefined);
    });

    it("returns error response when getConfluencePageVersions throws", async () => {
      mockedGetVersions.mockRejectedValue(new Error("Versions fetch failed"));

      const result = await handlers.callTool!({
        params: {
          name: "get_confluence_page_versions",
          arguments: { pageId: "12345" },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error fetching Confluence page versions");
    });

    it("handles non-Error thrown values gracefully", async () => {
      mockedGetVersions.mockRejectedValue({ weird: "object" });

      const result = await handlers.callTool!({
        params: {
          name: "get_confluence_page_versions",
          arguments: { pageId: "12345" },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error fetching Confluence page versions");
    });
  });

  // ===========================================================================
  // jira_search
  // ===========================================================================
  describe("jira_search", () => {
    it("calls searchJira and returns results", async () => {
      mockedJiraSearch.mockResolvedValue({ issues: [], total: 0 });

      const result = await handlers.callTool!({
        params: {
          name: "jira_search",
          arguments: { jql: "project=TEST", limit: 10, startAt: 0 },
        },
      });

      expect(mockedJiraSearch).toHaveBeenCalledWith(jiraClient, "project=TEST", 10, 0, undefined);
      expect(result.isError).toBeUndefined();
    });

    it("uses default limit and startAt when not provided", async () => {
      mockedJiraSearch.mockResolvedValue({ issues: [], total: 0 });

      await handlers.callTool!({
        params: {
          name: "jira_search",
          arguments: { jql: "project=TEST" },
        },
      });

      expect(mockedJiraSearch).toHaveBeenCalledWith(jiraClient, "project=TEST", 25, 0, undefined);
    });

    it("returns error response when searchJira throws", async () => {
      mockedJiraSearch.mockRejectedValue(new Error("Search failed"));

      const result = await handlers.callTool!({
        params: {
          name: "jira_search",
          arguments: { jql: "invalid" },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error searching Jira");
    });
  });

  // ===========================================================================
  // jira_get_issue
  // ===========================================================================
  describe("jira_get_issue", () => {
    it("calls getJiraIssue and returns issue details", async () => {
      mockedJiraGetIssue.mockResolvedValue({ key: "TEST-123", summary: "Test issue" } as any);

      const result = await handlers.callTool!({
        params: {
          name: "jira_get_issue",
          arguments: { issueIdOrKey: "TEST-123" },
        },
      });

      expect(mockedJiraGetIssue).toHaveBeenCalledWith(jiraClient, "TEST-123");
      expect(result.isError).toBeUndefined();
    });

    it("returns error response when getJiraIssue throws", async () => {
      mockedJiraGetIssue.mockRejectedValue(new Error("Issue not found"));

      const result = await handlers.callTool!({
        params: {
          name: "jira_get_issue",
          arguments: { issueIdOrKey: "INVALID-999" },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error getting Jira issue");
    });
  });

  // ===========================================================================
  // jira_create_issue
  // ===========================================================================
  describe("jira_create_issue", () => {
    it("calls createJiraIssue and returns created issue", async () => {
      mockedJiraCreateIssue.mockResolvedValue({ key: "TEST-456", id: "10001", url: "https://j.com/TEST-456" });

      const result = await handlers.callTool!({
        params: {
          name: "jira_create_issue",
          arguments: {
            projectKey: "TEST",
            issueType: "Story",
            summary: "New story",
            description: "Description",
            assigneeAccountId: "user123",
            priority: "High",
            labels: ["label1"],
          },
        },
      });

      expect(mockedJiraCreateIssue).toHaveBeenCalledWith(
        jiraClient,
        "TEST",
        "Story",
        "New story",
        "Description",
        "user123",
        "High",
        ["label1"],
        undefined
      );
      expect(result.isError).toBeUndefined();
      const text = result.content[0].text as string;
      expect(text).toContain("TEST-456");
      expect(text).toContain("created successfully");
    });

    it("returns error response when createJiraIssue throws", async () => {
      mockedJiraCreateIssue.mockRejectedValue(new Error("Create failed"));

      const result = await handlers.callTool!({
        params: {
          name: "jira_create_issue",
          arguments: { projectKey: "TEST", issueType: "Bug", summary: "Test" },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error creating Jira issue");
    });
  });

  // ===========================================================================
  // jira_update_issue
  // ===========================================================================
  describe("jira_update_issue", () => {
    it("calls updateJiraIssue and returns updated issue", async () => {
      mockedJiraUpdateIssue.mockResolvedValue({ key: "TEST-789", fields: {} } as any);

      const result = await handlers.callTool!({
        params: {
          name: "jira_update_issue",
          arguments: {
            issueIdOrKey: "TEST-789",
            fields: { summary: "Updated summary" },
          },
        },
      });

      expect(mockedJiraUpdateIssue).toHaveBeenCalledWith(
        jiraClient,
        "TEST-789",
        { summary: "Updated summary" }
      );
      expect(result.isError).toBeUndefined();
      const text = result.content[0].text as string;
      expect(text).toContain("TEST-789");
      expect(text).toContain("updated successfully");
    });

    it("returns error response when updateJiraIssue throws", async () => {
      mockedJiraUpdateIssue.mockRejectedValue(new Error("Update failed"));

      const result = await handlers.callTool!({
        params: {
          name: "jira_update_issue",
          arguments: { issueIdOrKey: "TEST-999", fields: {} },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error updating Jira issue");
    });
  });

  // ===========================================================================
  // jira_transition_issue
  // ===========================================================================
  describe("jira_transition_issue", () => {
    it("calls transitionJiraIssue and returns transition result", async () => {
      mockedJiraTransitionIssue.mockResolvedValue({
        issueKey: "TEST-111",
        transitionId: "31",
        transitionName: "Done",
      });

      const result = await handlers.callTool!({
        params: {
          name: "jira_transition_issue",
          arguments: { issueIdOrKey: "TEST-111", transition: "Done" },
        },
      });

      expect(mockedJiraTransitionIssue).toHaveBeenCalledWith(jiraClient, "TEST-111", "Done");
      expect(result.isError).toBeUndefined();
      const text = result.content[0].text as string;
      expect(text).toContain("TEST-111");
      expect(text).toContain("Done");
    });

    it("returns error response when transitionJiraIssue throws", async () => {
      mockedJiraTransitionIssue.mockRejectedValue(new Error("Transition failed"));

      const result = await handlers.callTool!({
        params: {
          name: "jira_transition_issue",
          arguments: { issueIdOrKey: "TEST-222", transition: "Invalid" },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error transitioning Jira issue");
    });
  });

  // ===========================================================================
  // jira_get_transitions
  // ===========================================================================
  describe("jira_get_transitions", () => {
    it("calls getJiraIssueTransitions and returns available transitions", async () => {
      mockedJiraGetTransitions.mockResolvedValue([
        { id: "11", name: "To Do" },
        { id: "21", name: "In Progress" },
        { id: "31", name: "Done" },
      ]);

      const result = await handlers.callTool!({
        params: {
          name: "jira_get_transitions",
          arguments: { issueIdOrKey: "TEST-333" },
        },
      });

      expect(mockedJiraGetTransitions).toHaveBeenCalledWith(jiraClient, "TEST-333");
      expect(result.isError).toBeUndefined();
      const text = result.content[0].text as string;
      expect(text).toContain("TEST-333");
      expect(text).toContain("transitions");
    });

    it("returns error response when getJiraIssueTransitions throws", async () => {
      mockedJiraGetTransitions.mockRejectedValue(new Error("Get transitions failed"));

      const result = await handlers.callTool!({
        params: {
          name: "jira_get_transitions",
          arguments: { issueIdOrKey: "TEST-444" },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error fetching Jira transitions");
    });
  });
});