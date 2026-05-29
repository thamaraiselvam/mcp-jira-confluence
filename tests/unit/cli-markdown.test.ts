import { describe, it, expect, vi } from "vitest";
import type { AxiosInstance } from "axios";
import type { ConfluenceConfig, JiraConfig } from "../../src/config.js";
import { run, type CliDeps } from "../../src/cli.js";

// NOTE: this file deliberately does NOT mock confluence.js / jira.js. It runs
// the real API functions against a fake axios client so we can assert that
// markdown is converted (to HTML for Confluence, ADF for Jira) before it is
// sent — exactly the conversion the MCP tools rely on.

const confluenceConfig: ConfluenceConfig = {
  baseUrl: "https://org.atlassian.net",
  email: "me@org.com",
  apiToken: "token",
  ignoreTlsErrors: false,
  spaceKey: undefined,
};

const jiraConfig: JiraConfig = {
  baseUrl: "https://org.atlassian.net",
  email: "me@org.com",
  apiToken: "token",
  ignoreTlsErrors: false,
  projectKey: undefined,
};

function makeMockClient(postData: unknown) {
  const post = vi.fn().mockResolvedValue({ data: postData });
  const client = {
    defaults: { baseURL: "https://org.atlassian.net" },
    post,
    get: vi.fn(),
    put: vi.fn(),
  } as unknown as AxiosInstance;
  return { client, post };
}

function makeDeps(
  client: AxiosInstance,
  which: "confluence" | "jira"
): CliDeps {
  return {
    loadConfluenceConfig: () => confluenceConfig,
    loadJiraConfiguration: () => jiraConfig,
    buildConfluenceClient: () => (which === "confluence" ? client : ({} as AxiosInstance)),
    buildJiraClient: () => (which === "jira" ? client : ({} as AxiosInstance)),
    stdout: () => {},
    stderr: () => {},
  };
}

describe("markdown conversion through the CLI", () => {
  it("create-page sends HTML in the Confluence storage body", async () => {
    const { client, post } = makeMockClient({
      id: "1",
      title: "T",
      space: { key: "ENG" },
      version: { number: 1 },
      _links: { webui: "/x" },
    });

    const code = await run(
      [
        "confluence",
        "create-page",
        "--spaceKey",
        "ENG",
        "--title",
        "T",
        "--markdownContent",
        "# Heading\n\n**bold**",
      ],
      makeDeps(client, "confluence")
    );

    expect(code).toBe(0);
    const payload = post.mock.calls[0][1] as {
      body: { storage: { value: string; representation: string } };
    };
    expect(payload.body.storage.representation).toBe("storage");
    expect(payload.body.storage.value).toContain("<h1>Heading</h1>");
    expect(payload.body.storage.value).toContain("<strong>bold</strong>");
  });

  it("create-issue sends an ADF document as the description", async () => {
    const { client, post } = makeMockClient({ id: "1", key: "PROJ-1" });

    const code = await run(
      [
        "jira",
        "create-issue",
        "--projectKey",
        "PROJ",
        "--issueType",
        "Story",
        "--summary",
        "S",
        "--description",
        "# Title\n\nSome text",
      ],
      makeDeps(client, "jira")
    );

    expect(code).toBe(0);
    const payload = post.mock.calls[0][1] as {
      fields: { description: { type: string; content: unknown[] } };
    };
    expect(payload.fields.description.type).toBe("doc");
    expect(Array.isArray(payload.fields.description.content)).toBe(true);
  });

  it("add-comment sends an ADF document as the comment body", async () => {
    const { client, post } = makeMockClient({ id: "10" });

    const code = await run(
      ["jira", "add-comment", "PROJ-1", "**important** update"],
      makeDeps(client, "jira")
    );

    expect(code).toBe(0);
    const payload = post.mock.calls[0][1] as {
      body: { type: string; content: unknown[] };
    };
    expect(payload.body.type).toBe("doc");
    expect(Array.isArray(payload.body.content)).toBe(true);
  });
});
