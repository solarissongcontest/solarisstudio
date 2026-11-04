import { supabase } from "@/integrations/supabase/client";

/**
 * TG6 public sessions consume deliberately narrow, server-authoritative RPCs.
 * No browser read of the canonical world_sessions or world_agenda_items tables.
 * The TG2 public organization catalogue is the only direct table read.
 */
export type WorldSession = {
  id: string;
  organizationSlug: string;
  organizationName: string;
  organName: string;
  title: string;
  sequenceNumber: number;
  startsAt: string;
  endsAt: string;
  status: "scheduled" | "open" | "recessed" | "concluded" | "cancelled" | "archived";
  venueType: string;
  venueLabel: string | null;
  revision: number;
};

export type WorldAgendaItem = {
  id: string;
  position: number;
  itemType: string;
  title: string;
  description: string | null;
  state: "scheduled" | "active" | "postponed" | "completed";
};

export type WorldSessionDetail = WorldSession & {
  externalUrl: string | null;
  agenda: WorldAgendaItem[];
};

export type WorldManageAgenda = {
  id: string;
  organizationId: string;
  organId: string;
  externalUrl: string | null;
  revision: number;
  status: string;
  items: Array<{
    id: string;
    title: string;
    position: number;
    state: string;
    revision: number;
  }>;
};

export type WorldOrganizationOption = {
  id: string;
  slug: string;
  shortName: string;
  organs: Array<{ id: string; name: string; slug: string }>;
};

export type WorldOperationReceipt = {
  ok: true;
  operationId: string;
  sessionId: string;
  revision: number;
  itemId?: string;
  replayed: boolean;
};

export class WorldSessionProjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorldSessionProjectionError";
  }
}

type JsonObject = Record<string, unknown>;
const object = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const string = (value: unknown): value is string => typeof value === "string";
const uuid = (value: unknown): value is string =>
  string(value) && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const revision = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 1;
const date = (value: unknown): value is string =>
  string(value) && Number.isFinite(Date.parse(value));
const sessionStatuses = new Set(["scheduled", "open", "recessed", "concluded", "cancelled", "archived"]);
const agendaStatuses = new Set(["scheduled", "active", "postponed", "completed"]);
const optionalString = (value: unknown): value is string | null =>
  value === null || string(value);
const safeExternalUrl = (value: unknown): value is string | null =>
  value === null || (string(value) && /^https:\/\/[^\s]+$/i.test(value));

function invalid(label: string): never {
  throw new WorldSessionProjectionError("Invalid world session " + label + " projection");
}

export function parseWorldSession(row: unknown): WorldSession {
  if (!object(row)) return invalid("schedule");
  if (!uuid(row.id) || !string(row.organizationSlug) ||
      !string(row.organizationName) || !string(row.organName) ||
      !string(row.title) || !Number.isSafeInteger(row.sequenceNumber) ||
      (row.sequenceNumber as number) < 1 ||
      !date(row.startsAt) || !date(row.endsAt) ||
      !string(row.status) || !sessionStatuses.has(row.status) ||
      !string(row.venueType) || !optionalString(row.venueLabel) ||
      !revision(row.revision)) return invalid("schedule");
  return {
    id: row.id,
    organizationSlug: row.organizationSlug,
    organizationName: row.organizationName,
    organName: row.organName,
    title: row.title,
    sequenceNumber: row.sequenceNumber as number,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status as WorldSession["status"],
    venueType: row.venueType,
    venueLabel: row.venueLabel,
    revision: row.revision,
  };
}

export function parseWorldSessionDetail(row: unknown): WorldSessionDetail | null {
  if (row === null) return null;
  if (!object(row) || !Array.isArray(row.agenda) || !safeExternalUrl(row.externalUrl)) {
    return invalid("detail");
  }
  const session = parseWorldSession(row);
  const agenda: WorldAgendaItem[] = row.agenda.map((item: unknown) => {
    if (!object(item) || !uuid(item.id) || !revision(item.position) ||
        !string(item.itemType) || !string(item.title) ||
        !optionalString(item.description) || !string(item.state) ||
        !agendaStatuses.has(item.state)) return invalid("agenda");
    return {
      id: item.id,
      position: item.position,
      itemType: item.itemType,
      title: item.title,
      description: item.description,
      state: item.state as WorldAgendaItem["state"],
    };
  });
  return { ...session, externalUrl: row.externalUrl, agenda };
}

export function parseWorldManageAgenda(row: unknown): WorldManageAgenda {
  if (!object(row) || !uuid(row.id) || !uuid(row.organizationId) ||
      !uuid(row.organId) || !safeExternalUrl(row.externalUrl) || !revision(row.revision) ||
      !string(row.status) || !Array.isArray(row.items)) return invalid("manager");
  const items = row.items.map((item: unknown) => {
    if (!object(item) || !uuid(item.id) || !revision(item.revision) ||
        !revision(item.position) || !string(item.title) || !string(item.state)) {
      return invalid("manager agenda");
    }
    return {
      id: item.id,
      title: item.title,
      position: item.position,
      state: item.state,
      revision: item.revision,
    };
  });
  return { id: row.id, organizationId: row.organizationId, organId: row.organId,
    externalUrl: row.externalUrl,
    revision: row.revision, status: row.status, items };
}

export function parseWorldReceipt(row: unknown): WorldOperationReceipt {
  if (!object(row) || row.ok !== true ||
      !uuid(row.operationId) || !uuid(row.sessionId) ||
      !revision(row.revision)) return invalid("receipt");
  if (row.itemId !== undefined && !uuid(row.itemId)) return invalid("receipt item");
  return {
    ok: true,
    operationId: row.operationId,
    sessionId: row.sessionId,
    revision: row.revision,
    ...(row.itemId ? { itemId: row.itemId } : {}),
    replayed: row.replayed === true,
  };
}

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  // Generated Database types predate TG6. Keep the unsafe cast isolated
  // at the transport boundary, never across the public projection model.
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) throw error;
  return data;
}

export async function listWorldSessions(organizationSlug?: string): Promise<WorldSession[]> {
  const data = await rpc("world_session_schedule_v1", {
    p_organization_slug: organizationSlug ?? null,
  });
  if (!Array.isArray(data)) return invalid("schedule collection");
  return data.map(parseWorldSession);
}

export async function getWorldSession(id: string): Promise<WorldSessionDetail | null> {
  if (!uuid(id)) return null;
  return parseWorldSessionDetail(await rpc("world_session_detail_v1", { p_session_id: id }));
}

export async function getWorldManageAgenda(id: string): Promise<WorldManageAgenda> {
  if (!uuid(id)) return invalid("session ID");
  return parseWorldManageAgenda(await rpc("world_session_manage_v1", { p_session_id: id }));
}

export async function listWorldOrganizationOptions(): Promise<WorldOrganizationOption[]> {
  const { data: organizations, error } = await (supabase as any)
    .from("world_organizations")
    .select("id,slug,short_name")
    .eq("public_visibility", "public")
    .order("short_name")
    .limit(100);
  if (error) throw error;
  if (!Array.isArray(organizations)) return invalid("organizations");
  const { data: organs, error: organError } = await (supabase as any)
    .from("world_organization_organs")
    .select("id,organization_id,slug,name")
    .eq("visibility", "public")
    .order("sort_order")
    .limit(200);
  if (organError) throw organError;
  if (!Array.isArray(organs)) return invalid("organs");
  return organizations.map((o: unknown) => {
    if (!object(o) || !uuid(o.id) || !string(o.slug) ||
        !string(o.short_name)) return invalid("organization");
    return {
      id: o.id,
      slug: o.slug,
      shortName: o.short_name,
      organs: organs.filter((g: unknown) => object(g) && g.organization_id === o.id)
        .map((g: unknown) => {
          if (!object(g) || !uuid(g.id) || !string(g.slug) ||
              !string(g.name)) return invalid("organ");
          return { id: g.id, slug: g.slug, name: g.name };
        }),
    };
  });
}

export async function canCreateWorldSession(organizationId: string, organId: string): Promise<boolean> {
  if (!uuid(organizationId) || !uuid(organId)) return false;
  const data = await rpc("world_access_allowed", {
    p_capability: "world.session.create",
    p_organization_id: organizationId,
    p_country_id: null,
    p_organ_id: organId,
    p_object_type: null,
    p_object_id: null,
  });
  return data === true;
}

export type CreateWorldSessionInput = {
  organizationId: string;
  organId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  venueType: "online" | "external" | "physical" | "hybrid";
  venueLabel: string;
  externalUrl: string;
  editionId?: string | null;
  operationId: string;
  idempotencyKey: string;
};

export function validateWorldSessionInput(input: CreateWorldSessionInput): string | null {
  if (!uuid(input.organizationId) || !uuid(input.organId)) return "Select a valid organization and organ.";
  if (!input.title.trim() || input.title.trim().length > 180) return "Use a session title up to 180 characters.";
  const start = Date.parse(input.startsAt), end = Date.parse(input.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return "The end must be after the start.";
  }
  if (start < Date.now() - 5 * 60_000) return "Choose a start time in the future.";
  if (!["online","external","physical","hybrid"].includes(input.venueType)) return "Select a valid venue type.";
  if (input.externalUrl && !/^https:\/\/[^\s]+$/.test(input.externalUrl)) {
    return "Meeting links must use HTTPS.";
  }
  if (!uuid(input.operationId) || !input.idempotencyKey.trim()) return "Invalid operation identity.";
  return null;
}

export async function createWorldSession(input: CreateWorldSessionInput): Promise<WorldOperationReceipt> {
  const problem = validateWorldSessionInput(input);
  if (problem) throw new Error(problem);
  return parseWorldReceipt(await rpc("world_session_create_v1", {
    p_organization_id: input.organizationId,
    p_organ_id: input.organId,
    p_title: input.title.trim(),
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_venue_type: input.venueType,
    p_venue_label: input.venueLabel.trim() || null,
    p_external_url: input.externalUrl.trim() || null,
    p_edition_id: input.editionId ?? null,
    p_operation_id: input.operationId,
    p_idempotency_key: input.idempotencyKey,
  }));
}

export async function appendWorldAgenda(input: {
  sessionId: string;
  title: string;
  description: string;
  itemType: string;
  publish: boolean;
  expectedRevision: number;
  operationId: string;
  idempotencyKey: string;
}): Promise<WorldOperationReceipt> {
  if (!uuid(input.sessionId) || !revision(input.expectedRevision) ||
      !input.title.trim() || input.title.trim().length > 180 ||
      !/^[a-z][a-z0-9_]{0,39}$/.test(input.itemType)) {
    throw new Error("Invalid agenda item. Refresh the session and review the details.");
  }
  return parseWorldReceipt(await rpc("world_agenda_append_v1", {
    p_session_id: input.sessionId,
    p_title: input.title.trim(),
    p_item_type: input.itemType,
    p_description: input.description.trim() || null,
    p_publish: input.publish,
    p_expected_revision: input.expectedRevision,
    p_operation_id: input.operationId,
    p_idempotency_key: input.idempotencyKey,
  }));
}

export async function reorderWorldAgenda(input: {
  sessionId: string;
  itemIds: string[];
  expectedRevision: number;
  operationId: string;
  idempotencyKey: string;
}): Promise<WorldOperationReceipt> {
  if (!uuid(input.sessionId) || !revision(input.expectedRevision) ||
      input.itemIds.some((id) => !uuid(id)) ||
      new Set(input.itemIds).size !== input.itemIds.length) {
    throw new Error("Invalid agenda order. Refresh the session and retry.");
  }
  return parseWorldReceipt(await rpc("world_agenda_reorder_v1", {
    p_session_id: input.sessionId,
    p_item_ids: input.itemIds,
    p_expected_revision: input.expectedRevision,
    p_operation_id: input.operationId,
    p_idempotency_key: input.idempotencyKey,
  }));
}


export async function canManageWorldSession(
  organizationId: string,
  organId: string,
): Promise<boolean> {
  if (!uuid(organizationId) || !uuid(organId)) return false;
  const data = await rpc("world_access_allowed", {
    p_capability: "world.session.manage",
    p_organization_id: organizationId,
    p_country_id: null,
    p_organ_id: organId,
    p_object_type: null,
    p_object_id: null,
  });
  return data === true;
}

export async function transitionWorldSession(input: {
  sessionId: string;
  targetStatus: "open" | "recessed" | "concluded" | "cancelled" | "archived";
  expectedRevision: number;
  operationId: string;
  idempotencyKey: string;
}): Promise<WorldOperationReceipt> {
  if (!uuid(input.sessionId) || !revision(input.expectedRevision) ||
      !uuid(input.operationId) || !input.idempotencyKey.trim() ||
      !["open", "recessed", "concluded", "cancelled", "archived"].includes(input.targetStatus)) {
    throw new Error("Invalid session operation. Refresh official session state.");
  }
  return parseWorldReceipt(await rpc("world_session_transition_v1", {
    p_session_id: input.sessionId,
    p_target_status: input.targetStatus,
    p_expected_revision: input.expectedRevision,
    p_operation_id: input.operationId,
    p_idempotency_key: input.idempotencyKey,
  }));
}

export async function publishWorldAgenda(input: {
  sessionId: string;
  itemId: string;
  expectedRevision: number;
  operationId: string;
  idempotencyKey: string;
}): Promise<WorldOperationReceipt> {
  if (!uuid(input.sessionId) || !uuid(input.itemId) ||
      !revision(input.expectedRevision) || !uuid(input.operationId) ||
      !input.idempotencyKey.trim()) {
    throw new Error("Invalid agenda publication request. Refresh official state.");
  }
  return parseWorldReceipt(await rpc("world_agenda_publish_v1", {
    p_session_id: input.sessionId,
    p_item_id: input.itemId,
    p_expected_revision: input.expectedRevision,
    p_operation_id: input.operationId,
    p_idempotency_key: input.idempotencyKey,
  }));
}
