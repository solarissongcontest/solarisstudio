import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useFanSession } from "@/lib/prediction-data";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export type ParticipationConfirmationEditState =
  | { status: "no-delegation" | "closed"; roundId: null; countryName: string | null; editionName: string | null; changesRequested: false }
  | { status: "open"; roundId: string; countryName: string | null; editionName: string | null; changesRequested: boolean };

/**
 * The maintenance HOD dashboard is the existing server-authoritative read for
 * editing an *existing* Confirmation. Its editing_open flag is independent of
 * whether new Confirmation rounds accept submissions. Never infer editing
 * rights from round.status, a completed task, or the public release flag.
 */
export function projectParticipationConfirmationEdit(raw: unknown): ParticipationConfirmationEditState {
  const dashboard = object(raw);
  if (!dashboard) throw new Error("Confirmation editing status is unavailable.");

  const country = object(dashboard.country);
  const edition = object(dashboard.edition);
  const countryName = string(country?.name);
  const editionName = string(edition?.name);
  if (dashboard.authenticated !== true || !country) {
    return { status: "no-delegation", roundId: null, countryName: null, editionName: null, changesRequested: false };
  }

  const response = object(dashboard.response);
  const round = object(response?.round);
  const roundId = string(round?.id);

  // This is a malformed server projection, not proof editing has closed.
  if (dashboard.editing_open === true && !roundId) {
    throw new Error("The editable Confirmation could not be identified. Refresh its status.");
  }

  if (dashboard.editing_open !== true || !roundId) {
    return { status: "closed", roundId: null, countryName, editionName, changesRequested: false };
  }

  return {
    status: "open",
    roundId,
    countryName,
    editionName,
    changesRequested: dashboard.entry_state === "changes_requested",
  };
}

export async function loadParticipationConfirmationEdit(): Promise<ParticipationConfirmationEditState> {
  const { data, error } = await (supabase as any).rpc("public_country_account_confirmation_dashboard");
  if (error) throw error;
  return projectParticipationConfirmationEdit(data);
}

/**
 * Query only for an authenticated actor, keyed by that actor and discarded on
 * unmount. This avoids the public anonymous fetch and sharing private
 * Confirmation status with a subsequent account on the same device.
 */
export function useParticipationConfirmationEdit() {
  const session = useFanSession();
  const actor = session.isSuccess ? session.data?.id ?? null : null;
  const query = useQuery({
    queryKey: ["participate-existing-confirmation-editor", actor],
    enabled: typeof window !== "undefined" && Boolean(actor),
    queryFn: loadParticipationConfirmationEdit,
    staleTime: 15_000,
    gcTime: 0,
    refetchOnWindowFocus: true,
    retry: false,
  });
  return { actor, query };
}
