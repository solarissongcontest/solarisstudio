import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const envelopeMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019205300_v3_media_review_operation_envelope.sql",
  ),
  "utf8",
);

const consequenceMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261016050000_v3_s5_media_review_consequences.sql",
  ),
  "utf8",
);

describe("V3 Media Review operation envelope", () => {
  it("adopts the S13 forward migration contract without replacing the compatibility RPC", () => {
    expect(envelopeMigration).toContain("v3_register_migration_contract");
    expect(envelopeMigration).toContain(
      "'20261019205300_v3_media_review_operation_envelope'",
    );
    expect(envelopeMigration).toContain("'forward_fix_only'");
    expect(envelopeMigration).toContain(
      "create or replace function public.studio2_review_media_assets_v3(",
    );
    expect(envelopeMigration).not.toContain(
      "drop function public.studio2_review_media_assets(uuid, jsonb, text)",
    );
    expect(consequenceMigration).toContain(
      "create or replace function public.studio2_review_media_assets(",
    );
  });

  it("requires caller-owned operation and idempotency identity", () => {
    expect(envelopeMigration).toContain("p_operation_id uuid");
    expect(envelopeMigration).toContain("p_idempotency_key text");
    expect(envelopeMigration).toContain("p_correlation_id uuid default null");
    expect(envelopeMigration).toContain("private.studio2_claim_operation(");
    expect(envelopeMigration).toContain("'media.review'");
    expect(envelopeMigration).toContain("v_semantic_request");
    expect(envelopeMigration).toContain("'reviews', p_reviews");
    expect(envelopeMigration).toContain("'reason', v_reason");
  });

  it("keeps the existing canonical Media Review writer and event consequences", () => {
    expect(envelopeMigration).toContain(
      "public.studio2_review_media_assets_legacy_impl(",
    );
    expect(envelopeMigration).toContain("private.studio2_complete_operation(");
    expect(consequenceMigration).toContain("new.command <> 'media.review'");
    expect(consequenceMigration).toContain("'media.reviewed'");
    expect(consequenceMigration).toContain("array['media.tasks']::text[]");
  });

  it("returns an authoritative receipt envelope and replays completed operations", () => {
    expect(envelopeMigration).toContain("'operationId', v_canonical_operation_id");
    expect(envelopeMigration).toContain("'receiptId', v_canonical_operation_id");
    expect(envelopeMigration).toContain("'editionId', p_edition_id");
    expect(envelopeMigration).toContain("'reviews', v_result");
    expect(envelopeMigration).toContain("'serverTime', now()");
    expect(envelopeMigration).toContain("'replayed', true");
    expect(envelopeMigration).toContain("'replayed', false");
  });

  it("fails closed for every replayed non-success state instead of re-entering the writer", () => {
    const replayBranch = envelopeMigration.slice(
      envelopeMigration.indexOf(
        "if coalesce((v_claim ->> 'replayed')::boolean, false) then",
      ),
      envelopeMigration.indexOf(
        "if v_claim_status is distinct from 'processing' then",
      ),
    );

    expect(replayBranch).toContain("if v_claim_status = 'succeeded' then");
    expect(replayBranch).toContain("'ok', false");
    expect(replayBranch).toContain("'status', coalesce(v_claim_status, 'unknown')");
    expect(replayBranch).not.toContain("studio2_review_media_assets_legacy_impl");
    expect(envelopeMigration).toContain(
      "if v_claim_status is distinct from 'processing' then",
    );
  });

  it("keeps the SECURITY DEFINER surface narrow", () => {
    expect(envelopeMigration).toContain("security definer");
    expect(envelopeMigration).toContain("set search_path = pg_catalog");
    expect(envelopeMigration).toContain("private.studio2_can_manage_media_assets");
    expect(envelopeMigration).toContain(
      "from public, anon, authenticated, service_role",
    );
    expect(envelopeMigration).toContain("to authenticated;");
  });
});
