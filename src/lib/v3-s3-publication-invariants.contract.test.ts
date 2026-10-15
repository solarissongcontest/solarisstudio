import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261015164100_v3_s3_publication_invariants.sql",
  "utf8",
);
const rehearsal = readFileSync(
  ".github/scripts/v3-s3-publication-invariants-rehearsal.sh",
  "utf8",
);

describe("System V3 S3 Publication invariants", () => {
  it("preserves legacy evidence instead of fabricating publication versions", () => {
    expect(migration).toContain(
      "Existing public outcome rows predate versioned result evidence",
    );
    expect(migration).not.toMatch(
      /update\s+public\.studio2_show_publication_controls[\s\S]{0,500}source_result_version\s*=/i,
    );
  });

  it("binds modern publication to the exact immutable finalized result version", () => {
    expect(migration).toContain(
      "private.v3_publication_result_version_release_ready",
    );
    expect(migration).toContain("operation.calculation_version = p_version");
    expect(migration).toContain("operation.reviewed_version = p_version");
    expect(migration).toContain("operation.locked_version = p_version");
    expect(migration).toContain("operation.reveal_ready_version = p_version");
    expect(migration).toContain("operation.reviewed_at is not null");
    expect(migration).toContain("operation.locked_at is not null");
    expect(migration).toContain("operation.reveal_ready_at is not null");
    expect(migration).toContain("join private.v3_result_versions version");
  });

  it("serializes Publication against Results and protects the canonical projection", () => {
    expect(migration).toContain(
      "hashtextextended('studio2-results:' || new.show_id::text, 0)",
    );
    expect(migration).toContain("v3_validate_publication_projection_from_control");
    expect(migration).toContain("v3_validate_publication_projection_from_show");
    expect(migration).toContain("v3_validate_publication_projection_from_results");
    expect(migration).toContain("deferrable initially deferred");
  });

  it("makes scheduled execution evidence terminal and one-per-operation", () => {
    expect(migration).toContain(
      "studio2_show_publication_executions_operation_v3_uidx",
    );
    expect(migration).toContain("v3_validate_publication_execution");
    expect(migration).toContain("v3_reject_publication_execution_mutation");
    expect(migration).toContain(
      "studio2_show_publication_executions_terminal_v3_check",
    );
    expect(migration).toContain(
      "Outcome publication execution requires exact result-version provenance",
    );
    expect(migration).not.toContain(
      "check (\n    not private.studio2_publication_has_outcomes(intended_config)",
    );
  });

  it("keeps hostile verification local-only", () => {
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("Refusing non-local database rehearsal");
    expect(rehearsal).toContain("public outcome without result provenance");
    expect(rehearsal).toContain("published result invalidation");
    expect(rehearsal).toContain("execution rewrite");
  });
});
