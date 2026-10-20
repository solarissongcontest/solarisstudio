import type { ContentEventRow } from "@/integrations/supabase/app-types";
import { buildPulseInbox, eventCategory, eventTypeLabel, type PulseCategory } from "./pulse";

type PulseInboxArgs = Parameters<typeof buildPulseInbox>[0];
type PulseEventRow = PulseInboxArgs["events"][number];
type PulseFollowRow = PulseInboxArgs["follows"][number];

export type V3PulseProvenance = "official" | "prediction" | "archive" | "contest";

export type V3PulseCursor = {
  publishedAt: string;
  id: string;
};

export type V3PulsePublicBundle = {
  schemaReady: boolean;
  events: ContentEventRow[];
  nextCursor: V3PulseCursor | null;
  serverTime: string | null;
};

export type V3PulseEventProjection = {
  id: string;
  eventType: string;
  eventLabel: string;
  category: PulseCategory | null;
  entityType: PulseEventRow["entity_type"];
  entityId: string;
  title: string;
  summary: string;
  route: string;
  importance: PulseEventRow["importance"];
  publishedAt: string;
  provenance: V3PulseProvenance;
  unread: boolean;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENTITY_TYPES = new Set<ContentEventRow["entity_type"]>(["country", "edition", "show"]);
const IMPORTANCE = new Set<ContentEventRow["importance"]>(["normal", "important"]);

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function timestampValue(value: unknown): string | null {
  const candidate = stringValue(value);
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : null;
}

function uuidValue(value: unknown): string | null {
  const candidate = stringValue(value);
  return candidate && UUID_PATTERN.test(candidate) ? candidate : null;
}

function safeRelativeRoute(value: unknown): string | null {
  const route = stringValue(value);
  if (!route || route.length > 512 || !route.startsWith("/") || route.startsWith("//")) {
    return null;
  }
  if (route.includes("\\") || /[\u0000-\u001f\u007f]/.test(route)) return null;
  return route;
}

function payloadValue(value: unknown): ContentEventRow["payload"] {
  // The System projection already applies an allowlist. This client boundary
  // rejects arrays/non-objects and narrows the remaining JSON object for the
  // established ContentEventRow helpers without treating arbitrary payload as
  // publication authority.
  return (objectValue(value) ?? {}) as ContentEventRow["payload"];
}

export function emptyV3PulsePublicBundle(): V3PulsePublicBundle {
  return {
    schemaReady: false,
    events: [],
    nextCursor: null,
    serverTime: null,
  };
}

export function parseV3PulsePublicBundle(value: unknown): V3PulsePublicBundle {
  const root = objectValue(value);
  if (!root) return emptyV3PulsePublicBundle();

  const events = Array.isArray(root.items)
    ? root.items.flatMap((candidate): ContentEventRow[] => {
        const row = objectValue(candidate);
        if (!row) return [];

        const id = uuidValue(row.id);
        const eventType = stringValue(row.eventType ?? row.event_type);
        const rawEntityType = stringValue(row.entityType ?? row.entity_type);
        const entityId = uuidValue(row.entityId ?? row.entity_id);
        const title = stringValue(row.title);
        const summary = typeof row.summary === "string" ? row.summary.trim() : "";
        const route = safeRelativeRoute(row.route);
        const publishedAt = timestampValue(row.publishedAt ?? row.published_at);
        const rawImportance = stringValue(row.importance);

        if (
          !id ||
          !eventType ||
          !rawEntityType ||
          !ENTITY_TYPES.has(rawEntityType as ContentEventRow["entity_type"]) ||
          !entityId ||
          !title ||
          !route ||
          !publishedAt
        ) {
          return [];
        }

        const importance = rawImportance && IMPORTANCE.has(rawImportance as ContentEventRow["importance"])
          ? (rawImportance as ContentEventRow["importance"])
          : "normal";

        return [{
          id,
          event_type: eventType,
          entity_type: rawEntityType as ContentEventRow["entity_type"],
          entity_id: entityId,
          title,
          summary,
          route,
          importance,
          payload: payloadValue(row.payload),
          published_at: publishedAt,
          created_at: publishedAt,
          dedupe_key: null,
        }];
      })
    : [];

  const rawCursor = objectValue(root.nextCursor ?? root.next_cursor);
  const cursorPublishedAt = timestampValue(rawCursor?.publishedAt ?? rawCursor?.published_at);
  const cursorId = uuidValue(rawCursor?.id);
  const nextCursor = cursorPublishedAt && cursorId
    ? { publishedAt: cursorPublishedAt, id: cursorId }
    : null;

  return {
    schemaReady: true,
    events,
    nextCursor,
    serverTime: timestampValue(root.serverTime ?? root.server_time),
  };
}

export function pulseProvenance(eventType: string): V3PulseProvenance {
  if (
    eventType === "entry_published" ||
    eventType === "running_order_published" ||
    eventType === "results_published"
  ) {
    return "official";
  }
  if (eventType.startsWith("prediction_")) return "prediction";
  if (eventType === "record_broken" || eventType === "record_threat") return "archive";
  return "contest";
}

export function projectV3PulseEvent(
  event: PulseEventRow,
  readIds: ReadonlySet<string>,
): V3PulseEventProjection {
  return {
    id: event.id,
    eventType: event.event_type,
    eventLabel: eventTypeLabel(event.event_type),
    category: eventCategory(event.event_type),
    entityType: event.entity_type,
    entityId: event.entity_id,
    title: event.title,
    summary: event.summary,
    route: event.route,
    importance: event.importance,
    publishedAt: event.published_at,
    provenance: pulseProvenance(event.event_type),
    unread: !readIds.has(event.id),
  };
}

export function projectV3PulseFeed({
  events,
  follows,
  categories,
  signedIn,
  inAppEnabled,
  readIds,
}: {
  events: PulseEventRow[];
  follows: PulseFollowRow[];
  categories: readonly string[];
  signedIn: boolean;
  inAppEnabled: boolean;
  readIds: ReadonlySet<string>;
}): V3PulseEventProjection[] {
  return buildPulseInbox({
    events,
    follows,
    categories,
    signedIn,
    inAppEnabled,
  }).map((event) => projectV3PulseEvent(event, readIds));
}
