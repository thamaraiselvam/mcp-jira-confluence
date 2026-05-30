# cli-commands Specification

## Purpose

Provide a command-line interface that exposes the package's existing Jira and Confluence MCP tools as one-shot CLI subcommands. The CLI coexists with the MCP server through a distinct entry point, runs a single command and exits, supports both human-readable and JSON output, returns conventional exit codes, and preserves the package's read-heavy, no-delete contract.

## Requirements

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

### Requirement: File-based Markdown content input

Every CLI argument that carries Markdown rich-text content SHALL be supplied as a path to a file rather than as an inline string. The CLI SHALL resolve the path, read its contents as UTF-8, and pass the raw Markdown to the corresponding `confluence.ts` / `jira.ts` function, which performs the Markdown→storage-HTML (Confluence) or Markdown→ADF (Jira) conversion internally. The CLI SHALL NOT duplicate conversion logic and SHALL NOT accept inline Markdown for these arguments.

#### Scenario: Content is read from a file

- **WHEN** the user supplies a content argument as a path to an existing, readable, non-empty Markdown file
- **THEN** the CLI reads the file as UTF-8 and passes its contents to the underlying API function for conversion and submission

#### Scenario: Content file does not exist

- **WHEN** the user supplies a content file path that does not exist
- **THEN** the CLI prints an error naming the missing file and exits with a non-zero code without calling the Atlassian API

#### Scenario: Content file is empty

- **WHEN** the user supplies a content file path that exists but is empty or contains only whitespace
- **THEN** the CLI prints an error indicating the file has no content and exits with a non-zero code without calling the Atlassian API

#### Scenario: Content file cannot be read

- **WHEN** the user supplies a content file path that cannot be read (e.g. a directory or a permission error)
- **THEN** the CLI prints the read error and exits with a non-zero code without calling the Atlassian API

### Requirement: Confluence CLI commands

The CLI SHALL expose every existing Confluence MCP tool as a subcommand under a `confluence` group: `search`, `get-page`, `create-page`, `update-page`, `add-comment`, `get-page-versions`, and `check-permissions`. Each subcommand SHALL accept the same inputs as its MCP tool, validate required arguments, invoke the corresponding `confluence.ts` function, and render the returned result. For subcommands that submit Markdown rich-text (`create-page` and `update-page` page body, `add-comment` comment body), the body SHALL be supplied as a path to a Markdown file; inline Markdown for these arguments is no longer accepted.

#### Scenario: Create a Confluence page

- **WHEN** the user runs the create-page command with a space key, title, and a path to a Markdown file for the body
- **THEN** the CLI reads the file, calls the Confluence create function which converts the Markdown, and prints the created page's id, title, and URL

#### Scenario: Search Confluence

- **WHEN** the user runs the search command with a CQL query
- **THEN** the CLI calls the Confluence search function and prints the matching results

#### Scenario: Missing required Confluence argument

- **WHEN** the user runs a Confluence subcommand without a required argument (e.g. create-page without a title)
- **THEN** the CLI prints an error naming the missing argument and exits with a non-zero code without calling the Atlassian API

#### Scenario: Confluence content file is missing

- **WHEN** the user runs create-page, update-page, or add-comment with a body file path that does not exist
- **THEN** the CLI prints an error naming the missing file and exits with a non-zero code without calling the Atlassian API

### Requirement: Jira CLI commands

The CLI SHALL expose every existing Jira MCP tool as a subcommand under a `jira` group: `search`, `get-issue`, `create-issue`, `update-issue`, `transition-issue`, `get-transitions`, `add-comment`, and `update-comment`. Each subcommand SHALL accept the same inputs as its MCP tool, validate required arguments, invoke the corresponding `jira.ts` function (using the markdown→ADF conversion where the tool does), and render the returned result. For subcommands that submit Markdown rich-text (`create-issue` description, `add-comment` and `update-comment` comment body), the content SHALL be supplied as a path to a Markdown file; inline Markdown for these arguments is no longer accepted. The `update-issue` subcommand SHALL additionally accept an optional path to a Markdown file for the issue description, converting it to ADF and merging it into the updated fields, while retaining the raw JSON fields input for other field updates.

#### Scenario: Create a Jira issue

- **WHEN** the user runs the create-issue command with a project key, issue type, summary, and a path to a Markdown file for the description
- **THEN** the CLI reads the file, calls the Jira create function which converts the description to ADF, and prints the created issue's key and URL

#### Scenario: Update a Jira issue description from a file

- **WHEN** the user runs the update-issue command with an issue key and a path to a Markdown file for the description
- **THEN** the CLI reads the file, converts it to ADF, merges it into the fields payload, and calls the Jira update function

#### Scenario: Transition a Jira issue

- **WHEN** the user runs the transition-issue command with an issue key and a target transition
- **THEN** the CLI calls the Jira transition function and reports the new status

#### Scenario: Unknown subcommand

- **WHEN** the user runs the CLI with a command name that does not match any registered subcommand
- **THEN** the CLI prints an "unknown command" error with the closest group's available commands and exits with a non-zero code

#### Scenario: Jira content file is missing

- **WHEN** the user runs create-issue, add-comment, or update-comment with a content file path that does not exist
- **THEN** the CLI prints an error naming the missing file and exits with a non-zero code without calling the Atlassian API

### Requirement: Output formatting

The CLI SHALL print human-readable formatted text by default and SHALL emit raw JSON when the `--json` flag is supplied, so output can be consumed by scripts.

#### Scenario: Default human-readable output

- **WHEN** a command succeeds without the `--json` flag
- **THEN** the CLI prints a formatted, labeled summary of the result to stdout

#### Scenario: JSON output

- **WHEN** a command succeeds with the `--json` flag
- **THEN** the CLI prints the result as a single valid JSON document to stdout and nothing else on stdout

### Requirement: Error handling and exit codes

The CLI SHALL exit with code 0 on success and a non-zero code on any failure (missing arguments, missing configuration, or Atlassian API errors), printing a clear error message to stderr.

#### Scenario: Missing configuration

- **WHEN** required Atlassian credentials/environment variables are absent and the user runs any command that needs them
- **THEN** the CLI prints an error listing the missing configuration and exits with a non-zero code

#### Scenario: Atlassian API error surfaces

- **WHEN** the underlying Jira or Confluence API call fails
- **THEN** the CLI prints the error message to stderr and exits with a non-zero code

### Requirement: No delete operations

The CLI SHALL NOT expose any command that deletes Jira issues, Confluence pages, comments, or other content, preserving the package's read-heavy, no-delete contract.

#### Scenario: No delete subcommand exists

- **WHEN** the user lists available CLI commands via help
- **THEN** no delete/remove command is listed for either the jira or confluence group
</content>
</invoke>
