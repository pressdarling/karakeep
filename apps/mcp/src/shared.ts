import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import TurndownService from "turndown";

import { createKarakeepClient } from "@karakeep/sdk";

const addr = process.env.KARAKEEP_API_ADDR;
const apiKey = process.env.KARAKEEP_API_KEY;

export type KarakeepClient = ReturnType<typeof createKarakeepClient>;

export interface KarakeepMcpContext {
  mcpServer: McpServer;
  karakeepClient: KarakeepClient;
  turndownService: TurndownService;
  webBaseUrl?: string;
}

const getCustomHeaders = () => {
  try {
    return process.env.KARAKEEP_CUSTOM_HEADERS
      ? JSON.parse(process.env.KARAKEEP_CUSTOM_HEADERS)
      : {};
  } catch (e) {
    console.error("Failed to parse KARAKEEP_CUSTOM_HEADERS", e);
    return {};
  }
};

const getWebBaseUrl = () => addr?.replace(/\/+$/, "");

export const createKarakeepMcpContext = (): KarakeepMcpContext => {
  const webBaseUrl = getWebBaseUrl();
  const karakeepClient = createKarakeepClient({
    baseUrl: `${webBaseUrl}/api/v1`,
    headers: {
      ...getCustomHeaders(),
      "Content-Type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
  });

  return {
    mcpServer: new McpServer({
      name: "Karakeep",
      version: "0.31.0",
    }),
    karakeepClient,
    turndownService: new TurndownService(),
    webBaseUrl,
  };
};
