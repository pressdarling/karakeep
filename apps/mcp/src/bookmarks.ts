import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import TurndownService from "turndown";
import { z } from "zod";

import { KarakeepAPISchemas } from "@karakeep/sdk";

import { KarakeepMcpContext } from "./shared";
import {
  bookmarkCitationUrl,
  bookmarkTitle,
  compactBookmark,
  toBookmarkSummary,
  toMcpToolError,
} from "./utils";

type Bookmark = KarakeepAPISchemas["Bookmark"];

interface SearchBookmarksInput {
  query: string;
  limit?: number;
  nextCursor?: string;
}

const searchBookmarksInputSchema = {
  query: z.string().describe(`
    By default, this will do a full-text search, but you can also use qualifiers to filter the results.
You can search bookmarks using specific qualifiers. is:fav finds favorited bookmarks,
is:archived searches archived bookmarks, is:tagged finds those with tags,
is:inlist finds those in lists, and is:link, is:text, and is:media filter by bookmark type.
url:<value> searches for URL substrings, #<tag> searches for bookmarks with a specific tag,
list:<name> searches for bookmarks in a specific list given its name (without the icon),
after:<date> finds bookmarks created on or after a date (YYYY-MM-DD), and before:<date> finds bookmarks created on or before a date (YYYY-MM-DD).
If you need to pass names with spaces, you can quote them with double quotes. If you want to negate a qualifier, prefix it with a minus sign.
## Examples:

### Find favourited bookmarks from 2023 that are tagged "important"
is:fav after:2023-01-01 before:2023-12-31 #important

### Find archived bookmarks that are either in "reading" list or tagged "work"
is:archived and (list:reading or #work)

### Combine text search with qualifiers
machine learning is:fav`),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe(`The number of results to return in a single query.`),
  nextCursor: z
    .string()
    .optional()
    .describe(
      `The next cursor to use for pagination. The value for this is returned from a previous call to this tool.`,
    ),
};

export async function searchKarakeepBookmarks(
  { karakeepClient }: KarakeepMcpContext,
  { query, limit = 10, nextCursor }: SearchBookmarksInput,
) {
  return karakeepClient.GET("/bookmarks/search", {
    params: {
      query: {
        q: query,
        limit,
        includeContent: false,
        cursor: nextCursor,
      },
    },
  });
}

export function extractBookmarkContent(
  bookmark: Bookmark,
  turndownService: TurndownService,
): string {
  if (bookmark.content.type === "link") {
    return turndownService.turndown(bookmark.content.htmlContent ?? "");
  }
  if (bookmark.content.type === "text") {
    return bookmark.content.text;
  }
  if (bookmark.content.type === "asset") {
    return bookmark.content.content ?? "";
  }
  return "";
}

export function registerBookmarkTools(context: KarakeepMcpContext) {
  const { karakeepClient, mcpServer, turndownService, webBaseUrl } = context;

  mcpServer.registerTool(
    "search",
    {
      title: "Search Karakeep bookmarks",
      description:
        "Use this when ChatGPT needs to search the user's Karakeep bookmarks as a read-only knowledge source.",
      inputSchema: {
        query: z.string().describe("The search query to run against Karakeep."),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ query }): Promise<CallToolResult> => {
      const res = await searchKarakeepBookmarks(context, { query, limit: 10 });
      if (!res.data) {
        return toMcpToolError(res.error);
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              results: res.data.bookmarks.map((bookmark) => ({
                id: bookmark.id,
                title: bookmarkTitle(bookmark),
                url: bookmarkCitationUrl(bookmark, webBaseUrl),
              })),
            }),
          },
        ],
      };
    },
  );

  mcpServer.registerTool(
    "fetch",
    {
      title: "Fetch a Karakeep bookmark",
      description:
        "Use this when ChatGPT needs the full text and metadata for one Karakeep bookmark returned by search.",
      inputSchema: {
        id: z.string().describe("The Karakeep bookmark id to fetch."),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ id }): Promise<CallToolResult> => {
      const res = await karakeepClient.GET(`/bookmarks/{bookmarkId}`, {
        params: {
          path: {
            bookmarkId: id,
          },
          query: {
            includeContent: true,
          },
        },
      });
      if (!res.data) {
        return toMcpToolError(res.error);
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              id: res.data.id,
              title: bookmarkTitle(res.data),
              text: extractBookmarkContent(res.data, turndownService),
              url: bookmarkCitationUrl(res.data, webBaseUrl),
              metadata: {
                createdAt: res.data.createdAt,
                summary: res.data.summary ?? "",
                note: res.data.note ?? "",
                tags: res.data.tags.map((tag) => tag.name),
                type: res.data.content.type,
              },
            }),
          },
        ],
      };
    },
  );

  mcpServer.registerTool(
    "search-bookmarks",
    {
      title: "Search bookmarks",
      description:
        "Use this when the user asks to search Karakeep bookmarks with Karakeep's full query syntax.",
      inputSchema: searchBookmarksInputSchema,
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ query, limit, nextCursor }): Promise<CallToolResult> => {
      const res = await searchKarakeepBookmarks(context, {
        query,
        limit,
        nextCursor,
      });
      if (!res.data) {
        return toMcpToolError(res.error);
      }
      return {
        content: [
          {
            type: "text",
            text: `
${res.data.bookmarks.map(compactBookmark).join("\n\n")}

Next cursor: ${res.data.nextCursor ? `'${res.data.nextCursor}'` : "no more pages"}
`,
          },
        ],
        structuredContent: {
          bookmarks: res.data.bookmarks.map((bookmark) =>
            toBookmarkSummary(bookmark, webBaseUrl),
          ),
          nextCursor: res.data.nextCursor ?? null,
        },
      };
    },
  );

  mcpServer.registerTool(
    "get-bookmark",
    {
      title: "Get bookmark",
      description:
        "Use this when the user asks for one Karakeep bookmark by id.",
      inputSchema: {
        bookmarkId: z.string().describe(`The bookmarkId to get.`),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ bookmarkId }): Promise<CallToolResult> => {
      const res = await karakeepClient.GET(`/bookmarks/{bookmarkId}`, {
        params: {
          path: {
            bookmarkId,
          },
          query: {
            includeContent: false,
          },
        },
      });
      if (!res.data) {
        return toMcpToolError(res.error);
      }
      return {
        content: [
          {
            type: "text",
            text: compactBookmark(res.data),
          },
        ],
        structuredContent: {
          bookmark: toBookmarkSummary(res.data, webBaseUrl),
        },
      };
    },
  );

  mcpServer.registerTool(
    "create-bookmark",
    {
      title: "Create bookmark",
      description:
        "Use this when the user asks to create a link or text bookmark.",
      inputSchema: {
        type: z
          .enum(["link", "text"])
          .describe(`The type of bookmark to create.`),
        title: z.string().optional().describe(`The title of the bookmark`),
        content: z
          .string()
          .describe(
            "If type is text, the text to be bookmarked. If the type is link, then it's the URL to be bookmarked.",
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ title, type, content }): Promise<CallToolResult> => {
      const res = await karakeepClient.POST(`/bookmarks`, {
        body:
          type === "link"
            ? {
                type: "link",
                title,
                url: content,
              }
            : {
                type: "text",
                title,
                text: content,
              },
      });
      if (!res.data) {
        return toMcpToolError(res.error);
      }
      return {
        content: [
          {
            type: "text",
            text: compactBookmark(res.data),
          },
        ],
        structuredContent: {
          bookmark: toBookmarkSummary(res.data, webBaseUrl),
        },
      };
    },
  );

  mcpServer.registerTool(
    "update-bookmark",
    {
      title: "Update bookmark",
      description:
        "Use this when the user asks to update fields on an existing Karakeep bookmark.",
      inputSchema: {
        bookmarkId: z.string().describe(`The bookmarkId to update.`),
        title: z
          .string()
          .nullable()
          .optional()
          .describe(`The bookmark's user-set title. Pass null to clear it.`),
        note: z
          .string()
          .optional()
          .describe(`A free-form note on the bookmark.`),
        summary: z
          .string()
          .nullable()
          .optional()
          .describe(`The bookmark's summary. Pass null to clear it.`),
        archived: z
          .boolean()
          .optional()
          .describe(`Whether the bookmark is archived.`),
        favourited: z
          .boolean()
          .optional()
          .describe(`Whether the bookmark is favourited.`),
        url: z
          .string()
          .url()
          .optional()
          .describe(`New URL for a link bookmark.`),
        description: z
          .string()
          .nullable()
          .optional()
          .describe(`Link description. Pass null to clear it.`),
        author: z
          .string()
          .nullable()
          .optional()
          .describe(`Link author. Pass null to clear it.`),
        publisher: z
          .string()
          .nullable()
          .optional()
          .describe(`Link publisher. Pass null to clear it.`),
        createdAt: z
          .string()
          .datetime()
          .optional()
          .describe(`Override the bookmark's createdAt timestamp (ISO 8601).`),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ bookmarkId, ...fields }): Promise<CallToolResult> => {
      const patchRes = await karakeepClient.PATCH(`/bookmarks/{bookmarkId}`, {
        params: {
          path: {
            bookmarkId,
          },
        },
        body: fields,
      });
      if (!patchRes.data) {
        return toMcpToolError(patchRes.error);
      }
      const getRes = await karakeepClient.GET(`/bookmarks/{bookmarkId}`, {
        params: {
          path: {
            bookmarkId,
          },
          query: {
            includeContent: false,
          },
        },
      });
      if (!getRes.data) {
        return toMcpToolError(getRes.error);
      }
      return {
        content: [
          {
            type: "text",
            text: compactBookmark(getRes.data),
          },
        ],
        structuredContent: {
          bookmark: toBookmarkSummary(getRes.data, webBaseUrl),
        },
      };
    },
  );

  mcpServer.registerTool(
    "get-bookmark-content",
    {
      title: "Get bookmark content",
      description:
        "Use this when the user asks for the markdown content of one Karakeep bookmark.",
      inputSchema: {
        bookmarkId: z.string().describe(`The bookmarkId to get content for.`),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ bookmarkId }): Promise<CallToolResult> => {
      const res = await karakeepClient.GET(`/bookmarks/{bookmarkId}`, {
        params: {
          path: {
            bookmarkId,
          },
          query: {
            includeContent: true,
          },
        },
      });
      if (!res.data) {
        return toMcpToolError(res.error);
      }
      return {
        content: [
          {
            type: "text",
            text: extractBookmarkContent(res.data, turndownService),
          },
        ],
      };
    },
  );
}
