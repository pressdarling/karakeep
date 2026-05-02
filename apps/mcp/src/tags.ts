import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { z } from "zod";

import { KarakeepMcpContext } from "./shared";
import { toMcpToolError } from "./utils";

export function registerTagTools({
  karakeepClient,
  mcpServer,
}: KarakeepMcpContext) {
  mcpServer.registerTool(
    "attach-tag-to-bookmark",
    {
      title: "Attach tag to bookmark",
      description:
        "Use this when the user asks to attach one or more tags to a Karakeep bookmark.",
      inputSchema: {
        bookmarkId: z.string().describe(`The bookmarkId to attach the tag to.`),
        tagsToAttach: z.array(z.string()).describe(`The tag names to attach.`),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ bookmarkId, tagsToAttach }): Promise<CallToolResult> => {
      const res = await karakeepClient.POST(`/bookmarks/{bookmarkId}/tags`, {
        params: {
          path: {
            bookmarkId,
          },
        },
        body: {
          tags: tagsToAttach.map((tag: string) => ({ tagName: tag })),
        },
      });
      if (res.error) {
        return toMcpToolError(res.error);
      }
      return {
        content: [
          {
            type: "text",
            text: `Tags ${JSON.stringify(tagsToAttach)} attached to bookmark ${bookmarkId}`,
          },
        ],
      };
    },
  );

  mcpServer.registerTool(
    "detach-tag-from-bookmark",
    {
      title: "Detach tag from bookmark",
      description:
        "Use this when the user asks to detach one or more tags from a Karakeep bookmark.",
      inputSchema: {
        bookmarkId: z
          .string()
          .describe(`The bookmarkId to detach the tag from.`),
        tagsToDetach: z.array(z.string()).describe(`The tag names to detach.`),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ bookmarkId, tagsToDetach }): Promise<CallToolResult> => {
      const res = await karakeepClient.DELETE(`/bookmarks/{bookmarkId}/tags`, {
        params: {
          path: {
            bookmarkId,
          },
        },
        body: {
          tags: tagsToDetach.map((tag) => ({ tagName: tag })),
        },
      });
      if (res.error) {
        return toMcpToolError(res.error);
      }
      return {
        content: [
          {
            type: "text",
            text: `Tags ${JSON.stringify(tagsToDetach)} detached from bookmark ${bookmarkId}`,
          },
        ],
      };
    },
  );
}
