import { supabase } from "@/integrations/supabase/client";
import { fetchWorldPublicEnabled } from "@/lib/terra-world-public";

export type WorldCertifiedResolution = {
  id: string;
  identifier: string;
  title: string;
  organizationSlug: string;
  organizationName: string;
  status: "adopted" | "effective" | "superseded" | "repealed" | "expired";
  adoptedAt: string;
  voteId: string;
  measureId: string;
  resultHash: string;
};
export type WorldCertifiedResolutionDetail = Omit<WorldCertifiedResolution, "measureId"> & {
  text: string;
  effectiveAt: string | null;
  sourceMeasureId: string;
  adoptedVersionId: string;
  sourceVersionHash: string;
  revision: number;
};
export type WorldResolutionCandidate = {
  voteId: string;
  measureId: string;
  organizationId: string;
  identifier: string;
  title: string;
  text: string;
  resultHash: string;
  certifiedAt: string;
  expectedMeasureRevision: number;
};
export type WorldResolutionReceipt = {
  ok: true;
  resolutionId: string;
  voteId: string;
  sourceMeasureId: string;
  identifier: string;
  status: "adopted";
  revision: 1;
  operationId: string;
  replayed: boolean;
};

const uuid = (raw: unknown): raw is string =>
  typeof raw === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw);
const slug = (raw: unknown): raw is string =>
  typeof raw === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw);
const text = (raw: unknown): raw is string => typeof raw === "string" && raw.trim().length > 0;
const instant = (raw: unknown): raw is string =>
  typeof raw === "string" && Number.isFinite(Date.parse(raw));
const revision = (raw: unknown): raw is number =>
  typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 1;
const record = (raw: unknown): Record<string, unknown> | null =>
  raw !== null && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown> : null;
const statuses = new Set(["adopted", "effective", "superseded", "repealed", "expired"]);
const hash = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

export function parseWorldCertifiedResolution(raw: unknown): WorldCertifiedResolution | null {
  const r = record(raw);
  if (!r || !uuid(r.id) || !text(r.identifier) || !text(r.title) ||
      !slug(r.organizationSlug) || !text(r.organizationName) ||
      typeof r.status !== "string" || !statuses.has(r.status) ||
      !instant(r.adoptedAt) || !uuid(r.voteId) || !uuid(r.measureId) || !hash(r.resultHash)) return null;
  return {
    id: r.id, identifier: r.identifier, title: r.title,
    organizationSlug: r.organizationSlug, organizationName: r.organizationName,
    status: r.status as WorldCertifiedResolution["status"], adoptedAt: r.adoptedAt,
    voteId: r.voteId, measureId: r.measureId, resultHash: r.resultHash,
  };
}
export function parseWorldCertifiedResolutionDetail(raw: unknown): WorldCertifiedResolutionDetail | null {
  const r = record(raw);
  const base = parseWorldCertifiedResolution(r && { ...r, measureId: r.sourceMeasureId });
  if (!base || !r || !text(r.text) || !uuid(r.sourceMeasureId) ||
      !uuid(r.adoptedVersionId) || !hash(r.sourceVersionHash) ||
      !revision(r.revision) || !(r.effectiveAt === null || instant(r.effectiveAt))) return null;
  return {
    id: base.id, identifier: base.identifier, title: base.title,
    organizationSlug: base.organizationSlug, organizationName: base.organizationName,
    status: base.status, adoptedAt: base.adoptedAt,
    voteId: base.voteId, resultHash: base.resultHash,
    text: r.text, sourceMeasureId: r.sourceMeasureId,
    adoptedVersionId: r.adoptedVersionId, sourceVersionHash: r.sourceVersionHash,
    revision: r.revision, effectiveAt: r.effectiveAt,
  };
}
export function parseWorldResolutionCandidate(raw: unknown): WorldResolutionCandidate | null {
  const r = record(raw);
  if (!r || !uuid(r.voteId) || !uuid(r.measureId) || !uuid(r.organizationId) ||
      !text(r.identifier) || !text(r.title) || !text(r.text) ||
      !instant(r.certifiedAt) || !hash(r.resultHash) || !revision(r.expectedMeasureRevision)) return null;
  return {
    voteId: r.voteId, measureId: r.measureId, organizationId: r.organizationId,
    identifier: r.identifier, title: r.title, text: r.text,
    certifiedAt: r.certifiedAt, resultHash: r.resultHash,
    expectedMeasureRevision: r.expectedMeasureRevision,
  };
}
export function parseWorldResolutionReceipt(raw: unknown): WorldResolutionReceipt | null {
  const r = record(raw);
  if (!r || r.ok !== true || !uuid(r.resolutionId) || !uuid(r.voteId) ||
      !uuid(r.sourceMeasureId) || !uuid(r.operationId) ||
      !text(r.identifier) || r.status !== "adopted" || r.revision !== 1 ||
      typeof r.replayed !== "boolean") return null;
  return {
    ok: true, resolutionId: r.resolutionId, voteId: r.voteId,
    sourceMeasureId: r.sourceMeasureId, operationId: r.operationId,
    identifier: r.identifier, status: "adopted", revision: 1, replayed: r.replayed,
  };
}

export async function listWorldCertifiedResolutions(orgSlug: string): Promise<WorldCertifiedResolution[]> {
  if (!slug(orgSlug)) throw new Error("Invalid institution.");
  if (!await fetchWorldPublicEnabled()) throw new Error("World is not available.");
  const { data, error } = await (supabase as any).rpc("world_public_resolutions_v1", {
    p_organization_slug: orgSlug, p_limit: 20,
  });
  if (error || !Array.isArray(data)) throw new Error("Official resolutions are unavailable.");
  const parsed = data.map(parseWorldCertifiedResolution);
  if (parsed.some((item) => item === null)) throw new Error("The official resolution projection was invalid.");
  return parsed as WorldCertifiedResolution[];
}

export async function getWorldCertifiedResolution(id: string): Promise<WorldCertifiedResolutionDetail | null> {
  if (!uuid(id)) throw new Error("Invalid resolution.");
  if (!await fetchWorldPublicEnabled()) throw new Error("World is not available.");
  const { data, error } = await (supabase as any).rpc("world_public_resolution_v1", {
    p_resolution_id: id,
  });
  if (error) throw new Error("Official resolution could not be loaded.");
  if (data === null) return null;
  const parsed = parseWorldCertifiedResolutionDetail(data);
  if (!parsed) throw new Error("The official resolution response was invalid.");
  return parsed;
}

/** Requires actual publisher authority on server, never a public vote preview. */
export async function getWorldResolutionCandidate(voteId: string): Promise<WorldResolutionCandidate | null> {
  if (!uuid(voteId)) throw new Error("Invalid vote.");
  const { data, error } = await (supabase as any).rpc("world_resolution_candidate_v1", {
    p_vote_id: voteId,
  });
  if (error) throw new Error(error.message || "The certified resolution preview is unavailable.");
  if (data === null) return null;
  const candidate = parseWorldResolutionCandidate(data);
  if (!candidate || candidate.voteId !== voteId)
    throw new Error("The certified resolution preview was invalid.");
  return candidate;
}

/** One R2 operation, stable IDs on retry, only TG8/TG7 frozen source on server. */
export async function materializeWorldCertifiedResolution(input: {
  voteId: string;
  expectedMeasureRevision: number;
  operationId: string;
  idempotencyKey: string;
}): Promise<WorldResolutionReceipt> {
  if (!uuid(input.voteId) || !uuid(input.operationId) ||
      !revision(input.expectedMeasureRevision) ||
      !text(input.idempotencyKey) || input.idempotencyKey.length < 8)
    throw new Error("The certified vote and operation identity are required.");

  const { data, error } = await (supabase as any).rpc("world_materialize_certified_resolution_v1", {
    p_vote_id: input.voteId,
    p_expected_measure_revision: input.expectedMeasureRevision,
    p_operation_id: input.operationId,
    p_idempotency_key: input.idempotencyKey,
    p_correlation_id: input.operationId,
  });
  if (error) throw new Error(error.message || "Resolution publication was not confirmed.");
  const receipt = parseWorldResolutionReceipt(data);
  if (!receipt || receipt.voteId !== input.voteId ||
      receipt.operationId !== input.operationId)
    throw new Error("Official publication receipt could not be verified.");
  return receipt;
}
