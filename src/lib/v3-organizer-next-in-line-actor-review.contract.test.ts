import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/routes/_authenticated/admin/next-in-line.tsx", "utf8");

describe("Organizer Next in Line actor-bound R2 review", () => {
  it("remounts private responses and draft reviews on account switches", () => {
    expect(source).toContain("useAuthenticatedUser().id");
    expect(source).toContain("component: NextInLineAdminScope,");
    expect(source).toContain("<NextInLineAdminPage key={actorId} actorId={actorId} />");
    expect(source).toContain('actorIdRef.current = "";');
    expect(source).toContain("alive = false;");
  });

  it("binds prepared window actions to both account and edition", () => {
    expect(source).toContain("type PendingWindowChange = {\n  actorId: string;");
    expect(source).toContain("actorId: operationActorId,");
    expect(source).toContain("pendingWindowChange.actorId !== operationActorId");
    expect(source).toContain("actorIdRef.current !== operationActorId");
    expect(source).toContain("pendingWindowChange.editionId !== operationEditionId");
    expect(source).toContain("pendingWindowChange.preview.editionId !== operationEditionId");
    expect(source).toContain("Organizer account changed after this preview.");
    expect(source).toContain("Organizer edition changed after this preview.");
  });

  it("preserves server version, reviewed scope and idempotent apply", () => {
    expect(source).toContain('"studio2_next_in_line_window_change_preview"');
    expect(source).toContain('"studio2_apply_next_in_line_window_change"');
    expect(source).toContain("p_expected_version: preview.expectedVersion,");
    expect(source).toContain("p_operation_id: pendingWindowChange.operationId,");
    expect(source).toContain("p_idempotency_key: pendingWindowChange.idempotencyKey,");
    expect(source).toContain("if (result.error) throw new Error(result.error.message);");
  });
});
