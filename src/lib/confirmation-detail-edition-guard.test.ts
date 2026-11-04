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
    const loadStart = source.indexOf("const load = useCallback(async () => {");
    const loadEnd = source.indexOf("  useEffect(() => {", loadStart);
    expect(loadStart).toBeGreaterThan(-1);
    expect(loadEnd).toBeGreaterThan(loadStart);
    const readOnlyLoad = source.slice(loadStart, loadEnd);
    expect(readOnlyLoad).not.toContain("syncSnapshot(");
    expect(readOnlyLoad).not.toContain("syncToSolaris(");
    expect(readOnlyLoad).not.toContain("syncConfirmationSnapshotToSolaris");
    expect(source).toContain("async function manualSync()");
    expect(source).toContain("const result = await syncSnapshot(liveDetail)");
    expect(source).toContain('const fresh = await confirmationsSupabase.rpc("admin_confirmation_response_for_edition", {');
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

  it("serializes Entry review and winner actions with a synchronous in-flight lock", () => {
    const source = readFileSync("src/routes/confirmations/admin/responses/$id.tsx", "utf8");
    expect(source).toContain("const mutationInFlightRef = useRef(false);");
    expect(source).toContain("if (mutationInFlightRef.current) return;");
    expect(source).toContain("if (mutationInFlightRef.current || !onWinner || !isScopeCurrent()) return;");
    expect(source).toContain("if (mutationInFlightRef.current || !onClearWinner || !isScopeCurrent()) return;");
    expect(source.split("mutationInFlightRef.current = true;").length - 1).toBe(3);
    expect(source.split("mutationInFlightRef.current = false;").length - 1).toBe(3);
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
    const fresh = source.indexOf('const fresh = await confirmationsSupabase.rpc("admin_confirmation_response_for_edition"');
    const changed = source.indexOf("JSON.stringify(liveDetail) !== reviewedSnapshot");
    const sync = source.indexOf("const result = await syncSnapshot(liveDetail)");
    expect(fresh).toBeGreaterThan(-1);
    expect(changed).toBeGreaterThan(fresh);
    expect(sync).toBeGreaterThan(changed);
    expect(source).toContain("if (scopeIsCurrent()) {");
    expect(source).toContain("let mutationStarted = false;");
    expect(source).toContain("mutationStarted = true;");
  });

  it("fails closed when Submission History's legacy detail RPC returns another edition", () => {
    const source = readFileSync("src/routes/_authenticated/admin/submission-versions.tsx", "utf8");
    expect(source).toContain("async function loadResponse(id: string, editionId: string)");
    expect(source).toContain("if (!isConfirmationDetailInOrganizerScope(detail, id, editionId))");
    expect(source).toContain("queryFn: () => loadResponse(activeId, editionId)");
    expect(source).toContain("const detail = data as unknown as ResponseDetail | null;");
  });

  it("requires the exact canonical winner receipt, never a transport-only success", () => {
    const source = readFileSync("src/routes/confirmations/admin/responses/$id.tsx", "utf8");
    const start = source.indexOf('  async function changeWinner(');
    const end = source.indexOf('  async function setWinner(', start);
    const winner = source.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(winner).toContain("receipt = normalizeSystemReceipt(applyData);");
    expect(winner).toContain('receipt.status !== "succeeded"');
    expect(winner).toContain("receipt.operationId !== command.operationId");
    expect(winner).toContain("reconcileWinnerOperation({");
    expect(winner).toContain('recovered.receipt.status === "succeeded"');
    expect(winner).toContain("unresolvedWinnerOperationRef.current = null;");
    expect(winner.indexOf("receipt = normalizeSystemReceipt(applyData);")).toBeLessThan(
      winner.indexOf("if (stillCurrent()) await load();", winner.indexOf("let receipt: SystemReceipt")),
    );
  });

  it("requires System #1241's server-enforced edition scope for private reads", () => {
    const detail = readFileSync("src/routes/confirmations/admin/responses/$id.tsx", "utf8");
    const history = readFileSync("src/routes/_authenticated/admin/submission-versions.tsx", "utf8");
    expect(detail.split('"admin_confirmation_response_for_edition"').length - 1).toBe(2);
    expect(detail).toContain('"admin_confirmation_technical_for_edition"');
    expect(detail).toContain("technicalDetail.edition_id !== organizerEditionId");
    expect(detail).toContain("technicalDetail.submission_id !== id");
    expect(detail).toContain("_edition_id: organizerEditionId");
    expect(detail).not.toContain('"admin_confirmation_response",');
    expect(detail).not.toContain('"admin_confirmation_technical",');
    expect(history).toContain("'admin_confirmation_response_for_edition'");
    expect(history).toContain("_edition_id: editionId");
    expect(history).not.toContain("'admin_confirmation_response',");
  });

  it("never issues a second winner operation before an uncertain prior operation is settled", () => {
    const source = readFileSync("src/routes/confirmations/admin/responses/$id.tsx", "utf8");
    const start = source.indexOf('  async function changeWinner(');
    const end = source.indexOf('  async function setWinner(', start);
    const winner = source.slice(start, end);
    const unresolvedCheck = winner.indexOf("const unresolved = unresolvedWinnerOperationRef.current;");
    const preview = winner.indexOf('"studio2_confirmation_winner_change_preview"');
    const apply = winner.indexOf('"studio2_apply_confirmation_winner_change"');
    expect(source).toContain("const winnerInFlightRef = useRef(false);");
    expect(winner).toContain("if (winnerInFlightRef.current) return;");
    expect(winner).toContain("winnerInFlightRef.current = true;");
    expect(winner).toContain("winnerInFlightRef.current = false;");
    expect(unresolvedCheck).toBeGreaterThan(-1);
    expect(preview).toBeGreaterThan(unresolvedCheck);
    expect(apply).toBeGreaterThan(preview);
    expect(winner).toContain("unresolved.action === action");
    expect(winner).toContain("unresolved.entryId === entryId");
    expect(winner).toContain("unresolved.editionId === organizerEditionId");
    expect(winner).toContain("unresolvedWinnerOperationRef.current = {");
    expect(winner).toContain("A prior National Final winner operation has an unresolved outcome.");
    expect(winner).toContain("Number.isSafeInteger(preview.expectedVersion)");
  });

  it("gates viewing, sync, token creation and deletion on the same response scope", () => {
    const source = readFileSync("src/routes/confirmations/admin/responses/$id.tsx", "utf8");
    expect(source).toContain("if (!isConfirmationDetailInOrganizerScope(data, id, organizerEditionId)) {");
    expect(source).toContain("if (!isConfirmationDetailInOrganizerScope(data, id, organizerEditionId) || deleting) return;");
    expect(source).toContain("if (!isConfirmationDetailInOrganizerScope(data, id, organizerEditionId)) return;");
    expect(source).toContain("currentScopeRef.current.editionId !== organizerEditionId");
  });
});
