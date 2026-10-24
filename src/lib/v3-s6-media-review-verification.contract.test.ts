import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019212000_v3_s6_media_review_verification.sql",
  ),
  "utf8",
);

function verifierBody() {
  const marker = "create or replace function public.studio2_verify_media_review_projection(";
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf("\nrevoke all on function", start + marker.length);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe("System V3 S6 Media review projection verification", () => {
  it("declares an S13 forward-only contract", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.s6.media-review-verification'");
    expect(migration).toContain("'forward_fix_only'");
  });

  it("bounds active review verification before resolving canonical sources", () => {
    const body = verifierBody();
    expect(body).toContain("p_review_limit > 1000");
    expect(body).toContain("limit p_review_limit + 1");
    expect(body).toContain("'verification_bound_exceeded'");
    expect(body.indexOf("'verification_bound_exceeded'")).toBeLessThan(
      body.indexOf("private.studio2_resolve_media_asset_source("),
    );
  });

  it("compares active immutable review evidence to the canonical Media source resolver", () => {
    const body = verifierBody();
    expect(body).toContain("public.studio2_media_asset_reviews");
    expect(body).toContain("review.superseded_at is null");
    expect(body).toContain("private.studio2_resolve_media_asset_source(");
    expect(body).toContain("'canonical_source_unresolvable'");
    expect(body).toContain("'canonical_source_missing'");
    expect(body).toContain("'source_fingerprint_drift'");
    expect(body).toContain("'approved_source_not_http'");
  });

  it("is read-only and never fabricates Media or storage recovery", () => {
    const body = verifierBody();
    expect(body).toContain("stable");
    expect(body).not.toMatch(/\binsert\s+into\b/i);
    expect(body).not.toMatch(/\bupdate\s+[a-z0-9_.\"]+\s+set\b/i);
    expect(body).not.toMatch(/\bdelete\s+from\b/i);
    expect(body).not.toContain("storage.objects");
    expect(body).toContain("'rebuildAvailable', false");
    expect(body).toContain(
      "'external_object_bytes_are_not_reconstructible_from_review_metadata'",
    );
  });

  it("makes the external-object verification gap explicit instead of claiming full recovery", () => {
    const body = verifierBody();
    expect(body).toContain("'coverage', 'relational_review_projection'");
    expect(body).toContain("'requires_external_object_verification'");
    expect(body).toContain("'not_applicable'");
    expect(body).toContain("'verified_relational_projection'");
  });

  it("keeps the verifier service-only", () => {
    expect(migration).toContain(
      "revoke all on function public.studio2_verify_media_review_projection(uuid, integer)",
    );
    expect(migration).toContain("from public, anon, authenticated;");
    expect(migration).toContain(
      "grant execute on function public.studio2_verify_media_review_projection(uuid, integer)",
    );
    expect(migration).toContain("to service_role;");
  });
});
