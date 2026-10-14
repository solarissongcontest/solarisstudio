import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../components/v3/V3MeScreen.tsx", import.meta.url),
  "utf8",
);

describe("V3 Me screen architecture boundary", () => {
  it("renders the canonical Me projection without owning data access", () => {
    expect(source).toContain("V3MeProjection");
    expect(source).toContain("projection.identity");
    expect(source).toContain("projection.current");
    expect(source).toContain("projection.history");
    expect(source).toContain("projection.activity");

    for (const forbidden of [
      "@supabase",
      "supabase.",
      "fetch(",
      "useQuery",
      "useMutation",
      "useEffect",
      "localStorage",
      "sessionStorage",
      "indexedDB",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("does not bring Participate task ownership back into Me", () => {
    expect(source).not.toMatch(/SolarisTask|actionRequired|blocking|deadline|responsibilit(y|ies)/i);
    expect(source).not.toMatch(/confirmation|jury voting|televot(e|ing)|entry submit/i);
  });

  it("does not infer Organizer authorization from the display role", () => {
    expect(source).toContain("projection.organizerAction ?");
    expect(source).not.toMatch(/displayRole\s*===|displayRole\.includes|roleLabel\s*===/);
  });

  it("preserves receipt evidence distinctions instead of manufacturing chronology", () => {
    expect(source).toContain("verifiedReceiptCount");
    expect(source).toContain("awaitingAuthoritativeReceiptCount");
    expect(source).not.toMatch(/acceptedAt|clientObservedAt|new Date|Date\.now|sort\(/);
  });

  it("reuses the shared V3 foundation and bounds history on the root surface", () => {
    expect(source).toContain('from "./V3Foundation"');
    expect(source).toContain("<V3Screen>");
    expect(source).toContain("projection.history.slice(0, 4)");
    expect(source).not.toContain("V3FoundationShell");
  });
});
