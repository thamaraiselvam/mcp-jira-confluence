# MCP Server for Jira & Confluence

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that enables AI assistants to **search, read, create, update, and manage** Confluence pages and Jira issues. Built with TypeScript and runs as a local HTTP server.

---

## Features

**Confluence**: Search (CQL), read pages, create/update pages (Markdown), comments, version history, permission checks, space scoping

**Jira**: Search (JQL), read/create/update issues (Markdown → ADF), workflow transitions, project scoping

**General**: HTTP-based (no stdio), stateless, TLS bypass option, shared Atlassian credentials

---

## Prerequisites

- Node.js >= 18.x
- Atlassian account with API token
- Network access to Atlassian instance

---

## Quick Start with npx

Run the server directly without installation:

```bash
npx mcp-jira-confluence
```

**With custom port:**

```bash
MCP_PORT=8080 npx mcp-jira-confluence
```

**With environment file:**

```bash
# Create .env file first with your credentials
npx mcp-jira-confluence
```

### Required Environment Variables

The server reads from `.env` file in the current directory:

```dotenv
# Common credentials (recommended - used by both services)
ATLASSIAN_URL=https://your-org.atlassian.net
ATLASSIAN_EMAIL=your.email@example.com
ATLASSIAN_API_TOKEN=your-api-token

# Optional: Service-specific overrides
# CONFLUENCE_URL=https://your-confluence.atlassian.net
# CONFLUENCE_EMAIL=confluence@example.com
# CONFLUENCE_API_TOKEN=confluence-specific-token
# JIRA_URL=https://your-jira.atlassian.net
# JIRA_EMAIL=jira@example.com
# JIRA_API_TOKEN=jira-specific-token

# Optional scoping
CONFLUENCE_SPACE_KEY=MYSPACE
JIRA_PROJECT_KEY=PROJ

# Optional TLS bypass (corporate VPN)
IGNORE_TLS_ERRORS=false

# Optional custom port (default: 3000)
MCP_PORT=3000
```

**Configuration Priority:**
- **Confluence**: `CONFLUENCE_*` → `ATLASSIAN_*`
- **Jira**: `JIRA_*` → `ATLASSIAN_*` → `CONFLUENCE_*` (legacy)

This allows you to:
1. Use common credentials for both services (simplest)
2. Override specific service credentials when needed
3. Keep backward compatibility with old `CONFLUENCE_*` only configs

**Get API Token:** [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens)

---

## Installation Options

### Option 1: npx (Recommended - No installation needed)

```bash
npx mcp-jira-confluence
```

### Option 2: Global Installation

```bash
npm install -g mcp-jira-confluence
mcp-jira-confluence
```

### Option 3: Local Development

```bash
git clone <repository-url>
cd mcp-jira-confluence
npm install
npm run build
npm start
```

**Verify server is running:**

```bash
curl http://127.0.0.1:3000/health
```

---

## MCP Client Configuration

**Connect URL:** `http://127.0.0.1:3000/mcp`

### Claude Desktop

Edit your config file:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

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

---

## Available Tools

### Confluence (7 tools)
- `search_confluence` - Search pages using CQL
- `get_confluence_page` - Read page content by ID
- `create_confluence_page` - Create new page with Markdown
- `update_confluence_page` - Update page with Markdown
- `add_confluence_comment` - Add comment to page
- `get_confluence_page_versions` - Get version history
- `check_confluence_permissions` - Validate API token

### Jira (6 tools)
- `jira_search` - Search issues using JQL
- `jira_get_issue` - Read issue details by key/ID
- `jira_create_issue` - Create issue with Markdown description
- `jira_update_issue` - Update issue fields
- `jira_transition_issue` - Move issue through workflow
- `jira_get_transitions` - List available transitions

**Full API documentation**: See tool schemas via `POST /mcp` with `tools/list` method

---

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

```
src/
├── index.ts          # HTTP server entry point
├── config.ts         # Environment variable loading
├── client.ts         # Axios client factory (TLS, auth)
├── markdown.ts       # Markdown → HTML conversion
├── jira-markdown.ts  # Markdown → ADF conversion
├── confluence.ts     # Confluence API operations
├── jira.ts          # Jira API operations
└── tools.ts         # MCP tool handlers

tests/
├── unit/            # Unit tests (mocked APIs)
└── integration/     # Integration tests (InMemoryTransport)
```

---

## Troubleshooting

### Connection Issues

| Issue | Fix |
|---|---|
| `ECONNREFUSED` | Check VPN, verify URLs in `.env` |
| TLS certificate errors | Set `IGNORE_TLS_ERRORS=true` |
| `401 Unauthorized` | Regenerate API token |
| `403 Forbidden` | Check space/project permissions |

### Common Errors

| Error | Solution |
|---|---|
| Port 3000 in use | Set `MCP_PORT=8080` |
| Space guard rejection | Check `CONFLUENCE_SPACE_KEY` matches target |
| Project guard rejection | Check `JIRA_PROJECT_KEY` matches target |
| Transition not found | Use `jira_get_transitions` first |

**Debug Commands:**
```bash
# Check server health
curl http://127.0.0.1:3000/health

# List all tools
curl -X POST http://127.0.0.1:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# Validate permissions
npm run validate -- [pageId] [issueKey]
```

---

## Security

- Server binds to `127.0.0.1` (localhost only)
- No MCP-level authentication required
- Credentials never exposed via MCP endpoints
- Use space/project guards to prevent out-of-scope writes
- Rotate API tokens periodically
- `IGNORE_TLS_ERRORS` should only be used in trusted networks

---

## License

MIT License - Free to fork, use, and modify without restrictions.

See [LICENSE](LICENSE) file for details.
