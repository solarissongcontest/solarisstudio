import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Solaris V6 result lifecycle authority retirement", () => {
  it("defines one governed lifecycle and release-readiness helper", () => {
    const service = source("src/lib/studio2-results-operations.ts");

    expect(service).toContain("STUDIO2_RESULT_LIFECYCLE");
    expect(service).toContain("loadStudio2ResultsOperations");
    expect(service).toContain("isStudio2ResultReleaseReady");
    expect(service).toContain("row.reviewedVersion === version");
    expect(service).toContain("row.lockedVersion === version");
    expect(service).toContain("row.revealReadyVersion === version");
  });

  it("makes Results Operations consume the canonical service instead of scoring tables directly", () => {
    const route = source("src/routes/_authenticated/admin/results.tsx");

    expect(route).toContain("loadStudio2ResultsOperations");
    expect(route).toContain("executeStudio2ResultOperation");
    expect(route).toContain("availableStudio2ResultActions");
    expect(route).not.toContain(".from('results')");
    expect(route).not.toContain('.from("results")');
    expect(route).not.toContain(".from('jury_votes')");
    expect(route).not.toContain(".from('televote_votes')");
  });

  it("makes Publication consume the same result snapshot and readiness decision", () => {
    const publication = source(
      "src/routes/_authenticated/admin/publication/$slug.tsx",
    );

    expect(publication).toContain("loadStudio2ResultsOperations");
    expect(publication).toContain("isStudio2ResultReleaseReady");
    expect(publication).toContain(
      'queryKey: ["studio2-results-operations", edition?.id ?? "none"]',
    );
    expect(publication).toContain("resultOperationByShow");
    expect(publication).not.toContain("STUDIO2_RESULT_LIFECYCLE");
  });

  it("keeps versioning, idempotency and stale-write rejection server-authoritative", () => {
    const migration = source(
      "supabase/migrations/20260912154500_studio2_results_operations.sql",
    );

    expect(migration).toContain("execution_id uuid not null unique");
    expect(migration).toContain(
      "p_expected_version <> v_ops.calculation_version",
    );
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("studio2_result_operation_executions");
    expect(migration).not.toContain(
      "create table if not exists public.studio2_results",
    );
  });
});
