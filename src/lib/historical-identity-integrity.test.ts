import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const integrityFiles = [
  "src/integrations/televoting/preflight.server.ts",
  "src/integrations/televoting/friend-voting-math.ts",
  "src/integrations/jury-voting/jury-voting.server.ts",
];

describe("historical identity integrity boundary", () => {
  it("keeps historical display metadata out of jury and televote integrity calculations", () => {
    for (const file of integrityFiles) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source).not.toContain("country_edition_identities");
      expect(source).not.toContain("historical_identity_override");
    }
  });
});
