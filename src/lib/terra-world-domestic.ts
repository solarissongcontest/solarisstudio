import { supabase } from "@/integrations/supabase/client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE = /^[a-z0-9-]{2,12}$/i;

export type DomesticParty = {
  id: string;
  name: string;
  abbreviation: string | null;
  ideology: string | null;
  summary: string | null;
  status: "active" | "dissolved";
  published: boolean;
  revision: number;
};
export type DomesticElection = {
  id: string;
  title: string;
  scope: "general" | "presidential" | "legislative" | "regional" | "local" | "other";
  heldOn: string;
  turnoutPercent: number | null;
  winnerPartyId: string | null;
  resultSummary: string;
  published: boolean;
};
export type DomesticCountry = {
  countryId: string;
  countryCode: string;
  countryName: string;
  governmentType: string | null;
  leaderName: string | null;
  leaderTitle: string | null;
  isController: boolean;
  parties: DomesticParty[];
  elections: DomesticElection[];
};
export type DomesticRecordKind = "party" | "election" | "editorial_history";
export type DomesticCommand = {
  countryId: string;
  kind: DomesticRecordKind;
  subjectId?: string | null;
  payload: Record<string, string | number | boolean | null>;
  expectedRevision: number;
  operationId: string;
  idempotencyKey: string;
};
export type DomesticWriteReceipt = {
  ok: true;
  id: string;
  kind: DomesticRecordKind;
  revision: number;
  operationId: string;
  replayed: boolean;
};

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const string = (x: unknown): x is string => typeof x === "string";
const opt = (x: unknown): x is string | null => x === null || string(x);
const integer = (x: unknown): x is number => Number.isSafeInteger(x) && Number(x) > 0;

export function parseDomesticCountry(data: unknown, requestedCode: string): DomesticCountry | null {
  if (data == null) return null;
  if (!isRecord(data) || !UUID.test(String(data.countryId)) ||
      !string(data.countryCode) || data.countryCode.toLowerCase() !== requestedCode.toLowerCase() ||
      !string(data.countryName) || !opt(data.governmentType) ||
      !opt(data.leaderName) || !opt(data.leaderTitle) ||
      typeof data.isController !== "boolean" ||
      !Array.isArray(data.parties) || !Array.isArray(data.elections)) {
    throw new Error("Invalid domestic country projection");
  }
  const parties = data.parties.map((p): DomesticParty => {
    if (!isRecord(p) || !UUID.test(String(p.id)) || !string(p.name) ||
        !opt(p.abbreviation) || !opt(p.ideology) || !opt(p.summary) ||
        (p.status !== "active" && p.status !== "dissolved") ||
        typeof p.published !== "boolean" || !integer(p.revision)) {
      throw new Error("Invalid domestic party projection");
    }
    return { id: String(p.id), name: p.name, abbreviation: p.abbreviation,
      ideology: p.ideology, summary: p.summary, status: p.status,
      published: p.published, revision: p.revision };
  });
  const elections = data.elections.map((e): DomesticElection => {
    if (!isRecord(e) || !UUID.test(String(e.id)) || !string(e.title) ||
        !string(e.heldOn) || !/^\d{4}-\d{2}-\d{2}$/.test(e.heldOn) ||
        !["general","presidential","legislative","regional","local","other"].includes(String(e.scope)) ||
        !(e.turnoutPercent === null || typeof e.turnoutPercent === "number") ||
        !opt(e.winnerPartyId) || !string(e.resultSummary) ||
        typeof e.published !== "boolean") {
      throw new Error("Invalid domestic election projection");
    }
    return { id: String(e.id), title: e.title, scope: e.scope as DomesticElection["scope"],
      heldOn: e.heldOn, turnoutPercent: e.turnoutPercent, winnerPartyId: e.winnerPartyId,
      resultSummary: e.resultSummary, published: e.published };
  });
  return {
    countryId: data.countryId as string,
    countryCode: data.countryCode, countryName: data.countryName,
    governmentType: data.governmentType, leaderName: data.leaderName,
    leaderTitle: data.leaderTitle, isController: data.isController, parties, elections,
  };
}

export async function readWorldDomesticCountry(code: string, signal?: AbortSignal): Promise<DomesticCountry | null> {
  if (!CODE.test(code)) throw new Error("Invalid country code");
  if (signal?.aborted) throw new Error("Request cancelled");
  const query = (supabase as any).rpc("world_domestic_country_v1", { p_country_code: code });
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  if (error) throw new Error("Domestic government could not be loaded");
  return parseDomesticCountry(data, code);
}

export function parseDomesticWriteReceipt(data: unknown): DomesticWriteReceipt {
  if (!isRecord(data) || data.ok !== true || !UUID.test(String(data.id)) ||
      !UUID.test(String(data.operationId)) || !integer(data.revision) ||
      !["party", "election", "editorial_history"].includes(String(data.kind))) {
    throw new Error("Missing authoritative domestic operation receipt");
  }
  return { ok: true, id: data.id as string, kind: data.kind as DomesticRecordKind,
    revision: data.revision as number, operationId: data.operationId as string,
    replayed: data.replayed === true };
}

/** The country controller is validated again at the server command boundary. */
export async function writeWorldDomesticCanon(input: DomesticCommand): Promise<DomesticWriteReceipt> {
  if (!UUID.test(input.countryId) || !UUID.test(input.operationId) ||
      (input.subjectId != null && !UUID.test(input.subjectId)) ||
      !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 ||
      input.idempotencyKey.length < 8 || input.idempotencyKey.length > 200) {
    throw new Error("Invalid domestic operation request");
  }
  const { data, error } = await (supabase as any).rpc("world_write_domestic_canon_v1", {
    p_country_id: input.countryId,
    p_kind: input.kind,
    p_subject_id: input.subjectId ?? null,
    p_payload: input.payload,
    p_expected_revision: input.expectedRevision,
    p_operation_id: input.operationId,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) {
    if (error.code === "40001" || String(error.message).includes("VERSION_CONFLICT")) {
      throw new Error("This political record changed elsewhere. Reload it before saving.");
    }
    if (error.code === "42501") throw new Error("You no longer control this country.");
    throw new Error(error.message || "Domestic record could not be saved.");
  }
  return parseDomesticWriteReceipt(data);
}
