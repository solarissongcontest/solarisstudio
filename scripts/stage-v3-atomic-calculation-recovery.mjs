// LOCAL recovery candidate, not deployment authorization. No network/DB client.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { transactionBody } from "./stage-v3-s07-televote-source-truth.mjs";
export const ATOMIC_REFERENCE =
  "docs/v3/recovery-candidates/evidence/atomic-after-ordered-recovery-local-reference.json";
export const ATOMIC_SOURCES = [
  "supabase/migrations/20261103004500_v3_s14_atomic_televote_calculation.sql",
  "supabase/migrations/20261113211759_v3_atomic_calculation_actor_binding.sql",
];
export const UPSTREAM_SOURCES = [
  "docs/v3/recovery-candidates/forward-only-s13-foundation.sql",
  "docs/v3/recovery-candidates/forward-only-s14-archive-integrated-local.sql",
  "scripts/stage-v3-s07-televote-source-truth.mjs",
  "docs/v3/recovery-candidates/s07-televote-managed-source-guard.sql",
  "supabase/migrations/20261017001000_v3_s14_televote_result_truth.sql",
  "supabase/migrations/20261017001020_v3_s14_televote_projection_replay_hardening.sql",
  "supabase/migrations/20261108004000_v3_s14_signed_combined_projection.sql",
  ...ATOMIC_SOURCES,
];
export const ATOMIC_RELATIONS = [
  "televoting.round_entries",
  "televoting.round_influence_results",
  "televoting.round_results",
  "televoting.rounds",
  "private.v3_televote_projection_write_context",
  "private.v3_televote_result_projection_sources",
];
export const ATOMIC_ROUTINES = [
  "auth.uid",
  "public.studio2_access_allowed",
  "private.v3_apply_published_televote_projection",
  "private.v3_sync_published_televote_round",
  "private.v3_guard_source_managed_televote_projection",
  "private.v3_sync_published_televote_round_trigger",
  "televoting.flag_round_results_outdated",
];
const identity = (x) => x.schema_name + "." + x.object_name;
export function validateAtomicReference(reference, root = process.cwd()) {
  assert.equal(reference.kind, "local-derived-after-ordered-recovery-not-hosted-adoption");
  assert.equal(reference.hostedEquivalenceCertified, false);
  assert.equal(reference.pg_version_num, 170011);
  assert.match(reference.measuredCandidateSha, /^[a-f0-9]{40}$/);
  assert.equal(reference.relations.length, 6);
  assert.equal(reference.routines.length, 7);
  assert.deepEqual(reference.relations.map(identity).sort(), [...ATOMIC_RELATIONS].sort());
  assert.deepEqual(reference.routines.map(identity).sort(), [...ATOMIC_ROUTINES].sort());
  assert.deepEqual(
    Object.keys(reference.upstreamSourceSha256).sort(),
    [...UPSTREAM_SOURCES].sort(),
  );
  for (const path of UPSTREAM_SOURCES)
    assert.equal(
      createHash("sha256")
        .update(readFileSync(resolve(root, path)))
        .digest("hex"),
      reference.upstreamSourceSha256[path],
      "Atomic upstream source drift: " + path,
    );
  const frozen = JSON.parse(
    readFileSync(
      resolve(
        root,
        "docs/v3/recovery-candidates/evidence/s06-hosted-catalog-digests-2026-11-10.json",
      ),
      "utf8",
    ),
  );
  for (const row of reference.relations) {
    const prior = frozen.relations.find((x) => identity(x) === identity(row));
    if (!prior) {
      assert.equal(row.schema_name, "private");
      assert.equal(row.owner_name, "postgres");
      assert.equal(row.object_kind, "r");
      assert.equal(row.rls_enabled, false);
      const acl =
        row.object_name === "v3_televote_projection_write_context"
          ? "{postgres=arwdDxtm/postgres}"
          : "{postgres=arwdDxtm/postgres,service_role=r/postgres}";
      assert.equal(
        row.acl_md5,
        createHash("md5").update(acl).digest("hex"),
        "Source-only projection evidence/context privilege drift",
      );
      continue;
    }
    // Only explicitly sourced Archive/S07 trigger additions distinguish these
    // tables after the preceding recovery. All other hosted properties match.
    const stable = (x) =>
      Object.fromEntries(
        Object.entries(x).filter(([key]) => !["triggers_md5", "trigger_count"].includes(key)),
      );
    assert.deepEqual(stable(row), stable(prior));
    if (row.object_name === "round_influence_results") assert.deepEqual(row, prior);
  }
  for (const row of reference.routines.filter((x) =>
    [
      "auth.uid",
      "public.studio2_access_allowed",
      "televoting.flag_round_results_outdated",
    ].includes(identity(x)),
  ))
    assert.deepEqual(
      row,
      frozen.routines.find((x) => x.signature === row.signature),
      "Existing hosted authority mismatch: " + identity(row),
    );
  return reference;
}
export function stageAtomicCalculation(root = process.cwd(), supplied) {
  const read = (path) => readFileSync(resolve(root, path), "utf8");
  const reference = validateAtomicReference(supplied ?? JSON.parse(read(ATOMIC_REFERENCE)), root);
  const catalog = read("scripts/v3-s06-hosted-catalog-digests-local.sql");
  const marker = "SELECT jsonb_build_object(\n  'pg_version_num'";
  assert.equal(catalog.split(marker).length, 2, "Catalog collector contract drift");
  const ctes = catalog.slice(catalog.indexOf("WITH relation_objects AS"), catalog.indexOf(marker));
  const tables = ATOMIC_RELATIONS.map((x) => "'" + x + "'").join(",");
  const routines = ATOMIC_ROUTINES.map((x) => "'" + x + "'").join(",");
  const expected = JSON.stringify({
    relations: reference.relations,
    routines: reference.routines,
  }).replaceAll("'", "''");
  const body = (path) => transactionBody(read(path).replace(/^(?:--[^\n]*\n|\s)+/, ""));
  return `\\set ON_ERROR_STOP on
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
do $atomic_preflight$ declare actual jsonb; begin
 if current_user<>'postgres' or current_setting('server_version_num')<>'170011' then raise exception 'Atomic recovery requires reviewed owner and PG17.11' using errcode='42501'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='televoting' and p.proname='v3_commit_official_round_calculation') then raise exception 'Atomic recovery already or partially installed' using errcode='55000'; end if;
 if to_regclass('private.v3_televote_projection_write_context') is null or to_regclass('private.v3_televote_result_projection_sources') is null or to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is null then raise exception 'Atomic recovery missing ordered S13/S07 prerequisites' using errcode='55000'; end if;
 ${ctes}
 SELECT jsonb_build_object('relations',(select jsonb_agg(to_jsonb(r) order by schema_name,object_name) from relation_objects r where schema_name||'.'||object_name in (${tables})),
 'routines',(select jsonb_agg(to_jsonb(f) order by schema_name,signature) from routine_objects f where schema_name||'.'||object_name in (${routines}))) into actual;
 if actual is distinct from '${expected}'::jsonb then raise exception 'Atomic recovery catalog/authority drift; preserve existing state' using errcode='55000'; end if;
end $atomic_preflight$;
-- The two unchanged canonical transactions become one guarded operation.
${ATOMIC_SOURCES.map(body).join("\n")}
commit;
`;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.stdout.write(stageAtomicCalculation());
