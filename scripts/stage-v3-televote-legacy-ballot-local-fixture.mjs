#!/usr/bin/env node
// LOCAL-ONLY S02 fixture repair. The bounded hosted catalog confirms the old
// Televote writer's signature, owner, SECURITY DEFINER and effective roles.
// The 56-table hosted-observed fixture omitted its body. Recover the exact
// original source function for a targeted destructive *isolated* retirement
// rehearsal, never for a hosted migration or as proof of body equivalence.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

if (process.env.SOLARIS_S02_TARGET !== "local") {
  throw Error("S16 Televote fixture generator refuses non-local execution");
}
const source = readFileSync(resolve(
  process.cwd(), "supabase/migrations/20260818094000_local_televoting_schema.sql"
), "utf8");
const startToken = "create or replace function televoting.submit_vote(\n";
const endToken = "end $$;";
const start = source.indexOf(startToken);
const end = source.indexOf(endToken, start) + endToken.length;
if (start < 0 || end < start || source.indexOf(startToken, start + 1) !== -1) {
  throw Error("S16 legacy Televote source function is absent or ambiguous");
}
const definition = source.slice(start, end);
if (!definition.includes("language plpgsql security definer set search_path=televoting,pg_temp as $$")
  || !definition.includes("insert into televoting.vote_submissions(")
  || !definition.includes("insert into televoting.vote_entries(")
  || definition.length < 3000 || definition.length > 13000) {
  throw Error("S16 legacy Televote original function body changed unexpectedly");
}
const sig = "televoting.submit_vote(uuid,text,text,jsonb,text,text,text,text,boolean)";
process.stdout.write(`-- LOCAL-ONLY historical-source donor for a scoped omitted-function fixture.
-- This reconstruction is NOT hosted-function-body equivalence evidence.
begin;
do $fixture_guard$ begin
  if to_regprocedure('${sig}') is not null then
    raise exception 'S16 legacy ballot fixture refuses to overwrite a present RPC';
  end if;
end $fixture_guard$;
${definition}
revoke all on function ${sig} from public,anon,authenticated;
grant execute on function ${sig} to service_role;
do $fixture_assert$ begin
  if not exists (
    select 1 from pg_proc where oid='${sig}'::regprocedure
      and prosecdef and pg_get_userbyid(proowner)='postgres'
  ) or has_function_privilege('anon','${sig}','EXECUTE')
    or has_function_privilege('authenticated','${sig}','EXECUTE')
    or not has_function_privilege('service_role','${sig}','EXECUTE')
  then raise exception 'S16 local legacy ballot fixture authority differs from bounded hosted catalog';
  end if;
end $fixture_assert$;
commit;
`);
