import {
 auditV3S16CatalogAuthority,
 type V3S16CatalogEvidence,
 type V3S16DomainDefinition,
} from "./v3-s16-mutation-authority";
const commands = [
 "public.v3_submit_integrity_appeal", "public.v3_public_submit_anonymous_integrity_appeal",
 "public.studio2_integrity_assign_appeal_reviewer", "public.studio2_integrity_resolve_appeal",
 "public.studio2_integrity_grant_appeal_extension",
];
const internals = ["public.reporter_submit_integrity_appeal_impl", "public.public_submit_anonymous_integrity_appeal_impl"];
export const V3_INTEGRITY_APPEAL_AUTHORITY: V3S16DomainDefinition = {
 id: "integrity-appeal", risk: "integrity_critical",
 canonicalTables: ["public.integrity_case_appeals"], canonicalOwner: "Integrity appeal command authority",
 canonicalCommands: commands, sanctionedInternalWriters: internals,
 sanctionedWriteTriggers: ["v3_integrity_appeal_before_update", "v3_integrity_appeal_changed_event", "organizer_inbox_integrity_appeal_insert", "organizer_inbox_appeal_state"],
};
/** Event-specific proof keeps unresolved case/evidence writers in global S16. */
export function proveIntegrityAppealAuthority(catalog: V3S16CatalogEvidence | null, candidateSha: string) {
 const errors = auditV3S16CatalogAuthority(catalog,candidateSha,[V3_INTEGRITY_APPEAL_AUTHORITY]).map((finding) => `${finding.kind}: ${finding.subject}`);
 if (!catalog || catalog.candidateSha!==candidateSha) return {candidateSha,passed:false,errors};
 const table=catalog.tables.find((item)=>item.table==="public.integrity_case_appeals");
 if (!table || table.owner!=="postgres" || table.rlsEnabled!==true) errors.push("Unsafe canonical appeal table owner/RLS");
 for (const trigger of ["v3_integrity_appeal_before_update","v3_integrity_appeal_changed_event"]) {
  if (!table?.writeTriggers?.includes(trigger)) errors.push(`Missing appeal invariant trigger: ${trigger}`);
 }

 for (const name of ["public.admin_assign_integrity_appeal_reviewer","public.admin_decide_integrity_appeal","public.admin_grant_integrity_appeal_extension"]) {
  const legacy=catalog.functions.find((item)=>item.name===name);
  if (legacy?.executeRoles.some((role)=>role!=="postgres")) errors.push(`Executable version-guessing appeal compatibility writer: ${name}`);
 }
 for (const name of [...commands,...internals,"private.v3_integrity_appeal_changed_event","private.v3_integrity_appeal_before_update"]) {
  const fn=catalog.functions.find((item)=>item.name===name);
  if (!fn || fn.owner!=="postgres" || !fn.securityDefiner || !/^pg_catalog(?:\s*,|$)/.test(fn.searchPath ?? "")) errors.push(`Unsafe or missing appeal authority: ${name}`);
  if (fn && commands.includes(name)) {
   const anonymous=name==="public.v3_public_submit_anonymous_integrity_appeal";
   if (fn.executeRoles.includes("PUBLIC") || (!anonymous && fn.executeRoles.includes("anon")) || !fn.executeRoles.includes(anonymous ? "anon" : "authenticated")) errors.push(`Incorrect appeal command EXECUTE boundary: ${name}`);
  }
  if (fn && (internals.includes(name) || name.startsWith("private.")) && fn.executeRoles.some((role)=>role!=="postgres")) errors.push(`Externally executable appeal implementation: ${name}`);
 }
 return {candidateSha,passed:errors.length===0,errors};
}
