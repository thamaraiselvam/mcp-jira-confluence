## 1. Scaffolding & packaging

- [x] 1.1 Create `src/cli.ts` with a `#!/usr/bin/env node` shebang and a thin `main()` bootstrap that reads `process.argv.slice(2)` and exits with the dispatch result code
- [x] 1.2 Add a new `bin` entry (`jira-confluence` → `dist/cli.js`) in `package.json`, keeping the existing `mcp-jira-confluence` server bin unchanged
- [x] 1.3 Add npm scripts for local CLI runs (e.g. `cli`/`dev:cli` building then invoking `dist/cli.js`)
- [x] 1.4 Confirm `tsc` emits `dist/cli.js` and that `.js`-extension ESM imports are used throughout `cli.ts`

## 2. Arg parser

- [x] 2.1 Implement a pure `parseArgs(argv)` helper returning `{ group, command, positionals, options, json, help }`, supporting `--flag value`, `--bool`, and global `--json` / `--help`
- [x] 2.2 Handle no-args (top-level help) and unknown-group cases
- [x] 2.3 Export `parseArgs` for direct unit testing

## 3. Command table & dispatch

- [x] 3.1 Define a declarative command table: group, name, required args, optional args/flags, and a handler that adapts parsed args to the matching `confluence.ts` / `jira.ts` function
- [x] 3.2 Add Confluence commands: `search`, `get-page`, `create-page`, `update-page`, `add-comment`, `get-page-versions`, `check-permissions`
- [x] 3.3 Add Jira commands: `search`, `get-issue`, `create-issue`, `update-issue`, `transition-issue`, `get-transitions`, `add-comment`, `update-comment`
- [x] 3.4 Reuse `convertMarkdownToHtml` (Confluence) and `markdownToAdf` (Jira) for markdown inputs exactly as the MCP tools do
- [x] 3.5 Implement `dispatch(parsed)` that validates required args, builds the clients/config once, calls the handler, and returns an exit code
- [x] 3.6 Generate per-command and per-group `--help` text from the command table

## 4. Output & error handling

- [x] 4.1 Implement a shared formatter: `--json` prints `JSON.stringify(result)` to stdout; otherwise a labeled text summary
- [x] 4.2 Route all errors (validation, config, API) to stderr and return a non-zero exit code; success returns 0
- [x] 4.3 Surface missing-config errors using the existing `loadConfig` / `loadJiraConfig` throws

## 5. Tests

- [x] 5.1 Unit tests for `parseArgs`: positionals, `--flag value`, booleans, `--json`, `--help`, no-args, unknown group/command
- [x] 5.2 Unit tests for dispatch with the `confluence.ts` / `jira.ts` functions mocked: each of the 15 commands calls the right function with mapped args
- [x] 5.3 Unit tests for markdown handling: create-page passes HTML, create-issue/add-comment pass ADF
- [x] 5.4 Unit tests for the formatter: text vs `--json` output, error → stderr + non-zero exit
- [x] 5.5 A coverage/parity test asserting every MCP tool in `tools.ts` has a corresponding CLI command (guards against future drift)
- [x] 5.6 Run `npm run test:coverage` and ensure 80% thresholds still pass

## 6. Docs & verification

- [x] 6.1 Add a "CLI usage" section to `README.md` documenting both binaries, command groups, examples (`jira-confluence jira create-issue ...`), and `--json`
- [x] 6.2 Update `CLAUDE.md` architecture notes to mention the CLI entry point and command table
- [x] 6.3 Run `npm run build` and `npx tsc --noEmit`; manually smoke-test a read command (e.g. `confluence check-permissions`, `jira search`) against real creds
