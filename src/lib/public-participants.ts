import { useQuery } from "@tanstack/react-query";

import { supabase as typedSupabase } from "@/integrations/supabase/client";
import type { Participant } from "@/lib/data";

const supabase = typedSupabase as any;

async function loadPublicParticipants(input: { editionId?: string; showId?: string }) {
  const { data, error } = await supabase.rpc("public_safe_participants", {
    _edition_id: input.editionId ?? null,
    _show_id: input.showId ?? null,
  });
  if (error) throw error;
  return Array.isArray(data) ? (data as Participant[]) : [];
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
