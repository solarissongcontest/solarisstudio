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
      "() => (editionsReady && editionId ? editions.find((edition) => edition.id === editionId) ?? null : null)",
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
    expect(route).toContain("if (!selectedEdition || createEditionId !== selectedEdition.id || !form.label.trim() || !form.due_at) return");
    expect(route).toContain("disabled={!selectedEdition || deadlinesError}");
  });

  it("fails closed visibly for edition-scoped schedule and reminder surfaces", () => {
    expect(route).toContain("Operational metrics unavailable");
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
  it("does not treat failed or in-flight edition refreshes as valid private read context", () => {
    expect(route).toContain("editionsQuery.isSuccess && !editionsQuery.error && !editionsQuery.isFetching");
    expect(route).toContain("editionsReady && editionId");
    expect(route).toContain("Retry edition lookup");
    expect(route).toContain("void editionsQuery.refetch()");
    expect(route).toContain("Edition lookup failed");
    expect(route).toContain("editionsQuery.error");
  });

  it("does not show misleading zero metrics or empty reminders when scoped reads fail", () => {
    expect(route).toContain("selectedEdition && !deadlinesError && !scheduleError");
    expect(route).toContain("Operational metrics unavailable");
    expect(route).toContain("Custom reminders could not be verified");
    expect(route).toContain("Retry reminders");
    expect(route).toContain("void refetchDeadlines()");
    expect(route).toContain("Schedule could not be verified");
  });

  it("shows audit read failures as unavailable with an explicit retry instead of reporting no history", () => {
    expect(route).toContain("isLoading: auditLoading");
    expect(route).toContain("isError: auditError");
    expect(route).toContain("error: auditReadError");
    expect(route).toContain("refetch: refetchAudit");
    expect(route).toContain("Organizer audit history unavailable");
    expect(route).toContain("Retry audit history");
    expect(route).toContain("void refetchAudit()");
    expect(route).toContain("auditError ? (");
  });

  it("locks unfinished reminder drafts to their original edition and closes on context loss", () => {
    expect(route).toContain("const [createEditionId, setCreateEditionId]");
    expect(route).toContain("createOpen && createEditionId && createEditionId !== selectedEdition?.id");
    expect(route).toContain("createEditionId !== selectedEdition.id");
    expect(route).toContain("setCreateEditionId(selectedEdition?.id ?? null)");
    expect(route).toContain("setCreateEditionId(null)");
  });

});
