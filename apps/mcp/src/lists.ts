import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { z } from "zod";

import { KarakeepMcpContext } from "./shared";
import { toMcpToolError } from "./utils";

export function registerListTools({
  karakeepClient,
  mcpServer,
}: KarakeepMcpContext) {
  mcpServer.registerTool(
    "get-lists",
    {
      title: "Get lists",
      description: "Use this when the user asks to list Karakeep lists.",
      annotations: {
        readOnlyHint: true,
      },
    },
    async (): Promise<CallToolResult> => {
      const res = await karakeepClient.GET("/lists", {
        params: {},
      });
      if (!res.data) {
        return toMcpToolError(res.error);
      }
      return {
        content: [
          {
            type: "text",
            text: res.data.lists
              .map(
                (list) => `List ID: ${list.id}
Name: ${list.name}
Icon: ${list.icon}
Description: ${list.description ?? ""}
Parent ID: ${list.parentId}`,
              )
              .join("\n\n"),
          },
        ],
        structuredContent: {
          lists: res.data.lists,
        },
      };
    },
  );

  mcpServer.registerTool(
    "add-bookmark-to-list",
    {
      title: "Add bookmark to list",
      description:
        "Use this when the user asks to add one Karakeep bookmark to one list.",
      inputSchema: {
        listId: z.string().describe(`The listId to add the bookmark to.`),
        bookmarkId: z.string().describe(`The bookmarkId to add.`),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ listId, bookmarkId }): Promise<CallToolResult> => {
      const res = await karakeepClient.PUT(
        `/lists/{listId}/bookmarks/{bookmarkId}`,
        {
          params: {
            path: {
              listId,
              bookmarkId,
            },
          },
        },
      );
      if (res.error) {
        return toMcpToolError(res.error);
      }
      return {
        content: [
          {
            type: "text",
            text: `Bookmark ${bookmarkId} added to list ${listId}`,
          },
        ],
      };
    },
  );

  mcpServer.registerTool(
    "remove-bookmark-from-list",
    {
      title: "Remove bookmark from list",
      description:
        "Use this when the user asks to remove one Karakeep bookmark from one list.",
      inputSchema: {
        listId: z.string().describe(`The listId to remove the bookmark from.`),
        bookmarkId: z.string().describe(`The bookmarkId to remove.`),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ listId, bookmarkId }): Promise<CallToolResult> => {
      const res = await karakeepClient.DELETE(
        `/lists/{listId}/bookmarks/{bookmarkId}`,
        {
          params: {
            path: {
              listId,
              bookmarkId,
            },
          },
        },
      );
      if (res.error) {
        return toMcpToolError(res.error);
      }
      return {
        content: [
          {
            type: "text",
            text: `Bookmark ${bookmarkId} removed from list ${listId}`,
          },
        ],
      };
    },
  );

  mcpServer.registerTool(
    "create-list",
    {
      title: "Create list",
      description: "Use this when the user asks to create a Karakeep list.",
      inputSchema: {
        name: z.string().describe(`The name of the list.`),
        icon: z.string().describe(`The emoji icon of the list.`),
        parentId: z
          .string()
          .optional()
          .describe(`The parent list id of this list.`),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ name, icon, parentId }): Promise<CallToolResult> => {
      const res = await karakeepClient.POST("/lists", {
        body: {
          name,
          icon,
          parentId,
        },
      });
      if (!res.data) {
        return toMcpToolError(res.error);
      }
      return {
        content: [
          {
            type: "text",
            text: `List ${name} created with id ${res.data.id}`,
          },
        ],
        structuredContent: {
          list: res.data,
        },
      };
    },
  );
}
