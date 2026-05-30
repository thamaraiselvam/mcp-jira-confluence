# Jira & Confluence MCP Server

[![Tests](https://github.com/thamaraiselvam/mcp-jira-confluence/workflows/Tests/badge.svg)](https://github.com/thamaraiselvam/mcp-jira-confluence/actions/workflows/test.yml)
[![npm version](https://img.shields.io/npm/v/mcp-jira-confluence.svg?style=flat&color=blue)](https://www.npmjs.com/package/mcp-jira-confluence)
[![npm downloads](https://img.shields.io/npm/d18m/mcp-jira-confluence)](https://www.npmjs.com/package/mcp-jira-confluence)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)

A Model Context Protocol (MCP) server that connects AI assistants to Jira and Confluence.

## Features

- 🔍 **Search & View** - Query Jira issues with JQL and Confluence pages with CQL
- ✏️ **Create & Edit** - Add new issues and pages, update existing content
- 🎨 **Rich Formatting** - Automatically converts AI-generated Markdown to ADF (Atlassian Document Format) for beautiful, native-looking content in Jira and Confluence
- 🔒 **Safe Operations** - No delete operations—read-heavy with controlled write access
- 🚀 **Easy Setup** - One-command integration with OpenCode, GitHub Copilot, Claude Desktop, and more
- 🔐 **Secure** - Uses Atlassian API tokens with optional TLS configuration for corporate networks

## Add to OpenCode CLI

### Quick Add (Interactive - Recommended)

Use OpenCode's interactive MCP add command:

```bash
opencode mcp add
```

Then follow the prompts:

```
┌  Add MCP server
│
◇  Enter MCP server name
│  jira-confluence
│
◇  Select MCP server type
│  Local
│
◇  Enter command to run
│  npx mcp-jira-confluence
```

After adding, edit `~/.config/opencode/opencode.json` to add your credentials:

```json
{
  "mcp": {
    "jira-confluence": {
      "type": "local",
      "command": ["npx", "mcp-jira-confluence"],
      "environment": {
        "ATLASSIAN_URL": "https://your-org.atlassian.net",
        "ATLASSIAN_EMAIL": "your.email@example.com",
        "ATLASSIAN_API_TOKEN": "your-api-token",
        "IGNORE_TLS_ERRORS": "true"
      }
    }
  }
}
```

Get your API token from [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens).


### Manual Configuration

Create or edit `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "jira-confluence": {
      "type": "local",
      "command": ["npx", "mcp-jira-confluence"],
      "environment": {
        "ATLASSIAN_URL": "https://your-org.atlassian.net",
        "ATLASSIAN_EMAIL": "your.email@example.com",
        "ATLASSIAN_API_TOKEN": "your-api-token",
        "IGNORE_TLS_ERRORS": "true"
      }
    }
  }
}
```

Get your API token from [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens).

### Usage in OpenCode

After configuration, use natural prompts to interact with Jira and Confluence:

**Search and Query:**
```
Show me all high-priority bugs in the AUTH project
What are the open issues assigned to me in Jira?
Search Confluence for API documentation in the DEV space
```

**View and Analyze:**
```
Get details of issue PROJ-123
Show me the latest comments on PROJ-456
What's in the "Architecture Decisions" Confluence page?
```

**Create and Update:**
```
Create a new bug in Jira: The login page shows a 500 error when...
Update PROJ-789 to mark it as in progress
Add a comment to PROJ-101: "Fixed in latest deployment"
```

**Workflow:**
```
What transitions are available for PROJ-234?
Move PROJ-567 to Done status
```

The AI will automatically use the Jira and Confluence tools when it detects you're asking about issues, projects, or documentation.

## Other MCP Clients

### GitHub Copilot CLI

Create or edit `~/.config/github-copilot/mcp.json`:

```json
{
  "mcpServers": {
    "jira-confluence": {
      "command": "npx",
      "args": ["mcp-jira-confluence"],
      "env": {
        "ATLASSIAN_URL": "https://your-org.atlassian.net",
        "ATLASSIAN_EMAIL": "your.email@example.com",
        "ATLASSIAN_API_TOKEN": "your-api-token",
        "IGNORE_TLS_ERRORS": "true"
      }
    }
  }
}
```

### Claude Desktop & VS Code

Same configuration format. For Claude Desktop, edit your Claude config file. For VS Code, add to `.vscode/mcp.json`.

### Connect to Running Server

If you prefer to run the server manually, use this configuration:

```json
{
  "mcpServers": {
    "jira-confluence": {
      "type": "http",
      "url": "http://127.0.0.1:9339/mcp"
    }
  }
}
```

## Quick Start (Manual Usage)

If you prefer to run the server manually instead of auto-starting:

1. **Create `.env` file in your home directory or project root:**

```bash
# ~/.env or current directory
ATLASSIAN_URL=https://your-org.atlassian.net
ATLASSIAN_EMAIL=your.email@example.com
ATLASSIAN_API_TOKEN=your-api-token
IGNORE_TLS_ERRORS=true
```

Get your API token from [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens).

2. **Run with npx:**

```bash
npx mcp-jira-confluence
```

Server runs on `http://127.0.0.1:9339` by default.

## Available Tools

### Confluence
- `search_confluence` - Search pages with CQL
- `get_confluence_page` - Read page content
- `create_confluence_page` - Create pages from Markdown
- `update_confluence_page` - Update pages from Markdown
- `add_confluence_comment` - Add comments
- `get_confluence_page_versions` - Read version history
- `check_confluence_permissions` - Check permissions

### Jira
- `jira_search` - Search issues with JQL
- `jira_get_issue` - Read issue details
- `jira_create_issue` - Create issues from Markdown
- `jira_update_issue` - Update issue fields
- `jira_transition_issue` - Change workflow status
- `jira_get_transitions` - List available transitions
- `jira_add_comment` - Add a Markdown comment to an issue
- `jira_update_comment` - Update an existing comment on an issue

## CLI Usage

The same package also ships a command-line interface, so you can drive Jira and Confluence straight from a terminal, a shell script, or a Claude skill — without an MCP client. Every MCP tool above has a matching CLI command, grouped under `jira` and `confluence`.

The CLI shares the **single** `mcp-jira-confluence` entry point — there is **no separate executable**. Invoke it as `<entry> <group> <command>`, where `<group>` is `jira` or `confluence`. With no group, the same entry point starts the MCP server instead.

It reads the **same** environment variables as the server (`ATLASSIAN_*`, or service-specific `JIRA_*` / `CONFLUENCE_*`). Set them in your shell or a `.env` file.

**Run it with npx (no install needed):**

```bash
npx -y mcp-jira-confluence@latest --help
```

> Installed the package globally (`npm install -g mcp-jira-confluence@latest`)? Drop the `npx -y …@latest` prefix and call `mcp-jira-confluence <group> <command>` directly. The examples below use the npx form.

```bash
# List all command groups and commands
npx -y mcp-jira-confluence@latest --help

# Per-command help (shows required/optional arguments)
npx -y mcp-jira-confluence@latest jira create-issue --help

# --- Jira ---
npx -y mcp-jira-confluence@latest jira search --jql "status = 'In Progress'" --limit 10
npx -y mcp-jira-confluence@latest jira get-issue PROJ-123
npx -y mcp-jira-confluence@latest jira create-issue \
  --projectKey PROJ --issueType Story \
  --summary "New story" --description ./description.md \
  --priority High --labels "backend,urgent"
# Update plain fields as JSON, and/or the description from a Markdown file:
npx -y mcp-jira-confluence@latest jira update-issue PROJ-123 --fields '{"summary":"Updated title"}'
npx -y mcp-jira-confluence@latest jira update-issue PROJ-123 --descriptionFile ./description.md
npx -y mcp-jira-confluence@latest jira transition-issue PROJ-123 "In Progress"
npx -y mcp-jira-confluence@latest jira get-transitions PROJ-123
npx -y mcp-jira-confluence@latest jira add-comment PROJ-123 ./comment.md
npx -y mcp-jira-confluence@latest jira update-comment PROJ-123 100042 ./comment.md

# --- Confluence ---
npx -y mcp-jira-confluence@latest confluence search --cql "type=page AND title~'Roadmap'"
npx -y mcp-jira-confluence@latest confluence get-page 12345
npx -y mcp-jira-confluence@latest confluence create-page \
  --spaceKey ENG --title "Design Notes" --markdownContent ./notes.md
npx -y mcp-jira-confluence@latest confluence update-page 12345 "New Title" ./notes.md
npx -y mcp-jira-confluence@latest confluence add-comment 12345 ./comment.md
npx -y mcp-jira-confluence@latest confluence get-page-versions 12345 --limit 5
npx -y mcp-jira-confluence@latest confluence check-permissions
```

**Notes:**
- Arguments can be passed as named flags (`--summary "..."`) or as positionals in the order shown by `--help`.
- **Markdown rich-text content is supplied as a path to a Markdown file**, not as an inline string — this keeps multi-line content reliable across shells. This applies to: Confluence `create-page`/`update-page` bodies and `add-comment`; Jira `create-issue` description, `add-comment`/`update-comment`, and `update-issue --descriptionFile`. (**BREAKING**: inline Markdown for these arguments is no longer accepted.)
- `update-issue` takes a JSON `--fields` object for plain fields and/or a `--descriptionFile` for the description (the file wins if both set a description); at least one is required.
- Markdown is converted exactly as the MCP server does — to HTML for Confluence and to ADF for Jira. The file's raw Markdown is passed to the API layer, which performs the conversion.
- Add `--json` to any command to print the raw result as JSON for scripting; the default is a human-readable summary.
- Commands exit `0` on success and non-zero on any failure (missing argument, missing config, or API error).
- Like the MCP server, the CLI has **no delete operations**.

## AI Agent Skill

### Installation

Copy and paste this prompt to your LLM agent (Claude Code, AmpCode, Cursor, etc.):

```
Install and configure the Jira & Confluence CLI agent skill by following the instructions here:
https://raw.githubusercontent.com/thamaraiselvam/mcp-jira-confluence/main/docs/agent-skill-setup.md
```
## Configuration

### Optional Variables

```bash
# Custom port (default: 9339)
MCP_PORT=8080

# Service-specific credentials (overrides ATLASSIAN_*)
CONFLUENCE_URL=https://your-confluence.atlassian.net
CONFLUENCE_API_TOKEN=confluence-token

JIRA_URL=https://your-jira.atlassian.net
JIRA_API_TOKEN=jira-token

# Project/Space scoping
CONFLUENCE_SPACE_KEY=MYSPACE
JIRA_PROJECT_KEY=PROJ

# Corporate network
IGNORE_TLS_ERRORS=true

# Debug logging
VERBOSE=true
```

**Note:** When using the `command` configuration approach, set variables in the `env` object. When running manually with `npx`, use a `.env` file.

## Troubleshooting

### Manual Testing

Run the server manually to test your configuration:

```bash
npx mcp-jira-confluence
```

Check server health:
```bash
curl http://127.0.0.1:9339/health
```

### Common Issues

- **Connection refused**: Check VPN/proxy and URLs in your configuration
- **TLS errors**: Add `"IGNORE_TLS_ERRORS": "true"` to the `env` object
- **Authentication errors**: Verify your API token at [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens)

### Development

Clone and validate:
```bash
git clone https://github.com/thamaraiselvam/mcp-jira-confluence
cd mcp-jira-confluence
npm install
npm run build
npm run validate
```

## License

MIT
