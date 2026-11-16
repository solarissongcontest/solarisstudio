#!/usr/bin/env node
/**
 * S16 Publication PG17.11 execution manifest. This consumes the *outputs* of
 * SQL operations that were executed in the networkless recovery database.
 * Source-file presence or a successful job name cannot certify this domain.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";

export const TABLES = [
  "public.studio2_show_publication_controls",
  "public.studio2_show_publication_executions",
];
export const ROLES = ["anon", "authenticated", "service_role"];
export const ACTIONS = ["INSERT", "UPDATE", "DELETE", "TRUNCATE"];
export const EVENTS = [
  "rollback-preview-apply-replay",
  "rollback-schema-data-verified",
  "committed-preview-apply",
  "durable-receipt-readback",
  "cross-session-idempotency",
  "unauthorized-caller-denied",
  "service-scheduler-accepted",
];

export function verifyPublicationExecution({ sha, expectedSha, version, network, ports,
  denials, events, readback, archiveLog, catalogPublicationFindings = [] }) {
  if (!/^[0-9a-f]{40}$/.test(sha) || sha !== expectedSha) throw Error("S16 Publication exact candidate SHA mismatch");
  if (version !== 170011 || network !== "none" || ports !== false) throw Error("S16 Publication requires networkless PostgreSQL 17.11");
  const expected = new Set(ROLES.flatMap(role => TABLES.flatMap(table => ACTIONS.map(action =>
    [role, table, action, "42501"].join("\t")
  ))));
  if (denials.length !== expected.size || new Set(denials).size !== expected.size ||
    denials.some(record => !expected.has(record))) throw Error("S16 Publication needs all 24 real-role SQLSTATE 42501 DML/TRUNCATE denials");
  if (events.length !== EVENTS.length || new Set(events).size !== EVENTS.length ||
    events.some(event => !EVENTS.includes(event))) throw Error("S16 Publication requires each successful runtime stage");
  if (!/PASS: real publication Archive guard rejects INSERT\/UPDATE\/DELETE; canonical control remains intact/.test(archiveLog) ||
    !/ROLLBACK/.test(archiveLog)) throw Error("S16 Publication Archive denial execution proof missing");
  if (readback?.serverVersionNum !== 170011 || readback?.currentUser !== "postgres" ||
    readback?.operatorSuperuser !== false || readback?.sessionUser !== "postgres" ||
    readback?.showState !== "public" || readback?.controlVersion !== 2 ||
    readback?.showPublished !== true || readback?.participantsPublished !== true ||
    readback?.receiptCount !== 1 || readback?.auditCount !== 1 ||
    readback?.actorId !== "71000000-0000-4000-8000-000000000001" ||
    readback?.operationId !== "71000000-0000-4000-8000-000000000005") {
    throw Error("S16 Publication committed state/receipt/privileged identity readback mismatch");
  }
  if (readback?.archiveGuard?.identity !== "private.v3_guard_archived_edition_workflow_write()" ||
    readback?.archiveGuard?.owner !== "postgres" ||
    readback?.archiveGuard?.securityDefiner !== true ||
    readback?.archiveGuard?.type !== 31 ||
    readback?.archiveGuard?.enabled !== "O" ||
    readback?.archiveGuard?.searchPath !== "pg_catalog, public, private" ||
    readback?.archiveGuard?.apiRoleExecute !== false) {
    throw Error("S16 Publication Archive guard attachment/owner/execution authority drift");
  }
  if (catalogPublicationFindings.length) {
    throw Error("S16 Publication has competing writers or unresolved catalog authority: " +
      catalogPublicationFindings.map(f => f.kind + ":" + f.subject).join(", "));
  }
  return {
    candidateSha: sha, domain: "publication", status: "PASS",
    database: { version: "17.11", network: "none", portsPublished: false,
      operator: "postgres", operatorSuperuser: false },
    actualExecution: {
      directDmlDenials: denials.length, archiveInsertUpdateDeleteDenials: 3,
      authorizedPreviewApply: true, committedReceipt: true,
      canonicalReadback: true, replayAndIdempotency: true,
      unauthorizedCallerDenied: true, servicePublisherAccepted: true,
      archiveTriggerIdentityVerified: true, noCompetingDirectPublicationWriter: true,
    },
  };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) {
  const dir = resolve(process.env.S16_PUBLICATION_EVIDENCE_DIR || "v3-release-preflight/s16/publication-execution");
  const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const candidateSha = process.env.EXACT_SHA;
  const text = name => readFileSync(join(dir, name), "utf8");
  const denials = text("direct-dml-42501.tsv").trim().split("\n").filter(Boolean);
  const events = text("executed-stages.txt").trim().split("\n").filter(Boolean);
  const readback = JSON.parse(text("committed-readback.json").trim());
  const archiveLog = text("archive-denials.log");
  const catalogFindingsPath = process.env.S16_PUBLICATION_CATALOG_FINDINGS;
  // This path must be produced by the *same* exact-SHA PG17.11 catalog audit,
  // not a list of filenames. Missing catalog evidence fails closed.
  if (!catalogFindingsPath) throw Error("S16 Publication exact-SHA catalog findings path missing");
  const classified = JSON.parse(readFileSync(catalogFindingsPath, "utf8"));
  if (classified.candidateSha !== sourceSha || classified.postgresVersionNum !== 170011 ||
      classified.domain !== "publication" || !Array.isArray(classified.findings)) {
    throw Error("S16 Publication exact-SHA PG17.11 catalog evidence mismatch");
  }
  const passed = verifyPublicationExecution({
    sha: sourceSha, expectedSha: candidateSha, version: readback.serverVersionNum,
    network: process.env.S16_PUBLICATION_NETWORK, ports: process.env.S16_PUBLICATION_PORTS === "false" ? false : true,
    denials, events, readback, archiveLog, catalogPublicationFindings: classified.findings,
  });
  const files = ["direct-dml-42501.tsv", "executed-stages.txt", "committed-readback.json", "archive-denials.log"];
  const hash = path => createHash("sha256").update(readFileSync(path)).digest("hex");
  const evidence = { schemaVersion: 1, ...passed, workflowRunId: process.env.GITHUB_RUN_ID || null,
    generatedAt: new Date().toISOString(),
    proofSha256: Object.fromEntries(files.map(name => [name, hash(join(dir, name))])),
    catalogFindingsSha256: hash(catalogFindingsPath),
    fixtureSource: "S02 hosted-observed synthetic PG17.11, NOT production-equivalent",
    productionTarget: false, hostedEquivalenceCertified: false,
    fullS16Certified: false, recoveryCertified: false };
  const destination = join(dir, "domain-execution-manifest.json");
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, JSON.stringify(evidence, null, 2) + "\n", { flag: "wx" });
  console.log("S16 Publication PG17.11 execution PASS for exact SHA " + sourceSha);
}
