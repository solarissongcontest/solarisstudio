import { createHash } from "node:crypto";
import ts from "typescript";
import type {
  V3S16CatalogEvidence,
  V3S16Finding,
  V3S16Report,
  V3S16SourceFile,
} from "../../src/lib/v3-s16-mutation-authority";
import type { V3S16ClassifiedFinding } from "../../src/lib/v3-s16-release-risk";

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function identity(finding: V3S16Finding | V3S16ClassifiedFinding) {
  const key = [
    finding.domain,
    finding.kind,
    finding.subject,
    finding.path ?? null,
    finding.detail,
  ];
  if (finding.mutationTarget) key.push(`target:${finding.mutationTarget}`);
  if (finding.objectSignature) key.push(`signature:${finding.objectSignature}`);
  return key;
}

function mutations(source: V3S16SourceFile | undefined, target: string) {
  if (!source) return [];
  const tree = ts.createSourceFile(
    source.path,
    source.source,
    ts.ScriptTarget.Latest,
    true,
    source.path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found: { line: number; type: string; caller: string | null }[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ["insert", "upsert", "update", "delete"].includes(node.expression.name.text)
    ) {
      let receiver: ts.Expression = node.expression.expression;
      while (ts.isCallExpression(receiver) && ts.isPropertyAccessExpression(receiver.expression)) {
        const arg = receiver.arguments[0];
        if (
          receiver.expression.name.text === "from" &&
          arg &&
          ts.isStringLiteralLike(arg) &&
          [target, target.split(".").at(-1)].includes(arg.text)
        ) {
          let parent: ts.Node | undefined = node.parent;
          let caller: string | null = null;
          while (parent) {
            if (ts.isFunctionDeclaration(parent) && parent.name) {
              caller = parent.name.text;
              break;
            }
            if (
              ts.isVariableDeclaration(parent) &&
              ts.isIdentifier(parent.name) &&
              parent.initializer &&
              (ts.isArrowFunction(parent.initializer) ||
                ts.isFunctionExpression(parent.initializer))
            ) {
              caller = parent.name.text;
              break;
            }
            parent = parent.parent;
          }
          found.push({
            line: tree.getLineAndCharacterOfPosition(node.expression.name.getStart(tree)).line + 1,
            type: node.expression.name.text,
            caller,
          });
          break;
        }
        receiver = receiver.expression.expression;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return found;
}

/** Accounting only: every raw occurrence and supplemental release finding is
 * retained. Results ownership never converts a blocking finding into a pass. */
export function buildV3S16FindingLedger(input: {
  candidateSha: string;
  raw: readonly V3S16Finding[];
  classified: readonly V3S16ClassifiedFinding[];
  domains: V3S16Report["domains"];
  files: readonly V3S16SourceFile[];
  catalog: V3S16CatalogEvidence | null;
  catalogReference: string | null;
}) {
  const byIdentity = new Map<
    string,
    { finding: V3S16Finding | V3S16ClassifiedFinding; raw: number[]; classified: boolean }
  >();
  input.raw.forEach((finding, index) => {
    const key = JSON.stringify(identity(finding));
    const row = byIdentity.get(key) ?? { finding, raw: [], classified: false };
    row.raw.push(index);
    byIdentity.set(key, row);
  });
  for (const finding of input.classified) {
    const key = JSON.stringify(identity(finding));
    const row = byIdentity.get(key) ?? { finding, raw: [], classified: false };
    row.finding = finding;
    row.classified = true;
    byIdentity.set(key, row);
  }
  const catalog = input.catalog;
  const rows = [...byIdentity.values()]
    .map(({ finding, raw, classified }) => {
      const domain = input.domains.find((d) => d.id === finding.domain);
      const source = input.files.find((f) => f.path === finding.path);
      const targets = new Set<string>();
      if (finding.mutationTarget) targets.add(finding.mutationTarget);
      const functions = (catalog?.functions ?? []).filter((f) =>
        finding.objectSignature
          ? f.signature === finding.objectSignature ||
            (!f.signature && f.name === finding.objectSignature)
          : f.name === finding.subject || f.signature === finding.subject,
      );
      const attachments = (catalog?.tables ?? []).flatMap((table) =>
        (table.triggerDefinitions ?? [])
          .filter(
            (t) =>
              t.name === finding.subject &&
              domain?.canonicalTables.includes(table.table) &&
              (!finding.mutationTarget || table.table === finding.mutationTarget),
          )
          .map((t) => ({
            table: table.table,
            name: t.name,
            type: t.type,
            enabled: t.enabled,
            signature: t.functionSignature,
            definition_hash: t.definitionHash ?? null,
          })),
      );
      for (const attachment of attachments) {
        targets.add(attachment.table);
        const fn = catalog?.functions.find((f) => f.signature === attachment.signature);
        if (fn && !functions.includes(fn)) functions.push(fn);
      }
      const tables = (catalog?.tables ?? []).filter(
        (t) =>
          t.table === finding.subject ||
          finding.subject.startsWith(`${t.table}.`) ||
          attachments.some((a) => a.table === t.table),
      );
      for (const table of tables) targets.add(table.table);
      for (const fn of functions)
        for (const table of fn.writesTables ?? [])
          if (
            domain?.canonicalTables.includes(table) &&
            (!finding.mutationTarget || table === finding.mutationTarget)
          )
            targets.add(table);
      if (finding.kind === "direct_application_writer") targets.add(finding.subject);
      const sourceMutations = mutations(source, finding.subject);
      const databaseObjects = functions
        .map((f) => ({
          signature: f.signature ?? f.name,
          definition_hash: f.definitionHash ?? null,
          owner: f.owner,
          security_definer: f.securityDefiner,
          search_path: f.searchPath,
          execute_roles: [...f.executeRoles].sort(),
          callers: (f.callers ?? [])
            .map(
              (oid) => catalog?.functions.find((c) => c.oid === oid)?.signature ?? `unknown:${oid}`,
            )
            .sort(),
        }))
        .sort((a, b) => a.signature.localeCompare(b.signature));
      const owner = domain?.ownerBoundary;
      const knownOwner = owner && owner === finding.ownerBoundary;
      const findingId = `s16-${digest(identity(finding)).slice(0, 24)}`;
      const evidence = {
        source_sha256: source ? createHash("sha256").update(source.source).digest("hex") : null,
        database_objects: databaseObjects,
        attachments,
        tables: tables.map((t) => ({
          table: t.table,
          owner: t.owner,
          rls: t.rlsEnabled,
          dml_roles: [...t.dmlRoles].sort(),
          column_dml_grants: [...(t.columnDmlGrants ?? [])].sort((a, b) =>
            JSON.stringify(a).localeCompare(JSON.stringify(b)),
          ),
          updatable_views: t.updatableViews ?? [],
        })),
      };
      return {
        finding_id: findingId,
        fingerprint: digest([
          identity(finding),
          domain?.canonicalOwner,
          finding.ownerBoundary,
          evidence,
        ]),
        source_location: finding.path ? { path: finding.path, mutations: sourceMutations } : null,
        database_object: databaseObjects.length
          ? databaseObjects
          : attachments.length
            ? attachments
            : finding.subject,
        mutation_target: [...targets].sort(),
        mutation_type: sourceMutations.length
          ? [...new Set(sourceMutations.map((m) => m.type))]
          : finding.kind,
        caller: source
          ? sourceMutations.map((m) => m.caller)
          : databaseObjects.flatMap((f) => f.callers),
        domain_owner: domain?.canonicalOwner ?? null,
        domain: finding.domain,
        classification:
          !classified || !knownOwner
            ? "unexplained"
            : owner === "results_pr_1400"
              ? "results_owned"
              : "shared_unresolved",
        proof_type: source ? "static_source" : "pg_catalog",
        proof_status: "unresolved",
        evidence_reference: source ? finding.path : input.catalogReference,
        disposition: owner === "results_pr_1400" ? "resolve_in_pr_1400" : "implement_or_prove",
        release_risk: finding.releaseRisk,
        raw_occurrence_indexes: raw,
        classified,
        detail: finding.detail,
        evidence,
      };
    })
    .sort((a, b) => a.finding_id.localeCompare(b.finding_id));
  const rawCovered = rows.reduce((sum, row) => sum + row.raw_occurrence_indexes.length, 0);
  const classifiedRows = rows.filter((row) => row.classified);
  const summary = {
    raw_total: input.raw.length,
    raw_source: input.raw.filter((f) => Boolean(f.path)).length,
    raw_runtime: input.raw.filter((f) => !f.path).length,
    raw_duplicates:
      input.raw.length - rows.filter((row) => row.raw_occurrence_indexes.length).length,
    supplemental_release_findings: rows.filter((row) => !row.raw_occurrence_indexes.length).length,
    classified_total: classifiedRows.length,
    classified_results_owned: classifiedRows.filter((row) => row.classification === "results_owned")
      .length,
    classified_shared: classifiedRows.filter((row) => row.classification === "shared_unresolved")
      .length,
    unexplained: rows.filter((row) => row.classification === "unexplained").length,
    conditional: classifiedRows.filter((row) => row.release_risk === "conditional_blocker").length,
  };
  const reconciled =
    catalog?.candidateSha === input.candidateSha &&
    rawCovered === input.raw.length &&
    summary.unexplained === 0 &&
    summary.raw_source + summary.raw_runtime === summary.raw_total &&
    summary.raw_total - summary.raw_duplicates + summary.supplemental_release_findings ===
      summary.classified_total &&
    summary.classified_results_owned + summary.classified_shared === summary.classified_total;
  return {
    schema_version: 1,
    candidate_sha: input.candidateSha,
    reconciled,
    summary,
    findings: rows,
  };
}
