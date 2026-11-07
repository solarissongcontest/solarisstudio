import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/admin/JuryVotingWindowControl.tsx", "utf8");

describe("Organizer Jury Window actor isolation", () => {
  it("namespaces the private edition query by authenticated actor and evicts inactive data", () => {
    expect(source).toContain('import { useAuthenticatedUser }');
    expect(source).toContain('const actorId = useAuthenticatedUser().id;');
    expect(source).toContain('queryKey: ["jury-voting-windows", actorId, edition?.id]');
    expect(source).toContain("enabled: Boolean(actorId && edition?.id && slug)");
    expect(source).toContain("gcTime: 0");
    expect(source).toContain("retry: false");
    expect(source).not.toContain('queryKey: ["jury-voting-windows", edition?.id]');
    // Prefix invalidation still reaches all exact-actor views after an operation.
    expect(source).toContain('invalidateQueries({ queryKey: ["jury-voting-windows"] })');
  });

  it("drops R2 review on account changes and refuses applying another actor's intent", () => {
    expect(source).toContain("actorId: string;");
    expect(source).toContain("}, [actorId, edition?.id, selectedShow?.id]);");
    expect(source).toContain("pendingChange?.actorId === actorId");
    expect(source).toContain("pending.actorId !== actorId ||");
    expect(source).toContain("actorId,\n        status,\n        preview,");
    expect(source).toContain("p_operation_id: pending.operationId");
    expect(source).toContain("p_idempotency_key: pending.idempotencyKey");
    expect(source).toContain("p_expected_version: pending.preview.expectedVersion");
  });

  it("keeps the authoritative operation gates rather than writing voting state directly", () => {
    expect(source).toContain("studio2_jury_window_change_preview");
    expect(source).toContain("studio2_apply_jury_voting_status");
    expect(source).toContain("isJuryWindowReviewScopeCurrent");
    expect(source).toContain("juryOperationsSupported");
    expect(source).not.toContain('.from("jury_voting_windows").update(');
  });
});
