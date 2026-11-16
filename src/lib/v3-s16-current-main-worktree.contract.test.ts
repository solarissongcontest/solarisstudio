import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../../.github/workflows/v3-s16-catalog-rehearsal.yml", import.meta.url),
  "utf8",
);

describe("S16 current-main evidence isolation", () => {
  it("audits an exact-main source checkout distinct from mutable local Supabase runtime", () => {
    expect(workflow).toContain('git worktree add "$runtime" "$baseline_sha"');
    expect(workflow).toContain('git worktree add "$source_dir" "$baseline_sha"');
    expect(workflow).toContain('echo "V3_S16_SOURCE_DIR=$source_dir" >> "$GITHUB_ENV"');
    expect(workflow).toContain('(cd "$V3_S16_SOURCE_DIR" && bash .github/scripts/v3-s16-catalog-rehearsal.sh)');
    expect(workflow).not.toContain('(cd "$V3_S16_RUNTIME_DIR" && bash .github/scripts/v3-s16-catalog-rehearsal.sh)');
  });

  it("binds both worktrees to the same exact SHA without borrowing candidate migrations", () => {
    expect(workflow).toContain('git -C "$V3_S16_SOURCE_DIR" rev-parse HEAD');
    expect(workflow).toContain('git -C "$V3_S16_RUNTIME_DIR" rev-parse HEAD');
    expect(workflow).toContain('"$V3_S16_SOURCE_SHA"');
    expect(workflow).not.toContain("v3-copy-migration-delta.sh");
    expect(workflow).toContain("supabase db reset --local --no-seed");
    expect(workflow).toContain('bash .github/scripts/v3-start-disposable-supabase.sh');
  });

  it("labels artifacts with their audited source SHA and preserves non-certification", () => {
    expect(workflow).toContain('name: s16-catalog-${{ matrix.baseline }}-${{ env.V3_S16_SOURCE_SHA }}');
    expect(workflow).toContain("not release certification");
  });
});
