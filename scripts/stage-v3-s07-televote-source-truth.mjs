import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const SOURCES = [
  "supabase/migrations/20261017001000_v3_s14_televote_result_truth.sql",
  "supabase/migrations/20261017001020_v3_s14_televote_projection_replay_hardening.sql",
];
export const GUARD = "docs/v3/recovery-candidates/s07-televote-managed-source-guard.sql";
const PREFIX = "\\set ON_ERROR_STOP on\nbegin;\nset local lock_timeout = '5s';\nset local statement_timeout = '120s';\ndo $s07_preflight$\ndeclare identity text;\nbegin\n  foreach identity in array array[\n    'public.editions','public.shows','public.countries','public.participants',\n    'public.televote_votes','public.televoting_round_bindings',\n    'televoting.rounds','televoting.round_results','televoting.televote_aggregations',\n    'televoting.televote_aggregation_sources','televoting.combined_televote_results'\n  ] loop\n    if to_regclass(identity) is null then\n      raise exception 'S07 missing dependency: %', identity using errcode='55000';\n    end if;\n  end loop;\n  foreach identity in array array[\n    'private.studio2_request_is_service_role()',\n    'public.studio2_access_allowed(text,uuid,boolean)',\n    'public.sync_show_results_from_votes(uuid)',\n    'extensions.digest(bytea,text)'\n  ] loop\n    if to_regprocedure(identity) is null then\n      raise exception 'S07 missing dependency: %', identity using errcode='55000';\n    end if;\n  end loop;\n  if to_regclass('private.v3_televote_result_projection_sources') is not null\n     or exists(select 1 from pg_trigger where tgrelid=to_regclass('public.televote_votes')\n       and tgname='v3_guard_source_managed_televote_projection' and not tgisinternal) then\n    raise exception 'S07 source truth already or partially installed' using errcode='55000';\n  end if;\n  foreach identity in array array[\n    'private.v3_apply_published_televote_projection(uuid,uuid,text,text,integer,timestamptz,jsonb)',\n    'private.v3_sync_published_televote_round(uuid)',\n    'private.v3_sync_published_televote_aggregation(uuid)',\n    'private.v3_televote_projection_snapshot(uuid)',\n    'private.v3_guard_source_managed_televote_projection()',\n    'private.v3_sync_published_televote_round_trigger()',\n    'private.v3_sync_published_televote_aggregation_trigger()',\n    'public.studio2_televote_projection_status(uuid)'\n  ] loop\n    if to_regprocedure(identity) is not null then\n      raise exception 'S07 source truth already or partially installed: %', identity using errcode='55000';\n    end if;\n  end loop;\nend\n$s07_preflight$;\n";
const SUFFIX = "\n-- Only source-derived adapters are externally callable by the server role.\n-- The arbitrary-payload materializer stays owner-only, including for service_role.\nrevoke all on function private.v3_apply_published_televote_projection(uuid,uuid,text,text,integer,timestamptz,jsonb)\n  from public, anon, authenticated, service_role;\ngrant execute on function private.v3_sync_published_televote_round(uuid),\n  private.v3_sync_published_televote_aggregation(uuid) to service_role;\ngrant select on private.v3_televote_result_projection_sources to service_role;\ncommit;\n";
export function transactionBody(sql) {
  if (!/^begin;\s/i.test(sql) || !/\scommit;\s*$/i.test(sql)) {
    throw Error("S07 requires the canonical single outer transaction");
  }
  return sql.replace(/^begin;\s*/i, "").replace(/\scommit;\s*$/i, "");
}
export function stageSourceTruth(root = process.cwd()) {
  let truth = transactionBody(readFileSync(resolve(root, SOURCES[0]), "utf8"));
  const replay = transactionBody(readFileSync(resolve(root, SOURCES[1]), "utf8"));
  const guard = readFileSync(resolve(root, GUARD), "utf8");
  const pattern = /create or replace function private\.v3_guard_source_managed_televote_projection\(\)[\s\S]*?\$guard\$;/g;
  const replacements = guard.match(pattern);
  if (replacements?.length !== 1 || truth.match(pattern)?.length !== 1) {
    throw Error("S07 canonical projection guard source drift");
  }
  truth = truth.replace(pattern, () => replacements[0]);
  return PREFIX + truth + "\n" + replay + SUFFIX;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.stdout.write(stageSourceTruth());
}
