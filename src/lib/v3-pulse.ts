import { buildPulseInbox, eventCategory, eventTypeLabel, type PulseCategory } from "./pulse";

type PulseInboxArgs = Parameters<typeof buildPulseInbox>[0];
type PulseEventRow = PulseInboxArgs["events"][number];
type PulseFollowRow = PulseInboxArgs["follows"][number];

export type V3PulseProvenance = "official" | "prediction" | "archive" | "contest";

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
