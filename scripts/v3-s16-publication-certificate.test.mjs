import test from "node:test";
import assert from "node:assert/strict";
import { certifyS16Publication } from "./v3-s16-publication-certificate.mjs";

const sha = "a".repeat(40);
const roles = ["anon", "authenticated", "service_role"];
const tables = ["public.studio2_show_publication_controls", "public.studio2_show_publication_executions"];
const actions = ["INSERT", "UPDATE", "DELETE", "TRUNCATE"];
function fixture() {
  return {
    report: {
      schemaVersion: 1, candidateSha: sha, policyVersion: "v3-s16-mutation-authority-8",
      s16Passed: false, catalogAuditPassed: false,
      findings: [{ domain: "publication", kind: "database_execution_evidence_missing" },
        { domain: "televote", kind: "competing_legacy_writer" }],
      domains: [{
        id: "publication", canonicalTables: tables,
        canonicalCommands: ["studio2_apply_show_publication_change", "studio2_publish_due_show_publications"],
      }],
    },
    execution: {
      schemaVersion: 1, candidateSha: sha, runId: "43917063169",
      status: "EXECUTION_PASS_CATALOG_BINDING_REQUIRED", domain: "publication",
      postgresVersion: "17.11", operator: "postgres", network: "none",
      fixture: "recovery_publication_api_probe", production: false,
      hostedEquivalent: false, globalS16Passed: false,
      mandatory: Object.fromEntries([
        "authorizedPreviewApply", "callerIdentityAndPrivileges",
        "unauthorizedDirectDmlTruncate", "canonicalCommand", "replayIdempotency",
        "committedReceipt", "canonicalReadback", "archiveDenial",
        "triggerAttachmentAndOwner", "noCompetingDirectDml",
      ].map(k => [k, true])),
      actualDeniedCount: 24,
      denials: roles.flatMap(role => tables.flatMap(table => actions.map(action => ({
        role, table, action, sqlstate: "42501", sha256: "f".repeat(64),
      })))),
      functionIdentities: [
        "public.studio2_apply_show_publication_change(uuid,text,jsonb,timestamptz,uuid,text,bigint)",
        "public.studio2_publish_due_show_publications()",
        "private.studio2_create_show_publication_control()",
        "private.studio2_ensure_show_publication_control(uuid)",
        "private.v3_guard_archived_edition_workflow_write()",
      ],
      archiveLogSha256: "b".repeat(64), committedReadbackSha256: "c".repeat(64),
      committedReadback: {state: "public", version: 2, published: true, receiptCount: 1, auditCount: 1},
    },
  };
}
test("Publication certificate requires two distinct executed sources bound to exact SHA", () => {
  const { report, execution } = fixture();
  const cert = certifyS16Publication(report, execution, sha);
  assert.equal(cert.status, "PASS");
  assert.equal(cert.globalS16Passed, undefined);
  assert.equal(cert.mainS16ReportPassed, false);
  assert.equal(cert.securityFixesReclassified, 0);
  assert.equal(cert.directApiDmlDenials, 24);
});
test("refuses foreign SHA, missing PG17.11 and partial execution proof", () => {
  for (const key of ["candidateSha", "postgresVersion", "network", "status", "runId"]) {
    const { report, execution } = fixture();
    execution[key] = key === "candidateSha" ? "b".repeat(40) : "invalid";
    assert.throws(() => certifyS16Publication(report, execution, sha), /Publication certificate refused/);
  }
  for (const key of Object.keys(fixture().execution.mandatory)) {
    const { report, execution } = fixture();
    execution.mandatory[key] = false;
    assert.throws(() => certifyS16Publication(report, execution, sha), /Publication certificate refused/);
  }
});
test("refuses unclassified real writer, trigger drift and skipped API role/action", () => {
  for (const change of [
    x => x.report.findings.push({ domain: "publication", kind: "unexpected_write_trigger" }),
    x => x.report.findings.push({ domain: "publication", kind: "competing_legacy_writer" }),
    x => x.execution.denials.splice(0,1),
    x => x.execution.denials[0].role = "postgres",
    x => x.execution.denials[0].sqlstate = "23503",
    x => x.execution.functionIdentities.splice(0,1),
    x => x.execution.committedReadback.receiptCount = 0,
    x => x.execution.committedReadback.auditCount = 2,
    x => x.execution.globalS16Passed = true,
    x => x.execution.production = true,
  ]) {
    const f=fixture(); change(f);
    assert.throws(() => certifyS16Publication(f.report, f.execution, sha), /Publication certificate refused/);
  }
});
