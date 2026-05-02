import { describe, expect, it } from "vitest";

import { buildWidgetHtml } from "./widget";

describe("buildWidgetHtml", () => {
  describe("postMessage target origin injection", () => {
    it("embeds a specific origin when provided", () => {
      const html = buildWidgetHtml("https://chatgpt.com");
      expect(html).toContain('"https://chatgpt.com"');
    });

    it("embeds '*' when the wildcard origin is provided", () => {
      const html = buildWidgetHtml("*");
      expect(html).toContain('"*"');
    });

    it("assigns TARGET_ORIGIN constant used in all postMessage calls", () => {
      const html = buildWidgetHtml("https://chatgpt.com");
      expect(html).toContain("const TARGET_ORIGIN =");
      // Both postMessage calls reference the constant, not a hardcoded "*"
      const matches = [...html.matchAll(/postMessage\([^)]+TARGET_ORIGIN/g)];
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    it("does not contain hardcoded '*' as a postMessage target", () => {
      const html = buildWidgetHtml("https://chatgpt.com");
      // There should be no postMessage(..., "*") remaining
      expect(html).not.toMatch(/postMessage\([^)]+,\s*"\*"\)/);
    });
  });

  describe("MCP protocol version", () => {
    it("uses the correct MCP protocol version 2024-11-05", () => {
      const html = buildWidgetHtml("*");
      expect(html).toContain('"2024-11-05"');
    });

    it("does not contain the incorrect future protocol version 2026-01-26", () => {
      const html = buildWidgetHtml("*");
      expect(html).not.toContain("2026-01-26");
    });
  });

  describe("XSS protection for URL opening", () => {
    it("includes a https? regex guard before window.open", () => {
      const html = buildWidgetHtml("*");
      // The guard must appear before window.open in the source
      const guardIndex = html.indexOf("/^https?:\\/\\//i.test(href)");
      const openIndex = html.indexOf('window.open(href, "_blank"');
      expect(guardIndex).toBeGreaterThan(-1);
      expect(openIndex).toBeGreaterThan(-1);
      expect(guardIndex).toBeLessThan(openIndex);
    });

    it("does not contain an unguarded window.open call", () => {
      const html = buildWidgetHtml("*");
      // The unguarded pattern would be: } else { window.open(href, ...
      expect(html).not.toMatch(/\} else \{\s*window\.open\(href/);
    });
  });

  describe("output is valid HTML", () => {
    it("starts with <!DOCTYPE html>", () => {
      const html = buildWidgetHtml("*");
      expect(html.trimStart()).toMatch(/^<!DOCTYPE html>/i);
    });

    it("contains the expected widget elements", () => {
      const html = buildWidgetHtml("*");
      expect(html).toContain('id="bookmarks"');
      expect(html).toContain('id="load-more"');
      expect(html).toContain("Karakeep bookmarks");
    });
  });
});
