// LOCAL candidate only. Catalog evidence is bounded; full Results recovery is not certified.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { extractDefinition } from "./v3-s13-s14-authorization-dependencies.mjs";
import { transactionBody } from "./stage-v3-s07-televote-source-truth.mjs";
export const OBSERVATION =
  "docs/v3/recovery-candidates/evidence/public-snapshot-prerequisites-observed-2026-11-13.json";
export const HELPERS =
  "docs/v3/recovery-candidates/evidence/publication-helper-prerequisites-observed-2026-11-13.json";
export const IDENTITY =
  "docs/v3/recovery-candidates/evidence/participant-identity-prerequisite-observed-2026-11-13.json";
export const IDENTITY_SOURCE =
  "supabase/migrations/20260818195904_canonical_edition_participations.sql";
export const HELPER_SOURCE =
  "supabase/migrations/20261003203000_organisation_os_v5_show_publication_lifecycle.sql";
// Historical, source-exact qualification helpers are reconstructed ONLY in the
// disposable hosted-observed PG fixture. They are not part of the recovery DDL.
export const QUALIFIER_SOURCE =
  "supabase/migrations/20260822212800_result_rank_is_qualification_source.sql";
export const MATERIALIZE_SOURCE =
  "supabase/migrations/20261003195500_organisation_os_v5_jury_result_truth.sql";
export const RELEASE_READINESS_SOURCE =
  "supabase/migrations/20261015164100_v3_s3_publication_invariants.sql";
export const PARTICIPATION_KEY_SOURCE =
  "supabase/migrations/20261003015000_organisation_os_v5_participation_status_operations.sql";
export const CURRENT_QUALIFIER_EVIDENCE =
  "docs/v3/recovery-candidates/evidence/qualification-prerequisites-observed-2026-11-13.json";
export const CURRENT_TRIGGER_EVIDENCE =
  "docs/v3/recovery-candidates/evidence/snapshot-trigger-prerequisites-observed-2026-11-13.json";
export const QUALIFIER_EVIDENCE =
  "docs/v3/recovery-candidates/evidence/s02-hosted-727-routine-fingerprints-2026-11-09.json";
export const CAPTURE_SOURCE =
  "supabase/migrations/20261104135245_v3_results_active_snapshot_and_qualification.sql";
export const SNAPSHOT_SOURCE =
  "supabase/migrations/20261024170500_v3_public_published_result_snapshot.sql";
export function stagePublicSnapshot(root = process.cwd()) {
  const read = (p) => readFileSync(resolve(root, p), "utf8");
  const evidence = JSON.parse(read(OBSERVATION));
  if (
    evidence.projectRef !== "dkxmnvekiopyesuzggeu" ||
    evidence.read_only !== "on" ||
    evidence.server_version_num !== "170011" ||
    evidence.routines.length !== 4 ||
    evidence.tables.length !== 3
  )
    throw Error("Unreviewed snapshot observation identity/scope");
  const literal = (x) => "'" + JSON.stringify(x).replaceAll("'", "''") + "'::jsonb";
  const helpers = JSON.parse(read(HELPERS));
  if (
    helpers.projectRef !== evidence.projectRef ||
    helpers.read_only !== "on" ||
    helpers.routines.length !== 3 ||
    helpers.routines.some((x) => !x.exists)
  )
    throw Error("Unreviewed publication helper observation");
  const identity = JSON.parse(read(IDENTITY));
  if (
    identity.projectRef !== evidence.projectRef ||
    identity.read_only !== "on" ||
    identity.routines.length !== 1 ||
    !identity.routines[0].exists
  )
    throw Error("Unreviewed participant identity observation");
  const routines = [...evidence.routines, ...helpers.routines, ...identity.routines];
  const capture = extractDefinition(read(CAPTURE_SOURCE), "private.v3_capture_result_version");
  const snapshot = transactionBody(read(SNAPSHOT_SOURCE));
  return `\\set ON_ERROR_STOP on
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
do $snapshot_preflight$
declare expected jsonb; actual jsonb; identity text; p pg_proc%rowtype; c pg_class%rowtype;
begin
 if current_user<>'postgres' then raise exception 'Snapshot recovery requires reviewed owner role' using errcode='42501'; end if;
 if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is null then raise exception 'Snapshot recovery requires S13 foundation' using errcode='55000'; end if;
 for expected in select value from jsonb_array_elements(${literal(routines)}) loop
  identity:=expected->>'identity';
  select * into p from pg_proc where oid=to_regprocedure(identity);
  actual:=jsonb_build_object('identity',identity,'exists',p.oid is not null,'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,'config',p.proconfig,'acl',p.proacl::text,'definition_md5',md5(pg_get_functiondef(p.oid)),'definition_sha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'));
  if actual is distinct from expected then raise exception 'Snapshot recovery routine drift or partial installation: %',identity using errcode='55000'; end if;
 end loop;
 for expected in select value from jsonb_array_elements(${literal(evidence.tables)}) loop
  identity:=expected->>'identity';
  select * into c from pg_class where oid=to_regclass(identity);
  -- The ordered LOCAL S14 forward recovery installs precisely one additional
  -- archive write guard on each of these existing hosted-observed relations.
  -- Require its exact trigger mode, target and authority; never broadly ignore
  -- extra triggers or relax the frozen hosted fingerprint of other triggers.
  if identity in (
    'public.studio2_result_operations',
    'public.studio2_show_publication_controls'
  ) and not exists (
    select 1 from pg_trigger guard
    where guard.tgrelid=c.oid
      and guard.tgname='v3_guard_archived_edition_workflow_write'
      and guard.tgenabled='O'
      and not guard.tgisinternal
      and guard.tgfoid=to_regprocedure('private.v3_guard_archived_edition_workflow_write()')
      and guard.tgtype=31 -- BEFORE INSERT, DELETE and UPDATE, FOR EACH ROW
      and guard.tgqual is null
      and guard.tgconstraint=0
  ) then
    raise exception 'Snapshot recovery requires the exact S14 forward archive guard: %',identity using errcode='55000';
  end if;
  actual:=jsonb_build_object(
    'identity',identity,'exists',c.oid is not null,
    'owner',pg_get_userbyid(c.relowner),
    'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
    'acl',c.relacl::text,
    'triggers',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'name',t.tgname,'enabled',t.tgenabled,
        'definition_md5',md5(pg_get_triggerdef(t.oid))
      ) order by t.tgname),'[]'::jsonb)
      from pg_trigger t
      where t.tgrelid=c.oid
        and not t.tgisinternal
        and not (
          identity in (
            'public.studio2_result_operations',
            'public.studio2_show_publication_controls'
          )
          and t.tgname='v3_guard_archived_edition_workflow_write'
        )
    )
  );
  if actual is distinct from expected then
    raise exception 'Snapshot recovery table security/trigger drift: %, expected %, actual %',identity,expected,actual using errcode='55000';
  end if;
 end loop;
end $snapshot_preflight$;
-- Install unchanged canonical active capture before exposing the public read model.
-- Do not register the full active-qualification contract: that stage is NOT installed here.
select public.v3_register_migration_contract('v3.recovery.active-result-capture',1,'forward_fix_only',false,null,'Source-exact active capture; qualification and canonical ranking are separate dependencies');
${capture}
${snapshot}
commit;
`;
}
export function stagedPublicationHelpers(root = process.cwd()) {
  const evidence = JSON.parse(readFileSync(resolve(root, HELPERS), "utf8"));
  const source = readFileSync(resolve(root, HELPER_SOURCE), "utf8");
  if (
    evidence.projectRef !== "dkxmnvekiopyesuzggeu" ||
    evidence.routines.length !== 3 ||
    evidence.routines.some((x) => !x.exists || x.acl !== "{postgres=X/postgres}")
  )
    throw Error("Unreviewed helper reconstruction");
  let sql = "begin;\n";
  const participant = JSON.parse(readFileSync(resolve(root, IDENTITY), "utf8"));
  if (
    participant.projectRef !== evidence.projectRef ||
    participant.routines.length !== 1 ||
    participant.routines[0].identity !==
      "public.participant_same_edition_identity(uuid,uuid,uuid,uuid,uuid,uuid)" ||
    !participant.routines[0].exists
  )
    throw Error("Unreviewed participant identity reconstruction");
  for (const row of [...evidence.routines, ...participant.routines]) {
    const identity = row.identity;
    sql += `do $pre$ begin if to_regprocedure('${identity}') is not null then raise exception 'Local helper reconstruction refuses existing ${identity}'; end if; end $pre$;\n`;
    const isParticipant = identity === participant.routines[0].identity;
    sql +=
      extractDefinition(
        isParticipant ? readFileSync(resolve(root, IDENTITY_SOURCE), "utf8") : source,
        identity.split("(")[0],
      ) + "\n";
    if (isParticipant) sql += `alter function ${identity} set search_path=public,pg_temp;\n`;
    sql += `revoke all on function ${identity} from public,anon,authenticated,service_role;\n`;
    if (isParticipant)
      sql += `grant execute on function ${identity} to anon,authenticated,service_role;\n`;
    sql += `do $post$ begin if not exists(select 1 from pg_proc p where p.oid=to_regprocedure('${identity}') and encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='${row.definition_sha256}' and md5(pg_get_functiondef(p.oid))='${row.definition_md5}' and pg_get_userbyid(p.proowner)='postgres' and not p.prosecdef and p.proacl::text='${row.acl}' and p.proconfig=array[${row.config.map((x) => "'" + x + "'").join(",")}]::text[]) then raise exception 'Hosted publication helper fingerprint/authority mismatch: ${identity}'; end if; end $post$;\n`;
  }
  return sql + "commit;\n";
}
export function stagedQualificationHelpers(root = process.cwd()) {
  const read = (p) => readFileSync(resolve(root, p), "utf8");
  const evidence = JSON.parse(read(QUALIFIER_EVIDENCE));
  if (
    evidence.serverVersionNum !== "170011" ||
    evidence.hostedHead !== "20261101181812" ||
    evidence.containsProductionRows !== false
  )
    throw Error("Unreviewed hosted qualification fixture observation");
  const expected = [
    {
      language: "plpgsql",
      name: "private.studio2_participation_subject_key",
      id: "private.studio2_participation_subject_key(p_country_id uuid, p_contest_entity_id uuid)",
      signature: "private.studio2_participation_subject_key(uuid,uuid)",
      source: PARTICIPATION_KEY_SOURCE,
      securityDefiner: false,
      serviceRole: false,
    },
    {
      name: "private.studio2_result_release_ready",
      id: "private.studio2_result_release_ready(p_show_id uuid)",
      signature: "private.studio2_result_release_ready(uuid)",
      source: RELEASE_READINESS_SOURCE,
      securityDefiner: true,
      serviceRole: false,
      language: "sql",
    },
    {
      name: "public.materialize_show_results_if_missing",
      id: "public.materialize_show_results_if_missing(_show_id uuid)",
      signature: "public.materialize_show_results_if_missing(uuid)",
      source: MATERIALIZE_SOURCE,
      securityDefiner: true,
      serviceRole: true,
      language: "plpgsql",
    },
    {
      language: "plpgsql",
      name: "public.refresh_edition_qualifications",
      id: "public.refresh_edition_qualifications(_edition_id uuid)",
      signature: "public.refresh_edition_qualifications(uuid)",
      source: QUALIFIER_SOURCE,
      securityDefiner: true,
      serviceRole: true,
    },
    {
      language: "plpgsql",
      name: "public.refresh_show_qualifiers",
      id: "public.refresh_show_qualifiers(_show_id uuid)",
      signature: "public.refresh_show_qualifiers(uuid)",
      source: QUALIFIER_SOURCE,
      securityDefiner: true,
      serviceRole: true,
    },
  ];
  const observations = [CURRENT_QUALIFIER_EVIDENCE, CURRENT_TRIGGER_EVIDENCE].map((path) =>
    JSON.parse(read(path)),
  );
  if (
    observations.some(
      (row) =>
        row.projectRef !== "dkxmnvekiopyesuzggeu" ||
        row.server_version_num !== "170011" ||
        row.read_only !== "on" ||
        row.applicationRowsRead !== false ||
        row.rawFunctionBodiesExported !== false,
    )
  )
    throw Error("Unreviewed current Results helper observation");
  const current = observations.flatMap((x) => x.routines);
  if (
    current.length !== expected.length ||
    new Set(current.map((x) => x.identity)).size !== expected.length ||
    current.some((x) => !expected.some((y) => y.signature === x.identity))
  )
    throw Error("Current Results helper observation scope drift");
  let sql = "begin;\n";
  for (const { name, id, signature, source, securityDefiner, serviceRole, language } of expected) {
    const observed = current.find((x) => x.identity === signature);
    const expectedAcl = serviceRole
      ? "{postgres=X/postgres,service_role=X/postgres}"
      : "{postgres=X/postgres}";
    if (
      !observed.exists ||
      observed.owner !== "postgres" ||
      observed.acl !== expectedAcl ||
      observed.security_definer !== securityDefiner ||
      !/^[a-f0-9]{32}$/.test(observed.definition_md5) ||
      !Array.isArray(observed.config)
    )
      throw Error("Unqualified current helper authority: " + signature);
    const matches = evidence.functions.filter((r) => r.id === id);
    if (
      matches.length !== 1 ||
      matches[0].sha256 !== observed.definition_sha256 ||
      matches[0].language !== language ||
      matches[0].securityDefiner !== securityDefiner ||
      matches[0].exec.anon !== false ||
      matches[0].exec.authenticated !== false ||
      matches[0].exec.service_role !== serviceRole ||
      !/^[0-9a-f]{64}$/.test(matches[0].sha256)
    )
      throw Error("Missing or unreviewed hosted qualification dependency: " + id);
    sql += `do $guard$ begin
  if to_regprocedure('${signature}') is not null then
    raise exception 'Local qualifier fixture refuses existing ${signature}';
  end if;
end $guard$;
`;
    sql += extractDefinition(read(source), name) + "\n";
    sql += `revoke all on function ${signature} from public,anon,authenticated,service_role;
`;
    if (serviceRole) sql += `grant execute on function ${signature} to service_role;\n`;
    sql += `do $verify$ begin
  if not exists (
    select 1 from pg_proc p
    where p.oid=to_regprocedure('${signature}')
      and pg_get_userbyid(p.proowner)='postgres'
      and p.prosecdef=${securityDefiner}
      and p.proacl::text='${observed.acl}'
      and p.proconfig=array[${observed.config.map((x) => "'" + x + "'").join(",")}]::text[]
      and md5(pg_get_functiondef(p.oid))='${observed.definition_md5}'
      and p.prolang=(select oid from pg_language where lanname='${language}')
      and encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='${matches[0].sha256}'
      and not has_function_privilege('anon','${signature}','EXECUTE')
      and not has_function_privilege('authenticated','${signature}','EXECUTE')
      and has_function_privilege('service_role','${signature}','EXECUTE')=${serviceRole}
  ) then raise exception 'Hosted qualification helper fingerprint or authorization drift: ${signature}';
  end if;
end $verify$;
`;
  }
  return sql + "commit;\n";
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.stdout.write(
    process.argv.includes("--local-qualification-helpers")
      ? stagedQualificationHelpers()
      : process.argv.includes("--local-helpers")
        ? stagedPublicationHelpers()
        : stagePublicSnapshot(),
  );
