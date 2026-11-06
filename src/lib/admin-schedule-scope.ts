/**
 * The Organizer edition ID, not a route parameter, is the authoritative
 * calendar scope. A stale slug must not generate links into another edition.
 *
 * Resolve the canonical slug from the exact edition row, and fail closed if
 * an older deep link supplies a different slug. Do not read other workflow
 * tables until this check passes.
 */
export function resolveOperationalScheduleEditionSlug(
  row: unknown,
  exactEditionId: string,
  requestedSlug?: string | null,
): string {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error('Operational schedule cannot verify the selected edition.');
  }
  const record = row as Record<string, unknown>;
  if (record.id !== exactEditionId) {
    throw new Error('Operational schedule received a different edition.');
  }
  const canonicalSlug = record.slug;
  if (typeof canonicalSlug !== 'string' || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(canonicalSlug)) {
    throw new Error('Operational schedule edition has no valid canonical slug.');
  }
  const provided = requestedSlug?.trim();
  if (provided && provided !== canonicalSlug) {
    throw new Error('Operational schedule link does not match the selected edition.');
  }
  return canonicalSlug;
}

/** A remote round may appear in more than one binding; query each only once. */
export function uniqueOperationalTelevoteRoundIds(
  bindings: readonly { remote_round_id?: string | null }[],
): string[] {
  return Array.from(new Set(
    bindings
      .map((binding) => binding.remote_round_id)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  ));
}
