import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261018122500_v3_voting_declaration_expected_edition_scope.sql",
  ),
  "utf8",
);
const client = readFileSync(
  resolve(process.cwd(), "src/lib/voting-declaration-admin.ts"),
  "utf8",
);

function functionBody(signatureStart: string, endMarker: string) {
  const start = migration.indexOf(signatureStart);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe("System V3 S7 voting declaration edition binding", () => {
  it("adds explicit expected-edition overloads without treating caller scope as authority", () => {
    expect(migration).toContain(
      "create or replace function public.studio2_voting_declaration_invalidation_preview(\n  p_preflight_id uuid,\n  p_expected_edition_id uuid",
    );
    expect(migration).toContain(
      "create or replace function public.studio2_apply_voting_declaration_invalidation(\n  p_preflight_id uuid,\n  p_expected_edition_id uuid",
    );
    expect(migration).toContain(
      "v_actual_edition_id := private.studio2_voting_declaration_edition_id(\n    p_preflight_id",
    );
    expect(migration).toContain(
      "v_actual_edition_id is distinct from p_expected_edition_id",
    );
  });

  it("locks canonical declaration state before resolving and checking edition scope", () => {
    const apply = functionBody(
      "create or replace function public.studio2_apply_voting_declaration_invalidation(\n  p_preflight_id uuid,\n  p_expected_edition_id uuid",
      "\nrevoke all on function public.studio2_apply_voting_declaration_invalidation(\n  uuid, uuid, text, uuid, text, bigint",
    );

    const rowLock = apply.indexOf("where id = p_preflight_id\n  for update;");
    const resolveEdition = apply.indexOf(
      "private.studio2_voting_declaration_edition_id(",
      rowLock,
    );
    const scopeCheck = apply.indexOf(
      "v_actual_edition_id is distinct from p_expected_edition_id",
      resolveEdition,
    );
    const versionCheck = apply.indexOf(
      "v_row.declaration_version is distinct from p_expected_version",
      scopeCheck,
    );
    const operationClaim = apply.indexOf("private.studio2_claim_operation(", versionCheck);
    const mutation = apply.indexOf("update televoting.vote_preflight_checks", operationClaim);

    expect(rowLock).toBeGreaterThanOrEqual(0);
    expect(resolveEdition).toBeGreaterThan(rowLock);
    expect(scopeCheck).toBeGreaterThan(resolveEdition);
    expect(versionCheck).toBeGreaterThan(scopeCheck);
    expect(operationClaim).toBeGreaterThan(versionCheck);
    expect(mutation).toBeGreaterThan(operationClaim);
  });

  it("fails closed on missing/mismatched edition before any mutation or receipt", () => {
    const apply = functionBody(
      "create or replace function public.studio2_apply_voting_declaration_invalidation(\n  p_preflight_id uuid,\n  p_expected_edition_id uuid",
      "\nrevoke all on function public.studio2_apply_voting_declaration_invalidation(\n  uuid, uuid, text, uuid, text, bigint",
    );

    expect(apply).toContain("Expected Organizer edition is required");
    expect(apply).toContain("Voting declaration has no canonical Solaris edition");
    expect(apply).toContain("Voting declaration is outside the reviewed Organizer edition");
    expect(apply).toContain("using errcode = '42501'");
  });

  it("uses HTTP 409 semantics for deterministic stale-version conflict", () => {
    const apply = functionBody(
      "create or replace function public.studio2_apply_voting_declaration_invalidation(\n  p_preflight_id uuid,\n  p_expected_edition_id uuid",
      "\nrevoke all on function public.studio2_apply_voting_declaration_invalidation(\n  uuid, uuid, text, uuid, text, bigint",
    );

    expect(apply).toContain(
      "Voting declaration changed since this preview was loaded. Refresh before continuing.",
    );
    expect(apply).toContain("using errcode = 'PT409'");
    expect(apply).not.toContain("using errcode = '40001'");
  });

  it("binds the semantic operation and audit trail to the canonical edition", () => {
    const apply = functionBody(
      "create or replace function public.studio2_apply_voting_declaration_invalidation(\n  p_preflight_id uuid,\n  p_expected_edition_id uuid",
      "\nrevoke all on function public.studio2_apply_voting_declaration_invalidation(\n  uuid, uuid, text, uuid, text, bigint",
    );

    expect(apply).toContain("'integrity.declaration.invalidate'");
    expect(apply).toContain("'editionId', v_actual_edition_id");
    expect(apply).toContain("'expectedVersion', p_expected_version");
    expect(apply).toContain("'voting_declaration_invalidated'");
  });

  it("keeps the new exact-scope boundaries anonymous-denied and service-compatible", () => {
    expect(migration).toContain(
      "revoke all on function public.studio2_voting_declaration_invalidation_preview(\n  uuid, uuid\n) from public, anon;",
    );
    expect(migration).toContain(
      "grant execute on function public.studio2_voting_declaration_invalidation_preview(\n  uuid, uuid\n) to authenticated, service_role;",
    );
    expect(migration).toContain(
      "revoke all on function public.studio2_apply_voting_declaration_invalidation(\n  uuid, uuid, text, uuid, text, bigint\n) from public, anon;",
    );
    expect(migration).toContain(
      "grant execute on function public.studio2_apply_voting_declaration_invalidation(\n  uuid, uuid, text, uuid, text, bigint\n) to authenticated, service_role;",
    );
  });

  it("cuts the Organizer adapter over to the canonical tab-scoped edition", () => {
    expect(client).toContain("readTabScopedEdition(window.sessionStorage, SOLARIS_TAB_EDITION_KEY)");
    expect(client).toContain("Choose an Organizer edition before changing a voting declaration.");
    expect(client).toContain("p_expected_edition_id: editionId");
    expect(client).toContain("scope: { editionId, entityId: input.preview.id }");
    expect(client).toContain("editionId: text(row.editionId, \"declaration edition id\")");
    expect(client).toContain("expectedEditionId: text(row.expectedEditionId, \"reviewed Organizer edition id\")");
    expect(client).toContain("input.preview.editionId !== editionId");
    expect(client).toContain("input.preview.expectedEditionId !== editionId");
    expect(client).toContain("receiptEditionId !== editionId");
  });

  it("keeps compatibility overloads without letting the Organizer adapter use them", () => {
    expect(migration).toContain(
      "legacy one-argument preview / five-argument apply continue to exist",
    );
    expect(client).toContain("p_expected_edition_id: editionId");
    expect(client).not.toContain("p_preflight_id: preflightId,\n    }),");
  });
});
