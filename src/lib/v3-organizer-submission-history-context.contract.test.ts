import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/routes/_authenticated/admin/submission-versions.tsx",
  "utf8",
);

describe("V3 Organizer Submission History edition boundary", () => {
  it("fails closed when Organizer edition context is missing", () => {
    expect(route).toContain("const { editionId } = useAdminContext();");
    expect(route).toContain("enabled: Boolean(editionId)");
    expect(route).toContain("Submission History requires an explicit Organizer edition scope.");
    expect(route).toContain('title="Choose an edition"');
    expect(route).toContain("will not load or retain another edition's confirmation history");
  });

  it("keeps the response index and selection bound to the exact edition", () => {
    expect(route).toContain(".filter((row) => row.editions?.id === editionId)");
    expect(route).toContain("['confirmation-responses-for-version-history', editionId ?? 'unscoped']");
    expect(route).toContain("setSelectedId('');");
    expect(route).toContain("filtered.some((row) => row.id === selectedId)");
    expect(route).toContain("const selected = filtered.find((row) => row.id === activeId) ?? null;");
  });

  it("cannot retain a detail query under the previous edition key", () => {
    expect(route).toContain(
      "['confirmation-response-version-current', editionId ?? 'unscoped', activeId]",
    );
    expect(route).toContain("enabled: Boolean(editionId && activeId)");
  });
});
