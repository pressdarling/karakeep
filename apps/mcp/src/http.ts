#!/usr/bin/env node
import { createServer, IncomingMessage, ServerResponse } from "node:http";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { createMcpServer } from "./server";

const port = Number(process.env.PORT ?? process.env.KARAKEEP_MCP_PORT ?? 8787);
const mcpPath = process.env.KARAKEEP_MCP_PATH ?? "/mcp";
const mcpMethods = new Set(["POST", "GET", "DELETE"]);

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
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
) {
  res.writeHead(status, {
    ...corsHeaders(),
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
      writeJsonRpcError(res, 500, -32603, "Internal server error");
    }
  }
}

const httpServer = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end("Missing URL");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname === mcpPath && req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
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
    for (const [header, value] of Object.entries(corsHeaders())) {
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
});
