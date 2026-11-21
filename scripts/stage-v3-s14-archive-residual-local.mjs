import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// LOCAL-ONLY stage derivation. Never connect to or execute against hosted Supabase.
// The immutable source is the previously reviewed 12-stage LOCAL candidate.
// Production now already has two of those effects; reinstalling the original
// would temporarily overwrite the *stricter* final-results readiness guard.
export const INTEGRATED = "docs/v3/recovery-candidates/forward-only-s14-archive-integrated-local.sql";
export const FINAL = "supabase/migrations/20261019112200_v3_s14_final_results_readiness_hardening.sql";
export const TASK = "supabase/migrations/20261021161000_v3_s14_task_reconciliation_service_boundary.sql";
export const EXPECTED_BLOBS = {
  integrated: "c866ebc8aea24891ee6648acf03c90ee192e6480",
  final: "09a9708a6ae26b290c30eedd67d2f6b6967602a5",
  task: "0c9a851a8a8e428ef02bcb6a21824dfd1d46ff78",
};
export const OMIT = [
  "20261019112200_v3_s14_final_results_readiness_hardening.sql",
  "20261021161000_v3_s14_task_reconciliation_service_boundary.sql",
];
export const RECOVERY_KEY = "v3.s14.archive-forward-effect-recovery-residual";

export function gitBlobSha(content) {
  const data = Buffer.from(content, "utf8");
  return createHash("sha1").update("blob " + data.length + "\0").update(data).digest("hex");
}
function requireExactly(source, fragment, count, label) {
  const found = source.split(fragment).length - 1;
  if (found !== count) throw Error(label + ": expected " + count + ", found " + found);
}
function load(root, path, sha) {
  const result = readFileSync(resolve(root, path), "utf8");
  if (gitBlobSha(result) !== sha) throw Error("Unreviewed historical recovery source: " + path);
  return result;
}
export function buildResidualArchive(root = process.cwd()) {
  const integrated = load(root, INTEGRATED, EXPECTED_BLOBS.integrated);
  const final = load(root, FINAL, EXPECTED_BLOBS.final);
  load(root, TASK, EXPECTED_BLOBS.task);

  const match = final.match(/as \$ready\$([\s\S]*?)\$ready\$;/);
  if (!match || match[1].includes("$s14_residual_body$")) throw Error("Unexpected final-results readiness body");
  const body = match[1];
  const sectionRE = /^-- ={10,}\n-- Canonical source effects: ([^\n]+) \(history INSERT omitted\)\n-- ={10,}\n/gm;
  const sections = [...integrated.matchAll(sectionRE)];
  if (sections.length !== 12) throw Error("Unexpected original Archive source-section count");
  const names = sections.map(s => s[1]);
  if (new Set(names).size !== 12 || OMIT.some(name => !names.includes(name))) {
    throw Error("Archive original source stage identity mismatch");
  }
  const postStart = integrated.indexOf("-- Release-gate postconditions are intentionally catalog-only:");
  if (postStart < 0 || postStart < sections[11].index) throw Error("Missing original postflight");
  let pre = integrated.slice(0, sections[0].index);
  let post = integrated.slice(postStart);

  const replacements = [
    ["-- Twelve canonical source SQL stages", "-- Ten residual canonical source SQL stages"],
    ["-- All source DDL/functions and final convergence fixes otherwise remain intact.", "-- Only the ten uninstalled source stages remain; existing final helper is never rewritten."],
    ["the twelve ordered S14 Archive effect stages", "the ten remaining ordered S14 Archive effect stages"],
    ["twelve missing historical migration versions", "ten remaining historical source effects"],
  ];
  for (const [from, to] of replacements) {
    if (pre.includes(from)) pre = pre.replace(from, to);
  }
  pre = pre.replaceAll("v3.s14.archive-forward-effect-recovery", RECOVERY_KEY);
  post = post.replaceAll("v3.s14.archive-forward-effect-recovery", RECOVERY_KEY);

  requireExactly(pre, "    'private.v3_edition_final_results_ready(uuid)',\n", 1, "obsolete absence gate");
  pre = pre.replace("    'private.v3_edition_final_results_ready(uuid)',\n", "");
  for (const key of ["v3.s14.final-results-readiness-hardening", "v3.s14.task-reconciliation-service-boundary"]) {
    requireExactly(pre, "'" + key + "',\n", 1, "preflight previously installed semantic key");
    pre = pre.replace("'" + key + "',\n", "");
    requireExactly(post, "'" + key + "',\n", 1, "postflight previously installed semantic key");
    post = post.replace("'" + key + "',\n", "");
  }

  const check = [
    "  -- These two immutable effects are already installed in production.",
    "  -- Abort on any body, owner, security, grant or semantic-contract drift.",
    "  if not exists (",
    "    select 1 from pg_proc p",
    "    where p.oid=to_regprocedure('private.v3_edition_final_results_ready(uuid)')",
    "      and p.prosrc=$s14_residual_body$" + body + "$s14_residual_body$",
    "      and p.prosecdef and p.provolatile='s'",
    "      and pg_get_userbyid(p.proowner)='postgres'",
    "      and p.proconfig=array['search_path=pg_catalog, public, private']::text[]",
    "  ) or has_function_privilege('anon','private.v3_edition_final_results_ready(uuid)','EXECUTE')",
    "    or has_function_privilege('authenticated','private.v3_edition_final_results_ready(uuid)','EXECUTE')",
    "    or has_function_privilege('service_role','private.v3_edition_final_results_ready(uuid)','EXECUTE')",
    "    or not exists (select 1 from private.v3_migration_contracts",
    "      where migration_key='v3.s14.final-results-readiness-hardening' and schema_version=1)",
    "  then raise exception 'S14 residual BLOCKED: final-results readiness effect mismatch'; end if;",
    "  if not exists (select 1 from pg_proc p",
    "    where p.oid=to_regprocedure('private.studio2_reconcile_all_organizer_tasks(uuid)')",
    "      and p.prosecdef and pg_get_userbyid(p.proowner)='postgres')",
    "    or has_function_privilege('anon','private.studio2_reconcile_all_organizer_tasks(uuid)','EXECUTE')",
    "    or has_function_privilege('authenticated','private.studio2_reconcile_all_organizer_tasks(uuid)','EXECUTE')",
    "    or not has_function_privilege('service_role','private.studio2_reconcile_all_organizer_tasks(uuid)','EXECUTE')",
    "    or not exists (select 1 from private.v3_migration_contracts",
    "      where migration_key='v3.s14.task-reconciliation-service-boundary' and schema_version=1)",
    "  then raise exception 'S14 residual BLOCKED: existing task service boundary mismatch'; end if;",
  ].join("\n") + "\n";
  requireExactly(pre, "end\n$s14_forward_archive_preflight$;", 1, "original preflight terminator");
  pre = pre.replace("end\n$s14_forward_archive_preflight$;", check + "end\n$s14_forward_archive_preflight$;");
  requireExactly(post, "end\n$s14_forward_archive_postcheck$;", 1, "original postflight terminator");
  post = post.replace("end\n$s14_forward_archive_postcheck$;", check + "end\n$s14_forward_archive_postcheck$;");

  const stages = sections.map((s, i) => ({
    name: s[1],
    body: integrated.slice(s.index, i === 11 ? postStart : sections[i + 1].index),
  })).filter(s => !OMIT.includes(s.name));
  if (stages.length !== 10) throw Error("Residual Archive stage-count mismatch");

  const first = stages[0];
  const oldStart = first.body.indexOf("-- Grand Final publication is the canonical cross-domain prerequisite");
  const oldEnd = first.body.indexOf("-- Canonical browser-callable V3 lifecycle mutation authority.");
  if (oldStart < 0 || oldEnd < oldStart || !first.body.slice(oldStart, oldEnd).includes("create or replace function private.v3_edition_final_results_ready(")) {
    throw Error("Initial, weaker Final Results helper no longer matches reviewed source");
  }
  first.body = first.body.slice(0, oldStart) + first.body.slice(oldEnd);
  const candidate = pre + stages.map(s => s.body).join("") + post;
  requireExactly(candidate, "create or replace function private.v3_edition_final_results_ready(", 0, "unexpected helper downgrade");
  requireExactly(candidate, "create or replace function private.studio2_reconcile_all_organizer_tasks(", 3, "final task producer pipeline");
  requireExactly(candidate, "commit;", 1, "single recovery transaction");
  if (!candidate.startsWith("-- SOLARIS V3 S14 / ARCHIVE FORWARD-EFFECT CANDIDATE.")
    || !candidate.trimEnd().endsWith("commit;")
    || candidate.includes("supabase_migrations.schema_migrations")) {
    throw Error("Unsafe candidate packaging");
  }
  return candidate;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.stdout.write(buildResidualArchive());
}
