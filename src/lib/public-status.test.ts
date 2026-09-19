import { describe, expect, it } from "vitest";

import { PUBLIC_STATUS, publicStatusDefinition } from "./public-status";

describe("public status vocabulary", () => {
  it("keeps high-risk states explicit instead of relying on colour", () => {
    expect(publicStatusDefinition("live").label).toBe("Live");
    expect(publicStatusDefinition("changes_required").label).toBe("Changes required");
    expect(publicStatusDefinition("not_published").label).toBe("Not yet published");
    expect(publicStatusDefinition("under_review").label).toBe("Under review");
  });

  it("keeps every public status mapped to a semantic tone", () => {
    for (const definition of Object.values(PUBLIC_STATUS)) {
      expect(definition.label.trim().length).toBeGreaterThan(0);
      expect(["neutral", "info", "success", "warning", "danger", "live"]).toContain(
        definition.tone,
      );
    }
  });
});
