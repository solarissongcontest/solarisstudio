import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/confirmations/admin/calendar.tsx", "utf8");

describe("V3 Organizer Delegation Calendar actor and async scope isolation", () => {
  it("keys private Calendar and authorization reads by exact actor and edition/round", () => {
    expect(route).toContain('queryKey: ["v3-organizer", "confirmation-calendar-editions", actorId]');
    expect(route).toContain('queryKey: ["v3-organizer", "confirmation-calendar-access", actorId, editionId || "none"]');
    expect(route).toContain('queryKey: ["v3-organizer", "confirmation-calendar", actorId, editionId || "none", roundId || "all"]');
    expect(route).toContain("verifyOrganizerConfirmationRead(editionId)");
    expect(route).toContain("enabled: Boolean(editionId) && hasReadAccess");
  });

  it("never renders former-account rows, false empty dates or stale totals during authorization and read refresh", () => {
    expect(route).toContain("editionsQuery.isSuccess && !editionsQuery.isFetching && !editionsQuery.error");
    expect(route).toContain("readAccessQuery.isSuccess && !readAccessQuery.isFetching");
    expect(route).toContain("calendarQuery.isSuccess");
    expect(route).toContain("!calendarQuery.isFetching && !calendarQuery.error");
    expect(route).toContain("const rows = verifiedRows ? (calendarQuery.data ?? []) : [];");
    expect(route).toContain("!loading && !error && verifiedRows");
    expect(route).toContain("!verifiedRows ? (");
    expect(route).toContain("gcTime: 0,");
    expect(route).not.toContain("setRows(await loadConfirmationCalendar");
  });

  it("refuses implicit global context and binds the round selector to the choosing actor and edition", () => {
    expect(route).toContain('editionRows.find((item) => item.id === organizerEditionId)?.id ?? ""');
    expect(route).toContain("roundChoice?.actorId === actorId && roundChoice.editionId === editionId");
    expect(route).toContain("setRoundChoice({ actorId, editionId, roundId: next })");
    expect(route).toContain("setOrganizerEditionId(next)");
    expect(route).not.toContain('item.status === "active"');
    expect(route).toContain("Solaris will not load a globally active or first edition");
  });
});
