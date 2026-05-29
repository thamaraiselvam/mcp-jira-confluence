# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

An MCP (Model Context Protocol) server that connects AI assistants to Jira and Confluence Cloud. Read-heavy with controlled write access — there are deliberately **no delete operations**.

## Commands

```bash
npm run build          # tsc compile src/ -> dist/
npm test               # vitest run (all tests, single pass)
npm run test:watch     # vitest watch mode
npm run test:unit      # only tests/unit
npm run test:integration  # only tests/integration
npm run test:coverage  # enforces 80% branch/function/line/statement thresholds
npm run validate       # build, then run dist/validate.js — live diagnostic against real Atlassian creds
npm run dev            # build + run (stdio mode by default)
npm run dev:http       # build + run forced on HTTP port 9339
npm run dev:verbose    # build + run with VERBOSE logging
```

Run a single test file: `npx vitest run tests/unit/jira.test.ts`
Run a single test by name: `npx vitest run -t "transition issue"`
Type-check without emitting (what CI's lint job does): `npx tsc --noEmit`

CI (`.github/workflows/test.yml`) runs `npm test` + `npm run build` on Node 18/20/22, plus `tsc --noEmit` and coverage. There is no separate ESLint/Prettier step — "lint" in CI means the type check.

## Architecture

ES modules throughout (`"type": "module"`, `Node16` module resolution). **Relative imports must use the `.js` extension** even for `.ts` sources (e.g. `import { x } from "./config.js"`).

### Request flow
`index.ts` (entry/transport) → `tools.ts` (MCP tool registry + dispatch) → `confluence.ts` / `jira.ts` (API calls) → axios clients from `client.ts`.

### Transport modes (`index.ts`)
The server auto-selects transport at startup based on `process.stdin.isTTY`:
- **STDIO** — when piped (an MCP client launched it) or `MCP_TRANSPORT=stdio`. This is the normal production path.
- **HTTP** — when run in a terminal, on `127.0.0.1:9339` (`MCP_PORT` to override). Localhost-only. Exposes `/health` and `/mcp`.

HTTP mode is **stateless**: a fresh `Server` + `StreamableHTTPServerTransport` is built per request via `createMcpServer()` and torn down on response finish. The axios clients and config, however, are created **once** at startup in the `bootstrap` IIFE.

### CLI entry point (`cli.ts`)
The package exposes a **second** `bin` (`jira-confluence` → `dist/cli.js`) that runs one-shot terminal commands and exits — it never starts an MCP transport, and `index.ts` is untouched by it. `cli.ts` is a thin argv→function adapter over the same `confluence.ts` / `jira.ts` layer:
- `parseArgs(argv)` — pure parser → `{ group, command, positionals, options, json, help }`.
- `commands` — a declarative table (one entry per MCP tool, grouped `confluence`/`jira`) describing args + a handler that calls the matching API function. **To add a CLI command, add a table entry** (mirrors the `tools.ts` ListTools/switch pattern). Args can be passed as `--flag value` or as positionals in declared order.
- `run(argv, deps)` — validates required args, lazily builds only the needed client (Confluence commands don't require Jira creds and vice versa), dispatches, formats, and returns an exit code. `deps` (config loaders, client builders, stdout/stderr) are injectable for testing.
- `formatResult(result, json)` — `--json` prints `JSON.stringify`; otherwise a labeled text summary.

A parity test (`tests/unit/cli.test.ts`) asserts every MCP tool has a matching CLI command, so the two surfaces can't silently drift. Markdown conversion is **not** duplicated — the CLI passes raw markdown to the API functions, which convert internally (HTML/ADF), same as the MCP tools.

### Configuration (`config.ts`)
Two configs (`loadConfig` for Confluence, `loadJiraConfig` for Jira), each resolved from env with a fallback chain:
- Confluence: `CONFLUENCE_*` → `ATLASSIAN_*`
- Jira: `JIRA_*` → `ATLASSIAN_*` → `CONFLUENCE_*` (legacy fallback)

Service-specific vars override the shared `ATLASSIAN_*`. Missing required vars throw with a list of what's missing. `IGNORE_TLS_ERRORS=true|1` disables cert verification (for corporate networks). Optional scoping: `CONFLUENCE_SPACE_KEY`, `JIRA_PROJECT_KEY`.

### Auth (`client.ts`)
Two separate axios instances (Confluence, Jira). Both use HTTP Basic auth: `base64(email:apiToken)`. TLS verification toggled via a custom `https.Agent`.

### Markdown conversion — two distinct target formats
This is the core value-add and the easiest place to introduce subtle bugs. The two products consume **different** rich-text formats:

- **Confluence** uses *storage format (HTML)*. `markdown.ts` is a thin wrapper over `markdown-it` (`convertMarkdownToHtml`).
- **Jira** uses *ADF (Atlassian Document Format)* — a JSON tree. `jira-markdown.ts` (`markdownToAdf`) is a **hand-rolled line-by-line parser** producing ADF nodes (headings, lists, tables, code blocks, blockquotes, inline marks). It does not use markdown-it. When changing Jira formatting, edit this parser and its unit tests, not the markdown-it path.

`jira.ts` also contains `extractTextFromAdf` (reading ADF back to plain text) and `buildAdfDocument` (wrapping plain text for comments).

### Tool layer (`tools.ts`)
The largest file. `registerTools` wires two MCP handlers onto the `Server`:
- `ListToolsRequestSchema` — declares every tool with its JSON input schema.
- `CallToolRequestSchema` — a single `switch (name)` that validates args and calls the matching `confluence.ts` / `jira.ts` function.

To add a tool: add the schema entry in the ListTools array AND a `case` in the CallTool switch, then implement the API function in `confluence.ts` or `jira.ts`.

### `validate.ts`
A standalone CLI diagnostic (not part of the server, excluded from coverage). Walks through auth → search → write checks against real credentials and prints a step-by-step report with masked tokens. Use it to debug connectivity/credential issues.

## Testing requirement

Always add or update tests for any new change. Every code change must ship with matching tests — new tools/functions need unit tests, behavior changes need updated tests. Coverage thresholds are enforced at 80% (branch/function/line/statement) via `npm run test:coverage`.

## Notes

- API endpoints: Confluence uses `/wiki/rest/api/...`; Jira uses its REST v3 API with ADF payloads.
- `src/index.ts` and `src/validate.ts` are excluded from coverage thresholds.
- This repo uses OpenSpec (`openspec/`) for spec-driven changes; the `opsx:*` / `openspec-*` skills drive that workflow.
