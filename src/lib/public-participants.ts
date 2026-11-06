import { useQuery } from "@tanstack/react-query";

import { supabase as typedSupabase } from "@/integrations/supabase/client";
import type { Participant } from "@/lib/data";

const supabase = typedSupabase as any;

function normalisePublicParticipant(row: any): Participant {
  return {
    ...row,
    // Match the normal archive/data hooks: global countries keep their stable
    // country id, while edition-only custom entities expose their entity id in
    // country_id so existing public UI can resolve them through entityDisplayMap.
    country_id: row.country_id ?? row.contest_entity_id ?? "",
  } as Participant;
}

async function loadPublicParticipants(input: { editionId?: string; showId?: string }) {
  const { data, error } = await supabase.rpc("public_safe_participants", {
    _edition_id: input.editionId ?? null,
    _show_id: input.showId ?? null,
  });
  if (error) throw error;
  // The SQL projection coalesces genuinely empty lineups to []. A null or
  // malformed RPC payload is an unavailable dataset, never zero participants.
  if (!Array.isArray(data)) throw new Error("Invalid public participants projection");
  return data.map(normalisePublicParticipant);
}

export function usePublicEditionParticipants(editionId?: string) {
  return useQuery({
    enabled: Boolean(editionId),
    queryKey: ["public-participants", "edition", editionId],
    queryFn: () => loadPublicParticipants({ editionId }),
  });
}

export function usePublicShowParticipants(showId?: string) {
  return useQuery({
    enabled: Boolean(showId),
    queryKey: ["public-participants", "show", showId],
    queryFn: () => loadPublicParticipants({ showId }),
  });
}
