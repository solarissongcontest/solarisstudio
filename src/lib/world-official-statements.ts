import { supabase } from "@/integrations/supabase/client";
import { fetchWorldPublicEnabled } from "@/lib/terra-world-public";

export type WorldOfficialStatement = {
  id: string;
  organizationSlug: string;
  organizationName: string;
  issuingOfficeId: string | null;
  publishedAt: string;
  revision: number;
  title: string;
  body: string;
  correctionReason: string | null;
};

export type WorldOfficialStatementVersion = {
  id: string;
  revision: number;
  title: string;
  body: string;
  correctionReason: string | null;
  publishedAt: string;
};

export type WorldOfficialStatementHistory = {
  id: string;
  organizationSlug: string;
  organizationName: string;
  issuingOfficeId: string | null;
  issuedByPersonId: string | null;
  publishedAt: string;
  revision: number;
  versions: WorldOfficialStatementVersion[];
};

export type WorldIssueStatementInput = {
  organizationId: string;
  statementId: string | null;
  issuingOfficeId: string | null;
  title: string;
  body: string;
  correctionReason: string | null;
  expectedRevision: number;
  /** Caller must keep both identifiers stable on retries after network uncertainty. */
  operationId: string;
  idempotencyKey: string;
};

export type WorldIssueStatementReceipt = {
  ok: true;
  statementId: string;
  versionId: string;
  revision: number;
  operationId: string;
  replayed: boolean;
};

const record = (raw: unknown): Record<string, unknown> | null =>
  raw !== null && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown> : null;

const nonempty = (s: unknown): s is string =>
  typeof s === "string" && s.trim().length > 0;
const maybeString = (s: unknown): string | null =>
  s === null ? null : typeof s === "string" && s.trim().length > 0 ? s : null;
const positiveRevision = (n: unknown): n is number =>
  typeof n === "number" && Number.isSafeInteger(n) && n >= 1;
const date = (s: unknown): s is string =>
  typeof s === "string" && Number.isFinite(Date.parse(s));
const safeSlug = (s: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);

export function parseWorldOfficialStatement(raw: unknown): WorldOfficialStatement | null {
  const row = record(raw);
  if (!row || !nonempty(row.id) || !nonempty(row.organizationSlug) ||
      !safeSlug(row.organizationSlug) || !nonempty(row.organizationName) ||
      !date(row.publishedAt) || !positiveRevision(row.revision) ||
      !nonempty(row.title) || !nonempty(row.body) ||
      !(row.issuingOfficeId === null || nonempty(row.issuingOfficeId)) ||
      !(row.correctionReason === null || nonempty(row.correctionReason))) return null;
  return {
    id: row.id, organizationSlug: row.organizationSlug,
    organizationName: row.organizationName, issuingOfficeId: maybeString(row.issuingOfficeId),
    publishedAt: row.publishedAt, revision: row.revision,
    title: row.title, body: row.body,
    correctionReason: maybeString(row.correctionReason),
  };
}

export function parseWorldOfficialStatementHistory(raw: unknown): WorldOfficialStatementHistory | null {
  const row = record(raw);
  if (!row || !nonempty(row.id) || !nonempty(row.organizationSlug) ||
      !safeSlug(row.organizationSlug) || !nonempty(row.organizationName) ||
      !date(row.publishedAt) || !positiveRevision(row.revision) ||
      !(row.issuingOfficeId === null || nonempty(row.issuingOfficeId)) ||
      !(row.issuedByPersonId === null || nonempty(row.issuedByPersonId)) ||
      !Array.isArray(row.versions)) return null;

  const versions: WorldOfficialStatementVersion[] = [];
  for (const rawVersion of row.versions) {
    const v = record(rawVersion);
    if (!v || !nonempty(v.id) || !positiveRevision(v.revision) ||
        !nonempty(v.title) || !nonempty(v.body) || !date(v.publishedAt) ||
        !(v.correctionReason === null || nonempty(v.correctionReason))) return null;
    versions.push({
      id: v.id, revision: v.revision, title: v.title, body: v.body,
      publishedAt: v.publishedAt, correctionReason: maybeString(v.correctionReason),
    });
  }
  // Do not silently accept partial/corrupt history or a fabricated "current" version.
  if (versions.length !== row.revision || versions[0]?.revision !== row.revision ||
      versions.some((v, i) => v.revision !== row.revision - i)) return null;
  return {
    id: row.id, organizationSlug: row.organizationSlug,
    organizationName: row.organizationName, issuingOfficeId: maybeString(row.issuingOfficeId),
    issuedByPersonId: maybeString(row.issuedByPersonId),
    publishedAt: row.publishedAt, revision: row.revision, versions,
  };
}

export async function listWorldOfficialStatements(slug: string, limit = 20): Promise<WorldOfficialStatement[]> {
  if (!safeSlug(slug)) throw new Error("Invalid institution.");
  if (!await fetchWorldPublicEnabled()) throw new Error("World is not available.");
  const { data, error } = await (supabase as any).rpc("world_public_statements_v1", {
    p_organization_slug: slug,
    p_limit: Math.max(1, Math.min(30, Math.trunc(limit))),
  });
  if (error) throw new Error("Official statements could not be loaded.");
  if (!Array.isArray(data)) throw new Error("Official statement response was invalid.");
  const rows = data.map(parseWorldOfficialStatement);
  if (rows.some((row) => row === null)) throw new Error("Official statement response was invalid.");
  return rows as WorldOfficialStatement[];
}

export async function getWorldOfficialStatementHistory(id: string): Promise<WorldOfficialStatementHistory | null> {
  if (!nonempty(id)) throw new Error("Invalid statement identifier.");
  if (!await fetchWorldPublicEnabled()) throw new Error("World is not available.");
  const { data, error } = await (supabase as any).rpc("world_public_statement_history_v1", {
    p_statement_id: id,
  });
  if (error) throw new Error("The statement history could not be loaded.");
  if (data === null) return null;
  const parsed = parseWorldOfficialStatementHistory(data);
  if (!parsed) throw new Error("The statement history was invalid.");
  return parsed;
}

export async function issueWorldOfficialStatement(input: WorldIssueStatementInput): Promise<WorldIssueStatementReceipt> {
  const { organizationId, statementId, issuingOfficeId, title, body, correctionReason,
    expectedRevision, operationId, idempotencyKey } = input;
  if (![organizationId, operationId, idempotencyKey].every(nonempty) ||
      !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 ||
      !title.trim() || title.length > 220 || !body.trim() || body.length > 50000 ||
      (statementId === null && (expectedRevision !== 0 || correctionReason !== null)) ||
      (statementId !== null && (expectedRevision < 1 || !correctionReason?.trim() ||
        correctionReason.trim().length < 5 || correctionReason.length > 2000))) {
    throw new Error("The statement and expected version are required.");
  }
  // Authorization, office ownership, CAS, idempotency, and publication all
  // occur in the governed PostgreSQL operation, never in this browser helper.
  const { data, error } = await (supabase as any).rpc("world_issue_statement_v1", {
    p_organization_id: organizationId,
    p_statement_id: statementId,
    p_issuing_office_id: issuingOfficeId,
    p_title: title.trim(),
    p_body: body.trim(),
    p_correction_reason: correctionReason?.trim() ?? null,
    p_expected_revision: expectedRevision,
    p_operation_id: operationId,
    p_idempotency_key: idempotencyKey,
    p_correlation_id: operationId,
  });
  if (error) throw new Error(error.message || "The statement was not published.");
  // Existing S2 reconcile_operation returns an *envelope* with status and
  // result; the replay marker is on the envelope, not inside result.
  const envelope = record(data);
  const row = record(envelope?.result);
  if (envelope?.status !== "succeeded" || row?.ok !== true ||
      !nonempty(row.statementId) || !nonempty(row.versionId) ||
      !nonempty(row.operationId) || !positiveRevision(row.revision) ||
      typeof envelope.replayed !== "boolean") {
    throw new Error("The statement receipt could not be verified.");
  }
  return {
    ok: true, statementId: row.statementId, versionId: row.versionId,
    revision: row.revision, operationId: row.operationId, replayed: envelope.replayed,
  };
}
