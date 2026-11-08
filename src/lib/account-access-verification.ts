/**
 * A verified shell is a claim about both independent authorization reads.
 * An error in either source is not a valid "restricted user" result.
 *
 * Pure helper: no Supabase client, network calls, environment variables or
 * React providers are needed for its regression tests.
 */
export function assertVerifiedAccountAccessChecks(
  organizerError: unknown,
  countryError: unknown,
): void {
  if (organizerError != null) throw organizerError;
  if (countryError != null) throw countryError;
}
