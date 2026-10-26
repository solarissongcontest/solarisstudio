import { confirmationsSupabase } from "@/integrations/confirmations/client";
import type { ConfirmationRecoveryCode } from "@/integrations/confirmations/admin";

export type ConfirmationProjectionCursor = {
  submittedAt: string;
  submissionId: string;
};

export type ConfirmationProjectionPage<T> = {
  schemaVersion: number;
  editionId: string;
  rows: T[];
  page: {
    limit: number;
    hasMore: boolean;
    nextCursor: ConfirmationProjectionCursor | null;
  };
  totalCount: number;
  stateVersion: string | null;
  serverTime: string;
};

type JsonRecord = Record<string, unknown>;

type ConfirmationResponseScope = {
  editions?: { id?: string | null } | null;
};

function object(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return value as JsonRecord;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return value;
}

function integer(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return parsed;
}

function parseCursor(value: unknown): ConfirmationProjectionCursor | null {
  if (value == null) return null;
  const row = object(value, "Confirmation projection cursor");
  return {
    submittedAt: text(row.submittedAt, "Confirmation cursor timestamp"),
    submissionId: text(row.submissionId, "Confirmation cursor submission"),
  };
}

function parsePage<T>(
  value: unknown,
  expectedEditionId: string,
  rowEditionId: (row: T) => string | null,
): ConfirmationProjectionPage<T> {
  const envelope = object(value, "Confirmation projection");
  const editionId = text(envelope.editionId, "Confirmation projection edition");
  if (editionId !== expectedEditionId) {
    throw new Error("Confirmation projection returned data for a different Organizer edition.");
  }

  const rows = Array.isArray(envelope.rows) ? (envelope.rows as T[]) : null;
  if (!rows) throw new Error("Solaris returned invalid Confirmation projection rows.");
  if (rows.some((row) => rowEditionId(row) !== expectedEditionId)) {
    throw new Error("Confirmation projection crossed the selected edition boundary.");
  }

  const page = object(envelope.page, "Confirmation projection page");
  const hasMore = page.hasMore;
  if (typeof hasMore !== "boolean") {
    throw new Error("Solaris returned an invalid Confirmation pagination state.");
  }

  return {
    schemaVersion: integer(envelope.schemaVersion, "Confirmation schema version"),
    editionId,
    rows,
    page: {
      limit: integer(page.limit, "Confirmation page limit"),
      hasMore,
      nextCursor: parseCursor(page.nextCursor),
    },
    totalCount: integer(envelope.totalCount, "Confirmation total count"),
    stateVersion:
      typeof envelope.stateVersion === "string" && envelope.stateVersion
        ? envelope.stateVersion
        : null,
    serverTime: text(envelope.serverTime, "Confirmation server time"),
  };
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await confirmationsSupabase.rpc(name, args);
  if (error) throw error;
  return data;
}

function cursorArgs(cursor?: ConfirmationProjectionCursor | null) {
  return {
    p_before_submitted_at: cursor?.submittedAt ?? null,
    p_before_submission_id: cursor?.submissionId ?? null,
  };
}

export async function loadConfirmationResponsesPage<T extends ConfirmationResponseScope>(
  editionId: string,
  cursor?: ConfirmationProjectionCursor | null,
  limit = 100,
): Promise<ConfirmationProjectionPage<T>> {
  if (!editionId) throw new Error("Select an exact Organizer edition before loading responses.");
  return parsePage<T>(
    await rpc("admin_confirmation_responses_v2", {
      p_edition_id: editionId,
      p_limit: limit,
      ...cursorArgs(cursor),
    }),
    editionId,
    (row) => row.editions?.id ?? null,
  );
}

export async function loadConfirmationRecoveryCodesPage(
  editionId: string,
  cursor?: ConfirmationProjectionCursor | null,
  limit = 100,
): Promise<ConfirmationProjectionPage<ConfirmationRecoveryCode>> {
  if (!editionId) {
    throw new Error("Select an exact Organizer edition before loading recovery credentials.");
  }
  return parsePage<ConfirmationRecoveryCode>(
    await rpc("admin_confirmation_recovery_codes_v2", {
      p_edition_id: editionId,
      p_limit: limit,
      ...cursorArgs(cursor),
    }),
    editionId,
    (row) => row.edition_id,
  );
}
