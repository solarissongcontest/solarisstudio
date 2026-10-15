import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261015060000_v3_s3_entry_invariants.sql",
  "utf8",
);

describe("System V3 S3 Entry invariants", () => {
  it("repairs only missing owned pointers through the canonical version trigger", () => {
    expect(migration).toContain("set artist = entry.artist");
    expect(migration).toContain("entry.current_version_id is null");
    expect(migration).toContain("join public.submissions submission");
    expect(migration).not.toContain("update private.v3_entry_versions");
  });

  it("audits current pointers, lineage, content hashes and exact reviews", () => {
    expect(migration).toContain("invalid immutable version chain");
    expect(migration).toContain("invalid internal Entry current pointer");
    expect(migration).toContain("invalid National Final Entry current pointer");
    expect(migration).toContain("review is not bound to the exact current version");
  });

  it("enforces append-only version lineage before insert", () => {
    expect(migration).toContain("v3_guard_entry_version_lineage");
    expect(migration).toContain("v_parent.revision is distinct from new.revision - 1");
    expect(migration).toContain("Entry version content hash does not match immutable content");
  });

  it("validates public pointers after canonical row triggers finish", () => {
    expect(migration).toContain("create constraint trigger v3_s3_validate_internal_entry_pointer");
    expect(migration).toContain("create constraint trigger v3_s3_validate_nf_entry_pointer");
    expect(migration).toContain("deferrable initially immediate");
    expect(migration).toContain("latest exact immutable content version");
  });

  it("keeps public review history bound to the same Entry scope", () => {
    expect(migration).toContain("v3_validate_review_history_scope");
    expect(migration).toContain("version.submission_id = new.submission_id");
    expect(migration).toContain("Review history version is outside its Entry scope");
  });
});
