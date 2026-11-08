/**
 * Delegation overview shows CURRENT country status, not the number of historic
 * Confirmation submissions. Never let an older accepted response keep a
 * withdrawn or revised country marked ready.
 *
 * Returning null is intentional: invalid/ambiguous response ordering is not
 * proof of an empty or clean queue. Callers must display an unavailable state.
 */
export function latestConfirmationResponsesByCountry<
  T extends { id: string; country: string; submitted_at: string },
>(responses: readonly T[]): T[] | null {
  const latest = new Map<string, { row: T; time: number }>();

  for (const row of responses) {
    // JSON projections are runtime data, regardless of their TypeScript shape.
    if (!row || typeof row.id !== "string" ||
        typeof row.country !== "string" || typeof row.submitted_at !== "string") {
      return null;
    }
    const countryKey = row.country.trim().normalize("NFC").toLocaleLowerCase("en");
    const time = Date.parse(row.submitted_at);
    if (!countryKey || !row.id || !Number.isFinite(time)) return null;

    const prior = latest.get(countryKey);
    if (!prior || time > prior.time) {
      latest.set(countryKey, { row, time });
    } else if (time === prior.time && row.id !== prior.row.id) {
      // Different responses with identical timestamps cannot be ordered safely.
      return null;
    }
  }

  return [...latest.values()]
    .map((entry) => entry.row)
    .sort((a, b) => a.country.localeCompare(b.country));
}
