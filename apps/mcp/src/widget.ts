import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { z } from "zod";

import { searchKarakeepBookmarks } from "./bookmarks";
import { KarakeepMcpContext } from "./shared";
import { toBookmarkSummary, toMcpToolError } from "./utils";

const TEMPLATE_URI = "ui://widget/karakeep-bookmark-search-v1.html";

const BOOKMARK_SEARCH_WIDGET_HTML = String.raw`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Karakeep bookmarks</title>
    <style>
      :root {
        color: #172026;
        background: #f7f3ea;
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-width: 0;
        background: #f7f3ea;
      }

      main {
        display: grid;
        gap: 12px;
        width: 100%;
        min-height: 260px;
        padding: 14px;
      }

      header {
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 12px;
        min-width: 0;
      }

      h1 {
        margin: 0;
        color: #14213d;
        font-size: 17px;
        font-weight: 750;
        line-height: 1.2;
      }

      .meta {
        margin-top: 3px;
        color: #52646f;
        font-size: 12px;
        line-height: 1.4;
      }

      .count {
        flex: 0 0 auto;
        border: 1px solid #d2d9d4;
        border-radius: 999px;
        background: #ffffff;
        color: #2f5d50;
        font-size: 12px;
        font-weight: 650;
        padding: 5px 9px;
      }

      .list {
        display: grid;
        gap: 10px;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .bookmark {
        display: grid;
        gap: 8px;
        border: 1px solid #d9dfd8;
        border-radius: 8px;
        background: #ffffff;
        padding: 11px;
      }

      .bookmark-title {
        overflow-wrap: anywhere;
        color: #16222a;
        font-size: 14px;
        font-weight: 700;
        line-height: 1.35;
      }

      .bookmark-details {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        color: #5c6970;
        font-size: 11px;
        line-height: 1.35;
      }

      .tag,
      .type {
        border-radius: 999px;
        background: #e8f0ec;
        color: #28584a;
        padding: 3px 7px;
      }

      .summary {
        color: #394850;
        font-size: 12px;
        line-height: 1.45;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
      }

      button {
        min-height: 30px;
        border: 1px solid #b9c7bf;
        border-radius: 7px;
        background: #fdfdfb;
        color: #163027;
        font: inherit;
        font-size: 12px;
        font-weight: 650;
        padding: 6px 9px;
        cursor: pointer;
      }

      button.primary {
        border-color: #27695a;
        background: #27695a;
        color: #ffffff;
      }

      button:disabled {
        cursor: wait;
        opacity: 0.65;
      }

      .empty {
        border: 1px dashed #c8d0ca;
        border-radius: 8px;
        background: #ffffff;
        color: #53626a;
        font-size: 13px;
        line-height: 1.45;
        padding: 18px;
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>Karakeep bookmarks</h1>
          <div class="meta" id="query"></div>
        </div>
        <div class="count" id="count">0 results</div>
      </header>
      <ul class="list" id="bookmarks"></ul>
      <div class="actions">
        <button class="primary" id="load-more" type="button" hidden>Load more</button>
      </div>
    </main>

    <script type="module">
      const queryEl = document.getElementById("query");
      const countEl = document.getElementById("count");
      const listEl = document.getElementById("bookmarks");
      const loadMoreButton = document.getElementById("load-more");

      let state = { query: "", bookmarks: [], nextCursor: null, limit: 10 };
      let rpcId = 0;
      const pendingRequests = new Map();

      const rpcNotify = (method, params) => {
        window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*");
      };

      const rpcRequest = (method, params) =>
        new Promise((resolve, reject) => {
          const id = ++rpcId;
          pendingRequests.set(id, { resolve, reject });
          window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
        });

      const escapeText = (value) =>
        String(value ?? "").replace(/[&<>"']/g, (char) => {
          const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          };
          return entities[char];
        });

      const formatDate = (value) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "";
        return new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
          dateStyle: "medium",
        }).format(date);
      };

      const render = () => {
        const bookmarks = Array.isArray(state.bookmarks) ? state.bookmarks : [];
        queryEl.textContent = state.query ? 'Search: "' + state.query + '"' : "";
        countEl.textContent =
          String(bookmarks.length) + (bookmarks.length === 1 ? " result" : " results");
        listEl.innerHTML = "";

        if (bookmarks.length === 0) {
          const empty = document.createElement("li");
          empty.className = "empty";
          empty.textContent = "No matching bookmarks.";
          listEl.appendChild(empty);
        }

        for (const bookmark of bookmarks) {
          const item = document.createElement("li");
          item.className = "bookmark";
          item.dataset.id = bookmark.id;
          item.dataset.url = bookmark.url || "";
          const tags = Array.isArray(bookmark.tags) ? bookmark.tags.slice(0, 4) : [];
          const summary = bookmark.summary || bookmark.note || "";
          item.innerHTML =
            '<div class="bookmark-title">' +
            escapeText(bookmark.title || "Untitled bookmark") +
            "</div>" +
            '<div class="bookmark-details">' +
            '<span class="type">' +
            escapeText(bookmark.type || "bookmark") +
            "</span>" +
            (bookmark.createdAt ? "<span>" + escapeText(formatDate(bookmark.createdAt)) + "</span>" : "") +
            tags.map((tag) => '<span class="tag">#' + escapeText(tag) + "</span>").join("") +
            "</div>" +
            (summary ? '<div class="summary">' + escapeText(summary) + "</div>" : "") +
            '<div class="actions">' +
            (bookmark.url ? '<button type="button" data-action="open">Open</button>' : "") +
            '<button type="button" data-action="ask">Ask about this</button>' +
            "</div>";
          listEl.appendChild(item);
        }

        loadMoreButton.hidden = !state.nextCursor;
        loadMoreButton.disabled = false;
      };

      const updateFromResponse = (response) => {
        if (!response || !response.structuredContent) return;
        const next = response.structuredContent;
        state = {
          query: next.query ?? state.query,
          bookmarks: Array.isArray(next.bookmarks) ? next.bookmarks : [],
          nextCursor: next.nextCursor ?? null,
          limit: next.limit ?? state.limit,
        };
        render();
      };

      window.addEventListener(
        "message",
        (event) => {
          if (event.source !== window.parent) return;
          const message = event.data;
          if (!message || message.jsonrpc !== "2.0") return;

          if (typeof message.id === "number") {
            const pending = pendingRequests.get(message.id);
            if (!pending) return;
            pendingRequests.delete(message.id);
            if (message.error) {
              pending.reject(message.error);
            } else {
              pending.resolve(message.result);
            }
            return;
          }

          if (message.method === "ui/notifications/tool-result") {
            updateFromResponse(message.params);
          }
        },
        { passive: true },
      );

      const bridgeReady = rpcRequest("ui/initialize", {
        appInfo: { name: "karakeep-bookmark-search", version: "0.1.0" },
        appCapabilities: {},
        protocolVersion: "2026-01-26",
      })
        .then(() => rpcNotify("ui/notifications/initialized", {}))
        .catch((error) => {
          console.error("Failed to initialise MCP Apps bridge", error);
        });

      const callTool = async (name, args) => {
        await bridgeReady;
        const response = await rpcRequest("tools/call", {
          name,
          arguments: args,
        });
        updateFromResponse(response);
      };

      loadMoreButton.addEventListener("click", async () => {
        if (!state.nextCursor) return;
        loadMoreButton.disabled = true;
        try {
          await callTool("show-karakeep-search", {
            query: state.query,
            limit: state.limit,
            nextCursor: state.nextCursor,
          });
        } catch (error) {
          console.error("Failed to load more bookmarks", error);
          loadMoreButton.disabled = false;
        }
      });

      listEl.addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        const item = button.closest(".bookmark");
        if (!item) return;
        const title = item.querySelector(".bookmark-title")?.textContent ?? "this bookmark";

        if (button.dataset.action === "open") {
          const href = item.dataset.url;
          if (!href) return;
          if (window.openai?.openExternal) {
            await window.openai.openExternal({ href });
          } else {
            window.open(href, "_blank", "noopener");
          }
          return;
        }

        rpcNotify("ui/message", {
          role: "user",
          content: [
            {
              type: "text",
              text: "Tell me more about the Karakeep bookmark " + item.dataset.id + ": " + title,
            },
          ],
        });
      });

      updateFromResponse({ structuredContent: window.openai?.toolOutput });
      render();
    </script>
  </body>
</html>`;

export function registerKarakeepWidgetTools(context: KarakeepMcpContext) {
  const domain = process.env.KARAKEEP_CHATGPT_APP_DOMAIN;
  const uiMeta = {
    prefersBorder: true,
    csp: {
      connectDomains: [],
      resourceDomains: [],
    },
    ...(domain ? { domain } : {}),
  };

  registerAppResource(
    context.mcpServer,
    "Karakeep bookmark search widget",
    TEMPLATE_URI,
    {
      description: "Interactive search results for Karakeep bookmarks.",
    },
    async () => ({
      contents: [
        {
          uri: TEMPLATE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: BOOKMARK_SEARCH_WIDGET_HTML,
          _meta: {
            ui: uiMeta,
            "openai/widgetDescription":
              "Shows interactive Karakeep bookmark search results.",
            "openai/widgetPrefersBorder": true,
            "openai/widgetCSP": {
              connect_domains: [],
              resource_domains: [],
            },
            ...(domain ? { "openai/widgetDomain": domain } : {}),
          },
        },
      ],
    }),
  );

  registerAppTool(
    context.mcpServer,
    "show-karakeep-search",
    {
      title: "Show Karakeep search",
      description:
        "Use this when the user wants an interactive ChatGPT widget for Karakeep bookmark search results.",
      inputSchema: {
        query: z.string().describe("The Karakeep search query to display."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(25)
          .optional()
          .describe("The number of results to show."),
        nextCursor: z
          .string()
          .optional()
          .describe("The pagination cursor returned by a previous search."),
      },
      annotations: {
        readOnlyHint: true,
      },
      _meta: {
        ui: {
          resourceUri: TEMPLATE_URI,
          visibility: ["model", "app"],
        },
        "openai/outputTemplate": TEMPLATE_URI,
        "openai/toolInvocation/invoking": "Searching Karakeep...",
        "openai/toolInvocation/invoked": "Karakeep results ready.",
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

      const bookmarks = res.data.bookmarks.map((bookmark) =>
        toBookmarkSummary(bookmark, context.webBaseUrl),
      );

      return {
        content: [
          {
            type: "text",
            text: `Showing ${bookmarks.length} Karakeep bookmark results for "${query}".`,
          },
        ],
        structuredContent: {
          query,
          limit: limit ?? 10,
          bookmarks,
          nextCursor: res.data.nextCursor ?? null,
        },
      };
    },
  );
}
