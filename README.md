# Jira and Confluence MCP Server (TypeScript, HTTP)

A production-ready **Model Context Protocol (MCP) server for Jira and Confluence** that lets AI assistants search, read, create, and update Atlassian content over HTTP.

If you're looking for an **Atlassian MCP server**, **Jira MCP integration**, or **Confluence MCP tools** for Claude Desktop, VS Code, Copilot, or Zed, this project is built for that workflow.

## Why this Jira + Confluence MCP Server

- Connect AI agents to **Jira issues** and **Confluence pages** with one server
- Use **JQL** and **CQL** search directly from MCP tools
- Create and update content using **Markdown** inputs
- Run as a simple **local HTTP MCP endpoint** (`/mcp`)
- Support shared or service-specific Atlassian credentials

## Features

### Confluence tools
- Search pages (`search_confluence`) with CQL
- Read page content (`get_confluence_page`)
- Create pages from Markdown (`create_confluence_page`)
- Update pages from Markdown (`update_confluence_page`)
- Add comments (`add_confluence_comment`)
- Read version history (`get_confluence_page_versions`)
- Check permissions (`check_confluence_permissions`)

### Jira tools
- Search issues (`jira_search`) with JQL
- Read issue details (`jira_get_issue`)
- Create issues from Markdown (`jira_create_issue`)
- Update issue fields (`jira_update_issue`)
- Transition workflow status (`jira_transition_issue`)
- List available transitions (`jira_get_transitions`)

### Platform capabilities
- HTTP transport for MCP clients (no stdio)
- Stateless server design
- Optional TLS bypass for restricted corporate networks
- Credential fallback strategy for Jira and Confluence

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [MCP Client Configuration](#mcp-client-configuration)
- [Available Tools](#available-tools)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [SEO Keywords](#seo-keywords)

## Prerequisites

- Node.js >= 18.x
- Atlassian account with API token
- Network access to your Atlassian Cloud or internal Atlassian instance

## Quick Start

1. **Clone the repository:**

```bash
git clone <repository-url>
cd mcp-jira-confluence
```

2. **Install dependencies:**

```bash
npm install
```

3. **Create a local `.env` file:**

```bash
cp .env.example .env
# Edit .env with your Atlassian credentials
```

4. **Build and run:**

```bash
npm run build
npm start
```

**Custom port:**

```bash
MCP_PORT=8080 npm start
```

**Verbose debug mode:**

```bash
VERBOSE=true npm start
```

**Health check:**

```bash
curl http://127.0.0.1:3000/health
```

## Environment Variables

The server reads `.env` from the current working directory.

```dotenv
# Common credentials (recommended)
ATLASSIAN_URL=https://your-org.atlassian.net
ATLASSIAN_EMAIL=your.email@example.com
ATLASSIAN_API_TOKEN=your-api-token

# Optional: service-specific overrides
# CONFLUENCE_URL=https://your-confluence.atlassian.net
# CONFLUENCE_EMAIL=confluence@example.com
# CONFLUENCE_API_TOKEN=confluence-specific-token
# JIRA_URL=https://your-jira.atlassian.net
# JIRA_EMAIL=jira@example.com
# JIRA_API_TOKEN=jira-specific-token

# Optional scoping
CONFLUENCE_SPACE_KEY=MYSPACE
JIRA_PROJECT_KEY=PROJ

# Optional TLS bypass (corporate VPN/proxy)
IGNORE_TLS_ERRORS=false

# Optional custom port (default: 3000)
MCP_PORT=3000

# Optional verbose mode
VERBOSE=false
```

**Configuration priority:**
- **Confluence**: `CONFLUENCE_*` → `ATLASSIAN_*`
- **Jira**: `JIRA_*` → `ATLASSIAN_*` → `CONFLUENCE_*` (legacy)

Get your token from [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens).

## MCP Client Configuration

**Connect URL:** `http://127.0.0.1:3000/mcp`

### Claude Desktop

```json
{
  "mcpServers": {
    "jira-confluence": {
      "type": "http",
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

### VS Code / GitHub Copilot

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "jira-confluence": {
      "type": "http",
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

### Zed

Add to `~/.config/zed/settings.json`:

```json
{
  "context_servers": {
    "jira-confluence": {
      "type": "http",
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

## Available Tools

### Confluence (7 tools)
- `search_confluence`
- `get_confluence_page`
- `create_confluence_page`
- `update_confluence_page`
- `add_confluence_comment`
- `get_confluence_page_versions`
- `check_confluence_permissions`

### Jira (6 tools)
- `jira_search`
- `jira_get_issue`
- `jira_create_issue`
- `jira_update_issue`
- `jira_transition_issue`
- `jira_get_transitions`

For tool schemas, call `POST /mcp` with method `tools/list`.

## Development

```bash
# Run in dev mode (build + watch)
npm run dev

# Run tests
npm test

# Generate coverage
npm run test:coverage

# Validate permissions
npm run validate
```

### Project Structure

```text
src/
├── index.ts          # HTTP server entry point
├── config.ts         # Environment variable loading
├── client.ts         # Axios client factory (TLS, auth)
├── markdown.ts       # Markdown → HTML conversion
├── jira-markdown.ts  # Markdown → ADF conversion
├── confluence.ts     # Confluence API operations
├── jira.ts           # Jira API operations
└── tools.ts          # MCP tool handlers

tests/
├── unit/             # Unit tests (mocked APIs)
└── integration/      # Integration tests (InMemoryTransport)
```

## Troubleshooting

### Validate access and configuration

```bash
npm run validate
```

### Common connection issues

| Issue | Fix |
|---|---|
| `ECONNREFUSED` | Check VPN/proxy and verify URLs in `.env` |
| TLS certificate errors | Set `IGNORE_TLS_ERRORS=true` |

## SEO Keywords

This repository targets queries such as:

- Jira MCP server
- Confluence MCP server
- Atlassian MCP integration
- Model Context Protocol Jira
- Model Context Protocol Confluence
- Claude Desktop Jira integration
- VS Code MCP Jira Confluence
