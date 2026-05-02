#!/usr/bin/env node
import { createServer, IncomingMessage, ServerResponse } from "node:http";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { createMcpServer } from "./server";

const port = Number(process.env.PORT ?? process.env.KARAKEEP_MCP_PORT ?? 8787);
const mcpPath = process.env.KARAKEEP_MCP_PATH ?? "/mcp";
const mcpMethods = new Set(["POST", "GET", "DELETE"]);

/**
 * Resolves the Access-Control-Allow-Origin value for a given request origin.
 *
 * When `allowedOriginsEnv` is set to a comma-separated list of allowed origins,
 * only requests from those origins receive a permissive CORS response.
 * If the value is unset (or empty), all origins are allowed ("*") for
 * backward-compatible behaviour in development/local setups.
 *
 * @param requestOrigin - The value of the incoming `Origin` request header.
 * @param allowedOriginsEnv - The value of the `KARAKEEP_MCP_ALLOWED_ORIGINS`
 *   environment variable (comma-separated list of allowed origin strings).
 */
export function resolveAllowOrigin(
  requestOrigin: string | undefined,
  allowedOriginsEnv: string | undefined,
): string {
  if (!allowedOriginsEnv || allowedOriginsEnv.trim() === "") {
    return "*";
  }
  const allowed = allowedOriginsEnv
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  // If the env var was set but contained only whitespace/empty entries, fail
  // closed (no origin allowed) rather than falling back to "*".
  if (allowed.length === 0) {
    return "";
  }
  if (requestOrigin && allowed.includes(requestOrigin)) {
    return requestOrigin;
  }
  // Return the first allowed origin so clients receive a deterministic value
  // even when their origin is not in the list (the browser will still block
  // the request, but we never echo arbitrary origins back).
  return allowed[0];
}

function corsHeaders(requestOrigin?: string) {
  return {
    "Access-Control-Allow-Origin": resolveAllowOrigin(
      requestOrigin,
      process.env.KARAKEEP_MCP_ALLOWED_ORIGINS,
    ),
    "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, content-type, mcp-session-id",
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
  };
}

function writeJsonRpcError(
  res: ServerResponse,
  status: number,
  code: number,
  message: string,
  requestOrigin?: string,
) {
  res.writeHead(status, {
    ...corsHeaders(requestOrigin),
    "content-type": "application/json",
  });
  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code, message },
      id: null,
    }),
  );
}

async function handleMcpRequest(req: IncomingMessage, res: ServerResponse) {
  const requestOrigin = Array.isArray(req.headers.origin)
    ? req.headers.origin[0]
    : req.headers.origin;
  const mcpServer = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on("close", () => {
    void transport.close();
    void mcpServer.close();
  });

  try {
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      writeJsonRpcError(res, 500, -32603, "Internal server error", requestOrigin);
    }
  }
}

const httpServer = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end("Missing URL");
    return;
  }

  const requestOrigin = Array.isArray(req.headers.origin)
    ? req.headers.origin[0]
    : req.headers.origin;
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname === mcpPath && req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(requestOrigin));
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    res
      .writeHead(200, { "content-type": "text/plain" })
      .end(`Karakeep MCP server listening on ${mcpPath}`);
    return;
  }

  if (url.pathname === mcpPath && req.method && mcpMethods.has(req.method)) {
    for (const [header, value] of Object.entries(corsHeaders(requestOrigin))) {
      res.setHeader(header, value);
    }
    await handleMcpRequest(req, res);
    return;
  }

  res.writeHead(404).end("Not Found");
});

httpServer.listen(port, () => {
  console.log(
    `Karakeep MCP server listening on http://localhost:${port}${mcpPath}`,
  );
  if (!process.env.KARAKEEP_MCP_ALLOWED_ORIGINS) {
    console.warn(
      "[karakeep-mcp] CORS is unrestricted (Access-Control-Allow-Origin: *). " +
        "Set KARAKEEP_MCP_ALLOWED_ORIGINS to restrict cross-origin access in production.",
    );
  }
});
