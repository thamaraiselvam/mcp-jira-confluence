import { describe, it, expect } from "vitest";
import https from "node:https";
import { createConfluenceClient } from "../../src/client.js";
import { ConfluenceConfig } from "../../src/config.js";

describe("client — createConfluenceClient()", () => {
  // -------------------------------------------------------
  // Helper: build a valid config for reuse
  // -------------------------------------------------------
  const makeConfig = (overrides: Partial<ConfluenceConfig> = {}): ConfluenceConfig => ({
    baseUrl: "https://my-org.atlassian.net",
    email: "user@example.com",
    apiToken: "my-api-token",
    ignoreTlsErrors: false,
    ...overrides,
  });

  // -------------------------------------------------------
  // Basic client creation
  // -------------------------------------------------------
  describe("basic creation", () => {
    it("returns an axios instance (object with request, get, put methods)", () => {
      const client = createConfluenceClient(makeConfig());

      expect(client).toBeDefined();
      expect(typeof client.get).toBe("function");
      expect(typeof client.put).toBe("function");
      expect(typeof client.post).toBe("function");
      expect(typeof client.delete).toBe("function");
      expect(typeof client.request).toBe("function");
    });

    it("sets baseURL from config.baseUrl", () => {
      const client = createConfluenceClient(makeConfig({
        baseUrl: "https://custom-domain.example.com",
      }));

      expect(client.defaults.baseURL).toBe("https://custom-domain.example.com");
    });

    it("sets a 30-second timeout", () => {
      const client = createConfluenceClient(makeConfig());

      expect(client.defaults.timeout).toBe(30000);
    });
  });

  // -------------------------------------------------------
  // Authentication headers
  // -------------------------------------------------------
  describe("authentication headers", () => {
    it("sets the Authorization header with Basic auth encoding", () => {
      const config = makeConfig({
        email: "admin@example.com",
        apiToken: "secret-token-123",
      });

      const expectedToken = Buffer.from("admin@example.com:secret-token-123").toString("base64");
      const client = createConfluenceClient(config);

      expect(client.defaults.headers["Authorization"]).toBe(`Basic ${expectedToken}`);
    });

    it("encodes email and token correctly for special characters", () => {
      const config = makeConfig({
        email: "user+special@example.com",
        apiToken: "tok3n/with=chars+!",
      });

      const expectedToken = Buffer.from("user+special@example.com:tok3n/with=chars+!").toString("base64");
      const client = createConfluenceClient(config);

      expect(client.defaults.headers["Authorization"]).toBe(`Basic ${expectedToken}`);
    });

    it("produces a valid base64 string in the Authorization header", () => {
      const client = createConfluenceClient(makeConfig());
      const authHeader = client.defaults.headers["Authorization"] as string;

      expect(authHeader).toMatch(/^Basic [A-Za-z0-9+/]+=*$/);
    });

    it("encodes the credentials in the format email:token", () => {
      const config = makeConfig({
        email: "decode-test@example.com",
        apiToken: "decode-test-token",
      });

      const client = createConfluenceClient(config);
      const authHeader = client.defaults.headers["Authorization"] as string;
      const base64Part = authHeader.replace("Basic ", "");
      const decoded = Buffer.from(base64Part, "base64").toString("utf-8");

      expect(decoded).toBe("decode-test@example.com:decode-test-token");
    });
  });

  // -------------------------------------------------------
  // Content-Type and Accept headers
  // -------------------------------------------------------
  describe("content headers", () => {
    it("sets Content-Type to application/json", () => {
      const client = createConfluenceClient(makeConfig());

      expect(client.defaults.headers["Content-Type"]).toBe("application/json");
    });

    it("sets Accept to application/json", () => {
      const client = createConfluenceClient(makeConfig());

      expect(client.defaults.headers["Accept"]).toBe("application/json");
    });
  });

  // -------------------------------------------------------
  // TLS / HTTPS Agent configuration
  // -------------------------------------------------------
  describe("TLS configuration", () => {
    it("creates an httpsAgent on the client", () => {
      const client = createConfluenceClient(makeConfig());

      expect(client.defaults.httpsAgent).toBeDefined();
      expect(client.defaults.httpsAgent).toBeInstanceOf(https.Agent);
    });

    it("sets rejectUnauthorized=true when ignoreTlsErrors is false", () => {
      const client = createConfluenceClient(makeConfig({ ignoreTlsErrors: false }));
      const agent = client.defaults.httpsAgent as https.Agent;

      // The agent stores options internally
      expect((agent.options as { rejectUnauthorized?: boolean }).rejectUnauthorized).toBe(true);
    });

    it("sets rejectUnauthorized=false when ignoreTlsErrors is true", () => {
      const client = createConfluenceClient(makeConfig({ ignoreTlsErrors: true }));
      const agent = client.defaults.httpsAgent as https.Agent;

      expect((agent.options as { rejectUnauthorized?: boolean }).rejectUnauthorized).toBe(false);
    });
  });

  // -------------------------------------------------------
  // Distinct instances
  // -------------------------------------------------------
  describe("instance isolation", () => {
    it("returns a new instance for each call", () => {
      const client1 = createConfluenceClient(makeConfig({ baseUrl: "https://one.example.com" }));
      const client2 = createConfluenceClient(makeConfig({ baseUrl: "https://two.example.com" }));

      expect(client1).not.toBe(client2);
      expect(client1.defaults.baseURL).toBe("https://one.example.com");
      expect(client2.defaults.baseURL).toBe("https://two.example.com");
    });

    it("uses different auth headers when created with different credentials", () => {
      const client1 = createConfluenceClient(makeConfig({ email: "a@a.com", apiToken: "aaa" }));
      const client2 = createConfluenceClient(makeConfig({ email: "b@b.com", apiToken: "bbb" }));

      expect(client1.defaults.headers["Authorization"]).not.toBe(
        client2.defaults.headers["Authorization"]
      );
    });

    it("uses different TLS settings when created with different ignoreTlsErrors", () => {
      const client1 = createConfluenceClient(makeConfig({ ignoreTlsErrors: false }));
      const client2 = createConfluenceClient(makeConfig({ ignoreTlsErrors: true }));

      const agent1 = client1.defaults.httpsAgent as https.Agent;
      const agent2 = client2.defaults.httpsAgent as https.Agent;

      expect((agent1.options as { rejectUnauthorized?: boolean }).rejectUnauthorized).toBe(true);
      expect((agent2.options as { rejectUnauthorized?: boolean }).rejectUnauthorized).toBe(false);
    });
  });
});

describe("client — createJiraClient()", () => {
  // -------------------------------------------------------
  // Helper: build a valid config for reuse
  // -------------------------------------------------------
  const makeConfig = (overrides: Partial<import("../../src/config.js").JiraConfig> = {}): import("../../src/config.js").JiraConfig => ({
    baseUrl: "https://my-org.atlassian.net",
    email: "user@example.com",
    apiToken: "my-api-token",
    ignoreTlsErrors: false,
    projectKey: undefined,
    ...overrides,
  });

  // -------------------------------------------------------
  // Basic client creation
  // -------------------------------------------------------
  describe("basic creation", () => {
    it("returns an axios instance (object with request, get, put methods)", async () => {
      const { createJiraClient } = await import("../../src/client.js");
      const client = createJiraClient(makeConfig());

      expect(client).toBeDefined();
      expect(typeof client.get).toBe("function");
      expect(typeof client.put).toBe("function");
      expect(typeof client.post).toBe("function");
      expect(typeof client.delete).toBe("function");
      expect(typeof client.request).toBe("function");
    });

    it("sets baseURL from config.baseUrl", async () => {
      const { createJiraClient } = await import("../../src/client.js");
      const client = createJiraClient(makeConfig({
        baseUrl: "https://custom-jira.example.com",
      }));

      expect(client.defaults.baseURL).toBe("https://custom-jira.example.com");
    });

    it("sets a 30-second timeout", async () => {
      const { createJiraClient } = await import("../../src/client.js");
      const client = createJiraClient(makeConfig());

      expect(client.defaults.timeout).toBe(30000);
    });
  });

  // -------------------------------------------------------
  // Authentication headers
  // -------------------------------------------------------
  describe("authentication headers", () => {
    it("sets the Authorization header with Basic auth encoding", async () => {
      const { createJiraClient } = await import("../../src/client.js");
      const config = makeConfig({
        email: "jira-admin@example.com",
        apiToken: "jira-secret-token-123",
      });

      const expectedToken = Buffer.from("jira-admin@example.com:jira-secret-token-123").toString("base64");
      const client = createJiraClient(config);

      expect(client.defaults.headers["Authorization"]).toBe(`Basic ${expectedToken}`);
    });

    it("sets Content-Type to application/json", async () => {
      const { createJiraClient } = await import("../../src/client.js");
      const client = createJiraClient(makeConfig());

      expect(client.defaults.headers["Content-Type"]).toBe("application/json");
    });

    it("sets Accept to application/json", async () => {
      const { createJiraClient } = await import("../../src/client.js");
      const client = createJiraClient(makeConfig());

      expect(client.defaults.headers["Accept"]).toBe("application/json");
    });
  });

  // -------------------------------------------------------
  // TLS / HTTPS Agent configuration
  // -------------------------------------------------------
  describe("TLS configuration", () => {
    it("creates an httpsAgent on the client", async () => {
      const { createJiraClient } = await import("../../src/client.js");
      const client = createJiraClient(makeConfig());

      expect(client.defaults.httpsAgent).toBeDefined();
      expect(client.defaults.httpsAgent).toBeInstanceOf(https.Agent);
    });

    it("sets rejectUnauthorized=true when ignoreTlsErrors is false", async () => {
      const { createJiraClient } = await import("../../src/client.js");
      const client = createJiraClient(makeConfig({ ignoreTlsErrors: false }));
      const agent = client.defaults.httpsAgent as https.Agent;

      expect((agent.options as { rejectUnauthorized?: boolean }).rejectUnauthorized).toBe(true);
    });

    it("sets rejectUnauthorized=false when ignoreTlsErrors is true", async () => {
      const { createJiraClient } = await import("../../src/client.js");
      const client = createJiraClient(makeConfig({ ignoreTlsErrors: true }));
      const agent = client.defaults.httpsAgent as https.Agent;

      expect((agent.options as { rejectUnauthorized?: boolean }).rejectUnauthorized).toBe(false);
    });
  });
});