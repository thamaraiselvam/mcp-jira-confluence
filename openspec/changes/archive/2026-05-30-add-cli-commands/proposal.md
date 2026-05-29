## Why

Today this npm package only works as an MCP server — it is useful only when launched by an MCP client (Claude, Copilot, etc.). Users who want to drive Jira/Confluence from a terminal, a shell script, CI, or a Claude "skill" wrapper have no entry point. Exposing the same capabilities as a plain CLI (`mcp-jira-confluence jira create-issue ...`) lets the one package serve both worlds without duplicating the Jira/Confluence logic.

## What Changes

- Add a second executable entry point (a `bin` command) that parses argv and runs **one-shot CLI commands** instead of starting a server.
- Expose **every existing MCP tool** as a CLI subcommand, grouped by product:
  - Confluence: `search`, `get-page`, `create-page`, `update-page`, `add-comment`, `get-page-versions`, `check-permissions`.
  - Jira: `search`, `get-issue`, `create-issue`, `update-issue`, `transition-issue`, `get-transitions`, `add-comment`, `update-comment`.
- Reuse the existing config resolution, axios clients, and `confluence.ts` / `jira.ts` functions — the CLI is a thin argv-to-function adapter, not a reimplementation.
- Support both **human-readable** output (default, formatted text) and **machine-readable** output (`--json`) for scripting.
- Keep the package's **read-heavy, no-delete** contract: the CLI exposes no delete operations, mirroring the MCP surface.
- Add CLI usage docs (`--help` per command and group) and unit tests covering argument parsing, command dispatch, and output formatting.

## Capabilities

### New Capabilities
- `cli-commands`: A command-line interface that maps each existing Jira and Confluence MCP tool to a terminal subcommand, parses and validates arguments, invokes the shared API layer, and renders results as text or JSON — while the package continues to function as an MCP server through its existing entry point.

### Modified Capabilities
<!-- No existing spec-level requirements change. The MCP server behavior and the jira-comments capability are unaffected. -->

## Impact

- **package.json**: add a new `bin` entry (e.g. `jira-confluence`) pointing at a compiled CLI entry (`dist/cli.js`); possibly add a lightweight arg-parsing dependency or hand-roll parsing to avoid new deps.
- **New source**: `src/cli.ts` (entry + dispatch). Reuses `config.ts`, `client.ts`, `confluence.ts`, `jira.ts`, `markdown.ts`, `jira-markdown.ts` unchanged.
- **index.ts / transport selection**: unaffected — MCP server behavior is preserved exactly.
- **Tests**: new unit tests under `tests/unit/` for CLI parsing, dispatch, and formatting; coverage thresholds (80%) must still pass.
- **Docs**: README gains a "CLI usage" section.
- No changes to Atlassian API usage, auth, or the markdown→ADF/HTML conversion logic.
