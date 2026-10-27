export type V3ParticipantActivityKind =
  | "submission"
  | "receipt"
  | "jury_participation"
  | "televote_participation"
  | "prediction"
  | "fantasy"
  | "other";

export type V3ParticipantActivityReconciliationState =
  | "current"
  | "superseded"
  | "unavailable";

export type V3ParticipantActivityItem = {
  id: string;
  occurredAt: string;
  kind: V3ParticipantActivityKind;
  title: string;
  description: string | null;
  editionId: string | null;
  editionLabel: string | null;
  countryId: string | null;
  route: string | null;
  receiptId: string | null;
  sourceEventType: string;
  reconciliationState: V3ParticipantActivityReconciliationState;
};

export type V3ParticipantActivityBundle = {
  schemaReady: boolean;
  items: V3ParticipantActivityItem[];
  nextBefore: string | null;
  nextOperationId: string | null;
  generatedAt: string | null;
};

const KINDS = new Set<V3ParticipantActivityKind>([
  "submission",
  "receipt",
  "jury_participation",
  "televote_participation",
  "prediction",
  "fantasy",
  "other",
]);

const RECONCILIATION_STATES = new Set<V3ParticipantActivityReconciliationState>([
  "current",
  "superseded",
  "unavailable",
]);

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hasUnsafeControlCharacter(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index);
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
}

function safeActivityRoute(value: unknown): string | null {
  const route = stringValue(value);
  if (!route || route.length > 512) return null;
  if (!route.startsWith("/") || route.startsWith("//")) return null;
  if (route.includes("\\") || hasUnsafeControlCharacter(route)) return null;
  return route;
}

export function emptyV3ParticipantActivityBundle(): V3ParticipantActivityBundle {
  return {
    schemaReady: false,
    items: [],
    nextBefore: null,
    nextOperationId: null,
    generatedAt: null,
  };
}

export function parseV3ParticipantActivity(
  value: unknown,
): V3ParticipantActivityBundle {
  const root = objectValue(value);
  if (!root) return emptyV3ParticipantActivityBundle();

  const items = Array.isArray(root.items)
    ? root.items.flatMap((candidate): V3ParticipantActivityItem[] => {
        const row = objectValue(candidate);
        if (!row) return [];

        const id = stringValue(row.id);
        const occurredAt = stringValue(row.occurred_at ?? row.occurredAt);
        const title = stringValue(row.title);
        const sourceEventType = stringValue(row.source_event_type ?? row.sourceEventType);
        if (!id || !occurredAt || !title || !sourceEventType) return [];

        const rawKind = stringValue(row.kind);
        const kind = rawKind && KINDS.has(rawKind as V3ParticipantActivityKind)
          ? (rawKind as V3ParticipantActivityKind)
          : "other";
        const rawState = stringValue(row.reconciliation_state ?? row.reconciliationState);
        const reconciliationState =
          rawState && RECONCILIATION_STATES.has(rawState as V3ParticipantActivityReconciliationState)
            ? (rawState as V3ParticipantActivityReconciliationState)
            : "current";

        return [{
          id,
          occurredAt,
          kind,
          title,
          description: stringValue(row.description),
          editionId: stringValue(row.edition_id ?? row.editionId),
          editionLabel: stringValue(row.edition_label ?? row.editionLabel),
          countryId: stringValue(row.country_id ?? row.countryId),
          route: safeActivityRoute(row.route),
          receiptId: stringValue(row.receipt_id ?? row.receiptId),
          sourceEventType,
          reconciliationState,
        }];
      })
    : [];

  return {
    schemaReady: true,
    items,
    nextBefore: stringValue(root.next_before ?? root.nextBefore),
    nextOperationId: stringValue(root.next_operation_id ?? root.nextOperationId),
    generatedAt: stringValue(root.generated_at ?? root.generatedAt),
  };
}
