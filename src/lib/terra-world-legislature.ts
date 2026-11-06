import { supabase } from "@/integrations/supabase/client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type WorldLegislature = {
  id: string;
  name: string;
  description: string | null;
  electionCycleMonths: number | null;
  published: boolean;
  revision: number;
};
export type WorldDomesticChamber = {
  id: string;
  title: string;
  seatCount: number | null;
  electionCycleMonths: number | null;
  presidingTitle: string | null;
  description: string | null;
  published: boolean;
  revision: number;
};
export type WorldLegislatureProjection = {
  countryId: string;
  countryCode: string;
  isController: boolean;
  legislature: WorldLegislature | null;
  chambers: WorldDomesticChamber[];
};
export type LegislatureKind = "legislature" | "chamber";
type StructurePayload = {
  title: string;
  description: string;
  electionCycleMonths: number | null;
  published: boolean;
  seatCount?: number | null;
  presidingTitle?: string;
  legislatureId?: string;
};
export type WriteLegislatureRequest = {
  countryId: string;
  kind: LegislatureKind;
  subjectId: string | null;
  payload: StructurePayload;
  expectedRevision: number;
  operationId: string;
  idempotencyKey: string;
};
const object = (data: unknown): data is Record<string, unknown> =>
  !!data && typeof data === "object" && !Array.isArray(data);
const optText = (v: unknown): v is string | null => v === null || typeof v === "string";
const optInteger = (v: unknown): v is number | null => v === null || (typeof v === "number" && Number.isSafeInteger(v) && v >= 0);
const revision = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const visibility = (v: unknown): v is boolean => typeof v === "boolean";

export function parseWorldLegislature(data: unknown, code: string): WorldLegislatureProjection | null {
  if (data == null) return null;
  if (!object(data) || !UUID.test(String(data.countryId)) ||
      data.countryCode !== code.toUpperCase() && String(data.countryCode).toLowerCase() !== code.toLowerCase() ||
      typeof data.isController !== "boolean" ||
      !(data.legislature === null || object(data.legislature)) ||
      !Array.isArray(data.chambers) || data.chambers.length > 10) {
    throw new Error("Invalid World legislature projection");
  }
  const l = data.legislature;
  let legislature: WorldLegislature | null = null;
  if (object(l)) {
    if (!UUID.test(String(l.id)) || typeof l.name !== "string" ||
        !optText(l.description) || !optInteger(l.electionCycleMonths) ||
        !visibility(l.published) || !revision(l.revision)) throw new Error("Invalid legislature record");
    legislature = { id:l.id as string, name:l.name, description:l.description,
      electionCycleMonths:l.electionCycleMonths, published:l.published, revision:l.revision };
  }
  const chambers = data.chambers.map((ch): WorldDomesticChamber => {
    if (!object(ch) || !UUID.test(String(ch.id)) || typeof ch.title !== "string" ||
        !optInteger(ch.seatCount) || !optInteger(ch.electionCycleMonths) ||
        !optText(ch.presidingTitle) || !optText(ch.description) ||
        !visibility(ch.published) || !revision(ch.revision)) throw new Error("Invalid chamber record");
    return { id:ch.id as string,title:ch.title,seatCount:ch.seatCount,
      electionCycleMonths:ch.electionCycleMonths,presidingTitle:ch.presidingTitle,
      description:ch.description,published:ch.published,revision:ch.revision };
  });
  if (chambers.length && !legislature) throw new Error("Orphan chamber projection");
  return { countryId:data.countryId as string,countryCode:data.countryCode as string,
    isController:data.isController as boolean,legislature,chambers };
}
export async function readWorldLegislature(code: string, signal?: AbortSignal) {
  if (!/^[a-z0-9-]{2,12}$/i.test(code)) throw new Error("Invalid country code");
  if (signal?.aborted) throw new Error("Request cancelled");
  const query = (supabase as any).rpc("world_domestic_legislature_v1",{p_country_code:code});
  const {data,error} = await (signal ? query.abortSignal(signal) : query);
  if (error) throw new Error("Legislature is not available");
  return parseWorldLegislature(data,code);
}
export async function writeWorldLegislature(input: WriteLegislatureRequest) {
  if (!UUID.test(input.countryId) || !UUID.test(input.operationId) ||
      (input.subjectId !== null && !UUID.test(input.subjectId)) ||
      !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 ||
      input.idempotencyKey.length < 8 || input.idempotencyKey.length > 200 ||
      (input.kind !== "legislature" && input.kind !== "chamber")) {
    throw new Error("Invalid legislature command");
  }
  const {data,error} = await (supabase as any).rpc("world_write_domestic_structure_v1",{
    p_country_id:input.countryId,p_kind:input.kind,p_subject_id:input.subjectId,
    p_payload:input.payload,p_expected_revision:input.expectedRevision,
    p_operation_id:input.operationId,p_idempotency_key:input.idempotencyKey,
  });
  if (error) {
    if (error.code === "40001") throw new Error("This record was updated elsewhere. Reload before saving.");
    if (error.code === "42501") throw new Error("Country control authorization changed.");
    throw new Error(error.message || "Legislature save failed");
  }
  if (!object(data) || data.ok !== true || !UUID.test(String(data.id)) ||
      !UUID.test(String(data.operationId)) || !revision(data.revision) ||
      data.kind !== input.kind) throw new Error("Missing official legislature operation receipt");
  return { id:data.id as string,revision:data.revision as number,operationId:data.operationId as string };
}
