import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { extractDefinition } from "./v3-s13-s14-authorization-dependencies.mjs";
const name = "televoting.v3_commit_official_round_calculation";
const original = readFileSync(
  "supabase/migrations/20261103004500_v3_s14_atomic_televote_calculation.sql",
  "utf8",
);
const file = readdirSync("supabase/migrations").find((x) =>
  x.endsWith("_v3_atomic_calculation_actor_binding.sql"),
);
const forward = readFileSync("supabase/migrations/" + file, "utf8");
test("forward repair preserves the entire canonical scoring implementation", () => {
  const fn = extractDefinition(forward, name);
  const restored = fn.replace(/  -- PostgreSQL's effective role[\s\S]*?^  end if;\n\n/m, "");
  assert.equal(restored, extractDefinition(original, name));
  assert.match(fn, /p_calculated_by is distinct from auth\.uid\(\)/);
  assert.match(fn, /current_user = 'authenticated'/);
  assert.ok(fn.indexOf("using errcode = '42501'") < fn.indexOf("for update;"));
  assert.doesNotMatch(fn, /security definer/);
});
test("migration refuses unknown installed code and does not alter table or RPC privileges", () => {
  assert.match(forward, /p\.prosrc is distinct from \$expected_actor_source\$/);
  assert.match(forward, /p\.prosecdef/);
  assert.match(forward, /pg_get_userbyid\(p.proowner\)<>'postgres'/);
  assert.match(forward, /v3_register_migration_contract/);
  assert.doesNotMatch(forward, /grant |revoke |create policy|alter table|drop policy/i);
});
