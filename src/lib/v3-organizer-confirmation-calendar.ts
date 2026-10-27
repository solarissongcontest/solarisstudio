import type { ConfirmationCalendarRow, ConfirmationEdition } from "@/integrations/confirmations/admin";

type ReadAuthority = {
  requireAdmin: () => Promise<{ id: string } | null>;
  editions: () => Promise<ConfirmationEdition[]>;
  calendar: (editionId: string, roundId?: string) => Promise<ConfirmationCalendarRow[]>;
};

async function requireCurrentActor(actorId: string, authority: ReadAuthority, signal: AbortSignal) {
  signal.throwIfAborted();
  if (!actorId) throw new Error("Organizer account is required for the delegation calendar.");
  const actor = await authority.requireAdmin();
  signal.throwIfAborted();
  if (actor?.id !== actorId) throw new Error("Organizer account changed before the delegation calendar read.");
}

export function confirmationCalendarEditionsQuery(actorId: string, authority: ReadAuthority) {
  return {
    queryKey: ["v3-organizer-confirmation-calendar-editions", actorId] as const,
    enabled: Boolean(actorId),
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      await requireCurrentActor(actorId, authority, signal);
      const editions = await authority.editions();
      signal.throwIfAborted();
      return editions;
    },
    staleTime: 20_000,
  };
}

/** The query key identifies the exact authorized read, never a second calendar authority. */
export function confirmationCalendarQuery(
  actorId: string,
  editionId: string,
  roundId: string,
  authority: ReadAuthority,
) {
  return {
    queryKey: ["v3-organizer-confirmation-calendar", actorId, editionId, roundId] as const,
    enabled: Boolean(actorId && editionId),
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      await requireCurrentActor(actorId, authority, signal);
      if (!editionId) throw new Error("Delegation calendar requires an exact edition scope.");
      const rows = await authority.calendar(editionId, roundId || undefined);
      signal.throwIfAborted();
      if (rows.some((row) => row.edition_id !== editionId || (roundId && row.round_id !== roundId))) {
        throw new Error("Delegation calendar returned data outside the selected edition or round.");
      }
      if (new Set(rows.map((row) => row.id)).size !== rows.length) {
        throw new Error("Delegation calendar returned duplicate submission rows.");
      }
      return rows;
    },
    staleTime: 20_000,
  };
}
