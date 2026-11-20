import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(new URL("../.github/workflows/v3-public-result-snapshot-rehearsal.yml", import.meta.url), "utf8");

function job(name) {
  const start = workflow.indexOf("\n  " + name + ":\n");
  assert.ok(start >= 0, name + " job missing");
  const next = workflow.indexOf("\n  " + (name === "clean-replay" ? "upgrade-from-main" : "unused") + ":\n", start + 1);
  return workflow.slice(start, next < 0 ? undefined : next);
}

for (const name of ["clean-replay", "upgrade-from-main"]) {
  test(name + " proves local database authority before every mutation", () => {
    const source = job(name);
    const start = source.indexOf("supabase start");
    const apiCheck = source.indexOf('[[ "$API_URL" == "http://127.0.0.1:54321" ]]');
    const dbCheck = source.indexOf('bun run "$GITHUB_WORKSPACE/scripts/check-v3-production-isolation.ts"');
    const reset = source.indexOf("supabase db reset --local --no-seed");
    const rehearsal = source.indexOf("rehearse-v3-public-result-snapshot.sh", reset);
    assert.ok(start >= 0 && apiCheck > start && dbCheck > apiCheck, "local URL and libpq authority checks precede replay");
    assert.ok(reset > dbCheck && rehearsal > reset, "nothing mutates or rehearses before local-only authority proof");
    assert.ok(source.includes("export DATABASE_URL=\"$DB_URL\""), "database URL must reach the isolation guard");
    for (const key of ["VITE_SUPABASE_URL", "SUPABASE_URL", "E2E_SUPABASE_URL",
      "VITE_CONFIRMATIONS_SUPABASE_URL", "CONFIRMATIONS_SUPABASE_URL"]) {
      assert.ok(source.includes("export " + key + "=\"$API_URL\""), key + " must be covered");
    }
    assert.ok(source.includes("node --test scripts/v3-public-result-snapshot-workflow.contract.mjs"));
    assert.ok(source.includes("git rev-parse HEAD"), "candidate identity must be checked");
  });
}

test("the snapshot rehearsal never requests hosted or production-side database operations", () => {
  assert.ok(workflow.includes("supabase/setup-cli@v1"));
  assert.ok(workflow.includes("v3-copy-migration-delta.sh"));
  assert.ok(workflow.includes("supabase migration up --local --include-all"));
  for (const unsafe of ["supabase db push", "supabase link", "supabase.co", "SUPABASE_ACCESS_TOKEN",
    "supabase db reset --linked"]) {
    assert.ok(!workflow.includes(unsafe), "unsafe operation or hosted authority: " + unsafe);
  }
});
