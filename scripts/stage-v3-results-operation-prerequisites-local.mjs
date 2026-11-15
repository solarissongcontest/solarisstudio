// LOCAL reconstruction only. Uses fresh owner-authorized catalog fingerprints;
// never creates permissive substitutes or runs against an arbitrary database.
import fs from "node:fs";
import { extractDefinition } from "./v3-s13-s14-authorization-dependencies.mjs";
const data = JSON.parse(
  fs.readFileSync(
    "docs/v3/recovery-candidates/evidence/results-operation-prerequisites-observed-2026-11-14.json",
    "utf8",
  ),
);
const items = [
  [
    "private.studio2_user_access_allowed",
    "uuid,text,uuid,boolean",
    "20260918205750_permission_engine_v2_authoritative_cutover.sql",
  ],
  [
    "private.studio2_can_preview_results",
    "uuid,uuid",
    "20260915185524_permission_engine_v2_private_helper_cutover.sql",
  ],
  [
    "private.studio2_can_verify_results",
    "uuid,uuid",
    "20260915185524_permission_engine_v2_private_helper_cutover.sql",
  ],
  [
    "private.studio2_result_preconditions",
    "uuid",
    "20261003195500_organisation_os_v5_jury_result_truth.sql",
  ],
  [
    "public.materialize_show_results_if_missing",
    "uuid",
    "20261003195500_organisation_os_v5_jury_result_truth.sql",
  ],
  [
    "public.recalculate_show_results_internal",
    "uuid",
    "20260822124500_fix_show_tiebreak_recalculation.sql",
  ],
  [
    "public.studio2_results_operations_snapshot",
    "uuid",
    "20260912154500_studio2_results_operations.sql",
  ],
  [
    "public.studio2_execute_result_operation",
    "uuid,text,text,uuid,bigint",
    "20260912154500_studio2_results_operations.sql",
  ],
];
console.log(
  "begin;do $local$begin if current_user<>'postgres' or current_database() not in('recovery_operator_baseline','results_cas_probe') or current_setting('server_version_num')<>'170011' then raise exception 'LOCAL Results prerequisite reconstruction only';end if;end $local$;",
);
for (const [name, args, file] of items) {
  const o = data.routines.find((x) => x.identity === `${name}(${args})`);
  if (!o?.exists) throw Error("Missing approved observation " + name);
  const sourceSha =
    name === "public.recalculate_show_results_internal"
      ? "3589a6c8d073f486b4fa4f5695ccc6c2b3ef5fc3228c1d71aa5b8a5a69976bf0"
      : o.definition_sha256;
  console.log(
    `do $pre$begin if to_regprocedure('${o.identity}') is not null and encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('${o.identity}')),'UTF8')),'hex')<>'${sourceSha}' then raise exception 'Unknown existing local Results prerequisite: ${name}';end if;end $pre$;`,
  );
  console.log(extractDefinition(fs.readFileSync("supabase/migrations/" + file, "utf8"), name));
  console.log(`revoke all on function ${o.identity} from public,anon,authenticated,service_role;`);
  const roles = Object.entries(o.execute)
    .filter(([, x]) => x)
    .map(([r]) => r)
    .sort();
  if (roles.length) console.log(`grant execute on function ${o.identity} to ${roles.join(",")};`);
  console.log(
    `do $post$begin if encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('${o.identity}')),'UTF8')),'hex')<>'${sourceSha}' then raise exception 'Source does not reproduce observed Results definition: ${name}';end if;end $post$;`,
  );
}
const runtime = JSON.parse(
  fs.readFileSync(
    "docs/v3/recovery-candidates/evidence/results-runtime-prerequisites-observed-2026-11-15.json",
    "utf8",
  ),
);
if (
  runtime.projectRef !== "dkxmnvekiopyesuzggeu" ||
  runtime.readOnly !== "on" ||
  runtime.applicationRowsRead !== false
)
  throw Error("Unqualified Results runtime observation");
for (const [name, args, file, placeholder] of [
  [
    "private.studio2_request_fingerprint",
    "text,text,jsonb,jsonb",
    "20261014194651_v3_s2_operation_receipt_idempotency.sql",
    null,
  ],
  [
    "private.v3_emit_result_execution_event",
    "",
    "20261016053000_v3_s5_results_consequences.sql",
    "1006245ea9cfe8f31451566ca05b0c8a9071d5ba65ae7d214c6b66dd10a13c6c",
  ],
]) {
  const o = runtime.routines.find((x) => x.identity === `${name}(${args})`);
  if (!o?.exists || o.owner !== "postgres" || !/^[a-f0-9]{64}$/.test(o.sha256))
    throw Error("Missing qualified Results runtime routine");
  const prior = placeholder
    ? ` and encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('${o.identity}')),'UTF8')),'hex')<>'${placeholder}'`
    : "";
  console.log(
    `do $pre$begin if to_regprocedure('${o.identity}') is not null and encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('${o.identity}')),'UTF8')),'hex')<>'${o.sha256}'${prior} then raise exception 'Unknown local Results runtime prerequisite';end if;end $pre$;`,
  );
  console.log(extractDefinition(fs.readFileSync("supabase/migrations/" + file, "utf8"), name));
  console.log(`revoke all on function ${o.identity} from public,anon,authenticated,service_role;`);
  console.log(
    `do $post$begin if encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('${o.identity}')),'UTF8')),'hex')<>'${o.sha256}' then raise exception 'Canonical Results runtime definition differs from hosted observation';end if;end $post$;`,
  );
}
// Exact observed table ACL completion is fixture reconstruction, not production
// grants. The subsequent CAS cutover revokes the unsafe direct API write path.
console.log(
  "grant truncate,references,trigger on public.studio2_result_operations,public.studio2_result_operation_executions to service_role;commit;",
);
