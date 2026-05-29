## Context

The package is currently MCP-only. `index.ts` auto-selects a transport (stdio vs HTTP) at startup and `tools.ts` registers 15 tools that dispatch to `confluence.ts` / `jira.ts`, which call axios clients built in `client.ts` from config in `config.ts`. Markdown is converted to HTML for Confluence (`markdown.ts`) and to ADF for Jira (`jira-markdown.ts`).

We want the same package to also run as a one-shot CLI. The API logic, config, auth, and markdown conversion already exist and are transport-agnostic — the CLI only needs an argv parser and a dispatch table that calls the same functions, then formats the return value. This is a cross-cutting addition (new entry point, new `bin`, packaging change) so a short design is warranted.

## Goals / Non-Goals

**Goals:**
- A second `bin` executable that runs a single command and exits.
- 1:1 coverage of all 15 existing MCP tools as CLI subcommands, grouped `jira` and `confluence`.
- Reuse `config.ts`, `client.ts`, `confluence.ts`, `jira.ts`, and both markdown modules without modification.
- Text output by default, `--json` for scripting; correct exit codes.
- Unit tests for parsing, dispatch, formatting, and error paths; keep 80% coverage.

**Non-Goals:**
- No interactive prompts, REPL, or watch mode — strictly one-shot.
- No new delete/remove capabilities (preserves no-delete contract).
- No changes to MCP server behavior or the markdown conversion logic.
- No global config file or credential storage beyond the existing env-var resolution.

## Decisions

### Decision: Separate CLI entry point (`src/cli.ts` → `dist/cli.js`) with its own `bin`
Add a second `bin` (e.g. `jira-confluence`) pointing at `dist/cli.js`, keeping the existing `mcp-jira-confluence` → `dist/index.js` for the server. Rationale: clean separation means the server's TTY-based transport auto-selection in `index.ts` is untouched, and there is no ambiguity about whether an invocation is "server" or "CLI". Alternative considered: a single entry that branches on argv (e.g. `index.js cli ...`). Rejected because it risks regressing the stdin.isTTY transport detection and conflates two concerns.

### Decision: Hand-rolled minimal arg parser, no new runtime dependency
Parse `argv` with a small internal helper: first token = group (`jira`/`confluence`), second = subcommand, remaining = positional + `--flag value` / `--bool` options, plus global `--json` and `--help`. Rationale: the repo deliberately keeps dependencies lean and uses Node16 ESM; a hand-rolled parser avoids adding `commander`/`yargs` and keeps the parser unit-testable as a pure function. Alternative: `commander`. Rejected to avoid a new dependency for a constrained command set. (If parsing complexity grows, revisit.)

### Decision: Declarative command table mapping subcommand → handler
A single table describes each command: group, name, required args, optional args/flags, and a handler that adapts parsed args to the existing `confluence.ts`/`jira.ts` function call. Rationale: mirrors the `tools.ts` ListTools/switch pattern the codebase already uses, makes "add a command" a one-entry change, and lets help text and validation be generated from the same source. The table is exported so tests can assert coverage of all 15 tools.

### Decision: Shared result formatter with `--json` switch
One formatter renders results: when `--json` is set it prints `JSON.stringify(result)` to stdout; otherwise it prints a labeled text summary. Errors always go to stderr. Rationale: keeps stdout clean for piping and centralizes formatting for testing. Markdown inputs reuse `convertMarkdownToHtml` / `markdownToAdf` exactly as the tools do, so output parity with MCP is guaranteed.

### Decision: Centralized error handling and exit codes
Wrap dispatch in a try/catch: success → exit 0; validation/config/API error → print message to stderr, exit 1. Config errors reuse the existing `loadConfig` / `loadJiraConfig` "missing vars" throw. Rationale: predictable scripting behavior and matches spec requirements.

## Risks / Trade-offs

- **Hand-rolled parser misses edge cases (quoting, `=` syntax, repeated flags)** → Keep the parser pure and cover edge cases with unit tests; document supported syntax in `--help`. Escalate to `commander` only if the surface outgrows it.
- **Drift between MCP tools and CLI commands as new tools are added** → A test enumerates the MCP tool list and asserts a matching CLI command exists, failing CI when they diverge.
- **Coverage threshold (80%) on new `cli.ts`** → Design `cli.ts` so the parser, command table, and formatter are exported pure functions tested directly; keep the thin `#!/usr/bin/env node` bootstrap minimal and, if needed, exclude only the bootstrap shebang line behavior the way `index.ts` is excluded.
- **Double `bin` could confuse install/PATH** → Document both binaries in README; the server bin name is unchanged so existing MCP client configs keep working.

## Migration Plan

Additive change — no migration needed. Existing MCP server users are unaffected (entry point, bin name, and behavior unchanged). The new `bin` appears after `npm install`/upgrade. Rollback = revert the change; the server path has no new dependencies on the CLI.

## Open Questions

- Final name for the CLI `bin` (`jira-confluence` vs `jc` vs reusing `mcp-jira-confluence` with a subcommand). Defaulting to a new dedicated bin name; confirm during implementation.
- Whether to ship a thin Claude "skill" wrapper/manifest in this change or follow up separately once the CLI is stable.
