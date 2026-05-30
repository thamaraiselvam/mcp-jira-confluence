## ADDED Requirements

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

## MODIFIED Requirements

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
