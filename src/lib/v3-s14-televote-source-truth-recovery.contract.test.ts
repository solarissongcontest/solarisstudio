import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const candidate = readFileSync(
  resolve("docs/v3/recovery-candidates/forward-only-s14-televote-source-truth-local.sql"),
  "utf8",
);

describe("S14 Televote source-truth recovery candidate", () => {
  test("stays staged and composes with the separately owned provenance guard", () => {
    expect(candidate).not.toContain("supabase/migrations");
    expect(candidate).toContain("v3_guard_source_managed_televote_projection");
    expect(candidate).toContain("S14 source-truth recovery requires");
  });

  test("contains the canonical source adapters and bounded projection contract", () => {
    expect(candidate).toContain("v3_apply_published_televote_projection");
    expect(candidate).toContain("v3_sync_published_televote_round");
    expect(candidate).toContain("v3_sync_published_televote_aggregation");
    expect(candidate).toContain("studio2_televote_projection_status");
    expect(candidate).toContain("IDEMPOTENCY_CONFLICT");
    expect(candidate).toContain("STALE_VERSION");
    expect(candidate).not.toContain("solaris.v3_televote_projection_write");
  });
});
