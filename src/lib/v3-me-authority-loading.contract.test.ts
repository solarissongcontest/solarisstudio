import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = readFileSync(
  new URL("../components/v3/V3MeRoot.tsx", import.meta.url),
  "utf8",
);

describe("V3 Me authority loading semantics", () => {
  it("does not present missing personal history while the caller-scoped summary is still unresolved", () => {
    expect(root).toContain("workspace.isLoading || summary.isPending");
    expect(root).toContain("Opening your account…");
  });

  it("reserves unavailable history for an actually settled invalid/error summary", () => {
    expect(root).toContain(
      "const scoped = !summary.isError && isScopedV3MeSummary(summary.data, viewerId, account?.country?.id);",
    );
    expect(root).toContain("historyAvailable: scoped");
    expect(root).toContain("history: scoped ?");
  });
});
