import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261015070000_v3_s3_media_invariants.sql",
  "utf8",
);

describe("System V3 S3 Media invariants", () => {
  it("audits before adding enforcement and refuses to guess a repair", () => {
    expect(migration).toContain("Media invariant audit failed: invalid asset scope");
    expect(migration).toContain("active review does not reference the current source");
    expect(migration).toContain("fails closed if drift appears before rollout");
  });

  it("stages and validates scope, timeline and accepted-source constraints", () => {
    expect(migration).toContain("studio2_media_asset_reviews_scope_check");
    expect(migration).toContain("studio2_media_asset_reviews_timeline_check");
    expect(migration).toContain("studio2_media_asset_reviews_approved_source_check");
    expect(migration.match(/not valid/g)).toHaveLength(3);
    expect(migration.match(/validate constraint/g)).toHaveLength(3);
  });

  it("makes review evidence immutable except for one-way supersession", () => {
    expect(migration).toContain("v3_guard_media_asset_review");
    expect(migration).toContain("Media review history is immutable");
    expect(migration).toContain("only transition once from active to superseded");
    expect(migration).toContain("Media review timestamp cannot be in the future");
    expect(migration).toContain("exact current canonical source");
  });

  it("invalidates active decisions when their canonical source changes", () => {
    expect(migration).toContain("v3_supersede_stale_media_reviews");
    expect(migration).toContain("after update of song_url, metadata on public.entries");
    expect(migration).toContain("after update of flag_image on public.countries");
    expect(migration).toContain("after update of logo on public.editions");
  });

  it("exposes one private accepted-current predicate without a second asset store", () => {
    expect(migration).toContain("private.v3_media_asset_is_currently_accepted");
    expect(migration).toContain("review.decision = 'approved'");
    expect(migration).not.toContain("create table public.media_assets");
    expect(migration).not.toContain("create table public.media_asset_revisions");
  });
});
