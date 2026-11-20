import { supabase } from "@/integrations/supabase/client";
import { fetchWorldPublicEnabled } from "@/lib/terra-world-public";
import { recoverWorldOfficialOperationEnvelope } from "@/lib/world-official-operation-receipt";

export type WorldProceduralDecisionKind = "procedural" | "scheduling";
export type WorldProceduralDecision = {
  id: string;
  identifier: string;
  organizationSlug: string;
  decisionKind: WorldProceduralDecisionKind;
  publishedAt: string;
  effectiveAt: string | null;
  revision: number;
  title: string;
  excerpt: string;
  corrected: boolean;
};

export type WorldDecisionVersion = {
  id: string;
  revision: number;
  title: string;
  body: string;
  correctionReason: string | null;
  publishedAt: string;
};
export type WorldProceduralDecisionHistory = {
  id: string;
  identifier: string;
  organizationSlug: string;
  decisionKind: WorldProceduralDecisionKind;
  effectiveAt: string | null;
  publishedAt: string;
  revision: number;
  versions: WorldDecisionVersion[];
};
export type WorldIssueDecisionInput = {
  organizationId: string;
  decisionId: string | null;
  issuingOfficeId: string;
  kind: WorldProceduralDecisionKind;
  title: string;
  body: string;
  effectiveAt: string | null;
  correctionReason: string | null;
  expectedRevision: number;
  operationId: string;
  idempotencyKey: string;
};
export type WorldIssueDecisionReceipt = {
  ok: true;
  decisionId: string;
  versionId: string;
  identifier: string;
  revision: number;
  operationId: string;
  replayed: boolean;
};

const rec = (input: unknown): Record<string, unknown> | null =>
  input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown> : null;
const text = (input: unknown): input is string =>
  typeof input === "string" && input.trim().length > 0;
const kind = (input: unknown): input is WorldProceduralDecisionKind =>
  input === "procedural" || input === "scheduling";
const date = (input: unknown): input is string =>
  typeof input === "string" && Number.isFinite(Date.parse(input));
const nullableDate = (input: unknown) => input === null || date(input);
const revision = (input: unknown): input is number =>
  typeof input === "number" && Number.isSafeInteger(input) && input > 0;
const slug = (input: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input);

export function parseWorldProceduralDecision(input: unknown): WorldProceduralDecision | null {
  const r = rec(input);
  if (!r || !text(r.id) || !text(r.identifier) ||
      !text(r.organizationSlug) || !slug(r.organizationSlug) ||
      !kind(r.decisionKind) || !date(r.publishedAt) ||
      !nullableDate(r.effectiveAt) || !revision(r.revision) ||
      !text(r.title) || typeof r.excerpt !== "string" ||
      typeof r.corrected !== "boolean" ||
      r.corrected !== (r.revision > 1)) return null;
  return {
    id: r.id, identifier: r.identifier, organizationSlug: r.organizationSlug,
    decisionKind: r.decisionKind, publishedAt: r.publishedAt,
    effectiveAt: r.effectiveAt as string | null, revision: r.revision,
    title: r.title, excerpt: r.excerpt, corrected: r.corrected,
  };
}

export function parseWorldProceduralDecisionHistory(input: unknown): WorldProceduralDecisionHistory | null {
  const r = rec(input);
  if (!r || !text(r.id) || !text(r.identifier) ||
      !text(r.organizationSlug) || !slug(r.organizationSlug) ||
      !kind(r.decisionKind) || !date(r.publishedAt) ||
      !nullableDate(r.effectiveAt) || !revision(r.revision) ||
      !Array.isArray(r.versions)) return null;
  const versions: WorldDecisionVersion[] = [];
  for (const value of r.versions) {
    const v = rec(value);
    if (!v || !text(v.id) || !revision(v.revision) ||
        !text(v.title) || !text(v.body) || !date(v.publishedAt) ||
        !(v.correctionReason === null || text(v.correctionReason))) return null;
    versions.push({
      id: v.id, revision: v.revision,
      title: v.title, body: v.body,
      correctionReason: v.correctionReason as string | null,
      publishedAt: v.publishedAt,
    });
  }
  if (versions.length !== r.revision ||
      versions.some((v, i) => v.revision !== r.revision - i)) return null;
  return {
    id: r.id, identifier: r.identifier, organizationSlug: r.organizationSlug,
    decisionKind: r.decisionKind, effectiveAt: r.effectiveAt as string | null,
    publishedAt: r.publishedAt, revision: r.revision, versions,
  };
}

export async function listWorldProceduralDecisions(slugValue: string, limit = 20) {
  if (!slug(slugValue)) throw new Error("Invalid organization.");
  if (!await fetchWorldPublicEnabled()) throw new Error("World is not available.");
  const { data, error } = await (supabase as any).rpc("world_public_executive_decisions_v1", {
    p_organization_slug: slugValue,
    p_limit: Number.isFinite(limit) ? Math.min(30, Math.max(1, Math.trunc(limit))) : 20,
  });
  if (error) throw new Error("Executive decisions could not be loaded.");
  if (!Array.isArray(data)) throw new Error("Invalid executive decision list.");
  const list = data.map(parseWorldProceduralDecision);
  if (list.some((d) => d === null)) throw new Error("Invalid executive decision list.");
  return list as WorldProceduralDecision[];
}

export async function getWorldProceduralDecisionHistory(decisionId: string) {
  if (!text(decisionId)) throw new Error("Invalid decision identifier.");
  if (!await fetchWorldPublicEnabled()) throw new Error("World is not available.");
  const { data, error } = await (supabase as any).rpc("world_public_executive_decision_history_v1", {
    p_decision_id: decisionId,
  });
  if (error) throw new Error("Executive decision record could not be loaded.");
  if (data === null) return null;
  const value = parseWorldProceduralDecisionHistory(data);
  if (!value) throw new Error("Executive decision history was incomplete.");
  return value;
}

export async function issueWorldProceduralDecision(input: WorldIssueDecisionInput): Promise<WorldIssueDecisionReceipt> {
  if (![input.organizationId,input.issuingOfficeId,input.operationId,input.idempotencyKey].every(text) ||
      !kind(input.kind) || !text(input.title) || input.title.length > 220 ||
      !text(input.body) || input.body.length > 50000 ||
      !nullableDate(input.effectiveAt) ||
      !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 ||
      (input.decisionId === null && (input.expectedRevision !== 0 || input.correctionReason !== null)) ||
      (input.decisionId !== null && (!text(input.decisionId) || input.expectedRevision < 1 ||
        !text(input.correctionReason) || input.correctionReason.trim().length < 5 ||
        input.correctionReason.length > 2000))) {
    throw new Error("The decision, correction reason and exact version must be supplied.");
  }
  // The authoritative server command independently checks live organization
  // state, executive office holder, platform mode, expected revision, and S2
  // operation identity. No client writes to the decision tables.
  const { data, error } = await (supabase as any).rpc("world_issue_executive_decision_v1", {
    p_organization_id: input.organizationId,
    p_decision_id: input.decisionId,
    p_issuing_office_id: input.issuingOfficeId,
    p_kind: input.kind,
    p_title: input.title.trim(),
    p_body: input.body.trim(),
    p_effective_at: input.effectiveAt,
    p_correction_reason: input.correctionReason?.trim() ?? null,
    p_expected_revision: input.expectedRevision,
    p_operation_id: input.operationId,
    p_idempotency_key: input.idempotencyKey,
    p_correlation_id: input.operationId,
  });
  const reconciled = await recoverWorldOfficialOperationEnvelope(
    { data, error },
    input.operationId,
    input.decisionId === null ? "world.decision.publish" : "world.decision.correct",
  );
  const envelope = rec(reconciled);
  const result = rec(envelope?.result);
  if (envelope?.status !== "succeeded" || typeof envelope.replayed !== "boolean" ||
      !result || result.ok !== true ||
      !text(result.decisionId) || !text(result.versionId) ||
      !text(result.identifier) || !text(result.operationId) ||
      !revision(result.revision)) throw new Error("Decision receipt was invalid.");
  return {
    ok: true, decisionId: result.decisionId,
    versionId: result.versionId, identifier: result.identifier,
    operationId: result.operationId, revision: result.revision,
    replayed: envelope.replayed,
  };
}
