## ADDED Requirements

### Requirement: Dual-mode package entry

The package SHALL continue to function as an MCP server through its existing entry point while ALSO providing a distinct command-line entry point that runs one-shot commands and exits. Invoking the CLI entry point MUST NOT start the MCP server transport, and launching the MCP server MUST NOT trigger CLI argument parsing.

#### Scenario: CLI entry runs a command and exits

- **WHEN** the user runs the CLI binary with a valid command and arguments
- **THEN** the CLI executes that single command, prints the result, and exits with code 0 without opening an MCP transport

#### Scenario: MCP server entry is unchanged

- **WHEN** the package is launched through its existing MCP server entry point (stdio or HTTP)
- **THEN** it behaves exactly as before, registering and serving all MCP tools

#### Scenario: No command shows help

- **WHEN** the user runs the CLI binary with no arguments
- **THEN** the CLI prints top-level usage listing the `jira` and `confluence` command groups and exits with a non-zero code

### Requirement: Confluence CLI commands

The CLI SHALL expose every existing Confluence MCP tool as a subcommand under a `confluence` group: `search`, `get-page`, `create-page`, `update-page`, `add-comment`, `get-page-versions`, and `check-permissions`. Each subcommand SHALL accept the same inputs as its MCP tool, validate required arguments, invoke the corresponding `confluence.ts` function, and render the returned result.

#### Scenario: Create a Confluence page

- **WHEN** the user runs the create-page command with a space key, title, and markdown content
- **THEN** the CLI converts the markdown, calls the Confluence create function, and prints the created page's id, title, and URL

#### Scenario: Search Confluence

- **WHEN** the user runs the search command with a CQL query
- **THEN** the CLI calls the Confluence search function and prints the matching results

#### Scenario: Missing required Confluence argument

- **WHEN** the user runs a Confluence subcommand without a required argument (e.g. create-page without a title)
- **THEN** the CLI prints an error naming the missing argument and exits with a non-zero code without calling the Atlassian API

### Requirement: Jira CLI commands

The CLI SHALL expose every existing Jira MCP tool as a subcommand under a `jira` group: `search`, `get-issue`, `create-issue`, `update-issue`, `transition-issue`, `get-transitions`, `add-comment`, and `update-comment`. Each subcommand SHALL accept the same inputs as its MCP tool, validate required arguments, invoke the corresponding `jira.ts` function (using the markdown→ADF conversion where the tool does), and render the returned result.

#### Scenario: Create a Jira issue

- **WHEN** the user runs the create-issue command with a project key, issue type, summary, and markdown description
- **THEN** the CLI converts the description to ADF, calls the Jira create function, and prints the created issue's key and URL

#### Scenario: Transition a Jira issue

- **WHEN** the user runs the transition-issue command with an issue key and a target transition
- **THEN** the CLI calls the Jira transition function and reports the new status

#### Scenario: Unknown subcommand

- **WHEN** the user runs the CLI with a command name that does not match any registered subcommand
- **THEN** the CLI prints an "unknown command" error with the closest group's available commands and exits with a non-zero code

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
