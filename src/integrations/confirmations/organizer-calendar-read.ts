import { confirmationsSupabase } from "@/integrations/confirmations/client";
import type { ConfirmationCalendarRow } from "@/integrations/confirmations/admin";

export type OrganizerCalendarScope = { editionId: string; roundId?: string | null };
export type OrganizerCalendarReadClient = {
  rpc: (name: string, args: Record<string, unknown>) =>
    PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

/**
 * The existing database RPC is the only Calendar source. This read adapter
 * refuses global requests, malformed responses, and foreign edition/round
 * rows instead of silently generating zero-event or mixed-scope calendars.
 */
export async function loadExactOrganizerConfirmationCalendar(
  scope: OrganizerCalendarScope,
  client: OrganizerCalendarReadClient =
    confirmationsSupabase as unknown as OrganizerCalendarReadClient,
): Promise<ConfirmationCalendarRow[]> {
  const editionId = scope.editionId?.trim();
  const roundId = scope.roundId?.trim() || null;
  if (!editionId) {
    throw new Error("Delegation Calendar requires an explicit Organizer edition scope.");
  }

  const { data, error } = await client.rpc("admin_confirmation_calendar", {
    _edition_id: editionId,
    _round_id: roundId,
  });
  if (error) throw error;
  if (!Array.isArray(data)) {
    throw new Error("Delegation Calendar returned an invalid projection. Dates are unknown.");
  }

  const seenIds = new Set<string>();
  for (const item of data) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Delegation Calendar returned a malformed response row. Dates are unknown.");
    }
    const row = item as Record<string, unknown>;
    if (
      typeof row.id !== "string" || !row.id.trim() ||
      typeof row.country !== "string" || !row.country.trim() ||
      typeof row.participating !== "boolean" ||
      row.edition_id !== editionId ||
      typeof row.round_id !== "string" || !row.round_id.trim() ||
      (roundId !== null && row.round_id !== roundId)
    ) {
      throw new Error("Delegation Calendar returned malformed or cross-scope data. Dates are unknown.");
    }
    if (seenIds.has(row.id)) {
      throw new Error("Delegation Calendar returned duplicate response IDs. Dates are unknown.");
    }
    seenIds.add(row.id);
  }

  return data as ConfirmationCalendarRow[];
}
