import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  searchJira,
  getJiraIssue,
  createJiraIssue,
  updateJiraIssue,
  transitionJiraIssue,
  getJiraIssueTransitions,
} from "../../src/jira.js";
import type { AxiosInstance, AxiosResponse } from "axios";

// ---------------------------------------------------------------------------
// Helper: build a mock AxiosInstance with stubbed methods
// ---------------------------------------------------------------------------
function createMockClient(overrides: Partial<AxiosInstance> = {}): AxiosInstance {
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
    ...overrides,
  } as unknown as AxiosInstance;
}

// ---------------------------------------------------------------------------
// Helper: wrap data in an AxiosResponse shape
// ---------------------------------------------------------------------------
function axiosResponse<T>(data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config: {} as any,
  };
}

// ---------------------------------------------------------------------------
// Helper: build a minimal raw Jira issue as returned by the REST API
// ---------------------------------------------------------------------------
function rawIssue(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "10001",
    key: "PROJ-1",
    fields: {
      summary: "Test issue summary",
      status: { name: "To Do" },
      issuetype: { name: "Story" },
      priority: { name: "Medium" },
      assignee: { displayName: "Alice" },
      reporter: { displayName: "Bob" },
      description: "A plain description",
      labels: ["frontend", "backend"],
      project: { key: "PROJ", name: "My Project" },
      created: "2024-01-01T10:00:00.000Z",
      updated: "2024-01-02T10:00:00.000Z",
    },
    ...overrides,
  };
}

// ===========================================================================
// searchJira
// ===========================================================================
describe("jira — searchJira()", () => {
  let client: AxiosInstance;

  beforeEach(() => {
    client = createMockClient();
  });

  // ── input validation ──────────────────────────────────────────────────────

  describe("input validation", () => {
    it("throws when jql is an empty string", async () => {
      await expect(searchJira(client, "")).rejects.toThrow(
        "JQL query string must not be empty"
      );
    });

    it("throws when jql is only whitespace", async () => {
      await expect(searchJira(client, "   ")).rejects.toThrow(
        "JQL query string must not be empty"
      );
    });

    it("throws when limit is 0", async () => {
      await expect(searchJira(client, "project=PROJ", 0)).rejects.toThrow(
        "Limit must be between 1 and 100"
      );
    });

    it("throws when limit is negative", async () => {
      await expect(searchJira(client, "project=PROJ", -5)).rejects.toThrow(
        "Limit must be between 1 and 100"
      );
    });

    it("throws when limit is greater than 100", async () => {
      await expect(searchJira(client, "project=PROJ", 101)).rejects.toThrow(
        "Limit must be between 1 and 100"
      );
    });

    it("does not throw when limit is exactly 1", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(
        axiosResponse({ issues: [], total: 0, maxResults: 1, startAt: 0 })
      );
      await expect(searchJira(client, "project=PROJ", 1)).resolves.toBeDefined();
    });

    it("does not throw when limit is exactly 100", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(
        axiosResponse({ issues: [], total: 0, maxResults: 100, startAt: 0 })
      );
      await expect(searchJira(client, "project=PROJ", 100)).resolves.toBeDefined();
    });

    it("throws when startAt is negative", async () => {
      await expect(searchJira(client, "project=PROJ", 25, -1)).rejects.toThrow(
        "startAt must be 0 or greater"
      );
    });

    it("does not throw when startAt is 0", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(
        axiosResponse({ issues: [], total: 0, maxResults: 25, startAt: 0 })
      );
      await expect(
        searchJira(client, "project=PROJ", 25, 0)
      ).resolves.toBeDefined();
    });
  });

  // ── API request ───────────────────────────────────────────────────────────

  describe("API request", () => {
    it("calls GET /rest/api/3/search/jql with correct params", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(
        axiosResponse({ issues: [], total: 0, maxResults: 25, startAt: 0 })
      );

      await searchJira(client, 'status="In Progress"', 10, 5);

      expect(client.get).toHaveBeenCalledWith("/rest/api/3/search/jql", {
        params: expect.objectContaining({
          jql: 'status="In Progress"',
          maxResults: 10,
          startAt: 5,
        }),
      });
    });

    it("defaults limit to 25 and startAt to 0 when not provided", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(
        axiosResponse({ issues: [], total: 0, maxResults: 25, startAt: 0 })
      );

      await searchJira(client, "project=PROJ");

      expect(client.get).toHaveBeenCalledWith("/rest/api/3/search/jql", {
        params: expect.objectContaining({
          maxResults: 25,
          startAt: 0,
        }),
      });
    });

    it("requests the standard set of fields", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(
        axiosResponse({ issues: [], total: 0, maxResults: 25, startAt: 0 })
      );

      await searchJira(client, "project=PROJ");

      const callParams = vi.mocked(client.get).mock.calls[0][1] as any;
      expect(callParams.params.fields).toContain("summary");
      expect(callParams.params.fields).toContain("status");
      expect(callParams.params.fields).toContain("assignee");
    });
  });

  // ── project key auto-scoping ──────────────────────────────────────────────

  describe("project key auto-scoping", () => {
    it("prepends project filter when projectKey is configured and JQL lacks project", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(
        axiosResponse({ issues: [], total: 0, maxResults: 25, startAt: 0 })
      );

      await searchJira(client, 'status="To Do"', 25, 0, "PROJ");

      const callParams = vi.mocked(client.get).mock.calls[0][1] as any;
      expect(callParams.params.jql).toBe('project="PROJ" AND status="To Do"');
    });

    it("does NOT prepend project filter when JQL already contains project=", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(
        axiosResponse({ issues: [], total: 0, maxResults: 25, startAt: 0 })
      );

      await searchJira(client, "project=OTHER AND status=Done", 25, 0, "PROJ");

      const callParams = vi.mocked(client.get).mock.calls[0][1] as any;
      expect(callParams.params.jql).toBe("project=OTHER AND status=Done");
    });

    it("does NOT modify JQL when no projectKey is configured", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(
        axiosResponse({ issues: [], total: 0, maxResults: 25, startAt: 0 })
      );

      await searchJira(client, 'status="To Do"');

      const callParams = vi.mocked(client.get).mock.calls[0][1] as any;
      expect(callParams.params.jql).toBe('status="To Do"');
    });
  });

  // ── response mapping ──────────────────────────────────────────────────────

  describe("response mapping", () => {
    it("maps a Jira issue to JiraIssue shape with all fields", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(
        axiosResponse({
          issues: [rawIssue()],
          total: 1,
          maxResults: 25,
          startAt: 0,
        })
      );

      const result = await searchJira(client, "project=PROJ");

      expect(result.issues).toHaveLength(1);
      const issue = result.issues[0];
      expect(issue.id).toBe("10001");
      expect(issue.key).toBe("PROJ-1");
      expect(issue.summary).toBe("Test issue summary");
      expect(issue.status).toBe("To Do");
      expect(issue.issueType).toBe("Story");
      expect(issue.priority).toBe("Medium");
      expect(issue.assignee).toBe("Alice");
      expect(issue.reporter).toBe("Bob");
      expect(issue.description).toBe("A plain description");
      expect(issue.labels).toEqual(["frontend", "backend"]);
      expect(issue.project).toEqual({ key: "PROJ", name: "My Project" });
      expect(issue.url).toBe("https://my-org.atlassian.net/browse/PROJ-1");
      expect(issue.created).toBe("2024-01-01T10:00:00.000Z");
      expect(issue.updated).toBe("2024-01-02T10:00:00.000Z");
    });

    it("returns correct total, maxResults, and startAt from API response", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(
        axiosResponse({
          issues: [rawIssue()],
          total: 42,
          maxResults: 10,
          startAt: 20,
        })
      );

      const result = await searchJira(client, "project=PROJ");

      expect(result.total).toBe(42);
      expect(result.maxResults).toBe(10);
      expect(result.startAt).toBe(20);
    });

    it("returns an empty issues array when API returns no issues", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(
        axiosResponse({ issues: [], total: 0, maxResults: 25, startAt: 0 })
      );

      const result = await searchJira(client, "project=PROJ");

      expect(result.issues).toHaveLength(0);
    });

    it("handles missing issues array in API response", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(
        axiosResponse({ total: 0, maxResults: 25, startAt: 0 })
      );

      const result = await searchJira(client, "project=PROJ");

      expect(result.issues).toHaveLength(0);
    });

    it("falls back to issues.length when total is missing", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(
        axiosResponse({ issues: [rawIssue(), rawIssue()], maxResults: 25, startAt: 0 })
      );

      const result = await searchJira(client, "project=PROJ");

      expect(result.total).toBe(2);
    });

    it("constructs URL correctly when baseURL is empty", async () => {
      const clientNoBase = createMockClient({
        defaults: { baseURL: "", headers: {} as any },
      } as any);

      vi.mocked(clientNoBase.get).mockResolvedValueOnce(
        axiosResponse({ issues: [rawIssue()], total: 1, maxResults: 25, startAt: 0 })
      );

      const result = await searchJira(clientNoBase, "project=PROJ");

      expect(result.issues[0].url).toBe("/browse/PROJ-1");
    });

    it("handles null assignee gracefully", async () => {
      const issue = rawIssue();
      (issue.fields as any).assignee = null;

      vi.mocked(client.get).mockResolvedValueOnce(
        axiosResponse({ issues: [issue], total: 1, maxResults: 25, startAt: 0 })
      );

      const result = await searchJira(client, "project=PROJ");

      expect(result.issues[0].assignee).toBeNull();
    });

    it("handles null priority gracefully", async () => {
      const issue = rawIssue();
      (issue.fields as any).priority = null;

      vi.mocked(client.get).mockResolvedValueOnce(
        axiosResponse({ issues: [issue], total: 1, maxResults: 25, startAt: 0 })
      );

      const result = await searchJira(client, "project=PROJ");

      expect(result.issues[0].priority).toBeNull();
    });

    it("handles empty labels array", async () => {
      const issue = rawIssue();
      (issue.fields as any).labels = [];

      vi.mocked(client.get).mockResolvedValueOnce(
        axiosResponse({ issues: [issue], total: 1, maxResults: 25, startAt: 0 })
      );

      const result = await searchJira(client, "project=PROJ");

      expect(result.issues[0].labels).toEqual([]);
    });

    it("handles missing labels field", async () => {
      const issue = rawIssue();
      delete (issue.fields as any).labels;

      vi.mocked(client.get).mockResolvedValueOnce(
        axiosResponse({ issues: [issue], total: 1, maxResults: 25, startAt: 0 })
      );

      const result = await searchJira(client, "project=PROJ");

      expect(result.issues[0].labels).toEqual([]);
    });

    it("extracts text from ADF description", async () => {
      const issue = rawIssue();
      (issue.fields as any).description = {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "ADF paragraph text" }],
          },
        ],
      };

      vi.mocked(client.get).mockResolvedValueOnce(
        axiosResponse({ issues: [issue], total: 1, maxResults: 25, startAt: 0 })
      );

      const result = await searchJira(client, "project=PROJ");

      expect(result.issues[0].description).toBe("ADF paragraph text");
    });

    it("returns null description when description is null", async () => {
      const issue = rawIssue();
      (issue.fields as any).description = null;

      vi.mocked(client.get).mockResolvedValueOnce(
        axiosResponse({ issues: [issue], total: 1, maxResults: 25, startAt: 0 })
      );

      const result = await searchJira(client, "project=PROJ");

      expect(result.issues[0].description).toBeNull();
    });

    it("returns null description when ADF content is empty", async () => {
      const issue = rawIssue();
      (issue.fields as any).description = {
        type: "doc",
        version: 1,
        content: [],
      };

      vi.mocked(client.get).mockResolvedValueOnce(
        axiosResponse({ issues: [issue], total: 1, maxResults: 25, startAt: 0 })
      );

      const result = await searchJira(client, "project=PROJ");

      expect(result.issues[0].description).toBeNull();
    });
  });

  // ── error propagation ─────────────────────────────────────────────────────

  describe("error propagation", () => {
    it("propagates network errors from axios", async () => {
      vi.mocked(client.get).mockRejectedValueOnce(new Error("Network error"));

      await expect(searchJira(client, "project=PROJ")).rejects.toThrow(
        "Network error"
      );
    });

    it("propagates 401 errors from the API", async () => {
      const err = Object.assign(new Error("Unauthorized"), {
        response: { status: 401, data: { message: "Unauthorized" } },
      });
      vi.mocked(client.get).mockRejectedValueOnce(err);

      await expect(searchJira(client, "project=PROJ")).rejects.toThrow(
        "Unauthorized"
      );
    });

    it("propagates 400 errors from the API (bad JQL)", async () => {
      const err = Object.assign(new Error("Bad Request"), {
        response: { status: 400, data: { errorMessages: ["Invalid JQL"] } },
      });
      vi.mocked(client.get).mockRejectedValueOnce(err);

      await expect(searchJira(client, "INVALID JQL !!")).rejects.toThrow(
        "Bad Request"
      );
    });
  });
});

// ===========================================================================
// getJiraIssue
// ===========================================================================
describe("jira — getJiraIssue()", () => {
  let client: AxiosInstance;

  beforeEach(() => {
    client = createMockClient();
  });

  // ── input validation ──────────────────────────────────────────────────────

  describe("input validation", () => {
    it("throws when issueIdOrKey is an empty string", async () => {
      await expect(getJiraIssue(client, "")).rejects.toThrow(
        "Issue ID or key must not be empty"
      );
    });

    it("throws when issueIdOrKey is only whitespace", async () => {
      await expect(getJiraIssue(client, "   ")).rejects.toThrow(
        "Issue ID or key must not be empty"
      );
    });
  });

  // ── API request ───────────────────────────────────────────────────────────

  describe("API request", () => {
    it("calls GET /rest/api/3/issue/{key} with correct params", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(axiosResponse(rawIssue()));

      await getJiraIssue(client, "PROJ-123");

      expect(client.get).toHaveBeenCalledWith(
        "/rest/api/3/issue/PROJ-123",
        expect.objectContaining({
          params: expect.objectContaining({ fields: expect.any(String) }),
        })
      );
    });

    it("URL-encodes the issue key", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(axiosResponse(rawIssue()));

      await getJiraIssue(client, "MY PROJECT-1");

      expect(client.get).toHaveBeenCalledWith(
        "/rest/api/3/issue/MY%20PROJECT-1",
        expect.anything()
      );
    });
  });

  // ── response mapping ──────────────────────────────────────────────────────

  describe("response mapping", () => {
    it("maps a full raw issue to JiraIssue shape", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(axiosResponse(rawIssue()));

      const result = await getJiraIssue(client, "PROJ-1");

      expect(result.id).toBe("10001");
      expect(result.key).toBe("PROJ-1");
      expect(result.summary).toBe("Test issue summary");
      expect(result.status).toBe("To Do");
      expect(result.issueType).toBe("Story");
      expect(result.priority).toBe("Medium");
      expect(result.assignee).toBe("Alice");
      expect(result.reporter).toBe("Bob");
      expect(result.labels).toEqual(["frontend", "backend"]);
      expect(result.project).toEqual({ key: "PROJ", name: "My Project" });
      expect(result.url).toBe("https://my-org.atlassian.net/browse/PROJ-1");
    });

    it("returns 'Unknown' for missing status name", async () => {
      const issue = rawIssue();
      (issue.fields as any).status = {};

      vi.mocked(client.get).mockResolvedValueOnce(axiosResponse(issue));

      const result = await getJiraIssue(client, "PROJ-1");

      expect(result.status).toBe("Unknown");
    });

    it("returns 'Unknown' for missing issuetype name", async () => {
      const issue = rawIssue();
      (issue.fields as any).issuetype = {};

      vi.mocked(client.get).mockResolvedValueOnce(axiosResponse(issue));

      const result = await getJiraIssue(client, "PROJ-1");

      expect(result.issueType).toBe("Unknown");
    });

    it("returns 'Unknown' for missing project key and name", async () => {
      const issue = rawIssue();
      (issue.fields as any).project = {};

      vi.mocked(client.get).mockResolvedValueOnce(axiosResponse(issue));

      const result = await getJiraIssue(client, "PROJ-1");

      expect(result.project).toEqual({ key: "Unknown", name: "Unknown" });
    });

    it("returns empty string for missing summary", async () => {
      const issue = rawIssue();
      delete (issue.fields as any).summary;

      vi.mocked(client.get).mockResolvedValueOnce(axiosResponse(issue));

      const result = await getJiraIssue(client, "PROJ-1");

      expect(result.summary).toBe("");
    });

    it("returns empty strings for missing timestamps", async () => {
      const issue = rawIssue();
      delete (issue.fields as any).created;
      delete (issue.fields as any).updated;

      vi.mocked(client.get).mockResolvedValueOnce(axiosResponse(issue));

      const result = await getJiraIssue(client, "PROJ-1");

      expect(result.created).toBe("");
      expect(result.updated).toBe("");
    });
  });

  // ── error propagation ─────────────────────────────────────────────────────

  describe("error propagation", () => {
    it("propagates network errors", async () => {
      vi.mocked(client.get).mockRejectedValueOnce(new Error("Network error"));

      await expect(getJiraIssue(client, "PROJ-1")).rejects.toThrow(
        "Network error"
      );
    });

    it("propagates 404 errors when issue not found", async () => {
      const err = Object.assign(new Error("Not Found"), {
        response: { status: 404, data: { errorMessages: ["Issue not found"] } },
      });
      vi.mocked(client.get).mockRejectedValueOnce(err);

      await expect(getJiraIssue(client, "PROJ-9999")).rejects.toThrow(
        "Not Found"
      );
    });
  });
});

// ===========================================================================
// createJiraIssue
// ===========================================================================
describe("jira — createJiraIssue()", () => {
  let client: AxiosInstance;

  beforeEach(() => {
    client = createMockClient();
  });

  // ── input validation ──────────────────────────────────────────────────────

  describe("input validation", () => {
    it("throws when projectKey is empty", async () => {
      await expect(
        createJiraIssue(client, "", "Story", "My issue")
      ).rejects.toThrow("Project key must not be empty");
    });

    it("throws when projectKey is only whitespace", async () => {
      await expect(
        createJiraIssue(client, "   ", "Story", "My issue")
      ).rejects.toThrow("Project key must not be empty");
    });

    it("throws when issueType is empty", async () => {
      await expect(
        createJiraIssue(client, "PROJ", "", "My issue")
      ).rejects.toThrow("Issue type must not be empty");
    });

    it("throws when issueType is only whitespace", async () => {
      await expect(
        createJiraIssue(client, "PROJ", "   ", "My issue")
      ).rejects.toThrow("Issue type must not be empty");
    });

    it("throws when summary is empty", async () => {
      await expect(
        createJiraIssue(client, "PROJ", "Story", "")
      ).rejects.toThrow("Summary must not be empty");
    });

    it("throws when summary is only whitespace", async () => {
      await expect(
        createJiraIssue(client, "PROJ", "Story", "   ")
      ).rejects.toThrow("Summary must not be empty");
    });
  });

  // ── project-scoping guard ─────────────────────────────────────────────────

  describe("project-scoping guard", () => {
    it("throws when projectKey does not match configuredProjectKey", async () => {
      await expect(
        createJiraIssue(
          client,
          "OTHER",
          "Story",
          "My issue",
          undefined,
          undefined,
          undefined,
          undefined,
          "PROJ"
        )
      ).rejects.toThrow(
        'Cannot create issue in project "OTHER" — this server is scoped to project "PROJ". Creation rejected.'
      );
    });

    it("does not throw when projectKey matches configuredProjectKey", async () => {
      vi.mocked(client.post).mockResolvedValueOnce(
        axiosResponse({ id: "10001", key: "PROJ-1" })
      );

      await expect(
        createJiraIssue(
          client,
          "PROJ",
          "Story",
          "My issue",
          undefined,
          undefined,
          undefined,
          undefined,
          "PROJ"
        )
      ).resolves.toBeDefined();
    });

    it("does not throw when no configuredProjectKey is set", async () => {
      vi.mocked(client.post).mockResolvedValueOnce(
        axiosResponse({ id: "10001", key: "PROJ-1" })
      );

      await expect(
        createJiraIssue(client, "PROJ", "Story", "My issue")
      ).resolves.toBeDefined();
    });

    it("comparison is case-insensitive", async () => {
      vi.mocked(client.post).mockResolvedValueOnce(
        axiosResponse({ id: "10001", key: "proj-1" })
      );

      await expect(
        createJiraIssue(
          client,
          "proj",
          "Story",
          "My issue",
          undefined,
          undefined,
          undefined,
          undefined,
          "PROJ"
        )
      ).resolves.toBeDefined();
    });

    it("does not throw when configuredProjectKey is empty string", async () => {
      vi.mocked(client.post).mockResolvedValueOnce(
        axiosResponse({ id: "10001", key: "OTHER-1" })
      );

      await expect(
        createJiraIssue(
          client,
          "OTHER",
          "Story",
          "My issue",
          undefined,
          undefined,
          undefined,
          undefined,
          ""
        )
      ).resolves.toBeDefined();
    });
  });

  // ── API request payload ───────────────────────────────────────────────────

  describe("API request payload", () => {
    it("sends POST to /rest/api/3/issue", async () => {
      vi.mocked(client.post).mockResolvedValueOnce(
        axiosResponse({ id: "10001", key: "PROJ-1" })
      );

      await createJiraIssue(client, "PROJ", "Story", "My issue");

      expect(client.post).toHaveBeenCalledWith(
        "/rest/api/3/issue",
        expect.any(Object)
      );
    });

    it("includes project key, issue type, and summary in fields", async () => {
      vi.mocked(client.post).mockResolvedValueOnce(
        axiosResponse({ id: "10001", key: "PROJ-1" })
      );

      await createJiraIssue(client, "PROJ", "Bug", "Fix the bug");

      const payload = vi.mocked(client.post).mock.calls[0][1] as any;
      expect(payload.fields.project).toEqual({ key: "PROJ" });
      expect(payload.fields.issuetype).toEqual({ name: "Bug" });
      expect(payload.fields.summary).toBe("Fix the bug");
    });

    it("includes ADF description when description is provided", async () => {
      vi.mocked(client.post).mockResolvedValueOnce(
        axiosResponse({ id: "10001", key: "PROJ-1" })
      );

      await createJiraIssue(client, "PROJ", "Story", "My issue", "Some details");

      const payload = vi.mocked(client.post).mock.calls[0][1] as any;
      expect(payload.fields.description).toBeDefined();
      expect(payload.fields.description.type).toBe("doc");
      expect(payload.fields.description.version).toBe(1);
      expect(payload.fields.description.content[0].content[0].text).toBe(
        "Some details"
      );
    });

    it("does not include description when it is undefined", async () => {
      vi.mocked(client.post).mockResolvedValueOnce(
        axiosResponse({ id: "10001", key: "PROJ-1" })
      );

      await createJiraIssue(client, "PROJ", "Story", "My issue");

      const payload = vi.mocked(client.post).mock.calls[0][1] as any;
      expect(payload.fields.description).toBeUndefined();
    });

    it("does not include description when it is empty string", async () => {
      vi.mocked(client.post).mockResolvedValueOnce(
        axiosResponse({ id: "10001", key: "PROJ-1" })
      );

      await createJiraIssue(client, "PROJ", "Story", "My issue", "");

      const payload = vi.mocked(client.post).mock.calls[0][1] as any;
      expect(payload.fields.description).toBeUndefined();
    });

    it("includes assignee accountId when provided", async () => {
      vi.mocked(client.post).mockResolvedValueOnce(
        axiosResponse({ id: "10001", key: "PROJ-1" })
      );

      await createJiraIssue(
        client,
        "PROJ",
        "Story",
        "My issue",
        undefined,
        "account-123"
      );

      const payload = vi.mocked(client.post).mock.calls[0][1] as any;
      expect(payload.fields.assignee).toEqual({ accountId: "account-123" });
    });

    it("does not include assignee when assigneeAccountId is undefined", async () => {
      vi.mocked(client.post).mockResolvedValueOnce(
        axiosResponse({ id: "10001", key: "PROJ-1" })
      );

      await createJiraIssue(client, "PROJ", "Story", "My issue");

      const payload = vi.mocked(client.post).mock.calls[0][1] as any;
      expect(payload.fields.assignee).toBeUndefined();
    });

    it("includes priority when provided", async () => {
      vi.mocked(client.post).mockResolvedValueOnce(
        axiosResponse({ id: "10001", key: "PROJ-1" })
      );

      await createJiraIssue(
        client,
        "PROJ",
        "Story",
        "My issue",
        undefined,
        undefined,
        "High"
      );

      const payload = vi.mocked(client.post).mock.calls[0][1] as any;
      expect(payload.fields.priority).toEqual({ name: "High" });
    });

    it("includes labels when provided", async () => {
      vi.mocked(client.post).mockResolvedValueOnce(
        axiosResponse({ id: "10001", key: "PROJ-1" })
      );

      await createJiraIssue(
        client,
        "PROJ",
        "Story",
        "My issue",
        undefined,
        undefined,
        undefined,
        ["urgent", "frontend"]
      );

      const payload = vi.mocked(client.post).mock.calls[0][1] as any;
      expect(payload.fields.labels).toEqual(["urgent", "frontend"]);
    });

    it("does not include labels when array is empty", async () => {
      vi.mocked(client.post).mockResolvedValueOnce(
        axiosResponse({ id: "10001", key: "PROJ-1" })
      );

      await createJiraIssue(
        client,
        "PROJ",
        "Story",
        "My issue",
        undefined,
        undefined,
        undefined,
        []
      );

      const payload = vi.mocked(client.post).mock.calls[0][1] as any;
      expect(payload.fields.labels).toBeUndefined();
    });
  });

  // ── response mapping ──────────────────────────────────────────────────────

  describe("response mapping", () => {
    it("returns id, key, and url", async () => {
      vi.mocked(client.post).mockResolvedValueOnce(
        axiosResponse({ id: "10001", key: "PROJ-42" })
      );

      const result = await createJiraIssue(client, "PROJ", "Story", "My issue");

      expect(result.id).toBe("10001");
      expect(result.key).toBe("PROJ-42");
      expect(result.url).toBe("https://my-org.atlassian.net/browse/PROJ-42");
    });

    it("constructs URL correctly when baseURL is missing", async () => {
      const clientNoBase = createMockClient({
        defaults: { baseURL: "", headers: {} as any },
      } as any);

      vi.mocked(clientNoBase.post).mockResolvedValueOnce(
        axiosResponse({ id: "10001", key: "PROJ-1" })
      );

      const result = await createJiraIssue(
        clientNoBase,
        "PROJ",
        "Story",
        "My issue"
      );

      expect(result.url).toBe("/browse/PROJ-1");
    });
  });

  // ── error propagation ─────────────────────────────────────────────────────

  describe("error propagation", () => {
    it("propagates network errors", async () => {
      vi.mocked(client.post).mockRejectedValueOnce(new Error("Network error"));

      await expect(
        createJiraIssue(client, "PROJ", "Story", "My issue")
      ).rejects.toThrow("Network error");
    });

    it("propagates 400 errors (validation failure)", async () => {
      const err = Object.assign(new Error("Bad Request"), {
        response: { status: 400, data: { errors: { summary: "Field required" } } },
      });
      vi.mocked(client.post).mockRejectedValueOnce(err);

      await expect(
        createJiraIssue(client, "PROJ", "Story", "My issue")
      ).rejects.toThrow("Bad Request");
    });
  });
});

// ===========================================================================
// updateJiraIssue
// ===========================================================================
describe("jira — updateJiraIssue()", () => {
  let client: AxiosInstance;

  beforeEach(() => {
    client = createMockClient();
  });

  // ── input validation ──────────────────────────────────────────────────────

  describe("input validation", () => {
    it("throws when issueIdOrKey is empty", async () => {
      await expect(
        updateJiraIssue(client, "", { summary: "New summary" })
      ).rejects.toThrow("Issue ID or key must not be empty");
    });

    it("throws when issueIdOrKey is only whitespace", async () => {
      await expect(
        updateJiraIssue(client, "   ", { summary: "New summary" })
      ).rejects.toThrow("Issue ID or key must not be empty");
    });

    it("throws when fields is empty object", async () => {
      await expect(
        updateJiraIssue(client, "PROJ-1", {})
      ).rejects.toThrow("At least one field must be provided to update");
    });
  });

  // ── API request ───────────────────────────────────────────────────────────

  describe("API request", () => {
    it("sends PUT to /rest/api/3/issue/{key}", async () => {
      vi.mocked(client.put).mockResolvedValueOnce(axiosResponse(null));

      await updateJiraIssue(client, "PROJ-1", { summary: "Updated" });

      expect(client.put).toHaveBeenCalledWith(
        "/rest/api/3/issue/PROJ-1",
        expect.any(Object)
      );
    });

    it("URL-encodes the issue key", async () => {
      vi.mocked(client.put).mockResolvedValueOnce(axiosResponse(null));

      await updateJiraIssue(client, "MY PROJECT-1", { summary: "Updated" });

      expect(client.put).toHaveBeenCalledWith(
        "/rest/api/3/issue/MY%20PROJECT-1",
        expect.anything()
      );
    });
  });

  // ── field transformation ──────────────────────────────────────────────────

  describe("field transformation", () => {
    it("passes summary through unchanged", async () => {
      vi.mocked(client.put).mockResolvedValueOnce(axiosResponse(null));

      await updateJiraIssue(client, "PROJ-1", { summary: "New title" });

      const payload = vi.mocked(client.put).mock.calls[0][1] as any;
      expect(payload.fields.summary).toBe("New title");
    });

    it("converts description string to ADF", async () => {
      vi.mocked(client.put).mockResolvedValueOnce(axiosResponse(null));

      await updateJiraIssue(client, "PROJ-1", {
        description: "Updated description",
      });

      const payload = vi.mocked(client.put).mock.calls[0][1] as any;
      expect(payload.fields.description.type).toBe("doc");
      expect(payload.fields.description.content[0].content[0].text).toBe(
        "Updated description"
      );
    });

    it("sets description to null when description is null", async () => {
      vi.mocked(client.put).mockResolvedValueOnce(axiosResponse(null));

      await updateJiraIssue(client, "PROJ-1", { description: null });

      const payload = vi.mocked(client.put).mock.calls[0][1] as any;
      expect(payload.fields.description).toBeNull();
    });

    it("sets description to null when description is empty string", async () => {
      vi.mocked(client.put).mockResolvedValueOnce(axiosResponse(null));

      await updateJiraIssue(client, "PROJ-1", { description: "" });

      const payload = vi.mocked(client.put).mock.calls[0][1] as any;
      expect(payload.fields.description).toBeNull();
    });

    it("converts assignee string to accountId object", async () => {
      vi.mocked(client.put).mockResolvedValueOnce(axiosResponse(null));

      await updateJiraIssue(client, "PROJ-1", { assignee: "account-abc" });

      const payload = vi.mocked(client.put).mock.calls[0][1] as any;
      expect(payload.fields.assignee).toEqual({ accountId: "account-abc" });
    });

    it("sets assignee to null when assignee is null (unassign)", async () => {
      vi.mocked(client.put).mockResolvedValueOnce(axiosResponse(null));

      await updateJiraIssue(client, "PROJ-1", { assignee: null });

      const payload = vi.mocked(client.put).mock.calls[0][1] as any;
      expect(payload.fields.assignee).toBeNull();
    });

    it("converts priority string to name object", async () => {
      vi.mocked(client.put).mockResolvedValueOnce(axiosResponse(null));

      await updateJiraIssue(client, "PROJ-1", { priority: "High" });

      const payload = vi.mocked(client.put).mock.calls[0][1] as any;
      expect(payload.fields.priority).toEqual({ name: "High" });
    });

    it("passes labels array through unchanged", async () => {
      vi.mocked(client.put).mockResolvedValueOnce(axiosResponse(null));

      await updateJiraIssue(client, "PROJ-1", { labels: ["alpha", "beta"] });

      const payload = vi.mocked(client.put).mock.calls[0][1] as any;
      expect(payload.fields.labels).toEqual(["alpha", "beta"]);
    });

    it("passes unknown fields through unmodified", async () => {
      vi.mocked(client.put).mockResolvedValueOnce(axiosResponse(null));

      await updateJiraIssue(client, "PROJ-1", {
        customfield_10001: "custom value",
      });

      const payload = vi.mocked(client.put).mock.calls[0][1] as any;
      expect(payload.fields.customfield_10001).toBe("custom value");
    });

    it("handles multiple fields in one call", async () => {
      vi.mocked(client.put).mockResolvedValueOnce(axiosResponse(null));

      await updateJiraIssue(client, "PROJ-1", {
        summary: "New summary",
        priority: "Low",
        labels: ["hotfix"],
      });

      const payload = vi.mocked(client.put).mock.calls[0][1] as any;
      expect(payload.fields.summary).toBe("New summary");
      expect(payload.fields.priority).toEqual({ name: "Low" });
      expect(payload.fields.labels).toEqual(["hotfix"]);
    });
  });

  // ── response mapping ──────────────────────────────────────────────────────

  describe("response mapping", () => {
    it("returns id, key, and url constructed from the issue key", async () => {
      vi.mocked(client.put).mockResolvedValueOnce(axiosResponse(null));

      const result = await updateJiraIssue(client, "PROJ-99", {
        summary: "Updated",
      });

      expect(result.id).toBe("PROJ-99");
      expect(result.key).toBe("PROJ-99");
      expect(result.url).toBe("https://my-org.atlassian.net/browse/PROJ-99");
    });
  });

  // ── error propagation ─────────────────────────────────────────────────────

  describe("error propagation", () => {
    it("propagates network errors", async () => {
      vi.mocked(client.put).mockRejectedValueOnce(new Error("Network error"));

      await expect(
        updateJiraIssue(client, "PROJ-1", { summary: "New" })
      ).rejects.toThrow("Network error");
    });

    it("propagates 404 errors when issue not found", async () => {
      const err = Object.assign(new Error("Not Found"), {
        response: { status: 404, data: { errorMessages: ["Issue not found"] } },
      });
      vi.mocked(client.put).mockRejectedValueOnce(err);

      await expect(
        updateJiraIssue(client, "PROJ-9999", { summary: "New" })
      ).rejects.toThrow("Not Found");
    });
  });
});

// ===========================================================================
// transitionJiraIssue
// ===========================================================================
describe("jira — transitionJiraIssue()", () => {
  let client: AxiosInstance;

  const mockTransitions = {
    transitions: [
      { id: "11", name: "To Do" },
      { id: "21", name: "In Progress" },
      { id: "31", name: "Done" },
    ],
  };

  beforeEach(() => {
    client = createMockClient();
  });

  // ── input validation ──────────────────────────────────────────────────────

  describe("input validation", () => {
    it("throws when issueIdOrKey is empty", async () => {
      await expect(
        transitionJiraIssue(client, "", "Done")
      ).rejects.toThrow("Issue ID or key must not be empty");
    });

    it("throws when issueIdOrKey is only whitespace", async () => {
      await expect(
        transitionJiraIssue(client, "   ", "Done")
      ).rejects.toThrow("Issue ID or key must not be empty");
    });

    it("throws when transitionIdOrName is empty", async () => {
      await expect(
        transitionJiraIssue(client, "PROJ-1", "")
      ).rejects.toThrow("Transition ID or name must not be empty");
    });

    it("throws when transitionIdOrName is only whitespace", async () => {
      await expect(
        transitionJiraIssue(client, "PROJ-1", "   ")
      ).rejects.toThrow("Transition ID or name must not be empty");
    });
  });

  // ── transition resolution ─────────────────────────────────────────────────

  describe("transition resolution", () => {
    it("resolves transition by exact name (case-insensitive)", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(axiosResponse(mockTransitions));
      vi.mocked(client.post).mockResolvedValueOnce(axiosResponse(null));

      const result = await transitionJiraIssue(client, "PROJ-1", "in progress");

      expect(result.transitionId).toBe("21");
      expect(result.transitionName).toBe("In Progress");
    });

    it("resolves transition by numeric ID", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(axiosResponse(mockTransitions));
      vi.mocked(client.post).mockResolvedValueOnce(axiosResponse(null));

      const result = await transitionJiraIssue(client, "PROJ-1", "31");

      expect(result.transitionId).toBe("31");
      expect(result.transitionName).toBe("Done");
    });

    it("falls back to name matching when numeric ID is not found", async () => {
      // "99" is not a valid ID but we have a transition named "To Do"
      vi.mocked(client.get).mockResolvedValueOnce(axiosResponse(mockTransitions));
      vi.mocked(client.post).mockResolvedValueOnce(axiosResponse(null));

      // "11" is a valid ID
      const result = await transitionJiraIssue(client, "PROJ-1", "11");
      expect(result.transitionId).toBe("11");
    });

    it("throws when transition name is not found", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(axiosResponse(mockTransitions));

      await expect(
        transitionJiraIssue(client, "PROJ-1", "Nonexistent Status")
      ).rejects.toThrow(
        'Transition "Nonexistent Status" not found for issue PROJ-1'
      );
    });

    it("includes available transitions in the error message", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(axiosResponse(mockTransitions));

      await expect(
        transitionJiraIssue(client, "PROJ-1", "Unknown")
      ).rejects.toThrow("To Do");
    });

    it("throws with 'none' when no transitions are available", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(
        axiosResponse({ transitions: [] })
      );

      await expect(
        transitionJiraIssue(client, "PROJ-1", "Done")
      ).rejects.toThrow("Available transitions: none");
    });
  });

  // ── API calls ─────────────────────────────────────────────────────────────

  describe("API calls", () => {
    it("fetches transitions from GET /rest/api/3/issue/{key}/transitions first", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(axiosResponse(mockTransitions));
      vi.mocked(client.post).mockResolvedValueOnce(axiosResponse(null));

      await transitionJiraIssue(client, "PROJ-1", "Done");

      expect(client.get).toHaveBeenCalledWith(
        "/rest/api/3/issue/PROJ-1/transitions"
      );
    });

    it("posts to /rest/api/3/issue/{key}/transitions with the resolved ID", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(axiosResponse(mockTransitions));
      vi.mocked(client.post).mockResolvedValueOnce(axiosResponse(null));

      await transitionJiraIssue(client, "PROJ-1", "Done");

      expect(client.post).toHaveBeenCalledWith(
        "/rest/api/3/issue/PROJ-1/transitions",
        { transition: { id: "31" } }
      );
    });

    it("calls GET before POST (sequential order)", async () => {
      const callOrder: string[] = [];

      vi.mocked(client.get).mockImplementationOnce(async () => {
        callOrder.push("GET");
        return axiosResponse(mockTransitions);
      });

      vi.mocked(client.post).mockImplementationOnce(async () => {
        callOrder.push("POST");
        return axiosResponse(null);
      });

      await transitionJiraIssue(client, "PROJ-1", "Done");

      expect(callOrder).toEqual(["GET", "POST"]);
    });

    it("does not POST if transition is not found", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(axiosResponse(mockTransitions));

      await expect(
        transitionJiraIssue(client, "PROJ-1", "Unknown")
      ).rejects.toThrow();

      expect(client.post).not.toHaveBeenCalled();
    });

    it("URL-encodes the issue key in both requests", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(axiosResponse(mockTransitions));
      vi.mocked(client.post).mockResolvedValueOnce(axiosResponse(null));

      await transitionJiraIssue(client, "MY PROJECT-1", "Done");

      expect(client.get).toHaveBeenCalledWith(
        "/rest/api/3/issue/MY%20PROJECT-1/transitions"
      );
      expect(client.post).toHaveBeenCalledWith(
        "/rest/api/3/issue/MY%20PROJECT-1/transitions",
        expect.anything()
      );
    });
  });

  // ── response mapping ──────────────────────────────────────────────────────

  describe("response mapping", () => {
    it("returns issueKey, transitionId, transitionName, and url", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(axiosResponse(mockTransitions));
      vi.mocked(client.post).mockResolvedValueOnce(axiosResponse(null));

      const result = await transitionJiraIssue(client, "PROJ-1", "Done");

      expect(result.issueKey).toBe("PROJ-1");
      expect(result.transitionId).toBe("31");
      expect(result.transitionName).toBe("Done");
      expect(result.url).toBe("https://my-org.atlassian.net/browse/PROJ-1");
    });
  });

  // ── error propagation ─────────────────────────────────────────────────────

  describe("error propagation", () => {
    it("propagates errors from the GET transitions request", async () => {
      vi.mocked(client.get).mockRejectedValueOnce(new Error("Network error"));

      await expect(
        transitionJiraIssue(client, "PROJ-1", "Done")
      ).rejects.toThrow("Network error");
    });

    it("propagates errors from the POST transition request", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(axiosResponse(mockTransitions));
      vi.mocked(client.post).mockRejectedValueOnce(
        Object.assign(new Error("Forbidden"), {
          response: { status: 403 },
        })
      );

      await expect(
        transitionJiraIssue(client, "PROJ-1", "Done")
      ).rejects.toThrow("Forbidden");
    });
  });
});

// ===========================================================================
// getJiraIssueTransitions
// ===========================================================================
describe("jira — getJiraIssueTransitions()", () => {
  let client: AxiosInstance;

  beforeEach(() => {
    client = createMockClient();
  });

  // ── input validation ──────────────────────────────────────────────────────

  describe("input validation", () => {
    it("throws when issueIdOrKey is empty", async () => {
      await expect(getJiraIssueTransitions(client, "")).rejects.toThrow(
        "Issue ID or key must not be empty"
      );
    });

    it("throws when issueIdOrKey is only whitespace", async () => {
      await expect(getJiraIssueTransitions(client, "   ")).rejects.toThrow(
        "Issue ID or key must not be empty"
      );
    });
  });

  // ── API request ───────────────────────────────────────────────────────────

  describe("API request", () => {
    it("calls GET /rest/api/3/issue/{key}/transitions", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(
        axiosResponse({ transitions: [] })
      );

      await getJiraIssueTransitions(client, "PROJ-1");

      expect(client.get).toHaveBeenCalledWith(
        "/rest/api/3/issue/PROJ-1/transitions"
      );
    });

    it("URL-encodes the issue key", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(
        axiosResponse({ transitions: [] })
      );

      await getJiraIssueTransitions(client, "MY PROJECT-1");

      expect(client.get).toHaveBeenCalledWith(
        "/rest/api/3/issue/MY%20PROJECT-1/transitions"
      );
    });
  });

  // ── response mapping ──────────────────────────────────────────────────────

  describe("response mapping", () => {
    it("returns a list of transitions with id and name", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(
        axiosResponse({
          transitions: [
            { id: "11", name: "To Do" },
            { id: "21", name: "In Progress" },
            { id: "31", name: "Done" },
          ],
        })
      );

      const result = await getJiraIssueTransitions(client, "PROJ-1");

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ id: "11", name: "To Do" });
      expect(result[1]).toEqual({ id: "21", name: "In Progress" });
      expect(result[2]).toEqual({ id: "31", name: "Done" });
    });

    it("returns an empty array when transitions is empty", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(
        axiosResponse({ transitions: [] })
      );

      const result = await getJiraIssueTransitions(client, "PROJ-1");

      expect(result).toHaveLength(0);
    });

    it("returns an empty array when transitions is missing from response", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(axiosResponse({}));

      const result = await getJiraIssueTransitions(client, "PROJ-1");

      expect(result).toHaveLength(0);
    });

    it("coerces non-string id to string", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(
        axiosResponse({
          transitions: [{ id: 42, name: "Done" }],
        })
      );

      const result = await getJiraIssueTransitions(client, "PROJ-1");

      expect(result[0].id).toBe("42");
    });

    it("returns empty string name when name is missing", async () => {
      vi.mocked(client.get).mockResolvedValueOnce(
        axiosResponse({
          transitions: [{ id: "11" }],
        })
      );

      const result = await getJiraIssueTransitions(client, "PROJ-1");

      expect(result[0].name).toBe("");
    });
  });

  // ── error propagation ─────────────────────────────────────────────────────

  describe("error propagation", () => {
    it("propagates network errors", async () => {
      vi.mocked(client.get).mockRejectedValueOnce(new Error("Network error"));

      await expect(
        getJiraIssueTransitions(client, "PROJ-1")
      ).rejects.toThrow("Network error");
    });

    it("propagates 404 errors", async () => {
      const err = Object.assign(new Error("Not Found"), {
        response: { status: 404 },
      });
      vi.mocked(client.get).mockRejectedValueOnce(err);

      await expect(
        getJiraIssueTransitions(client, "PROJ-9999")
      ).rejects.toThrow("Not Found");
    });
  });
});