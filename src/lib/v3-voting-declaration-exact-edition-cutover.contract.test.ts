import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const client = readFileSync(
  resolve(process.cwd(), "src/lib/voting-declaration-admin.ts"),
  "utf8",
);
const route = readFileSync(
  resolve(process.cwd(), "src/routes/televoting/admin/integrity-declarations.tsx"),
  "utf8",
);
const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261020004500_voting_declaration_exact_edition_cutover.sql",
  ),
  "utf8",
);

describe("V3 voting declaration exact-edition Organizer cutover", () => {
  it("passes the shell-selected edition to preview and validates returned edition evidence", () => {
    expect(route).toContain(
      "previewVotingDeclarationInvalidation({ preflightId, editionId })",
    );
    expect(client).toContain("p_expected_edition_id: editionId");
    expect(client).toContain("editionId: text(row.editionId, \"declaration edition\")");
    expect(client).toContain(
      "expectedEditionId: text(row.expectedEditionId, \"reviewed Organizer edition\")",
    );
    expect(client).toContain(
      "preview.editionId !== editionId || preview.expectedEditionId !== editionId",
    );
  });

  it("binds the R2 operation scope and apply call to the same exact edition", () => {
    expect(client).toContain("scope: { editionId, entityId: input.preview.id }");
    expect(client).toContain("p_expected_edition_id: editionId");
    expect(route).toContain("pending.preview.editionId !== editionId");
    expect(route).toContain("pending.preview.expectedEditionId !== editionId");
    expect(route).toContain("editionId,\n        preview: pending.preview");
  });

  it("rejects contradictory receipt edition evidence before treating the mutation as settled", () => {
    expect(client).toContain("const receiptEditionId = text(row.editionId, \"declaration receipt edition\")");
    expect(client).toContain("if (receiptEditionId !== editionId)");
    expect(route).toContain("if (receipt.editionId !== editionId)");
  });

  it("retires authenticated access to the legacy edition-implicit overloads", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("20261020004500_voting_declaration_exact_edition_cutover");
    expect(migration).toContain(
      "revoke execute on function public.studio2_voting_declaration_invalidation_preview(uuid)\n  from authenticated;",
    );
    expect(migration).toContain(
      "uuid, text, uuid, text, bigint\n) from authenticated;",
    );
    expect(migration).toContain("to service_role;");
  });
});
