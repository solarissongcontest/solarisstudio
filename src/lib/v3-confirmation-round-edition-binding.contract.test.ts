import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019210500_v3_confirmation_round_edition_binding.sql",
  ),
  "utf8",
);

const legacyAuthority = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261003018000_organisation_os_v5_confirmation_round_operations.sql",
  ),
  "utf8",
);

const consequenceMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261015183000_v3_s5_confirmation_consequences.sql",
  ),
  "utf8",
);

describe("V3 Confirmation round exact-edition binding", () => {
  it("adds an S13-adopted additive preview/apply contract", () => {
    expect(migration).toContain("v3_register_migration_contract");
    expect(migration).toContain(
      "'20261019210500_v3_confirmation_round_edition_binding'",
    );
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain(
      "public.studio2_confirmation_round_change_preview_v2(",
    );
    expect(migration).toContain(
      "public.studio2_apply_confirmation_round_change_v2(",
    );
    expect(legacyAuthority).toContain(
      "public.studio2_confirmation_round_change_preview(",
    );
    expect(legacyAuthority).toContain(
      "public.studio2_apply_confirmation_round_change(",
    );
  });

  it("requires exact expected-edition authorization before either fresh apply or replay", () => {
    const applyStart = migration.indexOf(
      "create or replace function public.studio2_apply_confirmation_round_change_v2(",
    );
    const accessCheck = migration.indexOf(
      "public.studio2_access_allowed('confirmation.manage', p_edition_id, false)",
      applyStart,
    );
    const receiptLookup = migration.indexOf(
      "select receipt.*\n  into v_existing_receipt",
      applyStart,
    );

    expect(migration).toContain("p_edition_id uuid");
    expect(accessCheck).toBeGreaterThan(applyStart);
    expect(receiptLookup).toBeGreaterThan(accessCheck);
    expect(migration).toContain("where round.id = p_round_id");
    expect(migration).toContain(
      "if v_round_edition_id is distinct from p_edition_id then",
    );
    expect(migration).toContain("message = 'EDITION_SCOPE_MISMATCH'");
  });

  it("forces expected edition into the original authority's persisted operation scope", () => {
    expect(migration).toContain(
      "v_payload := v_payload || jsonb_build_object('editionId', p_edition_id);",
    );
    expect(legacyAuthority).toContain(
      "'editionId', nullif(p_payload ->> 'editionId', '')",
    );
    expect(legacyAuthority).toContain("'expectedVersion', p_expected_version");
    expect(legacyAuthority).toContain("private.studio2_claim_operation(");
  });

  it("fingerprints the full V2 payload so same-key semantic drift cannot replay", () => {
    expect(migration).toContain("private.studio2_request_fingerprint(");
    expect(migration).toContain("'confirmation.round.v2.' || p_change_kind");
    expect(migration).toContain("v_semantic_scope");
    expect(migration).toContain("jsonb_build_object('payload', v_payload)");
    expect(migration).toContain(
      "nullif(v_existing_receipt.result ->> 'semanticFingerprint', '')",
    );
    expect(migration).toContain("is distinct from v_semantic_fingerprint");
  });

  it("rejects replay when edition, round, command, key, version or payload semantics drift", () => {
    expect(migration).toContain(
      "v_existing_receipt.command is distinct from v_expected_command",
    );
    expect(migration).toContain(
      "v_existing_receipt.idempotency_key is distinct from p_idempotency_key",
    );
    expect(migration).toContain("v_receipt_round_id is distinct from p_round_id");
    expect(migration).toContain(
      "v_receipt_edition_id is distinct from p_edition_id",
    );
    expect(migration).toContain(
      "v_receipt_expected_version is distinct from p_expected_version",
    );
    expect(migration).toContain("message = 'IDEMPOTENCY_CONFLICT'");
  });

  it("can reconcile a successful delete after the round itself no longer exists", () => {
    const applyStart = migration.indexOf(
      "create or replace function public.studio2_apply_confirmation_round_change_v2(",
    );
    const receiptLookup = migration.indexOf(
      "select receipt.*\n  into v_existing_receipt",
      applyStart,
    );
    const roundLookup = migration.indexOf(
      "select round.edition_id\n    into v_round_edition_id",
      receiptLookup,
    );

    expect(receiptLookup).toBeGreaterThan(applyStart);
    expect(roundLookup).toBeGreaterThan(receiptLookup);
    expect(migration).toContain("if v_existing_receipt.status = 'succeeded' then");
    expect(migration).toContain("'replayed', true");
  });

  it("persists edition, receipt and semantic evidence on the authoritative successful receipt", () => {
    expect(migration).toContain("'editionId', p_edition_id");
    expect(migration).toContain("'expectedEditionId', p_edition_id");
    expect(migration).toContain("'receiptId', v_canonical_operation_id");
    expect(migration).toContain("'semanticFingerprint', v_semantic_fingerprint");
    expect(migration).toContain("update public.studio2_operation_receipts receipt");
    expect(migration).toContain("and receipt.status = 'succeeded'");
    expect(migration).toContain("if v_updated <> 1 then");
  });

  it("does not duplicate Confirmation consequences when receipt evidence is enriched", () => {
    expect(consequenceMigration).toContain(
      "after update of status on public.studio2_operation_receipts",
    );
    expect(consequenceMigration).toContain(
      "when (old.status is distinct from new.status and new.status = 'succeeded')",
    );
    expect(consequenceMigration).toContain(
      "elsif new.command like 'confirmation.round.%' then",
    );
  });

  it("keeps the new SECURITY DEFINER RPCs narrowly exposed", () => {
    expect(migration).toContain("set search_path = pg_catalog");
    expect(migration).toContain(
      "from public, anon, authenticated, service_role",
    );
    expect(migration).toContain("to authenticated;");
  });
});
