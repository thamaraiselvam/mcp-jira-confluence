## MODIFIED Requirements

### Requirement: Dual-mode package entry

The package SHALL expose a **single** executable entry point (`mcp-jira-confluence`) that operates in two modes selected by its arguments, and SHALL NOT install any additional executable for the CLI. WHEN invoked with a CLI group/command (the first argument is `confluence` or `jira`) or a top-level help flag (`--help` / `-h`), the entry point SHALL run the one-shot CLI, print the result, and exit with the CLI's exit code WITHOUT opening an MCP transport. OTHERWISE it SHALL start the MCP server (stdio or HTTP, auto-selected) exactly as before. Routing to the CLI MUST NOT start a transport, and starting the server MUST NOT parse or require CLI arguments. The CLI is therefore reachable through the same entry point, e.g. `npx -y mcp-jira-confluence@latest <group> <command> [--flag value ...] [--json]`.

#### Scenario: CLI command runs and exits

- **WHEN** the entry point is invoked with a CLI group and command (e.g. `mcp-jira-confluence jira get-issue PROJ-1`)
- **THEN** it runs that single command, prints the result, and exits with the CLI's exit code without opening an MCP transport

#### Scenario: No separate CLI executable is installed

- **WHEN** the package is installed (globally or per-project)
- **THEN** it creates only the `mcp-jira-confluence` executable and no standalone `jira-confluence` (or other CLI) bin

#### Scenario: MCP server entry is unchanged

- **WHEN** the entry point is launched without a CLI group (no arguments, or server-only flags, via stdio or HTTP)
- **THEN** it starts the MCP server and behaves exactly as before, registering and serving all MCP tools, without parsing CLI commands

#### Scenario: Help flag lists groups

- **WHEN** the entry point is invoked with a top-level `--help` flag and no group
- **THEN** it prints top-level usage listing the `jira` and `confluence` command groups and exits with code 0

#### Scenario: Group without a command lists that group's commands

- **WHEN** the entry point is invoked with a CLI group but no command (e.g. `mcp-jira-confluence confluence`)
- **THEN** it lists that group's available commands and exits with a non-zero code, without opening an MCP transport
