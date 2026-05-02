import { describe, expect, it } from "vitest";

import { resolveAllowOrigin } from "./http";

describe("resolveAllowOrigin", () => {
  describe("when KARAKEEP_MCP_ALLOWED_ORIGINS is unset or empty", () => {
    it("returns '*' when allowedOriginsEnv is undefined", () => {
      expect(resolveAllowOrigin("https://example.com", undefined)).toBe("*");
    });

    it("returns '*' when allowedOriginsEnv is an empty string", () => {
      expect(resolveAllowOrigin("https://example.com", "")).toBe("*");
    });

    it("returns '*' when allowedOriginsEnv is whitespace-only", () => {
      expect(resolveAllowOrigin("https://example.com", "   ")).toBe("*");
    });

    it("returns empty string when env var has only whitespace entries (fail-closed)", () => {
      // All entries strip to empty → no valid origins → block all
      expect(resolveAllowOrigin("https://example.com", "  ,  ,  ")).toBe("");
    });

    it("returns '*' when requestOrigin is undefined", () => {
      expect(resolveAllowOrigin(undefined, undefined)).toBe("*");
    });
  });

  describe("when KARAKEEP_MCP_ALLOWED_ORIGINS is configured", () => {
    it("returns the requestOrigin when it is in the allow-list", () => {
      const env = "https://chatgpt.com,https://claude.ai";
      expect(resolveAllowOrigin("https://chatgpt.com", env)).toBe(
        "https://chatgpt.com",
      );
      expect(resolveAllowOrigin("https://claude.ai", env)).toBe(
        "https://claude.ai",
      );
    });

    it("returns the first allowed origin when requestOrigin is not in the list", () => {
      const env = "https://chatgpt.com";
      expect(resolveAllowOrigin("https://evil.com", env)).toBe(
        "https://chatgpt.com",
      );
    });

    it("returns the first allowed origin when requestOrigin is undefined", () => {
      const env = "https://chatgpt.com";
      expect(resolveAllowOrigin(undefined, env)).toBe("https://chatgpt.com");
    });

    it("trims whitespace from allowed origins", () => {
      const env = "  https://chatgpt.com  ,  https://claude.ai  ";
      expect(resolveAllowOrigin("https://chatgpt.com", env)).toBe(
        "https://chatgpt.com",
      );
    });

    it("never echoes back an untrusted origin", () => {
      const env = "https://chatgpt.com";
      const result = resolveAllowOrigin("https://attacker.com", env);
      expect(result).not.toBe("https://attacker.com");
    });

    it("handles a single allowed origin with no comma", () => {
      expect(resolveAllowOrigin("https://chatgpt.com", "https://chatgpt.com")).toBe(
        "https://chatgpt.com",
      );
    });
  });
});
