export type V3ParticipationHistoryRole = "hod" | "participant" | "juror" | "other";

export type V3ParticipationHistoryState =
  | "current"
  | "historical"
  | "superseded"
  | "unavailable";

export type V3ParticipationHistoryItem = {
  id: string;
  editionId: string;
  editionNumber: number | null;
  editionName: string;
  countryId: string | null;
  countryCode: string | null;
  countryName: string | null;
  role: V3ParticipationHistoryRole;
  startedAt: string | null;
  endedAt: string | null;
  source: string;
  state: V3ParticipationHistoryState;
};

export type V3ParticipationHistoryBundle = {
  schemaReady: boolean;
  viewerId: string | null;
  items: V3ParticipationHistoryItem[];
  generatedAt: string | null;
};

const STATES = new Set<V3ParticipationHistoryState>([
  "current",
  "historical",
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

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function safeRole(value: unknown): V3ParticipationHistoryRole {
  const role = stringValue(value)?.toLowerCase() ?? "";
  if (role === "hod") return "hod";
  if (role === "participant" || role === "member") return "participant";
  if (role === "juror" || role === "jury") return "juror";
  return "other";
}

export function emptyV3ParticipationHistoryBundle(): V3ParticipationHistoryBundle {
  return {
    schemaReady: false,
    viewerId: null,
    items: [],
    generatedAt: null,
  };
}

export function parseV3ParticipationHistory(value: unknown): V3ParticipationHistoryBundle {
  const root = objectValue(value);
  if (!root) return emptyV3ParticipationHistoryBundle();

  const items = Array.isArray(root.items)
    ? root.items.flatMap((candidate): V3ParticipationHistoryItem[] => {
        const row = objectValue(candidate);
        if (!row) return [];

        const id = stringValue(row.id);
        const editionId = stringValue(row.edition_id ?? row.editionId);
        const editionName = stringValue(row.edition_name ?? row.editionName);
        const source = stringValue(row.source);
        if (!id || !editionId || !editionName || !source) return [];

        const rawState = stringValue(row.state);
        const state = rawState && STATES.has(rawState as V3ParticipationHistoryState)
          ? (rawState as V3ParticipationHistoryState)
          : "historical";

        return [{
          id,
          editionId,
          editionNumber: numberValue(row.edition_number ?? row.editionNumber),
          editionName,
          countryId: stringValue(row.country_id ?? row.countryId),
          countryCode: stringValue(row.country_code ?? row.countryCode),
          countryName: stringValue(row.country_name ?? row.countryName),
          role: safeRole(row.role),
          startedAt: stringValue(row.started_at ?? row.startedAt),
          endedAt: stringValue(row.ended_at ?? row.endedAt),
          source,
          state,
        }];
      })
    : [];

  return {
    schemaReady: true,
    viewerId: stringValue(root.viewer_id ?? root.viewerId),
    items,
    generatedAt: stringValue(root.generated_at ?? root.generatedAt),
  };
}
