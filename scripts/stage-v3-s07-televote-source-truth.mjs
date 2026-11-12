import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const SOURCES = [
  "supabase/migrations/20261017001000_v3_s14_televote_result_truth.sql",
  "supabase/migrations/20261017001020_v3_s14_televote_projection_replay_hardening.sql",
  "supabase/migrations/20261108004000_v3_s14_signed_combined_projection.sql",
];
export const GUARD = "docs/v3/recovery-candidates/s07-televote-managed-source-guard.sql";
const PREFIX = "\\set ON_ERROR_STOP on\nbegin;\nset local lock_timeout = '5s';\nset local statement_timeout = '120s';\ndo $s07_preflight$\ndeclare identity text;\nbegin\n  foreach identity in array array[\n    'public.editions','public.shows','public.countries','public.participants',\n    'public.televote_votes','public.televoting_round_bindings',\n    'televoting.rounds','televoting.round_results','televoting.televote_aggregations',\n    'televoting.televote_aggregation_sources','televoting.combined_televote_results'\n  ] loop\n    if to_regclass(identity) is null then\n      raise exception 'S07 missing dependency: %', identity using errcode='55000';\n    end if;\n  end loop;\n  foreach identity in array array[\n    'private.studio2_request_is_service_role()',\n    'public.studio2_access_allowed(text,uuid,boolean)',\n    'public.sync_show_results_from_votes(uuid)',\n    'extensions.digest(bytea,text)'\n  ] loop\n    if to_regprocedure(identity) is null then\n      raise exception 'S07 missing dependency: %', identity using errcode='55000';\n    end if;\n  end loop;\n  if to_regclass('private.v3_televote_projection_write_context') is not null\n     or to_regclass('private.v3_televote_result_projection_sources') is not null\n     or exists(select 1 from pg_trigger where tgrelid=to_regclass('public.televote_votes')\n       and tgname='v3_guard_source_managed_televote_projection' and not tgisinternal) then\n    raise exception 'S07 source truth already or partially installed' using errcode='55000';\n  end if;\n  foreach identity in array array[\n    'private.v3_apply_published_televote_projection(uuid,uuid,text,text,integer,timestamptz,jsonb)',\n    'private.v3_sync_published_televote_round(uuid)',\n    'private.v3_sync_published_televote_aggregation(uuid)',\n    'private.v3_televote_projection_snapshot(uuid)',\n    'private.v3_guard_source_managed_televote_projection()',\n    'private.v3_sync_published_televote_round_trigger()',\n    'private.v3_sync_published_televote_aggregation_trigger()',\n    'public.studio2_televote_projection_status(uuid)'\n  ] loop\n    if to_regprocedure(identity) is not null then\n      raise exception 'S07 source truth already or partially installed: %', identity using errcode='55000';\n    end if;\n  end loop;\nend\n$s07_preflight$;\n";
const SUFFIX = "\n-- Only source-derived adapters are externally callable by the server role.\n-- The arbitrary-payload materializer stays owner-only, including for service_role.\nrevoke all on function private.v3_apply_published_televote_projection(uuid,uuid,text,text,integer,timestamptz,jsonb)\n  from public, anon, authenticated, service_role;\ngrant execute on function private.v3_sync_published_televote_round(uuid),\n  private.v3_sync_published_televote_aggregation(uuid) to service_role;\ngrant select on private.v3_televote_result_projection_sources to service_role;\ncommit;\n";
export const CONTEXT_ENTER = "  insert into private.v3_televote_projection_write_context(transaction_id,show_id)\n  values (pg_current_xact_id(),p_show_id);\n\n";
export const CONTEXT_LEAVE = "  delete from private.v3_televote_projection_write_context writer\n  where writer.transaction_id=pg_current_xact_id() and writer.show_id=p_show_id;\n\n";
export function transactionBody(sql) {
  if (!/^begin;\s/i.test(sql) || !/\scommit;\s*$/i.test(sql)) throw Error("S07 requires the canonical single outer transaction");
  return sql.replace(/^begin;\s*/i,"").replace(/\scommit;\s*$/i,"");
}
export function withWriterContext(sql) {
  const start = "  delete from public.televote_votes vote\n  where vote.show_id = p_show_id;";
  const end = "  perform set_config('solaris.v3_televote_projection_bulk_replace', '0', true);";
  if (sql.split(start).length!==2 || sql.split(end).length!==2) throw Error("S07 canonical materializer source drift");
  return sql.replace(start,()=>CONTEXT_ENTER+start).replace(end,()=>CONTEXT_LEAVE+end);
}
function inputs(root) {
  const truth=transactionBody(readFileSync(resolve(root,SOURCES[0]),"utf8"));
  const replay=transactionBody(readFileSync(resolve(root,SOURCES[1]),"utf8"));
  const signed=transactionBody(readFileSync(resolve(root,SOURCES[2]),"utf8"));
  const signedStart=signed.indexOf("alter table private.v3_televote_result_projection_sources");
  if(signedStart<0) throw Error("S07 signed Combined source drift");
  const latest=signed.slice(signedStart);
  const guard=readFileSync(resolve(root,GUARD),"utf8");
  const pattern=/create or replace function private\.v3_guard_source_managed_televote_projection\(\)[\s\S]*?\$guard\$;/g;
  const match=[...guard.matchAll(pattern)];
  if(match.length!==1 || truth.match(pattern)?.length!==1 || guard.slice(match[0].index+match[0][0].length).trim()) {
    throw Error("S07 canonical projection guard source drift");
  }
  return {truth,replay,latest,guard,definition:match[0][0],context:guard.slice(0,match[0].index),pattern};
}
export function stageSourceTruth(root=process.cwd()) {
  const {truth,replay,latest,definition,context,pattern}=inputs(root);
  return PREFIX+context+truth.replace(pattern,()=>definition)+"\n"+replay+"\n"+withWriterContext(latest)+SUFFIX;
}
export function stageWriterBoundary(root=process.cwd()) {
  const {latest,guard}=inputs(root);
  const fn=latest.match(/create or replace function private\.v3_apply_published_televote_projection\([\s\S]*?\$apply\$;/)?.[0];
  if(!fn) throw Error("S07 materializer missing");
  const body=fn.split("as $apply$")[1]?.split("$apply$;")[0];
  if(!body || body.includes("$s07_expected$")) throw Error("S07 invalid canonical body");
  const preflight="\\set ON_ERROR_STOP on\nbegin;\n"+
    "do $s07_boundary$ declare p pg_proc%rowtype; begin\n"+
    "select * into p from pg_proc where oid=to_regprocedure('private.v3_apply_published_televote_projection(uuid,uuid,text,text,integer,timestamptz,jsonb)');\n"+
    "if p.oid is null or not p.prosecdef or pg_get_userbyid(p.proowner)<>'postgres'\n"+
    "or p.proconfig is distinct from array['search_path=pg_catalog, public, private, extensions']::text[]\n"+
    "or p.prosrc is distinct from $s07_expected$"+body+"$s07_expected$\n"+
    "or to_regclass('private.v3_televote_projection_write_context') is not null then\n"+
    "raise exception 'S07 writer boundary requires exact canonical replay source and absent context'; end if;\n"+
    "end $s07_boundary$;\n";
  return preflight+guard+withWriterContext(fn)+"\n"+
    "revoke all on function private.v3_apply_published_televote_projection(uuid,uuid,text,text,integer,timestamptz,jsonb), private.v3_guard_source_managed_televote_projection() from public,anon,authenticated,service_role;\ncommit;\n";
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  process.stdout.write(process.argv.includes("--writer-boundary")?stageWriterBoundary():stageSourceTruth());
}
