// LOCAL fixture only: restore the existing hosted Results dependency, never a new writer.
import { readFileSync } from "node:fs";
import { extractDefinition } from "./v3-s13-s14-authorization-dependencies.mjs";
export function stagedHostedSync() {
  const source = readFileSync(
    new URL(
      "../supabase/migrations/20261003195500_organisation_os_v5_jury_result_truth.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const definition = extractDefinition(source, "public.sync_show_results_from_votes");
  return `begin;
do $pre$ begin
if to_regprocedure('public.sync_show_results_from_votes(uuid)') is not null then
 raise exception 'Hosted Results fixture function already exists; refuse overwrite'; end if;
end $pre$;
${definition}
revoke all on function public.sync_show_results_from_votes(uuid) from public,anon,authenticated,service_role;
grant execute on function public.sync_show_results_from_votes(uuid) to service_role;
do $post$ begin
if not exists(select 1 from pg_proc p where p.oid=to_regprocedure('public.sync_show_results_from_votes(uuid)')
 and encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='4deff875c74e40bb6ba7642cb449cdaa91c45ae157f55a430ae7f53f31e5c541'
 and md5(pg_get_functiondef(p.oid))='8301a60a5e193323662e184637092810'
 and pg_get_userbyid(p.proowner)='postgres' and p.prosecdef
 and p.proconfig=array['search_path=public, pg_temp']::text[]
 and p.proacl::text='{postgres=X/postgres,service_role=X/postgres}') then
 raise exception 'Hosted Results dependency fingerprint/authority mismatch'; end if;
end $post$;
commit;\n`;
}
if (process.argv[1]?.endsWith("stage-v3-hosted-result-sync.mjs"))
  process.stdout.write(stagedHostedSync());
