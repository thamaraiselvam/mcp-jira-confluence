## Why

Installing the package currently creates a **second global executable**, `jira-confluence`, alongside `mcp-jira-confluence`. That extra bin pollutes the user's `PATH`, risks name collisions with other tools, and implies a "you must install it" workflow — yet the project has standardized on running the CLI on demand with `npx -y mcp-jira-confluence@latest <group> <command>`. We want exactly one entry point and zero install-time executables beyond the server bin.

## What Changes

- **BREAKING**: Remove the `jira-confluence` bin from `package.json`. Installing the package (global or local) no longer creates a `jira-confluence` command. Anyone relying on that executable must switch to `npx -y mcp-jira-confluence@latest <group> <command>` (or call the existing server bin `mcp-jira-confluence <group> <command>`).
- The single `mcp-jira-confluence` entry point gains **CLI routing**: when invoked with a CLI group/command (first argument is `confluence` or `jira`, or a top-level `--help`/`-h`), it runs the one-shot CLI and exits with the CLI's exit code. With no such argument it starts the MCP server exactly as today (stdio/HTTP auto-selection unchanged).
- The CLI is therefore reachable as `npx -y mcp-jira-confluence@latest <group> <command> [--flag value ...] [--json]` — no separate bin, no prior install.
- Docs are updated to drop every reference to the `jira-confluence` bin and use only the `npx`/`mcp-jira-confluence` form (`README.md`, `skills/jira-confluence-cli/SKILL.md`, `docs/agent-skill-setup.md`, `CLAUDE.md`).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `cli-commands`: The "Dual-mode package entry" requirement changes — the command-line surface is no longer a *distinct second bin*; instead the **single** package entry point routes to the one-shot CLI when given a CLI group/command, and starts the MCP server otherwise. The two surfaces still must not interfere (CLI never opens a transport; server launch never parses CLI args).

## Impact

- **Code**: `package.json` (remove the `jira-confluence` bin entry); `src/index.ts` (add a CLI-dispatch guard that runs before the server bootstrap and delegates to `cli.ts`'s `run()`). `src/cli.ts` keeps its `run()` API and its dev-only self-invocation guard (still used by the `npm run cli` / `dev:cli` scripts), so its behavior is unchanged.
- **Behavior**: Backward-incompatible for anyone calling the `jira-confluence` executable directly. The server's stdio/HTTP behavior is unchanged; MCP clients that launch `mcp-jira-confluence` with no CLI group are unaffected.
- **Tests**: a unit test for the new routing predicate (which argv starts a CLI run vs. the server); the MCP↔CLI parity test in `tests/unit/cli.test.ts` is unaffected (commands unchanged). `src/index.ts` remains excluded from coverage thresholds.
- **Docs**: `README.md`, `skills/jira-confluence-cli/SKILL.md`, `docs/agent-skill-setup.md`, `CLAUDE.md`.
