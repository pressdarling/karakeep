import { CallToolResult } from "@modelcontextprotocol/sdk/types";

import { KarakeepAPISchemas } from "@karakeep/sdk";

type Bookmark = KarakeepAPISchemas["Bookmark"];

export interface BookmarkSummary {
  id: string;
  title: string;
  type: "link" | "text" | "media" | "unknown";
  createdAt: string;
  summary: string;
  note: string;
  url: string;
  tags: string[];
}

export function toMcpToolError(
  error: KarakeepAPISchemas["Error"] | string | undefined,
): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text:
          typeof error === "string"
            ? error
            : error
              ? JSON.stringify(error)
              : `Something went wrong`,
      },
    ],
  };
}

export function bookmarkTitle(bookmark: Bookmark): string {
  return (
    bookmark.title ??
    (bookmark.content.type === "link" ? bookmark.content.title : "") ??
    "Untitled bookmark"
  );
}

export function bookmarkType(bookmark: Bookmark): BookmarkSummary["type"] {
  if (bookmark.content.type === "link") {
    return "link";
  }
  if (bookmark.content.type === "text") {
    return "text";
  }
  if (bookmark.content.type === "asset") {
    return "media";
  }
  return "unknown";
}

export function bookmarkCitationUrl(
  bookmark: Bookmark,
  webBaseUrl?: string,
): string {
  if (bookmark.content.type === "link") {
    return bookmark.content.url;
  }
  if (bookmark.content.type === "text" && bookmark.content.sourceUrl) {
    return bookmark.content.sourceUrl;
  }
  if (bookmark.content.type === "asset" && bookmark.content.sourceUrl) {
    return bookmark.content.sourceUrl;
  }
  return webBaseUrl
    ? `${webBaseUrl}/dashboard/preview/${bookmark.id}`
    : `karakeep://bookmark/${bookmark.id}`;
}

export function toBookmarkSummary(
  bookmark: Bookmark,
  webBaseUrl?: string,
): BookmarkSummary {
  return {
    id: bookmark.id,
    title: bookmarkTitle(bookmark),
    type: bookmarkType(bookmark),
    createdAt: bookmark.createdAt,
    summary: bookmark.summary ?? "",
    note: bookmark.note ?? "",
    url: bookmarkCitationUrl(bookmark, webBaseUrl),
    tags: bookmark.tags.map((tag) => tag.name),
  };
}

export function compactBookmark(bookmark: Bookmark): string {
  let content: string;
  if (bookmark.content.type === "link") {
    content = `Bookmark type: link
Bookmarked URL: ${bookmark.content.url}
description: ${bookmark.content.description ?? ""}
author: ${bookmark.content.author ?? ""}
publisher: ${bookmark.content.publisher ?? ""}`;
  } else if (bookmark.content.type === "text") {
    content = `Bookmark type: text
  Source URL: ${bookmark.content.sourceUrl ?? ""}`;
  } else if (bookmark.content.type === "asset") {
    content = `Bookmark type: media
Asset ID: ${bookmark.content.assetId}
Asset type: ${bookmark.content.assetType}
Source URL: ${bookmark.content.sourceUrl ?? ""}`;
  } else {
    content = `Bookmark type: unknown`;
  }

  return `Bookmark ID: ${bookmark.id}
  Created at: ${bookmark.createdAt}
  Title: ${bookmarkTitle(bookmark)}
  Summary: ${bookmark.summary ?? ""}
  Note: ${bookmark.note ?? ""}
  ${content}
  Tags: ${bookmark.tags.map((t) => t.name).join(", ")}`;
}
