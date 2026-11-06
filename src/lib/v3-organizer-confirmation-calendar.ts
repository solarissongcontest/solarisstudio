import type { ConfirmationCalendarRow } from "@/integrations/confirmations/admin";

export type OrganizerConfirmationCalendarScope = {
  editionId: string;
  roundId?: string | null;
};

function normalizedScope(scope: OrganizerConfirmationCalendarScope) {
  const editionId = scope.editionId.trim();
  const roundId = scope.roundId?.trim() || null;

  if (!editionId) {
    throw new Error("Delegation Calendar requires an explicit Organizer edition scope.");
  }

  return { editionId, roundId };
}

export function confirmationCalendarScopeKey(scope: OrganizerConfirmationCalendarScope) {
  const normalized = normalizedScope(scope);
  return `${normalized.editionId}:${normalized.roundId ?? "*"}`;
}

export function assertConfirmationCalendarRowsInScope(
  rows: readonly ConfirmationCalendarRow[],
  scope: OrganizerConfirmationCalendarScope,
): ConfirmationCalendarRow[] {
  const normalized = normalizedScope(scope);

  for (const row of rows) {
    if (row.edition_id !== normalized.editionId) {
      throw new Error(
        `Delegation Calendar returned data for edition ${row.edition_id} while ${normalized.editionId} is selected.`,
      );
    }

    if (normalized.roundId && row.round_id !== normalized.roundId) {
      throw new Error(
        `Delegation Calendar returned data for round ${row.round_id} while ${normalized.roundId} is selected.`,
      );
    }
  }

  return [...rows];
}
