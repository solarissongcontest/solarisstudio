import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/system.tsx"),
  "utf8",
);

describe("Organizer System Settings exact edition context", () => {
  it("resolves edition-scoped content only from shell-owned OrganizerContext", () => {
    expect(route).toContain("const { editionId } = useAdminContext()");
    expect(route).toContain(
      "() => (editionId ? editions.find((edition) => edition.id === editionId) ?? null : null)",
    );
    expect(route).not.toContain("ordered[0]");
    expect(route).not.toContain("[...editions].sort(");
    expect(route).toContain("Solaris will not guess a newest edition");
  });

  it("passes null rather than an inferred edition into schedule/reminder projections", () => {
    expect(route).toContain("useAdminDeadlines(selectedEdition?.id ?? null)");
    expect(route).toContain(
      "useAdminOperationalSchedule(selectedEdition?.id ?? null, selectedEdition?.slug ?? null)",
    );
    expect(route).toContain("if (!selectedEdition || !form.label.trim() || !form.due_at) return");
    expect(route).toContain("disabled={!selectedEdition}");
  });

  it("fails closed visibly for edition-scoped schedule and reminder surfaces", () => {
    expect(route).toContain('title={editionsLoading ? "Resolving Organizer edition" : "Organizer edition required"}');
    expect(route).toContain('eyebrow={selectedEdition ? editionLabel(selectedEdition) : "Edition context required"}');
    expect(route).toContain('title={editionsLoading ? "Resolving Organizer edition" : "Select an Organizer edition"}');
    expect(route).toContain("description={editionContextMessage}");
  });

  it("keeps deliberately global platform mode authority available without edition fallback", () => {
    expect(route).toContain('queryKey: ["platform-operational-state"]');
    expect(route).toContain("queryFn: loadPlatformOperationalSnapshot");
    expect(route).toContain("previewPlatformModeChange");
    expect(route).toContain("applyPlatformModeChange");
    expect(route).toContain("Platform controls remain available globally");
  });
});
