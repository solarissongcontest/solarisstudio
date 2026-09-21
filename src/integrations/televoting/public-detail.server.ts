import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveShowPublication } from "@/lib/publication";

import {
  getMergedPublishedTelevotingResultsServer,
  type PublishedResultsPayload,
} from "./results.server";

export type PublicShowTelevoteDetail = {
  round: NonNullable<PublishedResultsPayload["round"]>;
  rows: PublishedResultsPayload["rows"];
} | null;

/**
 * Resolve a canonical Solaris show to a published Televoting round.
 *
 * The canonical database is consulted only for the show publication gate and
 * round binding. Televoting rows themselves are read through the public
 * Televoting client, so its RLS/results_status publication contract remains
 * authoritative.
 */
export async function getPublicShowTelevoteDetailServer(
  showId: string,
): Promise<PublicShowTelevoteDetail> {
  const db = supabaseAdmin as any;

  const { data: show, error: showError } = await db
    .from("shows")
    .select("id,published,publication_config")
    .eq("id", showId)
    .maybeSingle();

  if (showError) throw new Error(showError.message);
  if (!show || show.published !== true) return null;

  const publication = resolveShowPublication(show);
  if (!publication.detailed_voting || !publication.televote_results) return null;

  const { data: bindings, error: bindingError } = await db
    .from("televoting_round_bindings")
    .select("remote_round_id")
    .eq("show_id", showId);

  if (bindingError) throw new Error(bindingError.message);
  if (!bindings?.length) return null;

  for (const binding of bindings) {
    const remoteRoundId = String(binding.remote_round_id ?? "");
    if (!remoteRoundId) continue;

    const published = await getMergedPublishedTelevotingResultsServer(remoteRoundId);
    if (!published.round?.advanced || !published.rows.length) continue;

    const rowsWithSourceDetail = published.rows.filter(
      (row) =>
        row.country_contributions &&
        Object.keys(row.country_contributions).length > 0,
    );

    if (!rowsWithSourceDetail.length) continue;

    return {
      round: published.round,
      rows: rowsWithSourceDetail,
    };
  }

  return null;
}
