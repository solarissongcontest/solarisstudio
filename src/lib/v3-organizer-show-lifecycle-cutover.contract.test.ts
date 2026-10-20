import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/admin/shows/$slug.tsx", "utf8");
const authority = readFileSync("src/lib/show-lifecycle-authority.ts", "utf8");

describe("V3 Organizer Show lifecycle consumer cutover", () => {
  it("keeps RPC details and uncertain-outcome reconciliation inside the System adapter", () => {
    expect(route).toContain('from "@/lib/show-lifecycle-authority"');
    expect(route).not.toContain("studio2_reconcile_operation");
    expect(route).not.toContain("studio2_show_lifecycle_preview");
    expect(route).not.toContain("studio2_create_show_v3");
    expect(authority).toContain("studio2_reconcile_operation");
    expect(authority).toContain("studio2_show_lifecycle_preview");
    expect(authority).toContain("studio2_create_show_v3");
    expect(authority).toContain("studio2_update_show_v3");
    expect(authority).toContain("studio2_update_show_mode_v3");
    expect(authority).toContain("studio2_delete_show_v3");
  });

  it("creates one stable operation identity per reviewed human action", () => {
    expect(route).toContain('createShowLifecycleIdentity("show-create")');
    expect(route).toContain('createShowLifecycleIdentity("show-update")');
    expect(route).toContain('createShowLifecycleIdentity("show-mode")');
    expect(route).toContain('createShowLifecycleIdentity("show-delete")');
    expect(route).toContain("identity: review.identity");
    expect(route).not.toContain("createShowLifecycleIdentity(review");
  });

  it("uses server versions for edit and Show Mode optimistic concurrency", () => {
    expect(route).toContain("expectedVersion: preview.expectedVersion");
    expect(route).toContain("live.expectedVersion !== review.expectedVersion");
    expect(route).toContain("sameShowIdentity(live, review.before)");
    expect(route).toContain("sameShowMode(showModeSnapshot(current), review.before)");
    expect(route).toContain("expectedVersion: review.expectedVersion");
  });

  it("uses dependency-aware R3 deletion with reason, fresh auth and typed identity", () => {
    expect(route).toContain("preview.delete.allowed");
    expect(route).toContain("preview.delete.blockers");
    expect(route).toContain("preview.dependencies.blockingReferenceCount");
    expect(route).toContain("sameDeleteReview(live, review.preview)");
    expect(route).toContain("deleteReason.trim().length < 5");
    expect(route).toContain("reauthenticateShowLifecycleR3(deletePassword)");
    expect(route).toContain("const result = await executeShowDelete({");
    expect(route).toContain('confirmationText={pendingDeleteReview?.showName}');
    expect(route).toContain("Permanent deletion is R3");
  });

  it("removes direct browser Show mutation authority", () => {
    expect(route).not.toContain('supabase.from("shows")');
    expect(route).not.toMatch(/from\(["']shows["']\)[\s\S]{0,220}\.(insert|update|delete)\s*\(/);
    expect(route).toContain("createShow({");
    expect(route).toContain("updateShow({");
    expect(route).toContain("updateShowMode({");
    expect(route).toContain("executeShowDelete({");
  });

  it("surfaces authoritative operation evidence without promoting capability parity", () => {
    expect(route).toContain("result.stateVersion");
    expect(route).toContain("result.receiptId.slice(0, 8)");
    expect(route).not.toContain("current-edition-contest: 'parity'");
  });
});
