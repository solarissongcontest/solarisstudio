import { supabase } from "@/integrations/supabase/client";

// TG7 external messages are PRIVATE provenance. Formal measures remain owned
// exclusively by existing TG7 commands. Never query private tables from JS.
const db = supabase as any;
type Dict = Record<string, unknown>;
const object = (v: unknown): v is Dict =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const string = (v: unknown): v is string => typeof v === "string";
const optional = (v: unknown): v is string | null => v === null || string(v);
const revision = (v: unknown): v is number =>
  Number.isSafeInteger(v) && (v as number) >= 1;
const hash = (v: unknown): v is string =>
  string(v) && /^[0-9a-f]{64}$/.test(v);
const invalid = (name: string): never => {
  throw new Error("Official external intake " + name + " could not be verified.");
};
export const worldExternalUuid = uuid;
export type ExternalSource = "dm" | "instagram" | "other";
export type ExternalInstitution = { id: string; slug: string; shortName: string };
export type ExternalOptions = {
  organs: Array<{ id: string; name: string }>;
  countries: Array<{ id: string; name: string; shortCode: string }>;
  categories: Array<{ code: string; label: string }>;
};
export type ExternalIntake = {
  id: string;
  organizationId: string;
  countryId: string;
  countryCode: string;
  sourceChannel: ExternalSource;
  sourceReference: string | null;
  receivedAt: string;
  rawTitle: string;
  rawText: string;
  sourceNote: string | null;
  contentHash: string;
  status: "received" | "introduced";
  revision: number;
  introducedMeasureId: string | null;
};
export type ExternalReceipt = {
  ok: true; intakeId: string; organizationId?: string;
  measureId?: string; operationId: string; revision: number;
  status: "received" | "introduced"; contentHash?: string; replayed: boolean;
};
export type ExternalRecordInput = {
  organizationId: string; countryId: string; sourceChannel: ExternalSource;
  sourceReference: string; rawTitle: string; rawText: string;
  sourceNote: string; operationId: string;
};
export type ExternalIntroductionInput = {
  intakeId: string; organId: string; measureType: string;
  categoryCode: string | null; expectedRevision: number; operationId: string;
};
export const measureTypes = [
  ["proposal","Proposal"],["bill","Bill"],["motion","Motion"],
  ["draft_resolution","Draft resolution"],["membership_application","Membership application"],
  ["membership_expulsion","Membership expulsion"],["charter_amendment","Charter amendment"],
  ["rule_amendment","Rule amendment"],["union_recognition","Union recognition"],
  ["procedural_motion","Procedural motion"],["sanction_motion","Sanction motion"],["other","Other"],
] as const;
const sources = new Set(["dm","instagram","other"]);
const types = new Set<string>(measureTypes.map(([v])=>v));
async function rpc(name: string, args: Dict = {}): Promise<unknown> {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data;
}
export function parseExternalInstitutions(v: unknown): ExternalInstitution[] {
  if (!Array.isArray(v) || v.length > 30) return invalid("institutions");
  return v.map((value: unknown) => {
    if (!object(value) || !uuid(value.id) || !string(value.slug) ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug) ||
        !string(value.shortName) || !value.shortName.trim()) return invalid("institution");
    return { id: value.id, slug: value.slug, shortName: value.shortName };
  });
}
export function parseExternalOptions(v: unknown): ExternalOptions | null {
  if (v === null) return null;
  if (!object(v) || !Array.isArray(v.organs) || v.organs.length > 60 ||
      !Array.isArray(v.countries) || v.countries.length > 200 ||
      !Array.isArray(v.categories) || v.categories.length > 100) return invalid("options");
  const organs = v.organs.map((row: unknown) => {
    if (!object(row) || !uuid(row.id) || !string(row.name) || !row.name.trim())
      return invalid("organ");
    return { id: row.id, name: row.name };
  });
  const countries = v.countries.map((row: unknown) => {
    if (!object(row) || !uuid(row.id) || !string(row.name) || !row.name.trim() ||
        !string(row.shortCode) || !row.shortCode.trim()) return invalid("country");
    return { id: row.id, name: row.name, shortCode: row.shortCode };
  });
  const categories = v.categories.map((row: unknown) => {
    if (!object(row) || !string(row.code) || !/^[A-Z0-9]{2,12}$/.test(row.code) ||
        !string(row.label) || !row.label.trim()) return invalid("category");
    return { code: row.code, label: row.label };
  });
  return { organs, countries, categories };
}
export function parseExternalIntakes(v: unknown, institutionId: string): ExternalIntake[] | null {
  if (v === null) return null;
  if (!uuid(institutionId) || !Array.isArray(v) || v.length > 30) return invalid("inbox");
  return v.map((row: unknown) => {
    if (!object(row) || !uuid(row.id) || row.organizationId !== institutionId ||
        !uuid(row.countryId) || !string(row.countryCode) ||
        !string(row.sourceChannel) || !sources.has(row.sourceChannel) ||
        !optional(row.sourceReference) || !string(row.receivedAt) ||
        !Number.isFinite(Date.parse(row.receivedAt)) ||
        !string(row.rawTitle) || !string(row.rawText) ||
        !optional(row.sourceNote) || !hash(row.contentHash) ||
        !revision(row.revision) ||
        (row.status !== "received" && row.status !== "introduced") ||
        !(row.introducedMeasureId === null || uuid(row.introducedMeasureId)) ||
        ((row.status === "received") !== (row.introducedMeasureId === null))) return invalid("message");
    return { id: row.id, organizationId: institutionId, countryId: row.countryId,
      countryCode: row.countryCode, sourceChannel: row.sourceChannel as ExternalSource,
      sourceReference: row.sourceReference, receivedAt: row.receivedAt,
      rawTitle: row.rawTitle, rawText: row.rawText, sourceNote: row.sourceNote,
      contentHash: row.contentHash, status: row.status, revision: row.revision,
      introducedMeasureId: row.introducedMeasureId };
  });
}
export function parseExternalReceipt(v: unknown, expectedOperationId: string): ExternalReceipt {
  const envelope = object(v) ? v : null;
  const result = object(envelope?.result) ? envelope.result : null;
  if (!envelope || envelope.status !== "succeeded" ||
      envelope.operationId !== expectedOperationId ||
      typeof envelope.replayed !== "boolean" ||
      !result || result.ok !== true || result.operationId !== expectedOperationId ||
      !uuid(result.intakeId) || !revision(result.revision) ||
      (result.status !== "received" && result.status !== "introduced") ||
      (result.status === "received" && (!uuid(result.organizationId) ||
        !hash(result.contentHash))) ||
      (result.status === "introduced" && !uuid(result.measureId))) return invalid("receipt");
  return { ok: true, intakeId: result.intakeId,
    operationId: expectedOperationId, revision: result.revision,
    status: result.status, replayed: envelope.replayed,
    ...(result.organizationId ? { organizationId: result.organizationId as string } : {}),
    ...(result.measureId ? { measureId: result.measureId as string } : {}),
    ...(result.contentHash ? { contentHash: result.contentHash as string } : {}) };
}
export async function listExternalIntakeInstitutions(): Promise<ExternalInstitution[]> {
  return parseExternalInstitutions(await rpc("world_external_intake_institutions_v1"));
}
export async function loadExternalIntakeOptions(organizationId: string): Promise<ExternalOptions | null> {
  if (!uuid(organizationId)) return invalid("organization identity");
  return parseExternalOptions(await rpc("world_external_intake_options_v1",
    {p_organization_id: organizationId}));
}
export async function listExternalIntakes(organizationId: string): Promise<ExternalIntake[] | null> {
  if (!uuid(organizationId)) return invalid("organization identity");
  return parseExternalIntakes(await rpc("world_external_intakes_manage_v1",
    {p_organization_id: organizationId}), organizationId);
}
export function validateExternalRecord(input: ExternalRecordInput): string | null {
  if (!uuid(input.organizationId) || !uuid(input.countryId) || !uuid(input.operationId))
    return "The institution, sponsor or operation identity is invalid.";
  if (!sources.has(input.sourceChannel)) return "Choose the real source channel.";
  if (!input.rawTitle.trim() || input.rawTitle.trim().length > 180)
    return "Provide the received title (up to 180 characters).";
  if (!input.rawText.trim() || input.rawText.trim().length > 25000)
    return "Provide the received message (up to 25,000 characters).";
  if (input.sourceReference.length > 500 || input.sourceNote.length > 2000)
    return "Keep the source reference and provenance note within their limits.";
  return null;
}
export async function recordExternalIntake(input: ExternalRecordInput): Promise<ExternalReceipt> {
  const error = validateExternalRecord(input);
  if (error) throw new Error(error);
  const data = await rpc("world_record_external_intake_v1", {
    p_organization_id: input.organizationId,
    p_submitted_by_country_id: input.countryId,
    p_source_channel: input.sourceChannel,
    p_source_reference: input.sourceReference.trim() || null,
    p_raw_title: input.rawTitle.trim(),
    p_raw_text: input.rawText.trim(),
    p_source_note: input.sourceNote.trim() || null,
    // External attachments require secure evidence processing. Do not claim
    // inaccessible files were uploaded merely by typing attachment links.
    p_raw_attachments: [],
    p_operation_id: input.operationId,
    p_idempotency_key: "world.measure.external_intake.record:" + input.operationId,
  });
  return parseExternalReceipt(data,input.operationId);
}
export function validateExternalIntroduction(input: ExternalIntroductionInput): string | null {
  if (!uuid(input.intakeId) || !uuid(input.organId) || !uuid(input.operationId) ||
      !revision(input.expectedRevision) || !types.has(input.measureType))
    return "Choose an active organ, measure type and current intake revision.";
  if (input.categoryCode !== null && !/^[A-Z0-9]{2,12}$/.test(input.categoryCode))
    return "Use an existing valid institution category code.";
  return null;
}
export async function introduceExternalMeasure(input: ExternalIntroductionInput): Promise<ExternalReceipt> {
  const error = validateExternalIntroduction(input);
  if (error) throw new Error(error);
  const data = await rpc("world_introduce_external_measure_v1", {
    p_intake_id: input.intakeId,
    p_organ_id: input.organId,
    p_measure_type: input.measureType,
    p_category_code: input.categoryCode,
    p_expected_intake_revision: input.expectedRevision,
    p_operation_id: input.operationId,
    p_idempotency_key: "world.measure.external_intake.introduce:" + input.operationId,
  });
  return parseExternalReceipt(data,input.operationId);
}
