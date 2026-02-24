import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchConfluence, getConfluencePage, updateConfluencePage, checkPermissions } from "../../src/confluence.js";
import type { AxiosInstance, AxiosResponse } from "axios";

// ---------------------------------------------------------------------------
// Helper: build a mock AxiosInstance with stubbed get/put
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

// ===========================================================================
// searchConfluence
// ===========================================================================
describe("confluence — searchConfluence()", () => {
  let client: AxiosInstance;

  beforeEach(() => {
    client = createMockClient();
  });

  // -------------------------------------------------------
  // Input validation
  // -------------------------------------------------------
  describe("input validation", () => {
    it("throws when CQL is an empty string", async () => {
      await expect(searchConfluence(client, "")).rejects.toThrowError(
        "CQL query string must not be empty"
      );
    });

    it("throws when CQL is only whitespace", async () => {
      await expect(searchConfluence(client, "   ")).rejects.toThrowError(
        "CQL query string must not be empty"
      );
    });

    it("throws when limit is 0", async () => {
      await expect(searchConfluence(client, "type=page", 0)).rejects.toThrowError(
        "Limit must be between 1 and 100"
      );
    });

    it("throws when limit is negative", async () => {
      await expect(searchConfluence(client, "type=page", -5)).rejects.toThrowError(
        "Limit must be between 1 and 100"
      );
    });

    it("throws when limit is greater than 100", async () => {
      await expect(searchConfluence(client, "type=page", 101)).rejects.toThrowError(
        "Limit must be between 1 and 100"
      );
    });

    it("does not throw when limit is exactly 1", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({ results: [], totalSize: 0 })
      );

      await expect(searchConfluence(client, "type=page", 1)).resolves.not.toThrow();
    });

    it("does not throw when limit is exactly 100", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({ results: [], totalSize: 0 })
      );

      await expect(searchConfluence(client, "type=page", 100)).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------
  // API call
  // -------------------------------------------------------
  describe("API request", () => {
    it("calls GET /wiki/rest/api/content/search with correct params", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({ results: [], totalSize: 0 })
      );

      await searchConfluence(client, 'type=page AND text~"MCP"', 10);

      expect(client.get).toHaveBeenCalledOnce();
      expect(client.get).toHaveBeenCalledWith("/wiki/rest/api/content/search", {
        params: {
          cql: 'type=page AND text~"MCP"',
          limit: 10,
        },
      });
    });

    it("defaults limit to 25 when not specified", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({ results: [], totalSize: 0 })
      );

      await searchConfluence(client, "type=page");

      expect(client.get).toHaveBeenCalledWith("/wiki/rest/api/content/search", {
        params: {
          cql: "type=page",
          limit: 25,
        },
      });
    });
  });

  // -------------------------------------------------------
  // Response mapping
  // -------------------------------------------------------
  describe("response mapping", () => {
    it("maps Confluence results to SearchResult objects with id, title, url", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          results: [
            {
              id: "12345",
              title: "Getting Started",
              _links: { webui: "/spaces/ENG/pages/12345/Getting+Started" },
            },
            {
              id: "67890",
              title: "API Reference",
              _links: { webui: "/spaces/ENG/pages/67890/API+Reference" },
            },
          ],
          totalSize: 2,
        })
      );

      const response = await searchConfluence(client, "type=page");

      expect(response.results).toHaveLength(2);
      expect(response.results[0]).toEqual({
        id: "12345",
        title: "Getting Started",
        url: "https://my-org.atlassian.net/wiki/spaces/ENG/pages/12345/Getting+Started",
      });
      expect(response.results[1]).toEqual({
        id: "67890",
        title: "API Reference",
        url: "https://my-org.atlassian.net/wiki/spaces/ENG/pages/67890/API+Reference",
      });
    });

    it("returns totalSize from the API response", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          results: [{ id: "1", title: "Page", _links: { webui: "/p" } }],
          totalSize: 42,
        })
      );

      const response = await searchConfluence(client, "type=page");

      expect(response.totalSize).toBe(42);
    });

    it("handles a result with missing _links gracefully", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          results: [{ id: "111", title: "No Links Page" }],
          totalSize: 1,
        })
      );

      const response = await searchConfluence(client, "type=page");

      expect(response.results[0]).toEqual({
        id: "111",
        title: "No Links Page",
        url: "https://my-org.atlassian.net/wiki",
      });
    });

    it("handles a result with _links but missing webui", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          results: [{ id: "222", title: "Partial Links", _links: {} }],
          totalSize: 1,
        })
      );

      const response = await searchConfluence(client, "type=page");

      expect(response.results[0].url).toBe("https://my-org.atlassian.net/wiki");
    });

    it("returns an empty results array when API returns no results", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({ results: [], totalSize: 0 })
      );

      const response = await searchConfluence(client, "type=page AND title=nonexistent");

      expect(response.results).toEqual([]);
      expect(response.totalSize).toBe(0);
    });

    it("handles missing results array in API response", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({ totalSize: 0 })
      );

      const response = await searchConfluence(client, "type=page");

      expect(response.results).toEqual([]);
    });

    it("falls back to results.length when totalSize is missing", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          results: [
            { id: "1", title: "A", _links: { webui: "/a" } },
            { id: "2", title: "B", _links: { webui: "/b" } },
          ],
        })
      );

      const response = await searchConfluence(client, "type=page");

      expect(response.totalSize).toBe(2);
    });

    it("constructs URL correctly when baseURL is missing from client", async () => {
      const clientNoBase = createMockClient();
      (clientNoBase as any).defaults.baseURL = undefined;

      (clientNoBase.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          results: [
            { id: "1", title: "Page", _links: { webui: "/spaces/X/pages/1" } },
          ],
          totalSize: 1,
        })
      );

      const response = await searchConfluence(clientNoBase, "type=page");

      expect(response.results[0].url).toBe("/wiki/spaces/X/pages/1");
    });
  });

  // -------------------------------------------------------
  // Error propagation
  // -------------------------------------------------------
  describe("error propagation", () => {
    it("propagates network errors from axios", async () => {
      const networkError = new Error("Network Error");
      (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(networkError);

      await expect(searchConfluence(client, "type=page")).rejects.toThrow("Network Error");
    });

    it("propagates 401 errors from the API", async () => {
      const unauthorizedError = Object.assign(new Error("Request failed with status code 401"), {
        response: { status: 401, data: { message: "Unauthorized" } },
      });
      (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(unauthorizedError);

      await expect(searchConfluence(client, "type=page")).rejects.toThrow("401");
    });

    it("propagates 403 errors from the API", async () => {
      const forbiddenError = Object.assign(new Error("Request failed with status code 403"), {
        response: { status: 403, data: { message: "Forbidden" } },
      });
      (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(forbiddenError);

      await expect(searchConfluence(client, "type=page")).rejects.toThrow("403");
    });
  });
});

// ===========================================================================
// getConfluencePage
// ===========================================================================
describe("confluence — getConfluencePage()", () => {
  let client: AxiosInstance;

  beforeEach(() => {
    client = createMockClient();
  });

  // -------------------------------------------------------
  // Input validation
  // -------------------------------------------------------
  describe("input validation", () => {
    it("throws when pageId is an empty string", async () => {
      await expect(getConfluencePage(client, "")).rejects.toThrowError(
        "Page ID must not be empty"
      );
    });

    it("throws when pageId is only whitespace", async () => {
      await expect(getConfluencePage(client, "   ")).rejects.toThrowError(
        "Page ID must not be empty"
      );
    });
  });

  // -------------------------------------------------------
  // API request
  // -------------------------------------------------------
  describe("API request", () => {
    it("calls GET /wiki/rest/api/content/{pageId} with correct expand params", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          id: "12345",
          title: "Test Page",
          space: { key: "ENG" },
          version: { number: 3 },
          body: { storage: { value: "<p>Hello</p>" } },
          _links: { webui: "/spaces/ENG/pages/12345/Test+Page" },
        })
      );

      await getConfluencePage(client, "12345");

      expect(client.get).toHaveBeenCalledWith("/wiki/rest/api/content/12345", {
        params: {
          expand: "body.storage,version,space",
        },
      });
    });
  });

  // -------------------------------------------------------
  // Response mapping
  // -------------------------------------------------------
  describe("response mapping", () => {
    it("maps Confluence response to GetPageResponse with all fields", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          id: "12345",
          title: "Architecture Overview",
          space: { key: "ENG" },
          version: { number: 5 },
          body: { storage: { value: "<h1>Architecture</h1><p>Details here.</p>" } },
          _links: { webui: "/spaces/ENG/pages/12345/Architecture+Overview" },
        })
      );

      const response = await getConfluencePage(client, "12345");

      expect(response.id).toBe("12345");
      expect(response.title).toBe("Architecture Overview");
      expect(response.spaceKey).toBe("ENG");
      expect(response.version).toBe(5);
      expect(response.url).toBe(
        "https://my-org.atlassian.net/wiki/spaces/ENG/pages/12345/Architecture+Overview"
      );
      expect(response.content).toBe("<h1>Architecture</h1><p>Details here.</p>");
    });

    it("returns empty content when body.storage.value is missing", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          id: "99999",
          title: "Empty Page",
          space: { key: "ENG" },
          version: { number: 1 },
          body: {},
          _links: { webui: "/spaces/ENG/pages/99999/Empty+Page" },
        })
      );

      const response = await getConfluencePage(client, "99999");
      expect(response.content).toBe("");
    });

    it("returns empty content when body is missing entirely", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          id: "99999",
          title: "No Body",
          space: { key: "ENG" },
          version: { number: 1 },
          _links: { webui: "/spaces/ENG/pages/99999/No+Body" },
        })
      );

      const response = await getConfluencePage(client, "99999");
      expect(response.content).toBe("");
    });

    it("returns version 0 when version number is missing", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          id: "12345",
          title: "Test",
          space: { key: "ENG" },
          body: { storage: { value: "<p>Hi</p>" } },
          _links: { webui: "/spaces/ENG/pages/12345/Test" },
        })
      );

      const response = await getConfluencePage(client, "12345");
      expect(response.version).toBe(0);
    });

    it("returns 'unknown' spaceKey when space is missing", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          id: "12345",
          title: "Test",
          version: { number: 1 },
          body: { storage: { value: "<p>Hi</p>" } },
          _links: { webui: "/spaces/ENG/pages/12345/Test" },
        })
      );

      const response = await getConfluencePage(client, "12345");
      expect(response.spaceKey).toBe("unknown");
    });

    it("handles missing _links gracefully", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          id: "12345",
          title: "Test",
          space: { key: "ENG" },
          version: { number: 1 },
          body: { storage: { value: "<p>Hi</p>" } },
        })
      );

      const response = await getConfluencePage(client, "12345");
      expect(response.url).toBe("https://my-org.atlassian.net/wiki");
    });

    it("handles missing webui in _links", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          id: "12345",
          title: "Test",
          space: { key: "ENG" },
          version: { number: 1 },
          body: { storage: { value: "<p>Hi</p>" } },
          _links: {},
        })
      );

      const response = await getConfluencePage(client, "12345");
      expect(response.url).toBe("https://my-org.atlassian.net/wiki");
    });

    it("constructs URL correctly when baseURL is missing from client", async () => {
      const clientNoBase = createMockClient({
        defaults: { baseURL: undefined, headers: {} as any },
      } as Partial<AxiosInstance>);

      (clientNoBase.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          id: "12345",
          title: "Test",
          space: { key: "ENG" },
          version: { number: 1 },
          body: { storage: { value: "<p>Hi</p>" } },
          _links: { webui: "/spaces/ENG/pages/12345/Test" },
        })
      );

      const response = await getConfluencePage(clientNoBase, "12345");
      expect(response.url).toBe("/wiki/spaces/ENG/pages/12345/Test");
    });
  });

  // -------------------------------------------------------
  // Space-scoping guard
  // -------------------------------------------------------
  describe("space-scoping guard", () => {
    it("does not throw when no spaceKey is configured (guard disabled)", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          id: "12345",
          title: "Test",
          space: { key: "OTHER" },
          version: { number: 1 },
          body: { storage: { value: "<p>Hi</p>" } },
          _links: { webui: "/spaces/OTHER/pages/12345/Test" },
        })
      );

      await expect(getConfluencePage(client, "12345")).resolves.toBeDefined();
    });

    it("does not throw when page space matches the configured spaceKey", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          id: "12345",
          title: "Test",
          space: { key: "ENG" },
          version: { number: 1 },
          body: { storage: { value: "<p>Hi</p>" } },
          _links: { webui: "/spaces/ENG/pages/12345/Test" },
        })
      );

      await expect(
        getConfluencePage(client, "12345", "ENG")
      ).resolves.toBeDefined();
    });

    it("throws when page space does not match the configured spaceKey", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          id: "12345",
          title: "Test",
          space: { key: "OTHER" },
          version: { number: 1 },
          body: { storage: { value: "<p>Hi</p>" } },
          _links: { webui: "/spaces/OTHER/pages/12345/Test" },
        })
      );

      await expect(
        getConfluencePage(client, "12345", "ENG")
      ).rejects.toThrowError(
        'Page 12345 belongs to space "OTHER" but this server is scoped to space "ENG". Read rejected.'
      );
    });

    it("throws when page space is missing and a spaceKey is configured", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          id: "12345",
          title: "Test",
          version: { number: 1 },
          body: { storage: { value: "<p>Hi</p>" } },
          _links: { webui: "/spaces/ENG/pages/12345/Test" },
        })
      );

      await expect(
        getConfluencePage(client, "12345", "ENG")
      ).rejects.toThrowError(
        'Page 12345 belongs to space "unknown" but this server is scoped to space "ENG". Read rejected.'
      );
    });

    it("does not throw when spaceKey is an empty string (guard treated as disabled)", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          id: "12345",
          title: "Test",
          space: { key: "OTHER" },
          version: { number: 1 },
          body: { storage: { value: "<p>Hi</p>" } },
          _links: { webui: "/spaces/OTHER/pages/12345/Test" },
        })
      );

      await expect(
        getConfluencePage(client, "12345", "")
      ).resolves.toBeDefined();
    });

    it("does not throw when spaceKey is only whitespace (guard treated as disabled)", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          id: "12345",
          title: "Test",
          space: { key: "OTHER" },
          version: { number: 1 },
          body: { storage: { value: "<p>Hi</p>" } },
          _links: { webui: "/spaces/OTHER/pages/12345/Test" },
        })
      );

      await expect(
        getConfluencePage(client, "12345", "   ")
      ).resolves.toBeDefined();
    });
  });

  // -------------------------------------------------------
  // Error propagation
  // -------------------------------------------------------
  describe("error propagation", () => {
    it("propagates network errors from axios", async () => {
      const networkError = new Error("Network Error");
      (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(networkError);

      await expect(getConfluencePage(client, "12345")).rejects.toThrow(
        "Network Error"
      );
    });

    it("propagates 401 errors from the API", async () => {
      const unauthorizedError = Object.assign(new Error("Request failed with status code 401"), {
        response: { status: 401, data: { message: "Unauthorized" } },
      });
      (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(unauthorizedError);

      await expect(getConfluencePage(client, "12345")).rejects.toThrow("401");
    });

    it("propagates 404 errors from the API", async () => {
      const notFoundError = Object.assign(new Error("Request failed with status code 404"), {
        response: { status: 404, data: { message: "Not Found" } },
      });
      (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(notFoundError);

      await expect(getConfluencePage(client, "12345")).rejects.toThrow("404");
    });
  });
});

// ===========================================================================
// updateConfluencePage
// ===========================================================================
describe("confluence — updateConfluencePage()", () => {
  let client: AxiosInstance;

  beforeEach(() => {
    client = createMockClient();
  });

  // -------------------------------------------------------
  // Input validation
  // -------------------------------------------------------
  describe("input validation", () => {
    it("throws when pageId is an empty string", async () => {
      await expect(
        updateConfluencePage(client, "", "Title", "# Content")
      ).rejects.toThrowError("Page ID must not be empty");
    });

    it("throws when pageId is only whitespace", async () => {
      await expect(
        updateConfluencePage(client, "   ", "Title", "# Content")
      ).rejects.toThrowError("Page ID must not be empty");
    });

    it("throws when title is an empty string", async () => {
      await expect(
        updateConfluencePage(client, "12345", "", "# Content")
      ).rejects.toThrowError("Title must not be empty");
    });

    it("throws when title is only whitespace", async () => {
      await expect(
        updateConfluencePage(client, "12345", "   ", "# Content")
      ).rejects.toThrowError("Title must not be empty");
    });
  });

  // -------------------------------------------------------
  // Version fetching
  // -------------------------------------------------------
  describe("version fetching", () => {
    it("calls GET /wiki/rest/api/content/{pageId}?expand=version", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({ version: { number: 5 } })
      );
      (client.put as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          id: "12345",
          title: "Updated",
          version: { number: 6 },
          _links: { webui: "/pages/12345" },
        })
      );

      await updateConfluencePage(client, "12345", "Updated", "# Hello");

      expect(client.get).toHaveBeenCalledOnce();
      expect(client.get).toHaveBeenCalledWith("/wiki/rest/api/content/12345", {
        params: { expand: "version,space" },
      });
    });

    it("throws when version number is missing from the GET response", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({ version: {} })
      );

      await expect(
        updateConfluencePage(client, "12345", "Title", "# Content")
      ).rejects.toThrowError("Unable to determine current version for page 12345");
    });

    it("throws when version object is missing entirely", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({})
      );

      await expect(
        updateConfluencePage(client, "99999", "Title", "# Content")
      ).rejects.toThrowError("Unable to determine current version for page 99999");
    });

    it("throws when version.number is a string instead of a number", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({ version: { number: "not-a-number" } })
      );

      await expect(
        updateConfluencePage(client, "12345", "Title", "# Content")
      ).rejects.toThrowError("Unable to determine current version for page 12345");
    });
  });

  // -------------------------------------------------------
  // Version bumping
  // -------------------------------------------------------
  describe("version bumping", () => {
    it("increments the version by 1 in the PUT payload", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({ version: { number: 7 } })
      );
      (client.put as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          id: "12345",
          title: "My Page",
          version: { number: 8 },
          _links: { webui: "/pages/12345" },
        })
      );

      await updateConfluencePage(client, "12345", "My Page", "content");

      const putCall = (client.put as ReturnType<typeof vi.fn>).mock.calls[0];
      const payload = putCall[1];

      expect(payload.version.number).toBe(8);
    });

    it("handles version 1 (new page) correctly → bumps to 2", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({ version: { number: 1 } })
      );
      (client.put as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          id: "100",
          title: "New Page",
          version: { number: 2 },
          _links: { webui: "/pages/100" },
        })
      );

      await updateConfluencePage(client, "100", "New Page", "First update");

      const putCall = (client.put as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(putCall[1].version.number).toBe(2);
    });

    it("handles large version numbers", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({ version: { number: 999 } })
      );
      (client.put as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          id: "500",
          title: "Active Page",
          version: { number: 1000 },
          _links: { webui: "/pages/500" },
        })
      );

      await updateConfluencePage(client, "500", "Active Page", "update");

      const putCall = (client.put as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(putCall[1].version.number).toBe(1000);
    });
  });

  // -------------------------------------------------------
  // Markdown → HTML conversion in the payload
  // -------------------------------------------------------
  describe("markdown to HTML conversion", () => {
    beforeEach(() => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({ version: { number: 3 } })
      );
      (client.put as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          id: "12345",
          title: "Page",
          version: { number: 4 },
          _links: { webui: "/pages/12345" },
        })
      );
    });

    it("converts a heading to HTML in the storage value", async () => {
      await updateConfluencePage(client, "12345", "Page", "# Hello");

      const putCall = (client.put as ReturnType<typeof vi.fn>).mock.calls[0];
      const storageValue: string = putCall[1].body.storage.value;

      expect(storageValue).toContain("<h1>Hello</h1>");
    });

    it("converts bold markdown to <strong> in the storage value", async () => {
      await updateConfluencePage(client, "12345", "Page", "**bold text**");

      const putCall = (client.put as ReturnType<typeof vi.fn>).mock.calls[0];
      const storageValue: string = putCall[1].body.storage.value;

      expect(storageValue).toContain("<strong>bold text</strong>");
    });

    it("converts a list to HTML in the storage value", async () => {
      await updateConfluencePage(client, "12345", "Page", "- item A\n- item B");

      const putCall = (client.put as ReturnType<typeof vi.fn>).mock.calls[0];
      const storageValue: string = putCall[1].body.storage.value;

      expect(storageValue).toContain("<ul>");
      expect(storageValue).toContain("<li>item A</li>");
      expect(storageValue).toContain("<li>item B</li>");
    });

    it("sends empty HTML when markdownContent is empty", async () => {
      await updateConfluencePage(client, "12345", "Page", "");

      const putCall = (client.put as ReturnType<typeof vi.fn>).mock.calls[0];
      const storageValue: string = putCall[1].body.storage.value;

      expect(storageValue).toBe("");
    });

    it("sets representation to 'storage' in the body payload", async () => {
      await updateConfluencePage(client, "12345", "Page", "content");

      const putCall = (client.put as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(putCall[1].body.storage.representation).toBe("storage");
    });
  });

  // -------------------------------------------------------
  // PUT request payload structure
  // -------------------------------------------------------
  describe("PUT request payload", () => {
    beforeEach(() => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({ version: { number: 10 } })
      );
      (client.put as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          id: "54321",
          title: "Test Title",
          version: { number: 11 },
          _links: { webui: "/pages/54321" },
        })
      );
    });

    it("sends PUT to /wiki/rest/api/content/{pageId}", async () => {
      await updateConfluencePage(client, "54321", "Test Title", "# Test");

      expect(client.put).toHaveBeenCalledOnce();
      const putCall = (client.put as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(putCall[0]).toBe("/wiki/rest/api/content/54321");
    });

    it("includes id in the payload", async () => {
      await updateConfluencePage(client, "54321", "Test Title", "# Test");

      const putCall = (client.put as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(putCall[1].id).toBe("54321");
    });

    it("includes type as 'page' in the payload", async () => {
      await updateConfluencePage(client, "54321", "Test Title", "# Test");

      const putCall = (client.put as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(putCall[1].type).toBe("page");
    });

    it("includes the updated title in the payload", async () => {
      await updateConfluencePage(client, "54321", "New Title Here", "# Test");

      const putCall = (client.put as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(putCall[1].title).toBe("New Title Here");
    });

    it("includes the full correct payload structure", async () => {
      await updateConfluencePage(client, "54321", "Full Test", "**bold**");

      const putCall = (client.put as ReturnType<typeof vi.fn>).mock.calls[0];
      const payload = putCall[1];

      expect(payload).toMatchObject({
        id: "54321",
        type: "page",
        title: "Full Test",
        version: {
          number: 11,
        },
        body: {
          storage: {
            representation: "storage",
          },
        },
      });

      // Verify the storage value contains the converted HTML
      expect(payload.body.storage.value).toContain("<strong>bold</strong>");
    });
  });

  // -------------------------------------------------------
  // Response mapping
  // -------------------------------------------------------
  describe("response mapping", () => {
    it("returns an UpdateResponse with id, title, version, and url", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({ version: { number: 4 } })
      );
      (client.put as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          id: "12345",
          title: "Updated Page",
          version: { number: 5 },
          _links: { webui: "/spaces/ENG/pages/12345/Updated+Page" },
        })
      );

      const result = await updateConfluencePage(client, "12345", "Updated Page", "# New");

      expect(result).toEqual({
        id: "12345",
        title: "Updated Page",
        version: 5,
        url: "https://my-org.atlassian.net/wiki/spaces/ENG/pages/12345/Updated+Page",
      });
    });

    it("falls back to newVersion when response is missing version.number", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({ version: { number: 20 } })
      );
      (client.put as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          id: "111",
          title: "Fallback Page",
          version: {},
          _links: { webui: "/pages/111" },
        })
      );

      const result = await updateConfluencePage(client, "111", "Fallback Page", "text");

      expect(result.version).toBe(21);
    });

    it("handles missing _links in the update response", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({ version: { number: 1 } })
      );
      (client.put as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          id: "222",
          title: "No Links",
          version: { number: 2 },
        })
      );

      const result = await updateConfluencePage(client, "222", "No Links", "text");

      expect(result.url).toBe("https://my-org.atlassian.net/wiki");
    });

    it("handles missing webui in _links of the update response", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({ version: { number: 1 } })
      );
      (client.put as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          id: "333",
          title: "Partial Links",
          version: { number: 2 },
          _links: {},
        })
      );

      const result = await updateConfluencePage(client, "333", "Partial Links", "text");

      expect(result.url).toBe("https://my-org.atlassian.net/wiki");
    });

    it("constructs URL correctly when baseURL is missing from client", async () => {
      const clientNoBase = createMockClient();
      (clientNoBase as any).defaults.baseURL = undefined;

      (clientNoBase.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({ version: { number: 1 } })
      );
      (clientNoBase.put as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          id: "444",
          title: "No Base",
          version: { number: 2 },
          _links: { webui: "/spaces/X/pages/444" },
        })
      );

      const result = await updateConfluencePage(clientNoBase, "444", "No Base", "text");

      expect(result.url).toBe("/wiki/spaces/X/pages/444");
    });
  });

  // -------------------------------------------------------
  // Error propagation
  // -------------------------------------------------------
  describe("error propagation", () => {
    it("propagates errors from the GET version request", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("GET failed: 404 Not Found")
      );

      await expect(
        updateConfluencePage(client, "12345", "Title", "content")
      ).rejects.toThrow("GET failed: 404 Not Found");

      // PUT should never have been called
      expect(client.put).not.toHaveBeenCalled();
    });

    it("propagates errors from the PUT update request", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({ version: { number: 5 }, space: { key: "MYSPACE" } })
      );
      (client.put as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("PUT failed: 409 Conflict")
      );

      await expect(
        updateConfluencePage(client, "12345", "Title", "content")
      ).rejects.toThrow("PUT failed: 409 Conflict");
    });

    it("does not call PUT if version validation fails", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({}) // no version object
      );

      await expect(
        updateConfluencePage(client, "12345", "Title", "content")
      ).rejects.toThrow();

      expect(client.put).not.toHaveBeenCalled();
    });

    it("does not call PUT if input validation fails (empty pageId)", async () => {
      await expect(
        updateConfluencePage(client, "", "Title", "content")
      ).rejects.toThrow();

      expect(client.get).not.toHaveBeenCalled();
      expect(client.put).not.toHaveBeenCalled();
    });

    it("does not call PUT if input validation fails (empty title)", async () => {
      await expect(
        updateConfluencePage(client, "12345", "", "content")
      ).rejects.toThrow();

      expect(client.get).not.toHaveBeenCalled();
      expect(client.put).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------
  // Execution order
  // -------------------------------------------------------
  describe("execution order", () => {
    it("calls GET before PUT (sequential order)", async () => {
      const callOrder: string[] = [];

      (client.get as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        callOrder.push("GET");
        return axiosResponse({ version: { number: 1 } });
      });

      (client.put as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        callOrder.push("PUT");
        return axiosResponse({
          id: "12345",
          title: "Title",
          version: { number: 2 },
          _links: { webui: "/pages/12345" },
        });
      });

      await updateConfluencePage(client, "12345", "Title", "content");

      expect(callOrder).toEqual(["GET", "PUT"]);
    });
  });

  // -------------------------------------------------------
  // Space-scoping guard
  // -------------------------------------------------------
  describe("space-scoping guard", () => {
    it("does not throw when no spaceKey is configured (guard disabled)", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          version: { number: 3 },
          space: { key: "OTHER" },
        })
      );
      (client.put as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          id: "12345",
          title: "Title",
          version: { number: 4 },
          _links: { webui: "/pages/12345" },
        })
      );

      // No spaceKey passed → guard is inactive → should succeed
      await expect(
        updateConfluencePage(client, "12345", "Title", "content")
      ).resolves.toBeDefined();
    });

    it("does not throw when page space matches the configured spaceKey", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          version: { number: 3 },
          space: { key: "PROJ" },
        })
      );
      (client.put as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          id: "12345",
          title: "Title",
          version: { number: 4 },
          _links: { webui: "/pages/12345" },
        })
      );

      await expect(
        updateConfluencePage(client, "12345", "Title", "content", "PROJ")
      ).resolves.toBeDefined();
    });

    it("throws when page space does not match the configured spaceKey", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          version: { number: 3 },
          space: { key: "OTHER" },
        })
      );

      await expect(
        updateConfluencePage(client, "12345", "Title", "content", "PROJ")
      ).rejects.toThrowError(
        `Page 12345 belongs to space "OTHER" but this server is scoped to space "PROJ". Update rejected to prevent unintended modification.`
      );
    });

    it("does not call PUT when the space guard rejects", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          version: { number: 3 },
          space: { key: "OTHER" },
        })
      );

      await expect(
        updateConfluencePage(client, "12345", "Title", "content", "PROJ")
      ).rejects.toThrow();

      expect(client.put).not.toHaveBeenCalled();
    });

    it("throws when page space is missing and a spaceKey is configured", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          version: { number: 3 },
          // no space field at all
        })
      );

      await expect(
        updateConfluencePage(client, "12345", "Title", "content", "PROJ")
      ).rejects.toThrowError(
        `Page 12345 belongs to space "unknown" but this server is scoped to space "PROJ". Update rejected to prevent unintended modification.`
      );
    });

    it("does not throw when spaceKey is an empty string (guard treated as disabled)", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          version: { number: 3 },
          space: { key: "OTHER" },
        })
      );
      (client.put as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          id: "12345",
          title: "Title",
          version: { number: 4 },
          _links: { webui: "/pages/12345" },
        })
      );

      // Empty string spaceKey → guard inactive
      await expect(
        updateConfluencePage(client, "12345", "Title", "content", "")
      ).resolves.toBeDefined();
    });

    it("does not throw when spaceKey is only whitespace (guard treated as disabled)", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          version: { number: 3 },
          space: { key: "OTHER" },
        })
      );
      (client.put as ReturnType<typeof vi.fn>).mockResolvedValue(
        axiosResponse({
          id: "12345",
          title: "Title",
          version: { number: 4 },
          _links: { webui: "/pages/12345" },
        })
      );

      // Whitespace-only spaceKey → guard inactive
      await expect(
        updateConfluencePage(client, "12345", "Title", "content", "   ")
      ).resolves.toBeDefined();
    });
  });
});

// ===========================================================================
// checkPermissions
// ===========================================================================
describe("confluence — checkPermissions()", () => {
  let client: AxiosInstance;

  beforeEach(() => {
    client = createMockClient();
  });

  // -------------------------------------------------------
  // Helper: build an AxiosError-like object with response.status
  // -------------------------------------------------------
  function axiosError(message: string, status: number): Error & { response?: { status: number } } {
    const err = new Error(message) as Error & { response?: { status: number } };
    err.response = { status };
    return err;
  }

  // -------------------------------------------------------
  // Full success — authentication + read + write
  // -------------------------------------------------------
  describe("full success path", () => {
    it("returns authenticated=true with user info when /user/current succeeds", async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({
            displayName: "Alice Smith",
            email: "alice@example.com",
            accountId: "acc-12345",
          })
        )
        .mockResolvedValueOnce(
          axiosResponse({ results: [{ key: "ENG", name: "Engineering" }] })
        );

      const result = await checkPermissions(client);

      expect(result.authenticated).toBe(true);
      expect(result.user).toEqual({
        displayName: "Alice Smith",
        email: "alice@example.com",
        accountId: "acc-12345",
      });
    });

    it("returns readAccess=true and accessible spaces when /space succeeds", async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({
            displayName: "Alice",
            email: "alice@example.com",
            accountId: "acc-1",
          })
        )
        .mockResolvedValueOnce(
          axiosResponse({
            results: [
              { key: "ENG", name: "Engineering" },
              { key: "OPS", name: "Operations" },
            ],
          })
        );

      const result = await checkPermissions(client);

      expect(result.readAccess).toBe(true);
      expect(result.accessibleSpaces).toEqual([
        { key: "ENG", name: "Engineering" },
        { key: "OPS", name: "Operations" },
      ]);
    });

    it("returns writeAccess=true when pageId is provided and page fetch succeeds with version", async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({
            displayName: "Alice",
            email: "alice@example.com",
            accountId: "acc-1",
          })
        )
        .mockResolvedValueOnce(
          axiosResponse({ results: [] })
        )
        .mockResolvedValueOnce(
          axiosResponse({ version: { number: 5 } })
        );

      const result = await checkPermissions(client, "12345");

      expect(result.writeAccess).toBe(true);
      expect(result.writeCheckPageId).toBe("12345");
      expect(result.errors).toEqual([]);
    });

    it("returns writeAccess=null and writeCheckPageId=null when no pageId is provided", async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({
            displayName: "Alice",
            email: "alice@example.com",
            accountId: "acc-1",
          })
        )
        .mockResolvedValueOnce(
          axiosResponse({ results: [] })
        );

      const result = await checkPermissions(client);

      expect(result.writeAccess).toBeNull();
      expect(result.writeCheckPageId).toBeNull();
    });

    it("returns empty errors array on full success", async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({
            displayName: "User",
            email: "u@e.com",
            accountId: "a",
          })
        )
        .mockResolvedValueOnce(
          axiosResponse({ results: [] })
        );

      const result = await checkPermissions(client);

      expect(result.errors).toEqual([]);
    });
  });

  // -------------------------------------------------------
  // API call verification
  // -------------------------------------------------------
  describe("API calls", () => {
    it("calls GET /wiki/rest/api/user/current first", async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({ displayName: "U", email: "u@e.com", accountId: "a" })
        )
        .mockResolvedValueOnce(
          axiosResponse({ results: [] })
        );

      await checkPermissions(client);

      const firstCall = (client.get as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(firstCall[0]).toBe("/wiki/rest/api/user/current");
    });

    it("calls GET /wiki/rest/api/space with limit=5 second", async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({ displayName: "U", email: "u@e.com", accountId: "a" })
        )
        .mockResolvedValueOnce(
          axiosResponse({ results: [] })
        );

      await checkPermissions(client);

      const secondCall = (client.get as ReturnType<typeof vi.fn>).mock.calls[1];
      expect(secondCall[0]).toBe("/wiki/rest/api/space");
      expect(secondCall[1]).toEqual({ params: { limit: 5 } });
    });

    it("calls GET /wiki/rest/api/content/{pageId}?expand=version when pageId is provided", async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({ displayName: "U", email: "u@e.com", accountId: "a" })
        )
        .mockResolvedValueOnce(
          axiosResponse({ results: [] })
        )
        .mockResolvedValueOnce(
          axiosResponse({ version: { number: 3 } })
        );

      await checkPermissions(client, "77777");

      const thirdCall = (client.get as ReturnType<typeof vi.fn>).mock.calls[2];
      expect(thirdCall[0]).toBe("/wiki/rest/api/content/77777");
      expect(thirdCall[1]).toEqual({ params: { expand: "version" } });
    });

    it("does not call page endpoint when pageId is not provided", async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({ displayName: "U", email: "u@e.com", accountId: "a" })
        )
        .mockResolvedValueOnce(
          axiosResponse({ results: [] })
        );

      await checkPermissions(client);

      expect(client.get).toHaveBeenCalledTimes(2);
    });

    it("does not call page endpoint when pageId is an empty string", async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({ displayName: "U", email: "u@e.com", accountId: "a" })
        )
        .mockResolvedValueOnce(
          axiosResponse({ results: [] })
        );

      await checkPermissions(client, "");

      expect(client.get).toHaveBeenCalledTimes(2);
    });

    it("does not call page endpoint when pageId is only whitespace", async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({ displayName: "U", email: "u@e.com", accountId: "a" })
        )
        .mockResolvedValueOnce(
          axiosResponse({ results: [] })
        );

      await checkPermissions(client, "   ");

      expect(client.get).toHaveBeenCalledTimes(2);
    });

    it("calls all three endpoints in sequence when pageId is provided", async () => {
      const callOrder: string[] = [];

      (client.get as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
        callOrder.push(url);
        if (url === "/wiki/rest/api/user/current") {
          return axiosResponse({ displayName: "U", email: "u@e.com", accountId: "a" });
        }
        if (url === "/wiki/rest/api/space") {
          return axiosResponse({ results: [] });
        }
        return axiosResponse({ version: { number: 1 } });
      });

      await checkPermissions(client, "12345");

      expect(callOrder).toEqual([
        "/wiki/rest/api/user/current",
        "/wiki/rest/api/space",
        "/wiki/rest/api/content/12345",
      ]);
    });
  });

  // -------------------------------------------------------
  // Authentication failure — Step 1
  // -------------------------------------------------------
  describe("authentication failure (Step 1)", () => {
    it("returns authenticated=false and early-returns on 401", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        axiosError("Request failed with status code 401", 401)
      );

      const result = await checkPermissions(client);

      expect(result.authenticated).toBe(false);
      expect(result.user).toBeNull();
      expect(result.readAccess).toBe(false);
      expect(result.accessibleSpaces).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("401 Unauthorized");
    });

    it("returns authenticated=false and early-returns on 403", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        axiosError("Request failed with status code 403", 403)
      );

      const result = await checkPermissions(client);

      expect(result.authenticated).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("403 Forbidden");
    });

    it("returns authenticated=false and early-returns on network error", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("Network Error: ECONNREFUSED")
      );

      const result = await checkPermissions(client);

      expect(result.authenticated).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Authentication check failed");
      expect(result.errors[0]).toContain("ECONNREFUSED");
    });

    it("does not call /space or /content endpoints when authentication fails", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        axiosError("401", 401)
      );

      await checkPermissions(client, "12345");

      // Only one call to /user/current, nothing else
      expect(client.get).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------
  // Read access failure — Step 2
  // -------------------------------------------------------
  describe("read access failure (Step 2)", () => {
    it("returns readAccess=false when /space endpoint fails", async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({ displayName: "U", email: "u@e.com", accountId: "a" })
        )
        .mockRejectedValueOnce(new Error("500 Internal Server Error"));

      const result = await checkPermissions(client);

      expect(result.authenticated).toBe(true);
      expect(result.readAccess).toBe(false);
      expect(result.accessibleSpaces).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Read access check failed");
    });

    it("still attempts write access check even when read access fails", async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({ displayName: "U", email: "u@e.com", accountId: "a" })
        )
        .mockRejectedValueOnce(new Error("Read failed"))
        .mockResolvedValueOnce(
          axiosResponse({ version: { number: 2 } })
        );

      const result = await checkPermissions(client, "12345");

      expect(result.authenticated).toBe(true);
      expect(result.readAccess).toBe(false);
      expect(result.writeAccess).toBe(true);
      expect(result.errors).toHaveLength(1);
    });
  });

  // -------------------------------------------------------
  // Write access failure — Step 3
  // -------------------------------------------------------
  describe("write access failure (Step 3)", () => {
    it("returns writeAccess=false when page is not found (404)", async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({ displayName: "U", email: "u@e.com", accountId: "a" })
        )
        .mockResolvedValueOnce(
          axiosResponse({ results: [] })
        )
        .mockRejectedValueOnce(
          axiosError("Request failed with status code 404", 404)
        );

      const result = await checkPermissions(client, "99999");

      expect(result.writeAccess).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Page 99999 not found (404)");
    });

    it("returns writeAccess=false when access is forbidden (403)", async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({ displayName: "U", email: "u@e.com", accountId: "a" })
        )
        .mockResolvedValueOnce(
          axiosResponse({ results: [] })
        )
        .mockRejectedValueOnce(
          axiosError("Request failed with status code 403", 403)
        );

      const result = await checkPermissions(client, "55555");

      expect(result.writeAccess).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("No permission to access page 55555 (403 Forbidden)");
    });

    it("returns writeAccess=false when page fetch fails with a generic error", async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({ displayName: "U", email: "u@e.com", accountId: "a" })
        )
        .mockResolvedValueOnce(
          axiosResponse({ results: [] })
        )
        .mockRejectedValueOnce(new Error("Timeout"));

      const result = await checkPermissions(client, "12345");

      expect(result.writeAccess).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Write access check failed: Timeout");
    });

    it("returns writeAccess=false when page exists but version info is unavailable", async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({ displayName: "U", email: "u@e.com", accountId: "a" })
        )
        .mockResolvedValueOnce(
          axiosResponse({ results: [] })
        )
        .mockResolvedValueOnce(
          axiosResponse({ version: {} })
        );

      const result = await checkPermissions(client, "12345");

      expect(result.writeAccess).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Page 12345 exists but version info is unavailable");
    });

    it("returns writeAccess=false when page response has no version object at all", async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({ displayName: "U", email: "u@e.com", accountId: "a" })
        )
        .mockResolvedValueOnce(
          axiosResponse({ results: [] })
        )
        .mockResolvedValueOnce(
          axiosResponse({})
        );

      const result = await checkPermissions(client, "12345");

      expect(result.writeAccess).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("version info is unavailable");
    });
  });

  // -------------------------------------------------------
  // Fallback / default values in user data
  // -------------------------------------------------------
  describe("user data fallbacks", () => {
    it('uses "Unknown" for displayName when missing', async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({ email: "u@e.com", accountId: "a" })
        )
        .mockResolvedValueOnce(
          axiosResponse({ results: [] })
        );

      const result = await checkPermissions(client);

      expect(result.user!.displayName).toBe("Unknown");
    });

    it('uses "Unknown" for email when missing', async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({ displayName: "User", accountId: "a" })
        )
        .mockResolvedValueOnce(
          axiosResponse({ results: [] })
        );

      const result = await checkPermissions(client);

      expect(result.user!.email).toBe("Unknown");
    });

    it('uses "Unknown" for accountId when missing', async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({ displayName: "User", email: "u@e.com" })
        )
        .mockResolvedValueOnce(
          axiosResponse({ results: [] })
        );

      const result = await checkPermissions(client);

      expect(result.user!.accountId).toBe("Unknown");
    });

    it("uses userKey as accountId fallback when accountId is missing", async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({ displayName: "User", email: "u@e.com", userKey: "key-fallback-123" })
        )
        .mockResolvedValueOnce(
          axiosResponse({ results: [] })
        );

      const result = await checkPermissions(client);

      expect(result.user!.accountId).toBe("key-fallback-123");
    });
  });

  // -------------------------------------------------------
  // Space results fallback
  // -------------------------------------------------------
  describe("space results handling", () => {
    it("handles missing results array in space response", async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({ displayName: "U", email: "u@e.com", accountId: "a" })
        )
        .mockResolvedValueOnce(
          axiosResponse({})
        );

      const result = await checkPermissions(client);

      expect(result.readAccess).toBe(true);
      expect(result.accessibleSpaces).toEqual([]);
    });

    it("maps multiple spaces correctly", async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({ displayName: "U", email: "u@e.com", accountId: "a" })
        )
        .mockResolvedValueOnce(
          axiosResponse({
            results: [
              { key: "A", name: "Alpha" },
              { key: "B", name: "Beta" },
              { key: "C", name: "Charlie" },
            ],
          })
        );

      const result = await checkPermissions(client);

      expect(result.accessibleSpaces).toHaveLength(3);
      expect(result.accessibleSpaces[0]).toEqual({ key: "A", name: "Alpha" });
      expect(result.accessibleSpaces[1]).toEqual({ key: "B", name: "Beta" });
      expect(result.accessibleSpaces[2]).toEqual({ key: "C", name: "Charlie" });
    });
  });

  // -------------------------------------------------------
  // Multiple errors accumulated
  // -------------------------------------------------------
  describe("error accumulation", () => {
    it("accumulates errors from both read and write checks", async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({ displayName: "U", email: "u@e.com", accountId: "a" })
        )
        .mockRejectedValueOnce(new Error("Space endpoint down"))
        .mockRejectedValueOnce(
          axiosError("404", 404)
        );

      const result = await checkPermissions(client, "12345");

      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toContain("Read access check failed");
      expect(result.errors[1]).toContain("Page 12345 not found (404)");
    });
  });

  // -------------------------------------------------------
  // Return type shape
  // -------------------------------------------------------
  describe("return type shape", () => {
    it("always returns an object with all expected keys", async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({ displayName: "U", email: "u@e.com", accountId: "a" })
        )
        .mockResolvedValueOnce(
          axiosResponse({ results: [] })
        );

      const result = await checkPermissions(client);
      const keys = Object.keys(result).sort();

      expect(keys).toEqual([
        "accessibleSpaces",
        "authenticated",
        "errors",
        "readAccess",
        "user",
        "writeAccess",
        "writeCheckPageId",
      ]);
    });

    it("returns boolean for authenticated", async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({ displayName: "U", email: "u@e.com", accountId: "a" })
        )
        .mockResolvedValueOnce(
          axiosResponse({ results: [] })
        );

      const result = await checkPermissions(client);

      expect(typeof result.authenticated).toBe("boolean");
    });

    it("returns boolean for readAccess", async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({ displayName: "U", email: "u@e.com", accountId: "a" })
        )
        .mockResolvedValueOnce(
          axiosResponse({ results: [] })
        );

      const result = await checkPermissions(client);

      expect(typeof result.readAccess).toBe("boolean");
    });

    it("returns an array for errors", async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({ displayName: "U", email: "u@e.com", accountId: "a" })
        )
        .mockResolvedValueOnce(
          axiosResponse({ results: [] })
        );

      const result = await checkPermissions(client);

      expect(Array.isArray(result.errors)).toBe(true);
    });

    it("returns an array for accessibleSpaces", async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({ displayName: "U", email: "u@e.com", accountId: "a" })
        )
        .mockResolvedValueOnce(
          axiosResponse({ results: [] })
        );

      const result = await checkPermissions(client);

      expect(Array.isArray(result.accessibleSpaces)).toBe(true);
    });
  });

  // -------------------------------------------------------
  // Non-Error thrown values (covers String(error) branches)
  // -------------------------------------------------------
  describe("non-Error thrown values", () => {
    it("handles a non-Error thrown value in the authentication catch block", async () => {
      (client.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        "raw string auth failure"
      );

      const result = await checkPermissions(client);

      expect(result.authenticated).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Authentication check failed");
      expect(result.errors[0]).toContain("raw string auth failure");
    });

    it("handles a non-Error thrown value in the read access catch block", async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({ displayName: "U", email: "u@e.com", accountId: "a" })
        )
        .mockRejectedValueOnce(42);

      const result = await checkPermissions(client);

      expect(result.readAccess).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Read access check failed");
      expect(result.errors[0]).toContain("42");
    });

    it("handles a non-Error thrown value in the write access catch block", async () => {
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          axiosResponse({ displayName: "U", email: "u@e.com", accountId: "a" })
        )
        .mockResolvedValueOnce(
          axiosResponse({ results: [] })
        )
        .mockRejectedValueOnce({ weird: "object" });

      const result = await checkPermissions(client, "12345");

      expect(result.writeAccess).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Write access check failed");
    });
  });
});

// ===========================================================================
// addConfluenceComment
// ===========================================================================
describe("confluence — addConfluenceComment()", () => {
  let client: AxiosInstance;

  beforeEach(() => {
    client = createMockClient();
  });

  // -------------------------------------------------------
  // Input validation
  // -------------------------------------------------------
  describe("input validation", () => {
    it("throws an error when pageId is empty", async () => {
      const { addConfluenceComment } = await import("../../src/confluence.js");
      await expect(
        addConfluenceComment(client, "", "Some comment")
      ).rejects.toThrow("Page ID must not be empty");
    });

    it("throws an error when pageId is whitespace only", async () => {
      const { addConfluenceComment } = await import("../../src/confluence.js");
      await expect(
        addConfluenceComment(client, "   ", "Some comment")
      ).rejects.toThrow("Page ID must not be empty");
    });

    it("throws an error when comment content is empty", async () => {
      const { addConfluenceComment } = await import("../../src/confluence.js");
      await expect(
        addConfluenceComment(client, "12345", "")
      ).rejects.toThrow("Comment content must not be empty");
    });

    it("throws an error when comment content is whitespace only", async () => {
      const { addConfluenceComment } = await import("../../src/confluence.js");
      await expect(
        addConfluenceComment(client, "12345", "   ")
      ).rejects.toThrow("Comment content must not be empty");
    });
  });

  // -------------------------------------------------------
  // Space-scoping guard
  // -------------------------------------------------------
  describe("space-scoping guard", () => {
    it("fetches page to verify space when spaceKey is provided", async () => {
      const { addConfluenceComment } = await import("../../src/confluence.js");
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        axiosResponse({ space: { key: "ENG" } })
      );
      (client.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        axiosResponse({ id: "999", _links: { webui: "/pages/999" } })
      );

      await addConfluenceComment(client, "12345", "Test comment", "ENG");

      expect(client.get).toHaveBeenCalledWith("/wiki/rest/api/content/12345", {
        params: { expand: "space" },
      });
    });

    it("throws an error when page space does not match configured space", async () => {
      const { addConfluenceComment } = await import("../../src/confluence.js");
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        axiosResponse({ space: { key: "WRONG" } })
      );

      await expect(
        addConfluenceComment(client, "12345", "Test comment", "ENG")
      ).rejects.toThrow(
        'Page 12345 belongs to space "WRONG" but this server is scoped to space "ENG". Comment rejected.'
      );
    });

    it("allows comment when page space matches configured space", async () => {
      const { addConfluenceComment } = await import("../../src/confluence.js");
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        axiosResponse({ space: { key: "ENG" } })
      );
      (client.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        axiosResponse({ id: "999", _links: { webui: "/pages/999" } })
      );

      const result = await addConfluenceComment(client, "12345", "Test comment", "ENG");

      expect(result.pageId).toBe("12345");
      expect(result.id).toBe("999");
    });
  });

  // -------------------------------------------------------
  // Successful comment creation
  // -------------------------------------------------------
  describe("successful comment creation", () => {
    it("posts comment with correct payload", async () => {
      const { addConfluenceComment } = await import("../../src/confluence.js");
      (client.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        axiosResponse({ id: "888", _links: { webui: "/pages/888" } })
      );

      await addConfluenceComment(client, "12345", "# Test\nComment");

      expect(client.post).toHaveBeenCalledWith(
        "/wiki/rest/api/content",
        expect.objectContaining({
          type: "comment",
          container: { id: "12345", type: "page" },
          body: {
            storage: {
              value: expect.any(String),
              representation: "storage",
            },
          },
        })
      );
    });

    it("returns comment id and url", async () => {
      const { addConfluenceComment } = await import("../../src/confluence.js");
      (client.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        axiosResponse({ id: "777", _links: { webui: "/pages/viewpage.action?pageId=777" } })
      );

      const result = await addConfluenceComment(client, "12345", "Test comment");

      expect(result).toEqual({
        id: "777",
        pageId: "12345",
        url: "https://my-org.atlassian.net/wiki/pages/viewpage.action?pageId=777",
      });
    });
  });
});

// ===========================================================================
// getConfluencePageVersions
// ===========================================================================
describe("confluence — getConfluencePageVersions()", () => {
  let client: AxiosInstance;

  beforeEach(() => {
    client = createMockClient();
  });

  // -------------------------------------------------------
  // Input validation
  // -------------------------------------------------------
  describe("input validation", () => {
    it("throws an error when pageId is empty", async () => {
      const { getConfluencePageVersions } = await import("../../src/confluence.js");
      await expect(
        getConfluencePageVersions(client, "")
      ).rejects.toThrow("Page ID must not be empty");
    });

    it("throws an error when pageId is whitespace only", async () => {
      const { getConfluencePageVersions } = await import("../../src/confluence.js");
      await expect(
        getConfluencePageVersions(client, "   ")
      ).rejects.toThrow("Page ID must not be empty");
    });

    it("throws an error when limit is less than 1", async () => {
      const { getConfluencePageVersions } = await import("../../src/confluence.js");
      await expect(
        getConfluencePageVersions(client, "12345", 0)
      ).rejects.toThrow("Limit must be between 1 and 200");
    });

    it("throws an error when limit is greater than 200", async () => {
      const { getConfluencePageVersions } = await import("../../src/confluence.js");
      await expect(
        getConfluencePageVersions(client, "12345", 201)
      ).rejects.toThrow("Limit must be between 1 and 200");
    });
  });

  // -------------------------------------------------------
  // Space-scoping guard
  // -------------------------------------------------------
  describe("space-scoping guard", () => {
    it("fetches page to verify space when spaceKey is provided", async () => {
      const { getConfluencePageVersions } = await import("../../src/confluence.js");
      (client.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(axiosResponse({ space: { key: "ENG" } }))
        .mockResolvedValueOnce(axiosResponse({ results: [] }));

      await getConfluencePageVersions(client, "12345", 25, "ENG");

      expect(client.get).toHaveBeenCalledWith("/wiki/rest/api/content/12345", {
        params: { expand: "space" },
      });
    });

    it("throws an error when page space does not match configured space", async () => {
      const { getConfluencePageVersions } = await import("../../src/confluence.js");
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        axiosResponse({ space: { key: "WRONG" } })
      );

      await expect(
        getConfluencePageVersions(client, "12345", 25, "ENG")
      ).rejects.toThrow(
        'Page 12345 belongs to space "WRONG" but this server is scoped to space "ENG". Read rejected.'
      );
    });
  });

  // -------------------------------------------------------
  // Successful retrieval
  // -------------------------------------------------------
  describe("successful retrieval", () => {
    it("fetches version history with correct params", async () => {
      const { getConfluencePageVersions } = await import("../../src/confluence.js");
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        axiosResponse({ results: [] })
      );

      await getConfluencePageVersions(client, "12345", 50);

      expect(client.get).toHaveBeenCalledWith("/wiki/rest/api/content/12345/version", {
        params: { limit: 50 },
      });
    });

    it("returns formatted version history", async () => {
      const { getConfluencePageVersions } = await import("../../src/confluence.js");
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        axiosResponse({
          size: 3,
          results: [
            {
              number: 3,
              when: "2024-01-03T10:00:00.000Z",
              by: { displayName: "Alice", email: "alice@example.com" },
              message: "Updated content",
            },
            {
              number: 2,
              when: "2024-01-02T10:00:00.000Z",
              by: { displayName: "Bob", email: "bob@example.com" },
            },
            {
              number: 1,
            },
          ],
        })
      );

      const result = await getConfluencePageVersions(client, "12345");

      expect(result).toEqual({
        pageId: "12345",
        totalSize: 3,
        versions: [
          {
            number: 3,
            when: "2024-01-03T10:00:00.000Z",
            by: { displayName: "Alice", email: "alice@example.com" },
            message: "Updated content",
          },
          {
            number: 2,
            when: "2024-01-02T10:00:00.000Z",
            by: { displayName: "Bob", email: "bob@example.com" },
            message: "",
          },
          {
            number: 1,
            when: "",
            by: null,
            message: "",
          },
        ],
      });
    });

    it("uses default limit of 25 when not specified", async () => {
      const { getConfluencePageVersions } = await import("../../src/confluence.js");
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        axiosResponse({ results: [] })
      );

      await getConfluencePageVersions(client, "12345");

      expect(client.get).toHaveBeenCalledWith("/wiki/rest/api/content/12345/version", {
        params: { limit: 25 },
      });
    });
  });
});

// ===========================================================================
// createConfluencePage
// ===========================================================================
describe("confluence — createConfluencePage()", () => {
  let client: AxiosInstance;

  beforeEach(() => {
    client = createMockClient();
  });

  // -------------------------------------------------------
  // Input validation
  // -------------------------------------------------------
  describe("input validation", () => {
    it("throws an error when spaceKey is empty", async () => {
      const { createConfluencePage } = await import("../../src/confluence.js");
      await expect(
        createConfluencePage(client, "", "Title", "Content")
      ).rejects.toThrow("Space key must not be empty");
    });

    it("throws an error when spaceKey is whitespace only", async () => {
      const { createConfluencePage } = await import("../../src/confluence.js");
      await expect(
        createConfluencePage(client, "   ", "Title", "Content")
      ).rejects.toThrow("Space key must not be empty");
    });

    it("throws an error when title is empty", async () => {
      const { createConfluencePage } = await import("../../src/confluence.js");
      await expect(
        createConfluencePage(client, "ENG", "", "Content")
      ).rejects.toThrow("Title must not be empty");
    });

    it("throws an error when title is whitespace only", async () => {
      const { createConfluencePage } = await import("../../src/confluence.js");
      await expect(
        createConfluencePage(client, "ENG", "   ", "Content")
      ).rejects.toThrow("Title must not be empty");
    });
  });

  // -------------------------------------------------------
  // Space-scoping guard
  // -------------------------------------------------------
  describe("space-scoping guard", () => {
    it("allows creation when no configured space is set", async () => {
      const { createConfluencePage } = await import("../../src/confluence.js");
      (client.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        axiosResponse({
          id: "12345",
          title: "New Page",
          space: { key: "ENG" },
          version: { number: 1 },
          _links: { webui: "/pages/12345" },
        })
      );

      const result = await createConfluencePage(client, "ENG", "New Page", "# Content");

      expect(result.id).toBe("12345");
      expect(result.spaceKey).toBe("ENG");
    });

    it("allows creation when configured space matches", async () => {
      const { createConfluencePage } = await import("../../src/confluence.js");
      (client.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        axiosResponse({
          id: "12345",
          title: "New Page",
          space: { key: "ENG" },
          version: { number: 1 },
          _links: { webui: "/pages/12345" },
        })
      );

      const result = await createConfluencePage(client, "ENG", "New Page", "# Content", undefined, "ENG");

      expect(result.id).toBe("12345");
    });

    it("throws error when space does not match configured space", async () => {
      const { createConfluencePage } = await import("../../src/confluence.js");
      
      await expect(
        createConfluencePage(client, "WRONG", "Title", "Content", undefined, "ENG")
      ).rejects.toThrow(
        'Cannot create page in space "WRONG" — this server is scoped to space "ENG". Creation rejected.'
      );
    });

    it("allows creation when configured space is empty string", async () => {
      const { createConfluencePage } = await import("../../src/confluence.js");
      (client.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        axiosResponse({
          id: "99999",
          title: "Page",
          space: { key: "ANY" },
          version: { number: 1 },
          _links: { webui: "/pages/99999" },
        })
      );

      const result = await createConfluencePage(client, "ANY", "Page", "Content", undefined, "");

      expect(result.id).toBe("99999");
    });

    it("allows creation when configured space is whitespace", async () => {
      const { createConfluencePage } = await import("../../src/confluence.js");
      (client.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        axiosResponse({
          id: "88888",
          title: "Page",
          space: { key: "ANY" },
          version: { number: 1 },
          _links: { webui: "/pages/88888" },
        })
      );

      const result = await createConfluencePage(client, "ANY", "Page", "Content", undefined, "   ");

      expect(result.id).toBe("88888");
    });
  });

  // -------------------------------------------------------
  // Successful page creation
  // -------------------------------------------------------
  describe("successful page creation", () => {
    it("creates page with correct payload", async () => {
      const { createConfluencePage } = await import("../../src/confluence.js");
      (client.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        axiosResponse({
          id: "54321",
          title: "Test Page",
          space: { key: "ENG" },
          version: { number: 1 },
          _links: { webui: "/pages/54321" },
        })
      );

      await createConfluencePage(client, "ENG", "Test Page", "# Header\nContent");

      expect(client.post).toHaveBeenCalledWith(
        "/wiki/rest/api/content",
        expect.objectContaining({
          type: "page",
          title: "Test Page",
          space: { key: "ENG" },
          body: {
            storage: {
              value: expect.any(String),
              representation: "storage",
            },
          },
        })
      );
    });

    it("includes parent page when provided", async () => {
      const { createConfluencePage } = await import("../../src/confluence.js");
      (client.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        axiosResponse({
          id: "67890",
          title: "Child Page",
          space: { key: "ENG" },
          version: { number: 1 },
          _links: { webui: "/pages/67890" },
        })
      );

      await createConfluencePage(client, "ENG", "Child Page", "Content", "123");

      const callArgs = (client.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(callArgs.ancestors).toEqual([{ id: "123" }]);
    });

    it("does not include ancestors when parentPageId is empty", async () => {
      const { createConfluencePage } = await import("../../src/confluence.js");
      (client.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        axiosResponse({
          id: "11111",
          title: "Root Page",
          space: { key: "ENG" },
          version: { number: 1 },
          _links: { webui: "/pages/11111" },
        })
      );

      await createConfluencePage(client, "ENG", "Root Page", "Content", "");

      const callArgs = (client.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(callArgs.ancestors).toBeUndefined();
    });

    it("does not include ancestors when parentPageId is whitespace", async () => {
      const { createConfluencePage } = await import("../../src/confluence.js");
      (client.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        axiosResponse({
          id: "22222",
          title: "Page",
          space: { key: "ENG" },
          version: { number: 1 },
          _links: { webui: "/pages/22222" },
        })
      );

      await createConfluencePage(client, "ENG", "Page", "Content", "   ");

      const callArgs = (client.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(callArgs.ancestors).toBeUndefined();
    });

    it("returns page details", async () => {
      const { createConfluencePage } = await import("../../src/confluence.js");
      (client.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        axiosResponse({
          id: "77777",
          title: "My Page",
          space: { key: "TEST" },
          version: { number: 1 },
          _links: { webui: "/pages/viewpage.action?pageId=77777" },
        })
      );

      const result = await createConfluencePage(client, "TEST", "My Page", "Content");

      expect(result).toEqual({
        id: "77777",
        title: "My Page",
        spaceKey: "TEST",
        version: 1,
        url: "https://my-org.atlassian.net/wiki/pages/viewpage.action?pageId=77777",
      });
    });

    it("uses fallback values for missing data fields", async () => {
      const { createConfluencePage } = await import("../../src/confluence.js");
      (client.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        axiosResponse({
          id: "33333",
          title: "Incomplete",
        })
      );

      const result = await createConfluencePage(client, "ENG", "Incomplete", "Content");

      expect(result.spaceKey).toBe("ENG");
      expect(result.version).toBe(1);
      expect(result.url).toContain("wiki");
    });
  });
});