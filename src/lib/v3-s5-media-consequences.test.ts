import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { v3DomainConsequence } from "./v3-domain-consequence-registry";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source(
  "supabase/migrations/20261016050000_v3_s5_media_review_consequences.sql",
);
const verificationMigration = source(
  "supabase/migrations/20261027211600_v3_media_verified_byte_identity.sql",
);
const registry = source("src/lib/v3-domain-consequence-registry.ts");

describe("System V3 S5 Media consequences", () => {
  it("preserves the existing media review RPC contract while moving it behind an operation ledger", () => {
    expect(migration).toContain(
      "alter function public.studio2_review_media_assets(uuid, jsonb, text)",
    );
    expect(migration).toContain("rename to studio2_review_media_assets_legacy_impl");
    expect(migration).toContain("create or replace function public.studio2_review_media_assets(");
    expect(migration).toContain("private.studio2_request_fingerprint");
    expect(migration).toContain("'media.review'");
    expect(migration).toContain("public.studio2_operation_receipts");
  });

  it("derives stable retry identity without trusting a legacy browser-generated operation id", () => {
    expect(migration).toContain("'actor', coalesce(v_actor::text, 'service_role')");
    expect(migration).toContain("'reviews', p_reviews");
    expect(migration).toContain("'reason', v_reason");
    expect(migration).toContain("substr(v_fingerprint, 1, 8)");
    expect(migration).toContain("v_receipt.request_fingerprint is distinct from v_fingerprint");
    expect(migration).toContain("if v_receipt.status = 'succeeded' then");
  });

  it("removes the legacy implementation as a callable bypass", () => {
    expect(migration).toContain(
      "revoke all on function public.studio2_review_media_assets_legacy_impl(uuid, jsonb, text)",
    );
    expect(migration).toContain("from public, anon, authenticated, service_role");
    expect(migration).toContain("private.studio2_platform_mutation_allowed('media.review')");
  });

  it("emits one privacy-safe media.reviewed fact per durable review row", () => {
    expect(migration).toContain("new.command <> 'media.review'");
    expect(migration).toContain("jsonb_array_elements(new.result)");
    expect(migration).toContain("'media.reviewed'");
    expect(migration).toContain("'media_review'");
    expect(migration).toContain("review_row.id = v_review_id");
    expect(migration).toContain("review_row.edition_id = v_edition_id");
    expect(migration).not.toContain("'sourceFingerprint', v_item");
    expect(migration).not.toContain("'reason', v_item");
  });

  it("uses the shared replay-safe outbox consumer contract for media review task reconciliation", () => {
    expect(migration).toContain("array['media.tasks']::text[]");
    expect(migration).toContain("private.v3_domain_event_consumer_receipts");
    expect(migration).toContain("v_delivery.lease_owner is distinct from p_worker_id");
    expect(migration).toContain("private.studio2_reconcile_all_organizer_tasks");
    expect(migration).toContain("private.studio2_sync_task_notifications");
    expect(migration).toContain("private.studio2_prune_stale_task_notifications");
    expect(migration).toContain("private.studio2_request_is_service_role()");
  });

  it("backs media.verified with the canonical finalization transaction rather than an async second authority", () => {
    const verified = v3DomainConsequence("media.verified");
    expect(verified).not.toBeNull();
    expect(verified?.implementationState).toBe("event-backed");
    expect(verified?.consumers).toEqual([]);
    expect(verified?.taskEffects).toEqual([]);
    expect(verified?.notificationEffects).toEqual([]);
    expect(verified?.publicationEffects).toEqual([]);
    expect(verified?.realtimeEffects).toEqual([]);
    expect(verified?.analyticsEffects).toEqual(["domain-event:media.verified"]);
    expect(registry).toContain('"media.verified": [');
    expect(registry).toContain("EVENTS_WITHOUT_REQUIRED_ASYNC_CONSEQUENCES");
  });

  it("binds media.verified to exact bytes, a canonical receipt, and no required outbox consumer", () => {
    expect(verificationMigration).toContain("'media.verified'");
    expect(verificationMigration).toContain("'publishedSha256'");
    expect(verificationMigration).toContain("'storageObjectId'");
    expect(verificationMigration).toContain("public.v3_read_media_finalization_receipt");
    expect(verificationMigration).toContain("array[]::text[]");
    expect(verificationMigration).toContain("revoke insert, update, delete, truncate");
  });
});
