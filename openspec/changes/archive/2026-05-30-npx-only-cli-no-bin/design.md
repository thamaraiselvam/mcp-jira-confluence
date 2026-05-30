## Context

`package.json` declares two bins: `mcp-jira-confluence` → `dist/index.js` (the MCP server) and `jira-confluence` → `dist/cli.js` (the one-shot CLI). `src/index.ts` evaluates a top-level `bootstrap` IIFE on import that loads **both** Confluence and Jira config and exits the process if either is missing, then auto-selects a stdio or HTTP transport. `src/cli.ts` exposes a pure, injectable `run(argv, deps)` that lazily builds only the client a given command needs, plus a dev-only self-invocation guard (`isInvokedAsScript`) so `node dist/cli.js` works for `npm run cli`.

The project has standardized on `npx -y mcp-jira-confluence@latest <group> <command>`. We want to drop the second bin entirely and route the CLI through the single server entry point.

## Goals / Non-Goals

**Goals:**
- Installing the package creates only the `mcp-jira-confluence` executable — no `jira-confluence` bin.
- `mcp-jira-confluence <group> <command> …` (hence `npx -y mcp-jira-confluence@latest …`) runs the CLI and exits.
- The MCP server path (no CLI group) is byte-for-byte unchanged for existing clients.
- The heavy two-config `bootstrap` must NOT run on the CLI path (CLI loads only the client it needs).

**Non-Goals:**
- No change to CLI command behavior, arguments, output, or the `cli.ts` `run()`/`parseArgs()` API.
- No change to stdio/HTTP transport selection or the server's tools.
- Not removing `src/cli.ts` or the `npm run cli` / `dev:cli` dev scripts (they still call `node dist/cli.js`).

## Decisions

### Route in `index.ts` *before* the bootstrap IIFE
Add a guard at the very top of `index.ts` (immediately after imports, before `bootstrap` runs). It inspects `process.argv.slice(2)`; if the invocation is a CLI invocation, it delegates to `cli.ts`'s `run()` and `process.exit(code)`. Because this sits above the `bootstrap` IIFE and ends in `process.exit`, the server's two-config bootstrap and transport code never execute on the CLI path — so a Confluence-only command never requires Jira creds, matching today's CLI behavior.

- The module is ESM (`"type":"module"`) targeting ES2022 with Node16 resolution, so **top-level `await`** is available:
  ```ts
  const argv = process.argv.slice(2);
  if (isCliInvocation(argv)) {
    process.exit(await runCli(argv));
  }
  // …existing bootstrap + transport code, unchanged…
  ```
  Top-level await guarantees the rest of the module does not evaluate until the CLI promise settles, and `process.exit` prevents it entirely.

- **Alternative considered**: keep both bins but make `jira-confluence` a thin shim. Rejected — the explicit goal is to stop installing a second executable.
- **Alternative considered**: dispatch inside `cli.ts` and point a bin at it. Rejected — that *is* the second bin we're removing; routing must live on the surviving `index.ts` entry.

### `isCliInvocation(argv)` predicate (exported, testable)
A small pure function: returns true when `argv[0]` is a known CLI group (`confluence` | `jira`) **or** a top-level help flag (`--help` | `-h`). Everything else (no args, server flags, env-driven launches) falls through to the server. Exported so it can be unit-tested without spawning a process (`index.ts` itself stays excluded from coverage thresholds).

- Routing on a group covers `<entry> jira …`, `<entry> confluence …`, and `<entry> jira` (group-only → CLI prints that group's commands and exits non-zero).
- Routing on `--help`/`-h` preserves CLI discoverability (`npx … --help` lists groups) that the docs/skill rely on; the MCP server has no `--help` of its own, so this is unambiguous.
- MCP clients launch the server with no CLI group, so they are never diverted.

### Keep `cli.ts` and its self-invocation guard
`cli.ts` stays as-is: `index.ts` imports its `run()`. The `isInvokedAsScript` guard and the `npm run cli` / `dev:cli` scripts remain for local development against `dist/cli.js`. No bin points at it anymore.

## Risks / Trade-offs

- **[BREAKING] callers of the `jira-confluence` executable break** → Documented as BREAKING; docs switched to the `npx`/`mcp-jira-confluence` form; migration is mechanical (prefix `mcp-jira-confluence` or `npx -y mcp-jira-confluence@latest`).
- **[Arg collision] a future MCP need for a positional `jira`/`confluence`/`--help` server arg** → None exists today (the server takes only env vars + `MCP_*`). If one is ever added, gate CLI routing behind an explicit sentinel; for now the group-name check is safe.
- **[Top-level await + exit ordering]** the guard must precede the `bootstrap` IIFE → Enforced by placement and covered by the design note; verified by `tsc`/`npm run build` and a manual `node dist/index.js jira --help` smoke check.
- **[Coverage]** `index.ts` is excluded from thresholds, but the routing logic should still be tested → extract `isCliInvocation` and unit-test it; keep the thin glue in `index.ts`.

## Migration Plan

1. Add `isCliInvocation` + the dispatch guard to `index.ts`; import `run` from `cli.ts`.
2. Remove the `jira-confluence` entry from `package.json` `bin`.
3. `npm run build`; smoke-test `node dist/index.js jira --help` (CLI help), `node dist/index.js confluence` (group list), and a piped/no-arg launch (server still starts).
4. Add a unit test for `isCliInvocation`; run `npm run test:coverage`.
5. Update docs (`README.md`, `skills/jira-confluence-cli/SKILL.md`, `docs/agent-skill-setup.md`, `CLAUDE.md`) to drop the `jira-confluence` bin.
6. Bump version (breaking) on release.

Rollback: re-add the bin entry and revert the `index.ts` guard; no data or config migration involved.

## Open Questions

- Should a bare top-level `--help` show **CLI** help (groups/commands, as proposed) or a short server-vs-CLI usage note? Proposed: CLI top-level help, since that is the package's primary human-facing surface.
