import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/integrations/v3/primary-surface-source.server.ts",
  "utf8",
);

describe("V3 Participate voting read-model boundary", () => {
  it("does not pretend the current bootstrap exposes closed/upcoming televote state", () => {
    expect(source).toContain('.eq("status", "open")');
    expect(source).toContain("loadOpenPublicTelevote");
  });

  it("does not pretend the current jury adapter exposes non-open eligible rounds", () => {
    expect(source).toContain('if (!round?.eligible || round.status !== "open") return null;');
  });
});
