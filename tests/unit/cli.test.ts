import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as confluenceModule from "../../src/confluence.js";
import * as jiraModule from "../../src/jira.js";
import type { ConfluenceConfig, JiraConfig } from "../../src/config.js";
import type { AxiosInstance } from "axios";
import {
  parseArgs,
  formatResult,
  commands,
  findCommand,
  run,
  readContentFile,
  topLevelHelp,
  commandHelp,
  isInvokedAsScript,
  type CliDeps,
} from "../../src/cli.js";
import { markdownToAdf } from "../../src/jira-markdown.js";
import {
  mkdtempSync,
  writeFileSync,
  symlinkSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------
// Mock the API layer so dispatch can be observed without touching the network.
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

vi.mock("../../src/jira.js", () => ({
  searchJira: vi.fn(),
  getJiraIssue: vi.fn(),
  createJiraIssue: vi.fn(),
  updateJiraIssue: vi.fn(),
  transitionJiraIssue: vi.fn(),
  getJiraIssueTransitions: vi.fn(),
  addJiraComment: vi.fn(),
  updateJiraComment: vi.fn(),
}));

const confluenceClient = { id: "confluence-client" } as unknown as AxiosInstance;
const jiraClient = { id: "jira-client" } as unknown as AxiosInstance;

const confluenceConfig: ConfluenceConfig = {
  baseUrl: "https://org.atlassian.net",
  email: "me@org.com",
  apiToken: "token",
  ignoreTlsErrors: false,
  spaceKey: "ENG",
};

const jiraConfig: JiraConfig = {
  baseUrl: "https://org.atlassian.net",
  email: "me@org.com",
  apiToken: "token",
  ignoreTlsErrors: false,
  projectKey: "PROJ",
};

function makeDeps(overrides: Partial<CliDeps> = {}): {
  deps: CliDeps;
  stdout: string[];
  stderr: string[];
  files: Record<string, string>;
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  // In-memory file registry so content-file args resolve without disk I/O.
  // An unregistered path throws an ENOENT-shaped error, like readFileSync.
  const files: Record<string, string> = {};
  const deps: CliDeps = {
    loadConfluenceConfig: vi.fn(() => confluenceConfig),
    loadJiraConfiguration: vi.fn(() => jiraConfig),
    buildConfluenceClient: vi.fn(() => confluenceClient),
    buildJiraClient: vi.fn(() => jiraClient),
    readFile: vi.fn((path: string) => {
      if (path in files) return files[path];
      const err: NodeJS.ErrnoException = new Error(
        `ENOENT: no such file, open '${path}'`
      );
      err.code = "ENOENT";
      throw err;
    }),
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
    ...overrides,
  };
  return { deps, stdout, stderr, files };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// 5.1 parseArgs
// ===========================================================================
describe("parseArgs", () => {
  it("parses group, command, and positionals", () => {
    const parsed = parseArgs(["jira", "get-issue", "PROJ-1"]);
    expect(parsed.group).toBe("jira");
    expect(parsed.command).toBe("get-issue");
    expect(parsed.positionals).toEqual(["PROJ-1"]);
  });

  it("parses --flag value options", () => {
    const parsed = parseArgs(["jira", "search", "--jql", "status = Done"]);
    expect(parsed.options.jql).toBe("status = Done");
  });

  it("parses --flag=value options", () => {
    const parsed = parseArgs(["confluence", "search", "--cql=type=page"]);
    expect(parsed.options.cql).toBe("type=page");
  });

  it("treats a bare flag as boolean true", () => {
    const parsed = parseArgs(["jira", "search", "--verbose"]);
    expect(parsed.options.verbose).toBe(true);
  });

  it("parses the global --json flag without consuming a value", () => {
    const parsed = parseArgs(["jira", "search", "--jql", "x", "--json"]);
    expect(parsed.json).toBe(true);
    expect(parsed.options.json).toBeUndefined();
  });

  it("parses the global --help flag", () => {
    const parsed = parseArgs(["jira", "--help"]);
    expect(parsed.help).toBe(true);
  });

  it("handles no args", () => {
    const parsed = parseArgs([]);
    expect(parsed.group).toBeUndefined();
    expect(parsed.command).toBeUndefined();
    expect(parsed.positionals).toEqual([]);
    expect(parsed.json).toBe(false);
    expect(parsed.help).toBe(false);
  });
});

// ===========================================================================
// 5.5 parity — every MCP tool has a CLI command
// ===========================================================================
describe("command/tool parity", () => {
  // The 15 MCP tools, grouped to their CLI equivalents.
  const expected = {
    confluence: [
      "search",
      "get-page",
      "create-page",
      "update-page",
      "add-comment",
      "get-page-versions",
      "check-permissions",
    ],
    jira: [
      "search",
      "get-issue",
      "create-issue",
      "update-issue",
      "transition-issue",
      "get-transitions",
      "add-comment",
      "update-comment",
    ],
  };

  it("registers all 15 commands across both groups", () => {
    expect(commands).toHaveLength(15);
  });

  for (const [group, names] of Object.entries(expected)) {
    for (const name of names) {
      it(`has a "${group} ${name}" command`, () => {
        expect(findCommand(group, name)).toBeDefined();
      });
    }
  }

  it("exposes no delete/remove command", () => {
    const destructive = commands.filter((c) =>
      /delete|remove|destroy/i.test(c.name)
    );
    expect(destructive).toEqual([]);
  });
});

// ===========================================================================
// 5.4 formatter
// ===========================================================================
describe("formatResult", () => {
  it("emits pretty JSON when json=true", () => {
    const out = formatResult({ key: "PROJ-1", url: "u" }, true);
    expect(JSON.parse(out)).toEqual({ key: "PROJ-1", url: "u" });
  });

  it("emits labeled text by default", () => {
    const out = formatResult({ key: "PROJ-1", url: "u" }, false);
    expect(out).toContain("key: PROJ-1");
    expect(out).toContain("url: u");
  });

  it("renders nested objects and arrays", () => {
    const out = formatResult({ results: [{ id: "1" }], total: 1 }, false);
    expect(out).toContain("results:");
    expect(out).toContain("id: 1");
    expect(out).toContain("total: 1");
  });

  it("renders empty arrays and null values", () => {
    expect(formatResult([], false)).toContain("(empty)");
    expect(formatResult(null, false)).toContain("(none)");
    expect(formatResult(["a", "b"], false)).toContain("- a");
  });
});

// ===========================================================================
// 5.2 dispatch — each command calls the right function with mapped args
// ===========================================================================
describe("dispatch — Confluence", () => {
  it("search maps cql, limit and configured space", async () => {
    vi.mocked(confluenceModule.searchConfluence).mockResolvedValue({
      results: [],
      totalSize: 0,
    });
    const { deps, stdout } = makeDeps();
    const code = await run(
      ["confluence", "search", "--cql", "type=page", "--limit", "10"],
      deps
    );
    expect(code).toBe(0);
    expect(confluenceModule.searchConfluence).toHaveBeenCalledWith(
      confluenceClient,
      "type=page",
      10,
      "ENG"
    );
    expect(stdout.join("\n")).toContain("totalSize: 0");
  });

  it("get-page accepts a positional pageId", async () => {
    vi.mocked(confluenceModule.getConfluencePage).mockResolvedValue({} as never);
    const { deps } = makeDeps();
    await run(["confluence", "get-page", "12345"], deps);
    expect(confluenceModule.getConfluencePage).toHaveBeenCalledWith(
      confluenceClient,
      "12345",
      "ENG"
    );
  });

  it("create-page reads the body file and passes markdown and parent through", async () => {
    vi.mocked(confluenceModule.createConfluencePage).mockResolvedValue({} as never);
    const { deps, files } = makeDeps();
    files["./body.md"] = "# Body";
    await run(
      [
        "confluence",
        "create-page",
        "--spaceKey",
        "ENG",
        "--title",
        "Hi",
        "--markdownContent",
        "./body.md",
        "--parentPageId",
        "99",
      ],
      deps
    );
    expect(confluenceModule.createConfluencePage).toHaveBeenCalledWith(
      confluenceClient,
      "ENG",
      "Hi",
      "# Body",
      "99",
      "ENG"
    );
  });

  it("update-page reads the body file and maps its args", async () => {
    vi.mocked(confluenceModule.updateConfluencePage).mockResolvedValue({} as never);
    const { deps, files } = makeDeps();
    files["body.md"] = "**md**";
    await run(
      ["confluence", "update-page", "1", "Title", "body.md"],
      deps
    );
    expect(confluenceModule.updateConfluencePage).toHaveBeenCalledWith(
      confluenceClient,
      "1",
      "Title",
      "**md**",
      "ENG"
    );
  });

  it("add-comment reads the body file and maps its args", async () => {
    vi.mocked(confluenceModule.addConfluenceComment).mockResolvedValue({} as never);
    const { deps, files } = makeDeps();
    files["comment.md"] = "hello";
    await run(["confluence", "add-comment", "1", "comment.md"], deps);
    expect(confluenceModule.addConfluenceComment).toHaveBeenCalledWith(
      confluenceClient,
      "1",
      "hello",
      "ENG"
    );
  });

  it("get-page-versions parses the limit", async () => {
    vi.mocked(confluenceModule.getConfluencePageVersions).mockResolvedValue({} as never);
    const { deps } = makeDeps();
    await run(
      ["confluence", "get-page-versions", "1", "--limit", "5"],
      deps
    );
    expect(confluenceModule.getConfluencePageVersions).toHaveBeenCalledWith(
      confluenceClient,
      "1",
      5,
      "ENG"
    );
  });

  it("check-permissions works with no page id", async () => {
    vi.mocked(confluenceModule.checkPermissions).mockResolvedValue({} as never);
    const { deps } = makeDeps();
    const code = await run(["confluence", "check-permissions"], deps);
    expect(code).toBe(0);
    expect(confluenceModule.checkPermissions).toHaveBeenCalledWith(
      confluenceClient,
      undefined
    );
  });
});

describe("dispatch — Jira", () => {
  it("search maps jql, limit, startAt and configured project", async () => {
    vi.mocked(jiraModule.searchJira).mockResolvedValue({
      issues: [],
      total: 0,
      maxResults: 25,
      startAt: 0,
    });
    const { deps } = makeDeps();
    await run(
      ["jira", "search", "--jql", "status = Done", "--limit", "5", "--startAt", "10"],
      deps
    );
    expect(jiraModule.searchJira).toHaveBeenCalledWith(
      jiraClient,
      "status = Done",
      5,
      10,
      "PROJ"
    );
  });

  it("get-issue maps the key", async () => {
    vi.mocked(jiraModule.getJiraIssue).mockResolvedValue({} as never);
    const { deps } = makeDeps();
    await run(["jira", "get-issue", "PROJ-1"], deps);
    expect(jiraModule.getJiraIssue).toHaveBeenCalledWith(jiraClient, "PROJ-1");
  });

  it("create-issue reads the description file, maps fields and splits comma-separated labels", async () => {
    vi.mocked(jiraModule.createJiraIssue).mockResolvedValue({
      id: "1",
      key: "PROJ-2",
      url: "u",
    });
    const { deps, files } = makeDeps();
    files["./desc.md"] = "# Details";
    await run(
      [
        "jira",
        "create-issue",
        "--projectKey",
        "PROJ",
        "--issueType",
        "Story",
        "--summary",
        "A story",
        "--description",
        "./desc.md",
        "--priority",
        "High",
        "--labels",
        "alpha, beta , gamma",
      ],
      deps
    );
    expect(jiraModule.createJiraIssue).toHaveBeenCalledWith(
      jiraClient,
      "PROJ",
      "Story",
      "A story",
      "# Details",
      undefined,
      "High",
      ["alpha", "beta", "gamma"],
      "PROJ"
    );
  });

  it("update-issue parses the fields JSON", async () => {
    vi.mocked(jiraModule.updateJiraIssue).mockResolvedValue({} as never);
    const { deps } = makeDeps();
    const code = await run(
      ["jira", "update-issue", "PROJ-1", '{"summary":"New title"}'],
      deps
    );
    expect(code).toBe(0);
    expect(jiraModule.updateJiraIssue).toHaveBeenCalledWith(jiraClient, "PROJ-1", {
      summary: "New title",
    });
  });

  it("update-issue rejects invalid JSON fields", async () => {
    const { deps, stderr } = makeDeps();
    const code = await run(
      ["jira", "update-issue", "PROJ-1", "not-json"],
      deps
    );
    expect(code).toBe(1);
    expect(stderr.join("\n")).toContain("must be a valid JSON object");
    expect(jiraModule.updateJiraIssue).not.toHaveBeenCalled();
  });

  it("transition-issue maps its args", async () => {
    vi.mocked(jiraModule.transitionJiraIssue).mockResolvedValue({} as never);
    const { deps } = makeDeps();
    await run(["jira", "transition-issue", "PROJ-1", "In Progress"], deps);
    expect(jiraModule.transitionJiraIssue).toHaveBeenCalledWith(
      jiraClient,
      "PROJ-1",
      "In Progress"
    );
  });

  it("get-transitions maps the key", async () => {
    vi.mocked(jiraModule.getJiraIssueTransitions).mockResolvedValue([]);
    const { deps } = makeDeps();
    await run(["jira", "get-transitions", "PROJ-1"], deps);
    expect(jiraModule.getJiraIssueTransitions).toHaveBeenCalledWith(
      jiraClient,
      "PROJ-1"
    );
  });

  it("add-comment reads the body file and maps configured project", async () => {
    vi.mocked(jiraModule.addJiraComment).mockResolvedValue({} as never);
    const { deps, files } = makeDeps();
    files["note.md"] = "looks good";
    await run(["jira", "add-comment", "PROJ-1", "note.md"], deps);
    expect(jiraModule.addJiraComment).toHaveBeenCalledWith(
      jiraClient,
      "PROJ-1",
      "looks good",
      "PROJ"
    );
  });

  it("update-comment reads the body file and maps all three args", async () => {
    vi.mocked(jiraModule.updateJiraComment).mockResolvedValue({} as never);
    const { deps, files } = makeDeps();
    files["edit.md"] = "edited";
    await run(["jira", "update-comment", "PROJ-1", "100", "edit.md"], deps);
    expect(jiraModule.updateJiraComment).toHaveBeenCalledWith(
      jiraClient,
      "PROJ-1",
      "100",
      "edited",
      "PROJ"
    );
  });
});

// ===========================================================================
// File-based Markdown content input (readContentFile + dispatch resolution)
// ===========================================================================
describe("readContentFile", () => {
  it("returns file contents on success", () => {
    const read = vi.fn(() => "# Title\n\nBody");
    expect(readContentFile("doc.md", read)).toBe("# Title\n\nBody");
    expect(read).toHaveBeenCalledWith("doc.md");
  });

  it("throws a clear error when the file does not exist", () => {
    const read = vi.fn(() => {
      const err: NodeJS.ErrnoException = new Error("nope");
      err.code = "ENOENT";
      throw err;
    });
    expect(() => readContentFile("missing.md", read)).toThrow(
      "File not found: missing.md"
    );
  });

  it("throws when the file is empty or whitespace-only", () => {
    expect(() => readContentFile("empty.md", () => "")).toThrow("is empty");
    expect(() => readContentFile("ws.md", () => "   \n\t  ")).toThrow(
      "is empty"
    );
  });

  it("wraps an unreadable-file error (e.g. directory/permission)", () => {
    const read = vi.fn(() => {
      const err: NodeJS.ErrnoException = new Error("illegal operation on a directory");
      err.code = "EISDIR";
      throw err;
    });
    expect(() => readContentFile("adir", read)).toThrow(
      'Could not read file "adir":'
    );
  });
});

describe("content-file dispatch errors fail fast", () => {
  it("missing content file exits 1 before building a client or calling the API", async () => {
    const { deps, stderr } = makeDeps();
    const code = await run(
      [
        "confluence",
        "create-page",
        "--spaceKey",
        "ENG",
        "--title",
        "Hi",
        "--markdownContent",
        "does-not-exist.md",
      ],
      deps
    );
    expect(code).toBe(1);
    expect(stderr.join("\n")).toContain("File not found: does-not-exist.md");
    expect(deps.buildConfluenceClient).not.toHaveBeenCalled();
    expect(confluenceModule.createConfluencePage).not.toHaveBeenCalled();
  });

  it("empty content file exits 1 before calling the Jira API", async () => {
    const { deps, stderr, files } = makeDeps();
    files["blank.md"] = "   ";
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
        "blank.md",
      ],
      deps
    );
    expect(code).toBe(1);
    expect(stderr.join("\n")).toContain("is empty");
    expect(deps.buildJiraClient).not.toHaveBeenCalled();
    expect(jiraModule.createJiraIssue).not.toHaveBeenCalled();
  });
});

describe("update-issue with a description file", () => {
  it("converts the description file to ADF and merges it into fields", async () => {
    vi.mocked(jiraModule.updateJiraIssue).mockResolvedValue({} as never);
    const { deps, files } = makeDeps();
    files["desc.md"] = "# Heading";
    const code = await run(
      [
        "jira",
        "update-issue",
        "PROJ-1",
        "--fields",
        '{"summary":"New title"}',
        "--descriptionFile",
        "desc.md",
      ],
      deps
    );
    expect(code).toBe(0);
    expect(jiraModule.updateJiraIssue).toHaveBeenCalledWith(jiraClient, "PROJ-1", {
      summary: "New title",
      description: markdownToAdf("# Heading"),
    });
  });

  it("works with only a description file (no --fields)", async () => {
    vi.mocked(jiraModule.updateJiraIssue).mockResolvedValue({} as never);
    const { deps, files } = makeDeps();
    files["desc.md"] = "Body text";
    const code = await run(
      ["jira", "update-issue", "PROJ-1", "--descriptionFile", "desc.md"],
      deps
    );
    expect(code).toBe(0);
    expect(jiraModule.updateJiraIssue).toHaveBeenCalledWith(jiraClient, "PROJ-1", {
      description: markdownToAdf("Body text"),
    });
  });

  it("lets the description file win over a description in --fields", async () => {
    vi.mocked(jiraModule.updateJiraIssue).mockResolvedValue({} as never);
    const { deps, files } = makeDeps();
    files["desc.md"] = "from file";
    await run(
      [
        "jira",
        "update-issue",
        "PROJ-1",
        "--fields",
        '{"description":"from json"}',
        "--descriptionFile",
        "desc.md",
      ],
      deps
    );
    expect(jiraModule.updateJiraIssue).toHaveBeenCalledWith(jiraClient, "PROJ-1", {
      description: markdownToAdf("from file"),
    });
  });

  it("errors when neither --fields nor --descriptionFile is provided", async () => {
    const { deps, stderr } = makeDeps();
    const code = await run(["jira", "update-issue", "PROJ-1"], deps);
    expect(code).toBe(1);
    expect(stderr.join("\n")).toContain(
      "requires --fields and/or --descriptionFile"
    );
    expect(jiraModule.updateJiraIssue).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Help, validation, and error handling (spec: dual-mode, errors, no-delete)
// ===========================================================================
describe("help output", () => {
  it("no args prints usage to stderr and exits non-zero", async () => {
    const { deps, stdout, stderr } = makeDeps();
    const code = await run([], deps);
    expect(code).toBe(1);
    expect(stderr.join("\n")).toContain("Usage:");
    expect(stdout).toEqual([]);
  });

  it("--help prints top-level help to stdout and exits 0", async () => {
    const { deps, stdout } = makeDeps();
    const code = await run(["--help"], deps);
    expect(code).toBe(0);
    expect(stdout.join("\n")).toContain("confluence commands:");
    expect(stdout.join("\n")).toContain("jira commands:");
  });

  it("group --help lists that group's commands and exits 0", async () => {
    const { deps, stdout } = makeDeps();
    const code = await run(["jira", "--help"], deps);
    expect(code).toBe(0);
    expect(stdout.join("\n")).toContain("create-issue");
  });

  it("group with no command lists commands and exits non-zero", async () => {
    const { deps, stdout } = makeDeps();
    const code = await run(["confluence"], deps);
    expect(code).toBe(1);
    expect(stdout.join("\n")).toContain("get-page");
  });

  it("command --help prints usage and arguments", async () => {
    const { deps, stdout } = makeDeps();
    const code = await run(["jira", "create-issue", "--help"], deps);
    expect(code).toBe(0);
    const text = stdout.join("\n");
    expect(text).toContain("--projectKey");
    expect(text).toContain("(required)");
  });

  it("topLevelHelp and commandHelp are renderable", () => {
    expect(topLevelHelp()).toContain("jira-confluence");
    const cmd = findCommand("jira", "create-issue")!;
    expect(commandHelp(cmd)).toContain("create-issue");
  });
});

describe("error handling", () => {
  it("unknown group errors to stderr and exits non-zero", async () => {
    const { deps, stderr } = makeDeps();
    const code = await run(["bitbucket", "list"], deps);
    expect(code).toBe(1);
    expect(stderr.join("\n")).toContain('Unknown command group "bitbucket"');
  });

  it("unknown command in a known group errors with available commands", async () => {
    const { deps, stderr } = makeDeps();
    const code = await run(["jira", "frobnicate"], deps);
    expect(code).toBe(1);
    expect(stderr.join("\n")).toContain('Unknown jira command "frobnicate"');
    expect(stderr.join("\n")).toContain("create-issue");
  });

  it("missing required argument errors before calling the API", async () => {
    const { deps, stderr } = makeDeps();
    const code = await run(["jira", "create-issue", "--summary", "x"], deps);
    expect(code).toBe(1);
    expect(stderr.join("\n")).toContain("Missing required argument");
    expect(stderr.join("\n")).toContain("--projectKey");
    expect(jiraModule.createJiraIssue).not.toHaveBeenCalled();
  });

  it("missing configuration surfaces the loader error and exits non-zero", async () => {
    const { deps, stderr } = makeDeps({
      loadJiraConfiguration: vi.fn(() => {
        throw new Error("Missing required environment variables for Jira: JIRA_URL");
      }),
    });
    const code = await run(["jira", "get-issue", "PROJ-1"], deps);
    expect(code).toBe(1);
    expect(stderr.join("\n")).toContain("Missing required environment variables");
  });

  it("an API failure is reported to stderr with a non-zero exit", async () => {
    vi.mocked(jiraModule.getJiraIssue).mockRejectedValue(new Error("404 Not Found"));
    const { deps, stderr } = makeDeps();
    const code = await run(["jira", "get-issue", "PROJ-999"], deps);
    expect(code).toBe(1);
    expect(stderr.join("\n")).toContain("Error: 404 Not Found");
  });

  it("only builds the client for the invoked group", async () => {
    vi.mocked(confluenceModule.checkPermissions).mockResolvedValue({} as never);
    const { deps } = makeDeps();
    await run(["confluence", "check-permissions"], deps);
    expect(deps.buildConfluenceClient).toHaveBeenCalledTimes(1);
    expect(deps.buildJiraClient).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric limit", async () => {
    const { deps, stderr } = makeDeps();
    const code = await run(
      ["confluence", "search", "--cql", "x", "--limit", "abc"],
      deps
    );
    expect(code).toBe(1);
    expect(stderr.join("\n")).toContain("Expected a number");
  });
});

// ---------------------------------------------------------------------------
// Bootstrap guard — must recognise invocation through a bin symlink, which is
// how npm/Homebrew expose the installed `jira-confluence` binary. Regression
// test for the guard exiting 0 with no output when run via the symlink.
// ---------------------------------------------------------------------------
describe("isInvokedAsScript", () => {
  let dir: string;

  beforeEach(() => {
    // realpath: on macOS tmpdir() is a symlink, and import.meta.url is always
    // realpath-resolved by Node, so the module side of the comparison must be
    // resolved too — matching real runtime behaviour.
    dir = realpathSync(mkdtempSync(join(tmpdir(), "jc-cli-")));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("matches when argv path is the file itself", () => {
    const file = join(dir, "cli.js");
    writeFileSync(file, "");
    expect(isInvokedAsScript(file, pathToFileURL(file).href)).toBe(true);
  });

  it("matches when argv path is a symlink to the file (bin install)", () => {
    const file = join(dir, "cli.js");
    const link = join(dir, "jira-confluence");
    writeFileSync(file, "");
    symlinkSync(file, link);
    // argv[1] is the symlink path, import.meta.url resolves to the realpath.
    expect(isInvokedAsScript(link, pathToFileURL(file).href)).toBe(true);
  });

  it("does not match an unrelated module (e.g. imported as a library)", () => {
    const file = join(dir, "cli.js");
    const other = join(dir, "other.js");
    writeFileSync(file, "");
    writeFileSync(other, "");
    expect(isInvokedAsScript(other, pathToFileURL(file).href)).toBe(false);
  });

  it("returns false when argv path is undefined", () => {
    expect(isInvokedAsScript(undefined, pathToFileURL(dir).href)).toBe(false);
  });
});
