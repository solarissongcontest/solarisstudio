import { supabase } from "@/integrations/supabase/client";
import type { Participant } from "@/lib/data";

export type MySolarisParticipant = Participant & { participation_status: "pending" | "confirmed" | "withdrawn" | "disqualified" };

/**
 * MySolaris must never download the complete historical participant archive to
 * find the signed-in delegation's current row. Keep this query country- and
 * edition-scoped so mobile startup, egress and cache invalidation stay bounded.
 */
export async function loadMySolarisParticipant(
  countryId: string,
  editionId: string,
): Promise<MySolarisParticipant | null> {
  const { data, error } = await (supabase as any)
    .from("participants")
    .select(
      "id,edition_id,show_id,country_id,contest_entity_id,artist,song,running_order,semi_final,qualified,notes,participation_status",
    )
    .eq("edition_id", editionId)
    .eq("country_id", countryId)
    .is("show_id", null)
    .maybeSingle();

  if (error) throw error;
  return (data as MySolarisParticipant | null) ?? null;
}
