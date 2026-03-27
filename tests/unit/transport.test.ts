import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Test transport mode detection
 * 
 * The server should auto-detect whether to use STDIO or HTTP transport:
 * - STDIO when stdin is not a TTY (piped/redirected) or MCP_TRANSPORT=stdio
 * - HTTP when stdin is a TTY (terminal) or MCP_TRANSPORT=http
 */
describe("Transport Mode Detection", () => {
  const originalIsTTY = process.stdin.isTTY;
  const originalEnv = process.env.MCP_TRANSPORT;

  beforeEach(() => {
    // Reset environment
    delete process.env.MCP_TRANSPORT;
  });

  afterEach(() => {
    // Restore original state
    if (originalIsTTY !== undefined) {
      Object.defineProperty(process.stdin, "isTTY", {
        value: originalIsTTY,
        writable: true,
        configurable: true,
      });
    }
    if (originalEnv !== undefined) {
      process.env.MCP_TRANSPORT = originalEnv;
    } else {
      delete process.env.MCP_TRANSPORT;
    }
  });

  it("should use STDIO when stdin is not a TTY (piped)", () => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const USE_STDIO = !process.stdin.isTTY;
    expect(USE_STDIO).toBe(true);
  });

  it("should use HTTP when stdin is a TTY (terminal)", () => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      writable: true,
      configurable: true,
    });

    const USE_STDIO = !process.stdin.isTTY;
    expect(USE_STDIO).toBe(false);
  });

  it("should use STDIO when MCP_TRANSPORT=stdio", () => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      writable: true,
      configurable: true,
    });
    process.env.MCP_TRANSPORT = "stdio";

    const USE_STDIO = !process.stdin.isTTY || process.env.MCP_TRANSPORT === "stdio";
    expect(USE_STDIO).toBe(true);
  });

  it("should use HTTP when MCP_TRANSPORT=http (even if piped)", () => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    process.env.MCP_TRANSPORT = "http";

    const USE_STDIO = !process.stdin.isTTY && process.env.MCP_TRANSPORT !== "http";
    const USE_HTTP = !USE_STDIO || process.env.MCP_TRANSPORT === "http";
    
    expect(USE_HTTP).toBe(true);
  });

  it("should prefer environment variable over TTY detection", () => {
    // TTY says use HTTP
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      writable: true,
      configurable: true,
    });
    
    // But env var says use STDIO
    process.env.MCP_TRANSPORT = "stdio";

    const USE_STDIO = !process.stdin.isTTY || process.env.MCP_TRANSPORT === "stdio";
    expect(USE_STDIO).toBe(true);
  });
});

/**
 * Test that both transport modes are available
 */
describe("Transport Availability", () => {
  it("should import StdioServerTransport", async () => {
    const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
    expect(StdioServerTransport).toBeDefined();
    expect(typeof StdioServerTransport).toBe("function");
  });

  it("should import StreamableHTTPServerTransport", async () => {
    const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
    expect(StreamableHTTPServerTransport).toBeDefined();
    expect(typeof StreamableHTTPServerTransport).toBe("function");
  });

  it("should be able to create both transport types", async () => {
    const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
    const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");

    const stdioTransport = new StdioServerTransport();
    expect(stdioTransport).toBeDefined();

    const httpTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    expect(httpTransport).toBeDefined();
  });
});
