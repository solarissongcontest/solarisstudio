import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const screen = read("src/routes/confirmations/admin/responses.tsx");
const reader = read("src/integrations/confirmations/v3-projections.ts");
const recovery = read("src/routes/confirmations/admin/recovery-codes.tsx");
const reviewSql = read("supabase/migrations/20261104144000_v3_s15_confirmation_review_projection.sql");
const recoverySql = read("supabase/migrations/20261104144100_v3_s15_confirmation_recovery_projection.sql");

describe("S15 exact-edition Confirmation review consumer cutover", () => {
  it("removes global all-edition response downloads from the review list", () => {
    expect(screen).toContain("loadConfirmationResponsesPage<ResponseRow>(editionId)");
    expect(screen).toContain("loadMoreResponses");
    expect(screen).toContain("responseCursor");
    expect(screen).toContain("activeEditionRef.current !== requestedEditionId");
    expect(screen).not.toContain('rpc("admin_confirmation_responses")');
    expect(reader).toContain('rpc("admin_confirmation_responses_v2"');
    expect(reader).toContain("p_edition_id: editionId");
  });

  it("binds pagination to canonical state version and edition before accepting rows", () => {
    expect(reader).toContain("cursor.editionId !== editionId");
    expect(reader).toContain("page.stateVersion !== cursor.stateVersion");
    expect(reader).toContain("{ status: 409 }");
    expect(reader).toContain("Confirmation projection crossed the selected edition boundary.");
    expect(reader).toContain("limit = 100");
    expect(reviewSql).toContain("submission.edition_id = p_edition_id");
    expect(reviewSql).toContain(
      "private.solaris_confirmation_admin_read_allowed(p_edition_id, false)",
    );
  });

  it("does not accidentally expose legacy Recovery credentials in the read-only review cutover", () => {
    expect(recovery).toContain("Recovery Access requires a server update");
    expect(recovery).not.toContain("loadConfirmationRecoveryCodesPage");
    expect(recoverySql).toContain(
      "public.studio2_access_allowed('confirmation.manage', p_edition_id, false)",
    );
    expect(reader).not.toContain("admin_confirmation_recovery_codes_v2");
    expect(screen).not.toContain("recovery_code");
  });
});
