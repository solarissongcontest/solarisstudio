import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stagedHostedSync } from "./stage-v3-hosted-result-sync.mjs";
import { extractDefinition } from "./v3-s13-s14-authorization-dependencies.mjs";
test("reconstruct only the observed existing source routine, not an alternative Results engine", () => {
  const sql = stagedHostedSync();
  const source = readFileSync(
    new URL(
      "../supabase/migrations/20261003195500_organisation_os_v5_jury_result_truth.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.ok(sql.includes(extractDefinition(source, "public.sync_show_results_from_votes")));
  assert.equal((sql.match(/create or replace function/gi) || []).length, 1);
  assert.match(sql, /already exists; refuse overwrite/);
  assert.match(sql, /4deff875c74e40bb6ba7642cb449cdaa91c45ae157f55a430ae7f53f31e5c541/);
  assert.match(sql, /8301a60a5e193323662e184637092810/);
  assert.match(sql, /p\.proconfig=array\['search_path=public, pg_temp'\]/);
  assert.match(sql, /p\.proacl::text='\{postgres=X\/postgres,service_role=X\/postgres\}'/);
  assert.match(sql, /^begin;/);
  assert.match(sql, /commit;\s*$/);
});
test("ordered acceptance retains source authority and an explicit Results boundary", () => {
  const sql = readFileSync(
    new URL("../.github/tests/v3-ordered-televote-recovery.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /insufficient_privilege/);
  assert.match(sql, /anon','authenticated','service_role/);
  assert.doesNotMatch(sql, /create or replace function|disable trigger|drop table/i);
});
