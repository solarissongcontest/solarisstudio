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

  it("does not invent a show start time from the date-only edition event_date", () => {
    // The schedule projection currently stores a placeholder noon for a calendar date.
    // Organizer must NEVER present that placeholder as an actual show start time.
    expect(route).toContain('item.source === "edition" && item.id.startsWith("edition-event:")');
    expect(route).toContain("parseEditionCalendarDate(item.at)");
    expect(route).toContain("calendarDateOnly");
    expect(route).toContain('const displayedDate = calendarDateOnly');
    expect(route).toContain('parseEditionCalendarDate(item.at)?.toLocaleDateString()');
    expect(route).toContain('calendarDateOnly ? "Calendar date" : past ? "Passed" : "Scheduled"');
    expect(route).toContain('const past = !calendarDateOnly && new Date(item.at).getTime() < Date.now();');
    expect(route).toContain("yesterday.setHours(0, 0, 0, 0)");
    expect(route).not.toContain('{new Date(item.at).toLocaleString()} · {item.detail}');
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
    expect(route).toContain("editionId !== createEditionId ||");
    expect(route).toContain("(editionsReady && selectedEdition?.id !== createEditionId)");
    expect(route).toContain("Only a real scope switch or a confirmed missing edition discards the draft.");
    expect(route).toContain("A background refresh/error must never silently erase typed Organizer work.");
    expect(route).toContain("createEditionId !== selectedEdition.id");
    expect(route).toContain("setCreateEditionId(selectedEdition?.id ?? null)");
    expect(route).toContain("setCreateEditionId(null)");
  });

});
