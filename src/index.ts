#!/usr/bin/env node
import http from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig, loadJiraConfig } from "./config.js";
import { createConfluenceClient, createJiraClient } from "./client.js";
import { registerTools } from "./tools.js";

// ---------------------------------------------------------------------------
// Verbose Mode — controlled via VERBOSE env var
// ---------------------------------------------------------------------------
const VERBOSE = process.env.VERBOSE === "true" || process.env.VERBOSE === "1";

function log(...args: unknown[]): void {
  if (VERBOSE) {
    console.log("[VERBOSE]", new Date().toISOString(), ...args);
  }
}

function logError(...args: unknown[]): void {
  console.error("[ERROR]", new Date().toISOString(), ...args);
}

function printConfigSetupError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);

  console.error("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.error("  Configuration Error");
  console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.error(`  ${message}`);
  console.error("\n  Set the required environment variables in your shell or .env file:");
  console.error("  ATLASSIAN_URL=https://your-domain.atlassian.net");
  console.error("  ATLASSIAN_EMAIL=you@example.com");
  console.error("  ATLASSIAN_API_TOKEN=your-api-token");
  console.error("\n  Optional service-specific overrides:");
  console.error("  CONFLUENCE_URL / CONFLUENCE_EMAIL / CONFLUENCE_API_TOKEN");
  console.error("  JIRA_URL / JIRA_EMAIL / JIRA_API_TOKEN");
  console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

// ---------------------------------------------------------------------------
// Bootstrap — load config and create the Axios client once at startup.
// The MCP Server + Transport are created fresh per-request (stateless mode).
// ---------------------------------------------------------------------------
const bootstrap = (() => {
  try {
    log("Loading configuration...");
    const config = loadConfig();
    log("Confluence config:", {
      baseUrl: config.baseUrl,
      email: config.email,
      spaceKey: config.spaceKey,
      ignoreTlsErrors: config.ignoreTlsErrors,
    });

    const axiosClient = createConfluenceClient(config);
    log("Confluence client created");

    const jiraConfig = loadJiraConfig();
    log("Jira config:", {
      baseUrl: jiraConfig.baseUrl,
      email: jiraConfig.email,
      projectKey: jiraConfig.projectKey,
      ignoreTlsErrors: jiraConfig.ignoreTlsErrors,
    });

    const jiraClient = createJiraClient(jiraConfig);
    log("Jira client created");

    return { config, jiraConfig, axiosClient, jiraClient };
  } catch (error) {
    printConfigSetupError(error);
    process.exit(1);
  }
})();

const { config, jiraConfig, axiosClient, jiraClient } = bootstrap;

const PORT = parseInt(process.env.MCP_PORT ?? "9339", 10);
const HOST = "127.0.0.1"; // localhost only — no external access

// Track active connections for proper cleanup
const activeConnections = new Set<http.ServerResponse>();

// ---------------------------------------------------------------------------
// Factory — builds a fresh MCP Server with all tools registered.
// Called once per incoming HTTP request so each request is fully isolated.
// ---------------------------------------------------------------------------
function createMcpServer(): Server {
  const server = new Server(
    {
      name: "mcp-jira-confluence",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  registerTools(server, axiosClient, config, jiraClient, jiraConfig);
  return server;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read the full request body as a UTF-8 string. Returns "" for bodyless requests. */
async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/** Send a plain JSON response. */
function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

// ---------------------------------------------------------------------------
// HTTP Server
// ---------------------------------------------------------------------------
const httpServer = http.createServer(async (req, res) => {
  const url = req.url ?? "";
  const method = req.method ?? "GET";
  
  log(`${method} ${url}`);
  
  // Track this connection
  activeConnections.add(res);
  res.on("close", () => {
    activeConnections.delete(res);
    log(`Connection closed for ${method} ${url}`);
  });

  // ------------------------------------------------------------------
  // Health / discovery endpoint
  // ------------------------------------------------------------------
  if (url === "/" || url === "/health") {
    log("Health check request");
    sendJson(res, 200, {
      status: "ok",
      server: "mcp-jira-confluence",
      version: "1.0.0",
      mcp: `http://${HOST}:${PORT}/mcp`,
      verbose: VERBOSE,
    });
    return;
  }

  // ------------------------------------------------------------------
  // MCP endpoint — handles POST (JSON-RPC), GET (SSE), DELETE (session)
  // ------------------------------------------------------------------
  if (url === "/mcp" || url.startsWith("/mcp?")) {
    let parsedBody: unknown;

    // Only POST requests carry a JSON-RPC body
    if (req.method === "POST") {
      try {
        const raw = await readBody(req);
        parsedBody = raw.length > 0 ? JSON.parse(raw) : undefined;
      } catch {
        sendJson(res, 400, { error: "Invalid JSON in request body" });
        return;
      }
    }

    // Create a stateless transport + fresh server for this request
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless — no session tracking
    });

    const mcpServer = createMcpServer();

    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, parsedBody);

      // Clean up after the response is fully sent
      res.on("finish", () => {
        mcpServer.close().catch(() => {
          // ignore close errors during cleanup
        });
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("MCP request error:", message);

      if (!res.headersSent) {
        sendJson(res, 500, { error: "Internal server error", detail: message });
      }
    }

    return;
  }

  // ------------------------------------------------------------------
  // Everything else → 404
  // ------------------------------------------------------------------
  sendJson(res, 404, { error: "Not found" });
});

// ---------------------------------------------------------------------------
// Start listening
// ---------------------------------------------------------------------------
httpServer.listen(PORT, HOST, () => {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  MCP Server for Jira & Confluence");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  MCP endpoint : http://${HOST}:${PORT}/mcp`);
  console.log(`  Health check : http://${HOST}:${PORT}/health`);
  console.log(`  Space scope  : ${config.spaceKey ?? "(all spaces)"}`);
  console.log(`  Jira project : ${jiraConfig.projectKey ?? "(all projects)"}`);
  if (VERBOSE) {
    console.log(`  Verbose mode : ENABLED`);
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Ready. Connect your AI client to the MCP endpoint.");
  console.log("  Tools        : Confluence (7) + Jira (6)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log("Server started successfully");
});

httpServer.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    logError(`Port ${PORT} is already in use. Set MCP_PORT=<other> to use a different port.`);
    console.error(`Port ${PORT} is already in use. Set MCP_PORT=<other> to use a different port.`);
  } else {
    logError("HTTP server error:", err.message);
    console.error("HTTP server error:", err.message);
  }
  process.exit(1);
});

// Graceful shutdown with timeout
function shutdown() {
  log("Shutdown signal received");
  console.log("\nShutting down...");
  
  // Close all active connections immediately
  log(`Closing ${activeConnections.size} active connections...`);
  for (const conn of activeConnections) {
    if (!conn.destroyed) {
      conn.destroy();
    }
  }
  activeConnections.clear();
  
  // Force exit after 1 second if server hasn't closed
  const forceExitTimer = setTimeout(() => {
    log("Force closing server after timeout");
    console.log("Force closing server...");
    process.exit(0);
  }, 1000);
  
  // Try graceful shutdown
  httpServer.close(() => {
    clearTimeout(forceExitTimer);
    log("Server closed gracefully");
    console.log("Server closed gracefully.");
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);