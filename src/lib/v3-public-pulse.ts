import type { ContentEventRow } from "@/integrations/supabase/app-types";

export type V3PublicPulseCursor = {
  publishedAt: string;
  id: string;
};

export type V3PublicPulseBundle = {
  schemaReady: boolean;
  events: ContentEventRow[];
  nextCursor: V3PublicPulseCursor | null;
  serverTime: string | null;
};

const ENTITY_TYPES = new Set<ContentEventRow["entity_type"]>([
  "country",
  "edition",
  "show",
]);
const IMPORTANCE = new Set<ContentEventRow["importance"]>(["normal", "important"]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function uuidValue(value: unknown): string | null {
  const candidate = stringValue(value);
  return candidate && UUID_PATTERN.test(candidate) ? candidate : null;
}

function safeRelativeRoute(value: unknown): string | null {
  const route = stringValue(value);
  if (!route || route.length > 512) return null;
  if (!route.startsWith("/") || route.startsWith("//") || route.includes("\\")) return null;
  for (let index = 0; index < route.length; index += 1) {
    const code = route.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return null;
  }
  return route;
}

export function emptyV3PublicPulseBundle(): V3PublicPulseBundle {
  return {
    schemaReady: false,
    events: [],
    nextCursor: null,
    serverTime: null,
  };
}

export function parseV3PublicPulseBundle(value: unknown): V3PublicPulseBundle {
  const root = objectValue(value);
  if (!root) return emptyV3PublicPulseBundle();

  const events = Array.isArray(root.items)
    ? root.items.flatMap((candidate): ContentEventRow[] => {
        const row = objectValue(candidate);
        if (!row) return [];

        const id = uuidValue(row.id);
        const eventType = stringValue(row.eventType ?? row.event_type);
        const rawEntityType = stringValue(row.entityType ?? row.entity_type);
        const entityId = stringValue(row.entityId ?? row.entity_id);
        const title = stringValue(row.title);
        const summary = textValue(row.summary);
        const route = safeRelativeRoute(row.route);
        const rawImportance = stringValue(row.importance);
        const publishedAt = stringValue(row.publishedAt ?? row.published_at);

        if (
          !id ||
          !eventType ||
          !rawEntityType ||
          !ENTITY_TYPES.has(rawEntityType as ContentEventRow["entity_type"]) ||
          !entityId ||
          !title ||
          summary == null ||
          !route ||
          !rawImportance ||
          !IMPORTANCE.has(rawImportance as ContentEventRow["importance"]) ||
          !publishedAt
        ) {
          return [];
        }

        const payload = (objectValue(row.payload) ?? {}) as ContentEventRow["payload"];

        return [{
          id,
          event_type: eventType,
          entity_type: rawEntityType as ContentEventRow["entity_type"],
          entity_id: entityId,
          title,
          summary,
          route,
          importance: rawImportance as ContentEventRow["importance"],
          payload,
          published_at: publishedAt,
          // The public projection deliberately does not expose canonical creation
          // time. Legacy Pulse helpers require this compatibility field but never
          // use it for ordering/publication authority; server published_at owns that.
          created_at: publishedAt,
          dedupe_key: null,
        }];
      })
    : [];

  const cursor = objectValue(root.nextCursor ?? root.next_cursor);
  const cursorPublishedAt = stringValue(cursor?.publishedAt ?? cursor?.published_at);
  const cursorId = uuidValue(cursor?.id);

  return {
    schemaReady: true,
    events,
    nextCursor:
      cursorPublishedAt && cursorId
        ? { publishedAt: cursorPublishedAt, id: cursorId }
        : null,
    serverTime: stringValue(root.serverTime ?? root.server_time),
  };
}

export function mergeV3PublicPulsePages(
  pages: readonly V3PublicPulseBundle[],
): ContentEventRow[] {
  const seen = new Set<string>();
  const events: ContentEventRow[] = [];

  for (const page of pages) {
    for (const event of page.events) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      events.push(event);
    }
  }

  return events;
}
