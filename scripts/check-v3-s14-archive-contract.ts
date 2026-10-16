import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const requireReady = process.argv.includes("--require-ready");
const persistencePath = "src/lib/studio2-persistence.ts";
const persistence = readFileSync(persistencePath, "utf8");

function blockBetween(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  if (from < 0) return "";
  const to = source.indexOf(end, from + start.length);
  return to < 0 ? source.slice(from) : source.slice(from, to);
}

function sqlFiles(root: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) result.push(...sqlFiles(path));
    else if (entry.endsWith(".sql")) result.push(path);
  }
  return result;
}

const requestBlock = blockBetween(
  persistence,
  "export type Studio2TransitionEditionRequest = {",
  "};",
);
const mutationBlock = blockBetween(
  persistence,
  "async transitionEdition(request: Studio2TransitionEditionRequest)",
  "async requestTransitionApproval",
);
const migrations = sqlFiles("supabase/migrations");
const sqlCorpus = migrations.map((path) => readFileSync(path, "utf8")).join("\n");

const requirements = [
  {
    id: "expected-runtime-version",
    ok:
      requestBlock.includes("expectedVersion") &&
      mutationBlock.includes("p_expected_version") &&
      mutationBlock.includes("request.expectedVersion"),
    evidence: persistencePath,
  },
  {
    id: "stable-operation-identity",
    ok:
      requestBlock.includes("operationId") &&
      mutationBlock.includes("p_operation_id") &&
      mutationBlock.includes("request.operationId"),
    evidence: persistencePath,
  },
  {
    id: "stable-idempotency-key",
    ok:
      requestBlock.includes("idempotencyKey") &&
      mutationBlock.includes("p_idempotency_key") &&
      mutationBlock.includes("request.idempotencyKey"),
    evidence: persistencePath,
  },
  {
    id: "server-operation-ledger",
    ok:
      sqlCorpus.includes("studio2_claim_operation") &&
      sqlCorpus.includes("studio2_complete_operation") &&
      /edition[^\n]{0,80}(transition|lifecycle)/i.test(sqlCorpus),
    evidence: "supabase/migrations/**",
  },
  {
    id: "transport-reconciliation",
    ok: sqlCorpus.includes("studio2_reconcile_operation"),
    evidence: "supabase/migrations/**",
  },
] as const;

const blockers = requirements.filter((item) => !item.ok).map((item) => item.id);
const ready = blockers.length === 0;
const report = {
  schemaVersion: 1,
  ready,
  transitionConsumer: persistencePath,
  requirements,
  blockers,
  rationale:
    "S14 Archive must not use the legacy edition transition unless the reviewed runtime version, stable operation/idempotency identity, durable receipt path and transport reconciliation are all present.",
};

if (process.argv.includes("--json")) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
else {
  process.stdout.write(`S14 Archive transition contract: ${ready ? "READY" : "BLOCKED"}\n`);
  if (blockers.length) process.stdout.write(`Missing: ${blockers.join(", ")}\n`);
}

if (requireReady && !ready) process.exit(1);
