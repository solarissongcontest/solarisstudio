import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/lib/v3-official-communications-draft-commands.ts"),
  "utf8",
);

describe("V3 Official Communications draft command client", () => {
  it("uses only governed draft RPCs", () => {
    expect(source).toContain('"v3_create_notice_draft"');
    expect(source).toContain('"v3_update_notice_draft"');
    expect(source).toContain('"v3_create_superseding_notice_draft"');
    expect(source).not.toContain('"studio2_create_notice_draft_v2"');
    expect(source).not.toContain('"studio2_update_notice_draft_v2"');
  });

  it("binds explicit scope and expected revision where state already exists", () => {
    expect(source).toContain("p_scope_kind: scope.scopeKind");
    expect(source).toContain("p_edition_id: scope.editionId");
    expect(source).toContain("p_expected_revision: expectedRevision");
  });

  it("uses one stable operation identity and reconciles uncertain outcomes", () => {
    expect(source).toContain("p_operation_id: value");
    expect(source).toContain("p_idempotency_key: value");
    expect(source).toContain("p_correlation_id: value");
    expect(source).toContain('"studio2_reconcile_operation"');
    expect(source).toContain('recovered?.status === "succeeded"');
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
  });
});
