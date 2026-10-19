import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const adminOps = source("src/lib/admin-ops.ts");
const adminSchedule = source("src/lib/admin-schedule.ts");

describe("V3 Organizer custom reminder compatibility safety", () => {
  it("never loads browser reminder rows without an explicit edition", () => {
    expect(adminOps).toContain("Admin deadlines require an explicit Organizer edition scope.");
    expect(adminOps).toContain("enabled: Boolean(exactEditionId)");
    expect(adminOps).toContain('.eq("edition_id", normalizedEditionId)');
    expect(adminOps).not.toContain('["admin-deadlines", editionId ?? "all"]');
  });

  it("binds reminder reads to the live Organizer edition instead of accepting a fallback edition", () => {
    expect(adminOps).toContain("const { editionId: organizerContextEditionId } = useAdminContext()");
    expect(adminOps).toContain("organizerEditionId === requestedEditionId");
    expect(adminOps).toContain("Admin deadlines must match the exact selected Organizer edition scope.");
  });

  it("binds the operational schedule to the same live Organizer edition", () => {
    expect(adminSchedule).toContain("const { editionId: organizerContextEditionId } = useAdminContext()");
    expect(adminSchedule).toContain("organizerEditionId === requestedEditionId");
    expect(adminSchedule).toContain("enabled: Boolean(exactEditionId)");
    expect(adminSchedule).toContain(
      "Operational schedule must match the exact selected Organizer edition scope.",
    );
    expect(adminSchedule).not.toContain('.eq("edition_id", editionId)');
    expect(adminSchedule).toContain('.eq("edition_id", exactEditionId)');
  });

  it("binds reminder creation to the exact Organizer edition", () => {
    const createStart = adminOps.indexOf("export function useCreateAdminDeadline()");
    const toggleStart = adminOps.indexOf("export function useToggleAdminDeadline()");
    const createHook = adminOps.slice(createStart, toggleStart);

    expect(createHook).toContain("const { editionId } = useAdminContext()");
    expect(createHook).toContain("payload.edition_id !== organizerEditionId");
    expect(createHook).toContain("exact selected Organizer edition");
    expect(createHook).toContain('.select("id, edition_id")');
    expect(createHook).toContain("data.edition_id !== organizerEditionId");
  });

  it("re-reads a reminder and narrows completion updates by edition and prior state", () => {
    const toggleStart = adminOps.indexOf("export function useToggleAdminDeadline()");
    const notificationStart = adminOps.indexOf("export function useMarkNotificationRead()");
    const toggleHook = adminOps.slice(toggleStart, notificationStart);

    expect(toggleHook).toContain("const { editionId } = useAdminContext()");
    expect(toggleHook).toContain('.select("id, edition_id, completed_at")');
    expect(toggleHook).toContain('.eq("edition_id", organizerEditionId)');
    expect(toggleHook).toContain('update.eq("completed_at", current.completed_at)');
    expect(toggleHook).toContain('update.is("completed_at", null)');
    expect(toggleHook).toContain("changed before your action was applied");
    expect(toggleHook).toContain("could not be reconciled after the update");
  });

  it("does not pretend compatibility reminder CRUD closes System #1074", () => {
    expect(adminOps).not.toContain("studio2_apply_admin_deadline");
    expect(adminOps).not.toContain("studio2_admin_deadline_preview");
  });
});
