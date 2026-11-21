import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { linkedTelevoteRosterMatches } from "@/lib/televoting-roster-parity";

/**
 * Read-only server-side eligibility barrier for canonical-linked Televote.
 * No automatic database mutation during voting. Organizer must close and
 * re-sync a stale round from Solaris after any withdrawal or restoration.
 */
export async function assertLinkedTelevoteRosterCurrent(roundId: string): Promise<void> {
  const db = supabaseAdmin as any;
  const { data: binding, error: bindingError } = await db.from("televoting_round_bindings")
    .select("edition_id,show_id,source_mode")
    .eq("remote_round_id", roundId)
    .maybeSingle();
  if (bindingError) throw new Error("Could not verify Solaris Televoting participation");

  if (!binding) {
    // Historical/manual Televote rounds remain independent. A current
    // canonical edition is different: it must have an explicit Solaris
    // binding before its official ballot can open.
    const { data: round, error: roundError } = await db.schema("televoting")
      .from("rounds").select("edition_id").eq("id", roundId).maybeSingle();
    if (roundError || !round) throw new Error("Could not verify the Televoting round");
    const { data: link, error: linkError } = await db.from("integration_links")
      .select("solaris_id")
      .eq("service", "televoting")
      .eq("entity_type", "edition")
      .eq("remote_id", round.edition_id)
      .maybeSingle();
    if (linkError) throw new Error("Could not verify the linked Solaris edition");
    if (link) {
      const { data: edition, error: editionError } = await db.from("editions")
        .select("status").eq("id", link.solaris_id).maybeSingle();
      if (editionError || !edition) throw new Error("Could not verify Solaris edition state");
      if (edition.status === "active") {
        throw new Error("Official Televoting is not synchronized with Solaris. Configure and sync its round before opening.");
      }
    }
    return;
  }

  if (binding.source_mode !== "show" && binding.source_mode !== "edition") {
    throw new Error("Televoting source mode is not verified");
  }
  if (binding.source_mode === "show" && !binding.show_id) {
    throw new Error("Televoting show binding is incomplete");
  }
  let query = db.from("participants")
    .select("country_id")
    .eq("edition_id", binding.edition_id)
    .eq("participation_status", "confirmed");
  query = binding.source_mode === "show"
    ? query.eq("show_id", binding.show_id)
    : query.is("show_id", null);

  const { data: participants, error: participantsError } = await query;
  if (participantsError) throw new Error("Could not verify active Solaris participants");
  const countryIds: string[] = [...new Set<string>(
    (participants ?? []).map((row: { country_id: string | null }) => row.country_id)
      .filter((id: string | null): id is string => Boolean(id)),
  )];
  if (countryIds.length < 2 || countryIds.length !== (participants ?? []).length) {
    throw new Error("Active Televoting participant roster is incomplete or duplicated");
  }

  const [countriesResult, entriesResult] = await Promise.all([
    db.from("countries").select("id,short_code").in("id", countryIds),
    db.schema("televoting").from("round_entries")
      .select("entry_type,country_code").eq("round_id", roundId),
  ]);
  if (countriesResult.error || entriesResult.error) {
    throw new Error("Could not verify Televoting country entries");
  }
  const codesById = new Map<string, string>(
    (countriesResult.data ?? []).map((row: { id: string; short_code: string }) => [row.id, row.short_code]),
  );
  const activeCodes = countryIds.map((id) => codesById.get(id) ?? "");
  const remoteCodes = (entriesResult.data ?? [])
    .filter((row: { entry_type: string }) => row.entry_type === "country")
    .map((row: { country_code: string | null }) => row.country_code ?? "");
  if (!linkedTelevoteRosterMatches(activeCodes, remoteCodes)) {
    throw new Error("Televoting line-up is outdated after a participation change. Close and re-sync the round from Solaris before voting.");
  }
}
