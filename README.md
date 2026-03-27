# Jira & Confluence MCP Server

[![Tests](https://github.com/thamaraiselvam/mcp-jira-confluence/workflows/Tests/badge.svg)](https://github.com/thamaraiselvam/mcp-jira-confluence/actions/workflows/test.yml)
[![npm version](https://img.shields.io/npm/v/mcp-jira-confluence.svg?style=flat&color=blue)](https://www.npmjs.com/package/mcp-jira-confluence)
[![npm downloads](https://img.shields.io/npm/dm/mcp-jira-confluence.svg?style=flat&color=green)](https://www.npmjs.com/package/mcp-jira-confluence)
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
