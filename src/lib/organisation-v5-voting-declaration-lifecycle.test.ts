import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organisation OS V5 voting declaration lifecycle", () => {
  const migration = source(
    "supabase/migrations/20261003200000_organisation_os_v5_voting_declaration_lifecycle.sql",
  );
  const preflight = source("src/integrations/televoting/preflight.server.ts");
  const adminServer = source(
    "src/integrations/televoting/integrity-declarations.server.ts",
  );
  const adminRoute = source(
    "src/routes/televoting/admin/integrity-declarations.tsx",
  );
  const client = source("src/lib/voting-declaration-admin.ts");

  it("derives the exact V5 declaration states from canonical evidence", () => {
    expect(migration).toContain("studio2_voting_declaration_policy");
    expect(migration).toContain("current_statement_version");
    expect(migration).toContain("studio2_voting_declaration_state");
    expect(migration).toContain("then 'invalidated'");
    expect(migration).toContain("then 'missing'");
    expect(migration).toContain("then 'required'");
    expect(migration).toContain("then 'wrong_version'");
    expect(migration).toContain("else 'signed'");
  });

  it("versions declaration evidence and rejects stale organizer writes", () => {
    expect(migration).toContain("declaration_version bigint not null default 1");
    expect(migration).toContain("studio2_touch_voting_declaration_version");
    expect(migration).toContain("p_expected_version bigint");
    expect(migration).toContain("using errcode = '40001'");
    expect(migration).toContain("private.studio2_claim_operation");
    expect(migration).toContain("'integrity.declaration.invalidate'");
    expect(migration).toContain("'R2'");
  });

  it("keeps invalidation separate from ballot validity", () => {
    expect(migration).toContain("declaration_invalidated_at = now()");
    expect(migration).toContain("'voting_declaration_invalidated'");
    expect(migration).not.toContain("status = 'invalid'");
    expect(migration).not.toContain("status = 'excluded'");
    expect(adminRoute).toContain(
      "It does not silently delete or invalidate the ballot",
    );
  });

  it("binds new signatures to the canonical statement policy", () => {
    expect(preflight).toContain("loadCurrentVoteIntegrityStatementVersion");
    expect(preflight).toContain(
      "statement_version: declarationStatementVersion",
    );
    expect(preflight).toContain("This integrity declaration was invalidated");
    expect(preflight).toContain("uses an outdated statement");
    expect(preflight).toContain("alreadySigned: true");
  });

  it("shows canonical declaration state and a governed invalidation action in Organizer", () => {
    expect(adminServer).toContain("IntegrityDeclarationState");
    expect(adminServer).toContain("required_statement_version");
    expect(adminServer).toContain("declaration_state");
    expect(adminRoute).toContain("declarationLabel(row.declaration_state)");
    expect(adminRoute).toContain("Invalidate declaration");
    expect(adminRoute).toContain("AdminConfirmSheet");
    expect(client).toContain("studio2_voting_declaration_invalidation_preview");
    expect(client).toContain("studio2_apply_voting_declaration_invalidation");
    expect(client).toContain("operationId: input.operationId");
    expect(client).toContain("idempotencyKey: input.idempotencyKey");
  });
});
