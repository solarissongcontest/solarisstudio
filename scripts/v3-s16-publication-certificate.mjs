#!/usr/bin/env node
// Cross-attest the immutable full-source S16 catalog and the *executed*
// networkless PG17.11 Publication domain proof at precisely the same SHA.
// Never replace the overall S16 report, change risk classifications or waive
// a catalog writer/trigger finding to make this domain PASS.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROLES = ["anon", "authenticated", "service_role"];
const TABLES = ["public.studio2_show_publication_controls", "public.studio2_show_publication_executions"];
const ACTIONS = ["INSERT", "UPDATE", "DELETE", "TRUNCATE"];
const PROOFS = [
  "authorizedPreviewApply", "callerIdentityAndPrivileges",
  "unauthorizedDirectDmlTruncate", "canonicalCommand", "replayIdempotency",
  "committedReceipt", "canonicalReadback", "archiveDenial",
  "triggerAttachmentAndOwner", "noCompetingDirectDml",
];
const FUNCTIONS = [
  "public.studio2_apply_show_publication_change(uuid,text,jsonb,timestamptz,uuid,text,bigint)",
  "public.studio2_publish_due_show_publications()",
  "private.studio2_create_show_publication_control()",
  "private.studio2_ensure_show_publication_control(uuid)",
  "private.v3_guard_archived_edition_workflow_write()",
];
function need(ok, message) { if (!ok) throw new Error("Publication certificate refused: " + message); }

export function certifyS16Publication(report, execution, sha) {
  need(/^[0-9a-f]{40}$/.test(sha) && report?.candidateSha === sha && execution?.candidateSha === sha,
    "both independent inputs must bind to the exact candidate SHA");
  need(report.policyVersion === "v3-s16-mutation-authority-8" &&
    report.schemaVersion === 1 && Array.isArray(report.findings) &&
    report.s16Passed === false && report.catalogAuditPassed === false,
    "not an original, fail-closed full-source S16 catalog report");
  const publication = report.findings.filter(f => f.domain === "publication");
  need(publication.length === 1 && publication[0].kind === "database_execution_evidence_missing",
    "there are other unresolved Publication authority defects");
  const domain = report.domains?.find(d => d.id === "publication");
  need(domain && JSON.stringify(domain.canonicalTables) === JSON.stringify(TABLES) &&
    domain.canonicalCommands?.includes("studio2_apply_show_publication_change") &&
    domain.canonicalCommands?.includes("studio2_publish_due_show_publications"),
    "canonical Publication domain definition changed");
  need(execution.schemaVersion === 1 &&
    execution.status === "EXECUTION_PASS_CATALOG_BINDING_REQUIRED" &&
    execution.domain === "publication" && execution.postgresVersion === "17.11" &&
    execution.operator === "postgres" && execution.network === "none" &&
    execution.fixture === "recovery_publication_api_probe" &&
    execution.production === false && execution.hostedEquivalent === false &&
    execution.globalS16Passed === false,
    "the execution run is not isolated PostgreSQL 17.11 or overclaims certification");
  need(typeof execution.runId === "string" && /^\d+$/.test(execution.runId),
    "Publication execution must have a real GitHub Actions run identity");
  for (const p of PROOFS) need(execution.mandatory?.[p] === true, "missing executed mandatory proof: " + p);
  need(execution.actualDeniedCount === 24 && execution.denials?.length === 24,
    "all 24 API-role direct-DML and TRUNCATE probes must execute");
  const required = new Set(ROLES.flatMap(role => TABLES.flatMap(table => ACTIONS.map(action => role + "/" + table + "/" + action))));
  for (const d of execution.denials) {
    need(required.delete(d.role + "/" + d.table + "/" + d.action) &&
      d.sqlstate === "42501" && /^[0-9a-f]{64}$/.test(d.sha256 ?? ""),
      "duplicate, absent or non-ACL denial");
  }
  need(required.size === 0, "role/action coverage incomplete");
  need(execution.functionIdentities?.length === 5 &&
    FUNCTIONS.every(f => execution.functionIdentities.includes(f)) &&
    /^[0-9a-f]{64}$/.test(execution.archiveLogSha256 ?? "") &&
    /^[0-9a-f]{64}$/.test(execution.committedReadbackSha256 ?? ""),
    "unverified function/Archive/receipt evidence");
  const r = execution.committedReadback;
  need(r?.state === "public" && r?.version === 2 && r?.published === true &&
    r?.receiptCount === 1 && r?.auditCount === 1,
    "durable committed receipt, version, state or audit did not match");
  return {
    schemaVersion: 1, domain: "publication", candidateSha: sha,
    status: "PASS", certificateScope: "isolated_PG17.11_plus_full_source_S16_catalog",
    publicationFindingsClearedByExecution: 1,
    securityFixesReclassified: 0,
    githubExecutionRunId: execution.runId,
    directApiDmlDenials: execution.actualDeniedCount,
    mainS16ReportPassed: false,
    hostedEquivalenceCertified: false, productionAuthorized: false,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const readArg = flag => {
    const value = process.argv.find(a => a.startsWith(flag + "="))?.slice(flag.length + 1);
    need(value, "missing argument " + flag);
    return JSON.parse(readFileSync(resolve(value), "utf8"));
  };
  const sha = execFileSync("git", ["rev-parse", "HEAD"], {encoding: "utf8"}).trim();
  need(!execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {encoding: "utf8"}).trim(),
    "exact candidate checkout has tracked mutations");
  const proof = certifyS16Publication(readArg("--s16"), readArg("--execution"), sha);
  writeFileSync("s16-publication-certificate.json", JSON.stringify(proof, null, 2) + "\n", {flag:"wx"});
  console.log("PASS: Publication exact-SHA domain execution certificate; full S16 remains NO-GO");
}
