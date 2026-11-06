import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TG4's public reader must not bypass the same server-authoritative rollout
 * decision as the parent Terra Solaris World experience.
 *
 * This test reads source without rendering or issuing any Supabase traffic.
 */
describe("TG4 public document rollout boundaries", () => {
  for (const path of [
    "src/routes/world/documents/index.tsx",
    "src/routes/world/documents/$organization/$document.tsx",
  ]) {
    it(`${path} defers mounting the public reader until World is enabled`, () => {
      const source = readFileSync(resolve(process.cwd(), path), "utf8");
      expect(source).toContain('import { WorldPublicGate } from "@/components/world/WorldPublic"');
      expect(source).toMatch(/<WorldPublicGate>\s*<WorldDocument(?:Library|Reader)Screen/);
      expect(source).toContain("</WorldPublicGate>");
    });
  }
});
