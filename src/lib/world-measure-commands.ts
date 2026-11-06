import { supabase } from "@/integrations/supabase/client";
import { listWorldOrganizationOptions } from "@/lib/world-session-public";

// TG7 transport only. The existing TG7 RPCs are the sole writers. These
// projections are validated before reaching any public or private UI.
const client = supabase as any;
type RecordValue = Record<string, unknown>;
const obj = (x: unknown): x is RecordValue =>
  x !== null && typeof x === "object" && !Array.isArray(x);
export const isWorldUuid = (x: unknown): x is string =>
  typeof x === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const str = (x: unknown): x is string => typeof x === "string";
const optional = (x: unknown): x is string | null => x === null || str(x);
const rev = (x: unknown): x is number => Number.isSafeInteger(x) && (x as number) >= 1;
const fail = (message: string): never => { throw new Error("Invalid institutional measure " + message + " projection."); };
const states = new Set(["registered", "scheduled", "under_debate", "voting", "adopted",
  "rejected", "withdrawn", "superseded", "repealed", "archived"]);
const kinds = new Set(["proposal", "bill", "motion", "draft_resolution", "membership_application",
  "membership_expulsion", "charter_amendment", "rule_amendment", "union_recognition",
  "procedural_motion", "sanction_motion", "other"]);

export type WorldMeasureListItem = {
  id: string; organizationSlug: string; organName: string; identifier: string;
  shortTitle: string | null; measureType: string; title: string; summary: string | null;
  state: string; sponsorCountryCode: string; categoryCode: string | null;
  submittedAt: string; registeredAt: string; revision: number;
};
export type WorldMeasureVersion = {
  id: string; number: number; title: string; text: string; summary: string | null;
  contentHash: string; createdAt: string;
};
export type WorldMeasureDetail = WorldMeasureListItem & {
  categoryLabel: string | null; currentVersion: WorldMeasureVersion;
  publishedHistory: Array<Pick<WorldMeasureVersion, "id" | "number" | "title" | "contentHash" | "createdAt">>;
};
export type WorldMeasureReview = { action: string; note: string | null; revision: number; createdAt: string };
export type WorldMeasureManager = {
  id: string; organizationId: string; organId: string; sponsorCountryId: string;
  state: string; visibility: string; identifier: string | null; proceduralNote: string | null;
  revision: number; versions: Array<Pick<WorldMeasureVersion, "id" | "number" | "title" | "text" | "summary" | "createdAt"> & { publicationState: string }>;
  versionsTruncated: boolean; reviews: WorldMeasureReview[]; reviewsTruncated: boolean;
};
export type WorldMeasureReceipt = {
  ok: true; measureId: string; operationId: string; revision: number; state: string; replayed: boolean;
};
export type WorldMeasureCategory = { code: string; label: string };
export type WorldMeasureOrganization = Awaited<ReturnType<typeof listWorldOrganizationOptions>>[number];

function parseVersion(value: unknown): WorldMeasureVersion {
  if (!obj(value) || !isWorldUuid(value.id) || !rev(value.number) ||
      !str(value.title) || !str(value.text) || !optional(value.summary) ||
      !str(value.contentHash) || !str(value.createdAt)) return fail("version");
  return { id: value.id, number: value.number, title: value.title, text: value.text,
    summary: value.summary, contentHash: value.contentHash, createdAt: value.createdAt };
}
export function parseWorldMeasureListItem(value: unknown): WorldMeasureListItem {
  if (!obj(value) || !isWorldUuid(value.id) || !str(value.organizationSlug) ||
      !str(value.organName) || !str(value.identifier) || !value.identifier ||
      !optional(value.shortTitle) || !str(value.measureType) || !kinds.has(value.measureType) ||
      !str(value.title) || !optional(value.summary) || !str(value.state) ||
      !states.has(value.state) || !str(value.sponsorCountryCode) ||
      !optional(value.categoryCode) || !str(value.submittedAt) ||
      !str(value.registeredAt) || !rev(value.revision)) return fail("public list");
  return {
    id: value.id, organizationSlug: value.organizationSlug, organName: value.organName,
    identifier: value.identifier, shortTitle: value.shortTitle, measureType: value.measureType,
    title: value.title, summary: value.summary, state: value.state,
    sponsorCountryCode: value.sponsorCountryCode, categoryCode: value.categoryCode,
    submittedAt: value.submittedAt, registeredAt: value.registeredAt, revision: value.revision,
  };
}
export function parseWorldMeasureDetail(value: unknown): WorldMeasureDetail | null {
  if (value === null) return null;
  if (!obj(value) || !optional(value.categoryLabel) || !obj(value.currentVersion) ||
      !Array.isArray(value.publishedHistory) || value.publishedHistory.length > 25) {
    return fail("public detail");
  }
  const currentVersion = parseVersion(value.currentVersion);
  const history = value.publishedHistory.map((item: unknown) => {
    if (!obj(item) || !isWorldUuid(item.id) || !rev(item.number) ||
        !str(item.title) || !str(item.contentHash) || !str(item.createdAt)) {
      return fail("history");
    }
    return { id: item.id, number: item.number, title: item.title,
      contentHash: item.contentHash, createdAt: item.createdAt };
  });
  return { ...parseWorldMeasureListItem(value), categoryLabel: value.categoryLabel,
    currentVersion, publishedHistory: history };
}
export function parseWorldMeasureManager(value: unknown): WorldMeasureManager {
  if (!obj(value) || !isWorldUuid(value.id) || !isWorldUuid(value.organizationId) ||
      !isWorldUuid(value.organId) || !isWorldUuid(value.sponsorCountryId) ||
      !str(value.state) || !str(value.visibility) || !optional(value.identifier) ||
      !optional(value.proceduralNote) || !rev(value.revision) ||
      !Array.isArray(value.versions) || value.versions.length > 20 ||
      !Array.isArray(value.reviews) || value.reviews.length > 50 ||
      typeof value.versionsTruncated !== "boolean" ||
      typeof value.reviewsTruncated !== "boolean") return fail("manager");
  const versions = value.versions.map((item: unknown) => {
    if (!obj(item) || !isWorldUuid(item.id) || !rev(item.number) ||
        !str(item.title) || !str(item.text) || !optional(item.summary) ||
        !str(item.createdAt) || !str(item.publicationState)) return fail("private version");
    return { id: item.id, number: item.number, title: item.title, text: item.text,
      summary: item.summary, createdAt: item.createdAt, publicationState: item.publicationState };
  });
  const reviews = value.reviews.map((item: unknown) => {
    if (!obj(item) || !str(item.action) || !optional(item.note) ||
        !rev(item.revision) || !str(item.createdAt)) return fail("review");
    return { action: item.action, note: item.note, revision: item.revision, createdAt: item.createdAt };
  });
  return { id: value.id, organizationId: value.organizationId, organId: value.organId,
    sponsorCountryId: value.sponsorCountryId, state: value.state, visibility: value.visibility,
    identifier: value.identifier, proceduralNote: value.proceduralNote, revision: value.revision,
    versions, versionsTruncated: value.versionsTruncated, reviews, reviewsTruncated: value.reviewsTruncated };
}
export function parseWorldMeasureReceipt(value: unknown, expectedOperationId: string): WorldMeasureReceipt {
  if (!obj(value) || value.ok !== true || !isWorldUuid(value.measureId) ||
      value.operationId !== expectedOperationId || !rev(value.revision) ||
      !str(value.state) || typeof value.replayed !== "boolean") return fail("receipt");
  return { ok: true, measureId: value.measureId, operationId: expectedOperationId,
    revision: value.revision, state: value.state, replayed: value.replayed };
}
async function rpc(name: string, args: RecordValue): Promise<unknown> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data;
}
export async function listWorldMeasures(organizationSlug: string | null): Promise<WorldMeasureListItem[]> {
  const data = await rpc("world_measure_public_list_v1", {
    p_organization_slug: organizationSlug, p_limit: 50,
  });
  if (!Array.isArray(data) || data.length > 50) return fail("collection");
  return data.map(parseWorldMeasureListItem);
}
export async function getWorldMeasureDetail(id: string): Promise<WorldMeasureDetail | null> {
  if (!isWorldUuid(id)) return null;
  return parseWorldMeasureDetail(await rpc("world_measure_public_detail_v1", { p_measure_id: id }));
}
export async function getWorldMeasureManager(id: string): Promise<WorldMeasureManager> {
  if (!isWorldUuid(id)) return fail("ID");
  return parseWorldMeasureManager(await rpc("world_measure_manage_v1", { p_measure_id: id }));
}
export async function listWorldMeasureCategories(slug: string): Promise<WorldMeasureCategory[]> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return fail("organization");
  const rows = await rpc("world_measure_categories_public_v1", { p_organization_slug: slug });
  if (!Array.isArray(rows) || rows.length > 100) return fail("categories");
  return rows.map((item: unknown) => {
    if (!obj(item) || !str(item.code) || !str(item.label) ||
        !item.code || !item.label || item.code.length > 30 || item.label.length > 160) {
      return fail("category");
    }
    return { code: item.code, label: item.label };
  });
}
export async function listWorldMeasureOrganizations(): Promise<WorldMeasureOrganization[]> {
  return listWorldOrganizationOptions();
}
/** Only current country_accounts determines account control. UI selection is NOT authority. */
export async function getMyWorldControlledCountry(): Promise<string | null> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) return null;
  const { data, error } = await client.from("country_accounts")
    .select("country_id").eq("user_id", auth.user.id).limit(2);
  if (error) throw error;
  if (!Array.isArray(data) || data.length > 1 ||
      (data.length === 1 && !isWorldUuid(data[0]?.country_id))) return fail("country control");
  return data.length ? data[0].country_id : null;
}
export type WorldMeasureSubmitInput = {
  organizationId: string; organId: string; sponsorCountryId: string;
  measureType: string; title: string; fullText: string; summary: string;
  categoryCode: string | null; operationId: string;
};
export type WorldMeasureRevisionInput = {
  measureId: string; expectedRevision: number; operationId: string;
};
export function validateWorldMeasureSubmit(input: WorldMeasureSubmitInput): string | null {
  if (![input.organizationId, input.organId, input.sponsorCountryId, input.operationId].every(isWorldUuid)) {
    return "The institution, country or operation identity could not be verified.";
  }
  if (!kinds.has(input.measureType)) return "Select a supported measure type.";
  if (!input.title.trim() || input.title.trim().length > 180) return "Enter a title up to 180 characters.";
  if (!input.fullText.trim() || input.fullText.trim().length > 25000) return "Enter measure text up to 25,000 characters.";
  if (input.summary.length > 2000) return "Keep the summary under 2,000 characters.";
  if (input.categoryCode !== null && !/^[A-Za-z0-9_-]{1,30}$/.test(input.categoryCode)) {
    return "Choose a valid institutional category.";
  }
  return null;
}
export async function submitWorldMeasure(input: WorldMeasureSubmitInput): Promise<WorldMeasureReceipt> {
  const problem = validateWorldMeasureSubmit(input);
  if (problem) throw new Error(problem);
  const data = await rpc("world_measure_submit_v1", {
    p_organization_id: input.organizationId, p_organ_id: input.organId,
    p_sponsor_country_id: input.sponsorCountryId, p_measure_type: input.measureType,
    p_title: input.title.trim(), p_full_text: input.fullText.trim(),
    p_summary: input.summary.trim(), p_category_code: input.categoryCode,
    p_operation_id: input.operationId,
    p_idempotency_key: "world.measure.submit:" + input.operationId,
  });
  return parseWorldMeasureReceipt(data, input.operationId);
}
export async function resubmitWorldMeasure(input: WorldMeasureRevisionInput & {
  title: string; fullText: string; summary: string;
}): Promise<WorldMeasureReceipt> {
  if (!isWorldUuid(input.measureId) || !isWorldUuid(input.operationId) ||
      !rev(input.expectedRevision) || !input.title.trim() ||
      input.title.trim().length > 180 || !input.fullText.trim() ||
      input.fullText.trim().length > 25000 || input.summary.length > 2000) {
    throw new Error("Review the current version and corrected measure text.");
  }
  const data = await rpc("world_measure_resubmit_v1", {
    p_measure_id: input.measureId, p_title: input.title.trim(),
    p_full_text: input.fullText.trim(), p_summary: input.summary.trim(),
    p_expected_revision: input.expectedRevision, p_operation_id: input.operationId,
    p_idempotency_key: "world.measure.resubmit:" + input.operationId,
  });
  return parseWorldMeasureReceipt(data, input.operationId);
}
export async function reviewWorldMeasure(input: WorldMeasureRevisionInput & {
  targetState: "procedural_review" | "needs_correction" | "registered";
  identifier: string; proceduralNote: string;
}): Promise<WorldMeasureReceipt> {
  if (!isWorldUuid(input.measureId) || !isWorldUuid(input.operationId) ||
      !rev(input.expectedRevision) ||
      (input.targetState === "needs_correction" && (input.proceduralNote.trim().length < 8 ||
        input.proceduralNote.length > 500)) ||
      (input.targetState === "registered" && (!input.identifier.trim() ||
        input.identifier.trim().length > 160))) {
    throw new Error("Review the procedural decision and current revision.");
  }
  const data = await rpc("world_measure_review_v1", {
    p_measure_id: input.measureId, p_target_state: input.targetState,
    p_identifier: input.identifier.trim() || null,
    p_procedural_note: input.proceduralNote.trim() || null,
    p_expected_revision: input.expectedRevision, p_operation_id: input.operationId,
    p_idempotency_key: "world.measure.review:" + input.operationId,
  });
  return parseWorldMeasureReceipt(data, input.operationId);
}
