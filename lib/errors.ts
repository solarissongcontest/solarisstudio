/**
 * Central translation of backend failures into messages an organizer can act on.
 *
 * Raw PostgREST/Postgres errors leak constraint names, SQL wording and policy
 * details. Those stay in the console for debugging; the UI gets plain language
 * that says what failed, whether the entered data survived, and what to do next.
 */

type PostgrestLike = {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

const CONSTRAINT_MESSAGES: Array<[RegExp, string]> = [
  [/editions_slug_key/, "An edition with that URL name already exists. Pick a different name or edition number."],
  [/jury_votes_show_voter_points_key|jury_votes_edition_voter_points_key/, "This jury has already awarded that point value in this show. Clear the existing score first."],
  [/jury_votes_show_voter_recipient_key|jury_votes_edition_voter_recipient_key/, "This jury has already scored that country in this show."],
  [/jury_votes_voter_identity_check/, "This ballot has no jury attached. Pick a voting jury and try again."],
  [/jury_votes_points_positive/, "Jury points must be greater than zero."],
  [/jury_votes_check/, "A jury cannot award points to its own country."],
  [/participants_show_country_key|participants_edition_country_noshow_key/, "That country is already in this show's line-up."],
  [/televote_votes_show_country_key|televote_votes_edition_country_noshow_key/, "That country already has a televote total for this show."],
  [/results_show_country_key|results_edition_country_noshow_key/, "Results for that country are already archived for this show."],
  [/countries_name_key/, "A country with that name already exists."],
  [/user_roles_user_id_role_key/, "That role is already assigned."],
];

export function describeSupabaseError(error: unknown, fallback = "Something went wrong."): string {
  if (!error) return fallback;

  if (typeof error === "object" && "message" in (error as object)) {
    const err = error as PostgrestLike;
    const haystack = `${err.message ?? ""} ${err.details ?? ""} ${err.hint ?? ""}`;

    for (const [pattern, message] of CONSTRAINT_MESSAGES) {
      if (pattern.test(haystack)) return message;
    }

    switch (err.code) {
      case "23505":
        return "That record already exists. Change the conflicting value and try again — nothing was saved.";
      case "23503":
        return "This item is still referenced elsewhere and cannot be removed yet.";
      case "23514":
        return "Some of the entered values are not allowed. Check the highlighted fields — nothing was saved.";
      case "42501":
      case "PGRST301":
        return "You do not have permission to do that. Sign in again as an organizer.";
      case "P0002":
        return "That item no longer exists. Refresh the page.";
      case "PGRST116":
        return "That item could not be found.";
    }

    if (/Failed to fetch|NetworkError|fetch failed/i.test(err.message ?? "")) {
      return "Could not reach the server. Your entries are still here — check your connection and try again.";
    }
    if (/JWT|token is expired|not authenticated/i.test(err.message ?? "")) {
      return "Your session expired. Sign in again — your entries are still on screen.";
    }
  }

  return fallback;
}

/** Logs the technical detail and returns the user-facing message. */
export function reportSupabaseError(error: unknown, fallback?: string): string {
  if (error) console.error("[solaris]", error);
  return describeSupabaseError(error, fallback);
}
