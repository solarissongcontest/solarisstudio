import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { isConfirmationDetailInOrganizerScope } from "./confirmation-detail-edition-guard";

describe("Organizer Confirmation detail edition isolation", () => {
  const response = { id: "response-1", edition: { id: "edition-a" } };

  it("permits only the exact requested response and selected Organizer edition", () => {
    expect(isConfirmationDetailInOrganizerScope(response, "response-1", "edition-a")).toBe(true);
    expect(isConfirmationDetailInOrganizerScope(response, "response-1", "edition-b")).toBe(false);
    expect(isConfirmationDetailInOrganizerScope(response, "response-2", "edition-a")).toBe(false);
  });

  it("fails closed on absent edition associations, responses and contexts", () => {
    expect(isConfirmationDetailInOrganizerScope(null, "response-1", "edition-a")).toBe(false);
    expect(isConfirmationDetailInOrganizerScope({ id: "response-1" }, "response-1", "edition-a")).toBe(false);
    expect(isConfirmationDetailInOrganizerScope(response, "response-1", "")).toBe(false);
    expect(isConfirmationDetailInOrganizerScope(response, "", "edition-a")).toBe(false);
  });

  it("does not mutate canonical Solaris state merely by opening a response", () => {
    const source = readFileSync("src/routes/confirmations/admin/responses/$id.tsx", "utf8");
    expect(source).not.toContain("await syncSnapshot(detail)");
    expect(source).toContain("async function manualSync()");
    expect(source).toContain("const result = await syncSnapshot(liveDetail)");
    expect(source).toContain('const fresh = await confirmationsSupabase.rpc("admin_confirmation_response", {');
    expect(source).toContain("JSON.stringify(liveDetail) !== reviewedSnapshot");
    expect(source).toContain("if (!isStillCurrent())");
  });

  it("rejects wrong-edition response details before loading private technical data", () => {
    const source = readFileSync("src/routes/confirmations/admin/responses/$id.tsx", "utf8");
    const scopeCheck = source.indexOf("if (!isConfirmationDetailInOrganizerScope(detail, id, organizerEditionId))");
    const technicalRead = source.indexOf("await loadTechnical(generation)");
    expect(scopeCheck).toBeGreaterThan(-1);
    expect(technicalRead).toBeGreaterThan(scopeCheck);
    expect(source).toContain("responseLoadGenerationRef.current += 1;");
    expect(source).toContain("currentScopeRef.current.responseId === id");
    expect(source).toContain("if (responseLoadGenerationRef.current !== generation) return;");
  });

  it("reviews an official-state reconciliation explicitly before any sync mutation", () => {
    const source = readFileSync("src/routes/confirmations/admin/responses/$id.tsx", "utf8");
    expect(source).toContain('title="Review Solaris reconciliation"');
    expect(source).toContain("onClick={() => setSyncReviewOpen(true)}");
    expect(source).not.toContain("onClick={() => void manualSync()}");
    expect(source).toContain('title="Reconcile this Confirmation with Solaris?"');
    expect(source).toContain("confirmationText={data.country}");
    expect(source).toContain("if (syncInFlightRef.current || !syncReviewOpen) return;");
    expect(source).toContain("syncInFlightRef.current = true;");
    expect(source).toContain("syncInFlightRef.current = false;");
    expect(source).toContain("System #598 remains a prerequisite");
  });

  it("guards Entry review preflight, apply and reconciliation against stale edition switches", () => {
    const source = readFileSync("src/routes/confirmations/admin/responses/$id.tsx", "utf8");
    expect(source).toContain("isScopeCurrent: () => boolean;");
    expect(source).toContain("if (!isScopeCurrent()) {");
    const preview = source.indexOf('"studio2_confirmation_entry_review_preview"');
    const guard = source.indexOf("Organizer edition changed before the reviewed Entry command.");
    const apply = source.indexOf('"studio2_apply_confirmation_entry_review"');
    expect(preview).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(preview);
    expect(apply).toBeGreaterThan(guard);
    expect(source).toContain("isScopeCurrent={isDisplayedResponseCurrent}");
    expect(source).toContain("Entry review completed for a previous edition.");
  });

  it("keeps stale privileged sync results out of the current edition and rejects changed snapshots", () => {
    const source = readFileSync("src/routes/confirmations/admin/responses/$id.tsx", "utf8");
    const fresh = source.indexOf('const fresh = await confirmationsSupabase.rpc("admin_confirmation_response"');
    const changed = source.indexOf("JSON.stringify(liveDetail) !== reviewedSnapshot");
    const sync = source.indexOf("const result = await syncSnapshot(liveDetail)");
    expect(fresh).toBeGreaterThan(-1);
    expect(changed).toBeGreaterThan(fresh);
    expect(sync).toBeGreaterThan(changed);
    expect(source).toContain("if (scopeIsCurrent()) {");
    expect(source).toContain("let mutationStarted = false;");
    expect(source).toContain("mutationStarted = true;");
  });

  it("gates viewing, sync, token creation and deletion on the same response scope", () => {
    const source = readFileSync("src/routes/confirmations/admin/responses/$id.tsx", "utf8");
    expect(source).toContain("if (!isConfirmationDetailInOrganizerScope(data, id, organizerEditionId)) {");
    expect(source).toContain("if (!isConfirmationDetailInOrganizerScope(data, id, organizerEditionId) || deleting) return;");
    expect(source).toContain("if (!isConfirmationDetailInOrganizerScope(data, id, organizerEditionId)) return;");
    expect(source).toContain("currentScopeRef.current.editionId !== organizerEditionId");
  });
});
