import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261019230000_v3_media_review_receipted_command.sql',
  'utf8',
);
const client = readFileSync('src/lib/studio2-media-review-command.ts', 'utf8');
const consequenceMigration = readFileSync(
  'supabase/migrations/20261016050000_v3_s5_media_review_consequences.sql',
  'utf8',
);

describe('V3 receipted Media Review command', () => {
  it('adds caller-owned operation and idempotency identity without replacing the proven review writer', () => {
    expect(migration).toContain('public.studio2_review_media_assets_v3(');
    expect(migration).toContain('p_operation_id uuid');
    expect(migration).toContain('p_idempotency_key text');
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("'media.review'");
    expect(migration).toContain('public.studio2_review_media_assets_legacy_impl(');
  });

  it('stores the canonical review-array result so existing media consequences remain exactly-once compatible', () => {
    expect(migration).toContain('private.studio2_complete_operation(p_operation_id, v_reviews)');
    expect(migration).toContain("'reviews', v_reviews");
    expect(consequenceMigration).toContain("new.command <> 'media.review'");
    expect(consequenceMigration).toContain("jsonb_typeof(new.result) <> 'array'");
    expect(consequenceMigration).toContain("'media.reviewed'");
  });

  it('returns an authoritative receipt envelope and exact replay marker', () => {
    expect(migration).toContain("'operationId', p_operation_id");
    expect(migration).toContain("'receiptId', p_operation_id");
    expect(migration).toContain("'editionId', p_edition_id");
    expect(migration).toContain("'replayed', v_replayed");
    expect(migration).toContain("'serverTime', now()");
    expect(migration).toContain("v_claim -> 'result'");
  });

  it('keeps validation, authorization and canonical-source authority server-side', () => {
    expect(migration).toContain('jsonb_array_length(p_reviews) < 1');
    expect(migration).toContain('length(v_reason) < 5');
    expect(migration).toContain('public.studio2_review_media_assets_legacy_impl(');
    expect(consequenceMigration).toContain('private.studio2_can_manage_media_assets');
    expect(consequenceMigration).toContain(
      'studio2_review_media_assets_legacy_impl(uuid, jsonb, text)',
    );
  });

  it('lets the client reconcile a lost response by the original operation id', () => {
    expect(client).toContain("studio2_review_media_assets_v3");
    expect(client).toContain("studio2_reconcile_operation");
    expect(client).toContain("reconciliation.command !== 'media.review'");
    expect(client).toContain("reconciliation.status !== 'succeeded'");
    expect(client).toContain('createMediaReviewOperationIdentity');
    expect(client).toContain('reviewStudio2MediaAssetsV3');
    expect(client).not.toContain('new Date().toISOString()');
  });

  it('rejects receipts from another operation or edition instead of trusting a successful transport', () => {
    expect(client).toContain('operationId !== expected.operationId');
    expect(client).toContain('receiptId !== expected.operationId');
    expect(client).toContain('editionId !== expected.editionId');
    expect(client).toContain('returnedEditionId !== editionId');
  });

  it('never exposes the new command to anonymous callers', () => {
    expect(migration).toContain(
      'revoke all on function public.studio2_review_media_assets_v3(\n  uuid, jsonb, text, uuid, text\n) from public, anon',
    );
    expect(migration).toContain(
      'grant execute on function public.studio2_review_media_assets_v3(\n  uuid, jsonb, text, uuid, text\n) to authenticated, service_role',
    );
  });
});
