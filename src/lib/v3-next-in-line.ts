export type V3NextInLineState =
  | "unavailable"
  | "upcoming"
  | "open"
  | "draft"
  | "submitted"
  | "closed"
  | "cancelled";

export type V3NextInLineCandidate = {
  id: string;
  artist: string | null;
  songTitle: string | null;
  songUrl: string | null;
  position: number;
};

export type V3NextInLineHistoryItem = {
  revision: number;
  operationId: string | null;
  createdAt: string | null;
  snapshot: Record<string, unknown> | null;
};

export type V3NextInLineOperation = {
  operationId: string;
  correlationId: string | null;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
};

export type V3NextInLineSubmission = {
  id: string;
  revision: number;
  selectionType: "internal" | "national_final";
  nationalFinalEntryId: string | null;
  artist: string | null;
  songTitle: string | null;
  songUrl: string | null;
  previewStart: string | null;
  previewEnd: string | null;
  submittedAt: string | null;
  updatedAt: string | null;
  lastOperationId: string | null;
  history: V3NextInLineHistoryItem[];
  lastOperation: V3NextInLineOperation | null;
};

export type V3NextInLineContext = {
  country: {
    id: string;
    name: string;
    shortCode: string | null;
  };
  sourceSubmissionId: string;
  selectionMethod: "internal" | "national_final" | "unknown";
  eligible: boolean;
  candidates: V3NextInLineCandidate[];
  submission: V3NextInLineSubmission | null;
};

export type V3NextInLineProjection = {
  editionId: string;
  state: V3NextInLineState;
  window: {
    status: string;
    enabled: boolean;
    opensAt: string | null;
    closesAt: string | null;
    version: number | null;
    effectiveOpen: boolean;
  } | null;
  contexts: V3NextInLineContext[];
  serverTime: string | null;
};

export type V3NextInLineReceipt = {
  ok: true;
  submissionId: string;
  editionId: string;
  sourceSubmissionId: string;
  countryId: string;
  revision: number;
  submittedAt: string | null;
  updatedAt: string | null;
  operationId: string;
  receiptId: string;
  replayed: boolean;
  unchanged: boolean;
};

const STATES = new Set<V3NextInLineState>([
  "unavailable",
  "upcoming",
  "open",
  "draft",
  "submitted",
  "closed",
  "cancelled",
]);

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function integerValue(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function parseCandidate(value: unknown): V3NextInLineCandidate | null {
  const row = objectValue(value);
  if (!row) return null;
  const id = stringValue(row.id);
  if (!id) return null;
  return {
    id,
    artist: stringValue(row.artist),
    songTitle: stringValue(row.songTitle ?? row.song_title),
    songUrl: stringValue(row.songUrl ?? row.song_url),
    position: integerValue(row.position) ?? 0,
  };
}

function parseOperation(value: unknown): V3NextInLineOperation | null {
  const row = objectValue(value);
  if (!row) return null;
  const operationId = stringValue(row.operationId ?? row.operation_id);
  const status = stringValue(row.status);
  if (!operationId || !status) return null;
  return {
    operationId,
    correlationId: stringValue(row.correlationId ?? row.correlation_id),
    status,
    createdAt: stringValue(row.createdAt ?? row.created_at),
    updatedAt: stringValue(row.updatedAt ?? row.updated_at),
    completedAt: stringValue(row.completedAt ?? row.completed_at),
  };
}

function parseHistory(value: unknown): V3NextInLineHistoryItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate): V3NextInLineHistoryItem[] => {
    const row = objectValue(candidate);
    if (!row) return [];
    const revision = integerValue(row.revision);
    if (!revision || revision < 1) return [];
    return [{
      revision,
      operationId: stringValue(row.operationId ?? row.operation_id),
      createdAt: stringValue(row.createdAt ?? row.created_at),
      snapshot: objectValue(row.snapshot),
    }];
  });
}

function parseSubmission(value: unknown): V3NextInLineSubmission | null {
  const row = objectValue(value);
  if (!row) return null;
  const id = stringValue(row.id);
  const revision = integerValue(row.revision);
  const selectionType = stringValue(row.selectionType ?? row.selection_type);
  if (
    !id ||
    !revision ||
    revision < 1 ||
    (selectionType !== "internal" && selectionType !== "national_final")
  ) {
    return null;
  }
  return {
    id,
    revision,
    selectionType,
    nationalFinalEntryId: stringValue(row.nationalFinalEntryId ?? row.national_final_entry_id),
    artist: stringValue(row.artist),
    songTitle: stringValue(row.songTitle ?? row.song_title),
    songUrl: stringValue(row.songUrl ?? row.song_url),
    previewStart: stringValue(row.previewStart ?? row.preview_start),
    previewEnd: stringValue(row.previewEnd ?? row.preview_end),
    submittedAt: stringValue(row.submittedAt ?? row.submitted_at),
    updatedAt: stringValue(row.updatedAt ?? row.updated_at),
    lastOperationId: stringValue(row.lastOperationId ?? row.last_operation_id),
    history: parseHistory(row.history),
    lastOperation: parseOperation(row.lastOperation ?? row.last_operation),
  };
}

function parseContext(value: unknown): V3NextInLineContext | null {
  const row = objectValue(value);
  const country = objectValue(row?.country);
  if (!row || !country) return null;

  const countryId = stringValue(country.id);
  const countryName = stringValue(country.name);
  const sourceSubmissionId = stringValue(row.sourceSubmissionId ?? row.source_submission_id);
  const rawMethod = stringValue(row.selectionMethod ?? row.selection_method);
  if (!countryId || !countryName || !sourceSubmissionId) return null;

  const selectionMethod = rawMethod === "internal" || rawMethod === "national_final"
    ? rawMethod
    : "unknown";

  return {
    country: {
      id: countryId,
      name: countryName,
      shortCode: stringValue(country.shortCode ?? country.short_code),
    },
    sourceSubmissionId,
    selectionMethod,
    eligible: booleanValue(row.eligible),
    candidates: Array.isArray(row.candidates)
      ? row.candidates.flatMap((candidate) => {
          const parsed = parseCandidate(candidate);
          return parsed ? [parsed] : [];
        })
      : [],
    submission: parseSubmission(row.submission),
  };
}

export function parseV3NextInLineProjection(
  value: unknown,
  expectedEditionId?: string,
): V3NextInLineProjection {
  const root = objectValue(value);
  const editionId = stringValue(root?.editionId ?? root?.edition_id);
  const rawState = stringValue(root?.state);
  if (!root || !editionId || !rawState || !STATES.has(rawState as V3NextInLineState)) {
    throw new Error("Next in Line projection unavailable");
  }
  if (expectedEditionId && editionId !== expectedEditionId) {
    throw new Error("Next in Line projection scope mismatch");
  }

  const windowRow = objectValue(root.window);
  const contexts = Array.isArray(root.contexts)
    ? root.contexts.flatMap((candidate) => {
        const parsed = parseContext(candidate);
        return parsed ? [parsed] : [];
      })
    : [];

  return {
    editionId,
    state: rawState as V3NextInLineState,
    window: windowRow
      ? {
          status: stringValue(windowRow.status) ?? "unknown",
          enabled: booleanValue(windowRow.enabled),
          opensAt: stringValue(windowRow.opensAt ?? windowRow.opens_at),
          closesAt: stringValue(windowRow.closesAt ?? windowRow.closes_at),
          version: integerValue(windowRow.version),
          effectiveOpen: booleanValue(windowRow.effectiveOpen ?? windowRow.effective_open),
        }
      : null,
    contexts,
    serverTime: stringValue(root.serverTime ?? root.server_time),
  };
}

export function parseV3NextInLineReceipt(value: unknown): V3NextInLineReceipt {
  const row = objectValue(value);
  const submissionId = stringValue(row?.submission_id ?? row?.submissionId);
  const editionId = stringValue(row?.edition_id ?? row?.editionId);
  const sourceSubmissionId = stringValue(row?.source_submission_id ?? row?.sourceSubmissionId);
  const countryId = stringValue(row?.country_id ?? row?.countryId);
  const revision = integerValue(row?.revision);
  const operationId = stringValue(row?.operationId ?? row?.operation_id);
  const receiptId = stringValue(row?.receiptId ?? row?.receipt_id);
  if (
    row?.ok !== true ||
    !submissionId ||
    !editionId ||
    !sourceSubmissionId ||
    !countryId ||
    !revision ||
    !operationId ||
    !receiptId
  ) {
    throw new Error("Next in Line receipt unavailable");
  }
  return {
    ok: true,
    submissionId,
    editionId,
    sourceSubmissionId,
    countryId,
    revision,
    submittedAt: stringValue(row.submitted_at ?? row.submittedAt),
    updatedAt: stringValue(row.updatedAt ?? row.updated_at),
    operationId,
    receiptId,
    replayed: booleanValue(row.replayed),
    unchanged: booleanValue(row.unchanged),
  };
}
