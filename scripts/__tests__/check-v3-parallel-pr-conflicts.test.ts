import { describe, expect, test } from "bun:test";
import {
  analyzeParallelConflicts,
  hasDeclaredDependency,
  isRedZonePath,
  isV3PullRequest,
  migrationContractKeysFromPatch,
  type PullRequestWithFiles,
} from "../check-v3-parallel-pr-conflicts";

function pr(
  number: number,
  options: Partial<PullRequestWithFiles> = {},
): PullRequestWithFiles {
  return {
    number,
    title: `[V3-QA] PR ${number}`,
    body: null,
    head: { ref: `v3/qa-${number}` },
    base: { ref: "main" },
    files: [],
    migrationContractKeys: [],
    ...options,
  };
}

describe("V3 parallel PR conflict policy", () => {
  test("recognizes V3 PRs by branch or title", () => {
    expect(isV3PullRequest(pr(1))).toBe(true);
    expect(
      isV3PullRequest(pr(2, { title: "Ordinary title", head: { ref: "v3/public-results" } })),
    ).toBe(true);
    expect(
      isV3PullRequest(pr(3, { title: "Ordinary title", head: { ref: "fix/something" } })),
    ).toBe(false);
  });

  test("classifies coordination-sensitive paths as red-zone", () => {
    expect(isRedZonePath("package.json")).toBe(true);
    expect(isRedZonePath("tsconfig.app.json")).toBe(true);
    expect(isRedZonePath(".github/workflows/ci.yml")).toBe(true);
    expect(isRedZonePath(".github/scripts/v3-rehearsal.sh")).toBe(true);
    expect(isRedZonePath("supabase/migrations/20261023000000_change.sql")).toBe(true);
    expect(isRedZonePath("src/lib/v3-capability-registry.ts")).toBe(true);
    expect(isRedZonePath("src/lib/v3-public-capability-registry.ts")).toBe(true);
    expect(isRedZonePath("src/lib/v3-organizer-capability-registry.ts")).toBe(true);
    expect(isRedZonePath("src/routeTree.gen.ts")).toBe(true);
    expect(isRedZonePath("src/styles/tokens.css")).toBe(true);
    expect(isRedZonePath("src/routes/explore.tsx")).toBe(false);
  });

  test("extracts S13 semantic migration keys only from migration SQL patches", () => {
    const patch = `@@ -0,0 +1,8 @@
+select public.v3_register_migration_contract(
+  'v3.results.jury-share-edition-theme-v1',
+  1,
+  'forward_fix_only'
+);
+select public.v3_register_migration_contract('v3.results.second-key-v1', 1, 'forward_fix_only');`;

    expect(
      migrationContractKeysFromPatch(
        "supabase/migrations/20261023000000_jury_share_theme.sql",
        patch,
      ),
    ).toEqual([
      "v3.results.jury-share-edition-theme-v1",
      "v3.results.second-key-v1",
    ]);
    expect(migrationContractKeysFromPatch("src/lib/not-a-migration.ts", patch)).toEqual([]);
    expect(
      migrationContractKeysFromPatch(
        "supabase/migrations/20261023000000_jury_share_theme.sql",
        undefined,
      ),
    ).toEqual([]);
  });

  test("blocks undeclared red-zone overlap", () => {
    const conflicts = analyzeParallelConflicts(
      pr(10, { files: ["package.json", "scripts/a.ts"] }),
      [pr(11, { files: ["package.json", "scripts/b.ts"] })],
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.redZoneFiles).toEqual(["package.json"]);
    expect(conflicts[0]?.blocking).toBe(true);
  });

  test("blocks duplicate migration-file ownership even before semantic keys are considered", () => {
    const migration = "supabase/migrations/20261023000000_change.sql";
    const conflicts = analyzeParallelConflicts(
      pr(14, { files: [migration] }),
      [pr(15, { files: [migration] })],
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.redZoneFiles).toEqual([migration]);
    expect(conflicts[0]?.blocking).toBe(true);
  });

  test("blocks duplicate S13 semantic authority even when migration filenames differ", () => {
    const semanticKey = "v3.results.jury-share-edition-theme-v1";
    const conflicts = analyzeParallelConflicts(
      pr(12, {
        files: ["supabase/migrations/20261023205700_theme_a.sql"],
        migrationContractKeys: [semanticKey],
      }),
      [
        pr(13, {
          files: ["supabase/migrations/20261023221000_theme_b.sql"],
          migrationContractKeys: [semanticKey],
        }),
      ],
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.overlappingFiles).toEqual([]);
    expect(conflicts[0]?.semanticMigrationKeys).toEqual([semanticKey]);
    expect(conflicts[0]?.blocking).toBe(true);
  });

  test("reports ordinary overlap without blocking", () => {
    const conflicts = analyzeParallelConflicts(
      pr(20, { files: ["src/routes/results.tsx"] }),
      [pr(21, { files: ["src/routes/results.tsx"] })],
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.blocking).toBe(false);
    expect(conflicts[0]?.redZoneFiles).toEqual([]);
    expect(conflicts[0]?.semanticMigrationKeys).toEqual([]);
  });

  test("declared dependency exempts an intentional red-zone stack", () => {
    const current = pr(30, {
      body: "Depends on #31",
      files: [".github/workflows/ci.yml"],
    });
    const peer = pr(31, { files: [".github/workflows/ci.yml"] });

    expect(hasDeclaredDependency(current, peer)).toBe(true);
    const conflicts = analyzeParallelConflicts(current, [peer]);
    expect(conflicts[0]?.dependencyDeclared).toBe(true);
    expect(conflicts[0]?.blocking).toBe(false);
  });

  test("declared dependency also exempts intentional reuse of one semantic migration key", () => {
    const semanticKey = "v3.example.parent-owned-v1";
    const current = pr(32, {
      body: "Stacked on #33",
      files: ["supabase/migrations/20261023000001_child.sql"],
      migrationContractKeys: [semanticKey],
    });
    const peer = pr(33, {
      files: ["supabase/migrations/20261023000000_parent.sql"],
      migrationContractKeys: [semanticKey],
    });

    const conflicts = analyzeParallelConflicts(current, [peer]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.semanticMigrationKeys).toEqual([semanticKey]);
    expect(conflicts[0]?.dependencyDeclared).toBe(true);
    expect(conflicts[0]?.blocking).toBe(false);
  });

  test("recognizes repository dependency wording used by parallel V3 PRs", () => {
    const peer = pr(61, { files: [".github/workflows/ci.yml"] });
    for (const body of [
      "Requires #61",
      "Requires System #61",
      "Parent: #61",
      "Blocked by #61",
      "Stacked after #61",
      "Child of #61",
    ]) {
      const current = pr(60, {
        body,
        files: [".github/workflows/ci.yml"],
      });
      expect(hasDeclaredDependency(current, peer), body).toBe(true);
      expect(analyzeParallelConflicts(current, [peer])[0]?.blocking, body).toBe(false);
    }
  });

  test("direct branch stacking exempts intentional overlap", () => {
    const peer = pr(41, {
      head: { ref: "v3/sys-foundation" },
      files: ["package.json"],
    });
    const current = pr(40, {
      base: { ref: "v3/sys-foundation" },
      files: ["package.json"],
    });

    expect(hasDeclaredDependency(current, peer)).toBe(true);
    expect(analyzeParallelConflicts(current, [peer])[0]?.blocking).toBe(false);
  });

  test("ignores non-V3 and peers with no file or semantic overlap", () => {
    const current = pr(50, {
      files: ["package.json"],
      migrationContractKeys: ["v3.current-only-v1"],
    });
    const nonV3 = pr(51, {
      title: "Maintenance",
      head: { ref: "fix/maintenance" },
      files: ["package.json"],
    });
    const unrelated = pr(52, {
      files: ["src/routes/home.tsx"],
      migrationContractKeys: ["v3.peer-only-v1"],
    });

    expect(analyzeParallelConflicts(current, [nonV3, unrelated])).toEqual([]);
  });
});
