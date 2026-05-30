#!/usr/bin/env node
import { realpathSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AxiosInstance } from "axios";
import {
  loadConfig,
  loadJiraConfig,
  ConfluenceConfig,
  JiraConfig,
} from "./config.js";
import { createConfluenceClient, createJiraClient } from "./client.js";
import * as confluence from "./confluence.js";
import * as jira from "./jira.js";
import { markdownToAdf } from "./jira-markdown.js";

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

export interface ParsedArgs {
  /** First positional — the command group ("jira" / "confluence"). */
  group?: string;
  /** Second positional — the subcommand name. */
  command?: string;
  /** Remaining positionals, mapped onto a command's declared args by order. */
  positionals: string[];
  /** Named `--flag value` / `--flag=value` / bare `--flag` options. */
  options: Record<string, string | boolean>;
  /** Global `--json` flag. */
  json: boolean;
  /** Global `--help` flag. */
  help: boolean;
}

/**
 * Parse a raw argv array (already stripped of node + script path) into a
 * structured shape. Supports `--flag value`, `--flag=value`, bare booleans,
 * and the global `--json` / `--help` flags. Pure and side-effect free.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};
  let json = false;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (token.startsWith("--")) {
      let key = token.slice(2);
      let value: string | boolean | undefined;

      const eq = key.indexOf("=");
      if (eq !== -1) {
        value = key.slice(eq + 1);
        key = key.slice(0, eq);
      }

      if (key === "json") {
        json = true;
        continue;
      }
      if (key === "help") {
        help = true;
        continue;
      }

      if (value === undefined) {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          value = next;
          i++;
        } else {
          value = true;
        }
      }

      options[key] = value;
    } else {
      positionals.push(token);
    }
  }

  return {
    group: positionals[0],
    command: positionals[1],
    positionals: positionals.slice(2),
    options,
    json,
    help,
  };
}

// ---------------------------------------------------------------------------
// Command table
// ---------------------------------------------------------------------------

export interface CommandContext {
  confluenceClient: AxiosInstance;
  confluenceConfig: ConfluenceConfig;
  jiraClient: AxiosInstance;
  jiraConfig: JiraConfig;
}

export interface ArgSpec {
  name: string;
  required: boolean;
  description: string;
  /**
   * When true, the argument's value is a path to a Markdown file. The
   * dispatcher reads the file and replaces the value with its contents before
   * invoking the command handler.
   */
  contentFile?: boolean;
}

export interface CommandDef {
  group: "confluence" | "jira";
  name: string;
  description: string;
  args: ArgSpec[];
  run: (values: Record<string, string>, ctx: CommandContext) => Promise<unknown>;
}

/** Parse an optional numeric option, returning undefined when absent. */
function num(value: string | undefined): number | undefined {
  if (value === undefined || value.trim().length === 0) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Expected a number but got "${value}"`);
  }
  return n;
}

/** Split a comma-separated option into a trimmed string array. */
function list(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const items = value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return items.length > 0 ? items : undefined;
}

/**
 * Read Markdown rich-text content from a file path. All content-bearing CLI
 * arguments are supplied as file paths (never inline) so multi-line Markdown is
 * passed reliably. Throws a clear, typed error — surfaced before any network
 * call — when the file is missing, unreadable (e.g. a directory or permission
 * error), or empty/whitespace-only. The raw Markdown is returned unchanged; the
 * API layer performs the HTML/ADF conversion.
 */
export function readContentFile(
  path: string,
  readFile: (p: string) => string
): string {
  let raw: string;
  try {
    raw = readFile(path);
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      throw new Error(`File not found: ${path}`);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read file "${path}": ${message}`);
  }
  if (raw.trim().length === 0) {
    throw new Error(`File "${path}" is empty — expected Markdown content.`);
  }
  return raw;
}

export const commands: CommandDef[] = [
  // ----- Confluence -------------------------------------------------------
  {
    group: "confluence",
    name: "search",
    description: "Search Confluence content with a CQL query.",
    args: [
      { name: "cql", required: true, description: "CQL query string." },
      { name: "limit", required: false, description: "Max results (1-100)." },
    ],
    run: (v, ctx) =>
      confluence.searchConfluence(
        ctx.confluenceClient,
        v.cql,
        num(v.limit),
        ctx.confluenceConfig.spaceKey
      ),
  },
  {
    group: "confluence",
    name: "get-page",
    description: "Fetch a Confluence page by ID.",
    args: [{ name: "pageId", required: true, description: "Page ID." }],
    run: (v, ctx) =>
      confluence.getConfluencePage(
        ctx.confluenceClient,
        v.pageId,
        ctx.confluenceConfig.spaceKey
      ),
  },
  {
    group: "confluence",
    name: "create-page",
    description: "Create a new Confluence page from Markdown.",
    args: [
      { name: "spaceKey", required: true, description: "Target space key." },
      { name: "title", required: true, description: "Page title." },
      {
        name: "markdownContent",
        required: true,
        description: "Path to a Markdown file for the page body.",
        contentFile: true,
      },
      {
        name: "parentPageId",
        required: false,
        description: "Optional parent page ID to nest under.",
      },
    ],
    run: (v, ctx) =>
      confluence.createConfluencePage(
        ctx.confluenceClient,
        v.spaceKey,
        v.title,
        v.markdownContent,
        v.parentPageId,
        ctx.confluenceConfig.spaceKey
      ),
  },
  {
    group: "confluence",
    name: "update-page",
    description: "Update an existing Confluence page from Markdown.",
    args: [
      { name: "pageId", required: true, description: "Page ID to update." },
      { name: "title", required: true, description: "New page title." },
      {
        name: "markdownContent",
        required: true,
        description: "Path to a Markdown file for the new page body.",
        contentFile: true,
      },
    ],
    run: (v, ctx) =>
      confluence.updateConfluencePage(
        ctx.confluenceClient,
        v.pageId,
        v.title,
        v.markdownContent,
        ctx.confluenceConfig.spaceKey
      ),
  },
  {
    group: "confluence",
    name: "add-comment",
    description: "Add a Markdown comment to a Confluence page.",
    args: [
      { name: "pageId", required: true, description: "Page ID to comment on." },
      {
        name: "markdownContent",
        required: true,
        description: "Path to a Markdown file for the comment body.",
        contentFile: true,
      },
    ],
    run: (v, ctx) =>
      confluence.addConfluenceComment(
        ctx.confluenceClient,
        v.pageId,
        v.markdownContent,
        ctx.confluenceConfig.spaceKey
      ),
  },
  {
    group: "confluence",
    name: "get-page-versions",
    description: "List version history for a Confluence page.",
    args: [
      { name: "pageId", required: true, description: "Page ID." },
      { name: "limit", required: false, description: "Max versions (1-200)." },
    ],
    run: (v, ctx) =>
      confluence.getConfluencePageVersions(
        ctx.confluenceClient,
        v.pageId,
        num(v.limit),
        ctx.confluenceConfig.spaceKey
      ),
  },
  {
    group: "confluence",
    name: "check-permissions",
    description: "Check Confluence auth, read, and optional write access.",
    args: [
      {
        name: "pageId",
        required: false,
        description: "Optional page ID to test write access against.",
      },
    ],
    run: (v, ctx) =>
      confluence.checkPermissions(ctx.confluenceClient, v.pageId),
  },

  // ----- Jira -------------------------------------------------------------
  {
    group: "jira",
    name: "search",
    description: "Search Jira issues with a JQL query.",
    args: [
      { name: "jql", required: true, description: "JQL query string." },
      { name: "limit", required: false, description: "Max results (1-100)." },
      { name: "startAt", required: false, description: "Pagination offset." },
    ],
    run: (v, ctx) =>
      jira.searchJira(
        ctx.jiraClient,
        v.jql,
        num(v.limit),
        num(v.startAt),
        ctx.jiraConfig.projectKey
      ),
  },
  {
    group: "jira",
    name: "get-issue",
    description: "Fetch a Jira issue by key or ID.",
    args: [
      {
        name: "issueIdOrKey",
        required: true,
        description: "Issue key (e.g. PROJ-123) or numeric ID.",
      },
    ],
    run: (v, ctx) => jira.getJiraIssue(ctx.jiraClient, v.issueIdOrKey),
  },
  {
    group: "jira",
    name: "create-issue",
    description: "Create a Jira issue with a Markdown description.",
    args: [
      { name: "projectKey", required: true, description: "Project key." },
      {
        name: "issueType",
        required: true,
        description: "Issue type (e.g. Story, Bug, Task).",
      },
      { name: "summary", required: true, description: "Issue summary/title." },
      {
        name: "description",
        required: true,
        description: "Path to a Markdown file for the description.",
        contentFile: true,
      },
      {
        name: "assigneeAccountId",
        required: false,
        description: "Atlassian account ID of the assignee.",
      },
      { name: "priority", required: false, description: "Priority name." },
      {
        name: "labels",
        required: false,
        description: "Comma-separated label list.",
      },
    ],
    run: (v, ctx) =>
      jira.createJiraIssue(
        ctx.jiraClient,
        v.projectKey,
        v.issueType,
        v.summary,
        v.description,
        v.assigneeAccountId,
        v.priority,
        list(v.labels),
        ctx.jiraConfig.projectKey
      ),
  },
  {
    group: "jira",
    name: "update-issue",
    description: "Update fields on a Jira issue (fields JSON and/or description file).",
    args: [
      {
        name: "issueIdOrKey",
        required: true,
        description: "Issue key or numeric ID.",
      },
      {
        name: "fields",
        required: false,
        description:
          'JSON object of fields to update, e.g. \'{"summary":"New"}\'.',
      },
      {
        name: "descriptionFile",
        required: false,
        description:
          "Path to a Markdown file for the description (converted to ADF).",
        contentFile: true,
      },
    ],
    run: (v, ctx) => {
      let fields: jira.JiraIssueFields = {};
      if (v.fields !== undefined && v.fields.trim().length > 0) {
        try {
          fields = JSON.parse(v.fields) as jira.JiraIssueFields;
        } catch {
          throw new Error(
            `--fields must be a valid JSON object, got: ${v.fields}`
          );
        }
      }
      // A description file (already read to Markdown by the dispatcher) is
      // converted to ADF and wins over any description in --fields.
      if (v.descriptionFile !== undefined) {
        fields.description = markdownToAdf(
          v.descriptionFile
        ) as unknown as jira.JiraIssueFields["description"];
      }
      if (Object.keys(fields).length === 0) {
        throw new Error(
          "update-issue requires --fields and/or --descriptionFile"
        );
      }
      return jira.updateJiraIssue(ctx.jiraClient, v.issueIdOrKey, fields);
    },
  },
  {
    group: "jira",
    name: "transition-issue",
    description: "Transition a Jira issue to a new status.",
    args: [
      {
        name: "issueIdOrKey",
        required: true,
        description: "Issue key or numeric ID.",
      },
      {
        name: "transition",
        required: true,
        description: "Transition ID or name (e.g. In Progress).",
      },
    ],
    run: (v, ctx) =>
      jira.transitionJiraIssue(ctx.jiraClient, v.issueIdOrKey, v.transition),
  },
  {
    group: "jira",
    name: "get-transitions",
    description: "List available transitions for a Jira issue.",
    args: [
      {
        name: "issueIdOrKey",
        required: true,
        description: "Issue key or numeric ID.",
      },
    ],
    run: (v, ctx) =>
      jira.getJiraIssueTransitions(ctx.jiraClient, v.issueIdOrKey),
  },
  {
    group: "jira",
    name: "add-comment",
    description: "Add a Markdown comment to a Jira issue.",
    args: [
      {
        name: "issueIdOrKey",
        required: true,
        description: "Issue key or numeric ID.",
      },
      {
        name: "markdownBody",
        required: true,
        description: "Path to a Markdown file for the comment body.",
        contentFile: true,
      },
    ],
    run: (v, ctx) =>
      jira.addJiraComment(
        ctx.jiraClient,
        v.issueIdOrKey,
        v.markdownBody,
        ctx.jiraConfig.projectKey
      ),
  },
  {
    group: "jira",
    name: "update-comment",
    description: "Update an existing comment on a Jira issue.",
    args: [
      {
        name: "issueIdOrKey",
        required: true,
        description: "Issue key or numeric ID.",
      },
      { name: "commentId", required: true, description: "Comment ID." },
      {
        name: "markdownBody",
        required: true,
        description: "Path to a Markdown file for the new comment body.",
        contentFile: true,
      },
    ],
    run: (v, ctx) =>
      jira.updateJiraComment(
        ctx.jiraClient,
        v.issueIdOrKey,
        v.commentId,
        v.markdownBody,
        ctx.jiraConfig.projectKey
      ),
  },
];

export function findCommand(
  group: string | undefined,
  name: string | undefined
): CommandDef | undefined {
  return commands.find((c) => c.group === group && c.name === name);
}

// ---------------------------------------------------------------------------
// Entry routing
// ---------------------------------------------------------------------------

/** CLI command groups that, as the first argument, route to the one-shot CLI. */
const CLI_GROUPS = new Set(["confluence", "jira"]);

/**
 * Decide whether an argv (already stripped of node + script path) is a CLI
 * invocation rather than an MCP server launch. The package's single entry point
 * (`mcp-jira-confluence`) dispatches to the CLI when the first argument is a CLI
 * group (`confluence`/`jira`) or a top-level help flag; everything else (no
 * args, server flags, the way MCP clients launch it) starts the server.
 */
export function isCliInvocation(argv: string[]): boolean {
  const first = argv[0];
  if (first === undefined) return false;
  return CLI_GROUPS.has(first) || first === "--help" || first === "-h";
}

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

// Shown in usage/help. The CLI has no dedicated bin — it is reached through the
// package's single entry point, canonically via npx.
const BIN = "npx -y mcp-jira-confluence@latest";

export function topLevelHelp(): string {
  const groups = ["confluence", "jira"] as const;
  const lines: string[] = [
    `${BIN} — CLI for Jira & Confluence (same capabilities as the MCP server)`,
    "",
    `Usage: ${BIN} <group> <command> [--flag value ...] [--json]`,
    "",
  ];
  for (const group of groups) {
    lines.push(`${group} commands:`);
    for (const cmd of commands.filter((c) => c.group === group)) {
      lines.push(`  ${cmd.name.padEnd(20)} ${cmd.description}`);
    }
    lines.push("");
  }
  lines.push(`Run "${BIN} <group> <command> --help" for command details.`);
  return lines.join("\n");
}

export function commandHelp(cmd: CommandDef): string {
  const usageArgs = cmd.args
    .map((a) => {
      const placeholder = a.contentFile ? "<file.md>" : "<value>";
      return a.required
        ? `--${a.name} ${placeholder}`
        : `[--${a.name} ${placeholder}]`;
    })
    .join(" ");
  const lines: string[] = [
    `${BIN} ${cmd.group} ${cmd.name} — ${cmd.description}`,
    "",
    `Usage: ${BIN} ${cmd.group} ${cmd.name} ${usageArgs} [--json]`,
    "",
    "Arguments:",
  ];
  for (const a of cmd.args) {
    const tag = a.required ? "(required)" : "(optional)";
    lines.push(`  --${a.name.padEnd(18)} ${tag} ${a.description}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function formatText(value: unknown, indent: number): string {
  const pad = "  ".repeat(indent);

  if (value === null || value === undefined) return `${pad}(none)`;

  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}(empty)`;
    return value
      .map((item) =>
        item && typeof item === "object"
          ? `${pad}-\n${formatText(item, indent + 1)}`
          : `${pad}- ${String(item)}`
      )
      .join("\n");
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) =>
        v && typeof v === "object"
          ? `${pad}${k}:\n${formatText(v, indent + 1)}`
          : `${pad}${k}: ${String(v)}`
      )
      .join("\n");
  }

  return `${pad}${String(value)}`;
}

/** Render a command result as pretty JSON (when `json`) or labeled text. */
export function formatResult(result: unknown, json: boolean): string {
  if (json) return JSON.stringify(result, null, 2);
  return formatText(result, 0);
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export interface CliDeps {
  loadConfluenceConfig: typeof loadConfig;
  loadJiraConfiguration: typeof loadJiraConfig;
  buildConfluenceClient: typeof createConfluenceClient;
  buildJiraClient: typeof createJiraClient;
  /** Read a file's contents as UTF-8. Injectable so tests avoid the disk. */
  readFile: (path: string) => string;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}

const defaultDeps: CliDeps = {
  loadConfluenceConfig: loadConfig,
  loadJiraConfiguration: loadJiraConfig,
  buildConfluenceClient: createConfluenceClient,
  buildJiraClient: createJiraClient,
  readFile: (path) => readFileSync(path, "utf8"),
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
};

/** Map declared args onto values from named options (preferred) or positionals. */
function collectValues(cmd: CommandDef, parsed: ParsedArgs): Record<string, string> {
  const values: Record<string, string> = {};
  cmd.args.forEach((arg, index) => {
    const fromOption = parsed.options[arg.name];
    if (typeof fromOption === "string") {
      values[arg.name] = fromOption;
      return;
    }
    const fromPositional = parsed.positionals[index];
    if (typeof fromPositional === "string") {
      values[arg.name] = fromPositional;
    }
  });
  return values;
}

/**
 * Run one CLI invocation. Returns a process exit code (0 success, non-zero on
 * any failure). Dependencies are injectable so dispatch is fully testable.
 */
export async function run(
  argv: string[],
  deps: CliDeps = defaultDeps
): Promise<number> {
  const parsed = parseArgs(argv);

  // No group at all: explicit --help is success, otherwise usage error.
  if (!parsed.group) {
    if (parsed.help) {
      deps.stdout(topLevelHelp());
      return 0;
    }
    deps.stderr(topLevelHelp());
    return 1;
  }

  if (parsed.group !== "confluence" && parsed.group !== "jira") {
    deps.stderr(`Unknown command group "${parsed.group}".`);
    deps.stderr(topLevelHelp());
    return 1;
  }

  // Group help (no command, or --help with just the group).
  if (!parsed.command || (parsed.help && !findCommand(parsed.group, parsed.command))) {
    if (parsed.help || !parsed.command) {
      const groupCmds = commands.filter((c) => c.group === parsed.group);
      deps.stdout(`${parsed.group} commands:`);
      for (const c of groupCmds) {
        deps.stdout(`  ${c.name.padEnd(20)} ${c.description}`);
      }
      return parsed.command ? 1 : parsed.help ? 0 : 1;
    }
  }

  const cmd = findCommand(parsed.group, parsed.command);
  if (!cmd) {
    const groupCmds = commands
      .filter((c) => c.group === parsed.group)
      .map((c) => c.name)
      .join(", ");
    deps.stderr(
      `Unknown ${parsed.group} command "${parsed.command}". Available: ${groupCmds}`
    );
    return 1;
  }

  // Per-command help.
  if (parsed.help) {
    deps.stdout(commandHelp(cmd));
    return 0;
  }

  // Validate required args before touching config or the network.
  const values = collectValues(cmd, parsed);
  const missing = cmd.args
    .filter((a) => a.required)
    .filter((a) => !values[a.name] || values[a.name].trim().length === 0)
    .map((a) => `--${a.name}`);
  if (missing.length > 0) {
    deps.stderr(
      `Missing required argument(s) for "${parsed.group} ${parsed.command}": ${missing.join(", ")}`
    );
    deps.stderr(commandHelp(cmd));
    return 1;
  }

  // Resolve content-file arguments (paths → Markdown contents) before touching
  // config or the network, so a missing/empty/unreadable file fails fast.
  try {
    for (const arg of cmd.args) {
      if (arg.contentFile && values[arg.name] !== undefined) {
        values[arg.name] = readContentFile(values[arg.name], deps.readFile);
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    deps.stderr(`Error: ${message}`);
    return 1;
  }

  try {
    // Build only the client the command needs (so a Confluence command does
    // not require Jira credentials and vice versa).
    const ctx = {} as CommandContext;
    if (cmd.group === "confluence") {
      const cfg = deps.loadConfluenceConfig();
      ctx.confluenceConfig = cfg;
      ctx.confluenceClient = deps.buildConfluenceClient(cfg);
    } else {
      const cfg = deps.loadJiraConfiguration();
      ctx.jiraConfig = cfg;
      ctx.jiraClient = deps.buildJiraClient(cfg);
    }

    const result = await cmd.run(values, ctx);
    deps.stdout(formatResult(result, parsed.json));
    return 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    deps.stderr(`Error: ${message}`);
    return 1;
  }
}

// ---------------------------------------------------------------------------
// Bootstrap — only runs when this file is invoked directly as the CLI.
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const code = await run(process.argv.slice(2));
  process.exit(code);
}

// npm/Homebrew expose this CLI through a bin symlink, so process.argv[1] is
// the symlink path while import.meta.url is the resolved realpath of the
// target file. Resolve argv[1] through realpath before comparing, otherwise
// the two never match when invoked via the installed binary and main() never
// runs (the process exits 0 with no output).
export function isInvokedAsScript(
  argvPath: string | undefined,
  moduleUrl: string,
): boolean {
  if (argvPath === undefined) return false;
  let resolved: string;
  try {
    resolved = realpathSync(argvPath);
  } catch {
    resolved = argvPath;
  }
  return resolved === fileURLToPath(moduleUrl);
}

const invokedDirectly = isInvokedAsScript(process.argv[1], import.meta.url);

if (invokedDirectly) {
  void main();
}
