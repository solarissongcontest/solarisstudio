/** A linked Televote round is vote-ready only if its country entries exactly
 * match the currently active Solaris roster. Neither stale withdrawn targets
 * nor missing newly restored countries may silently change the ballot. */
export function linkedTelevoteRosterMatches(
  activeCountryCodes: readonly string[],
  remoteCountryCodes: readonly string[],
): boolean {
  const canonical = activeCountryCodes.map((code) => code.trim().toUpperCase());
  const remote = remoteCountryCodes.map((code) => code.trim().toUpperCase());
  if (canonical.length < 2 || canonical.length !== remote.length) return false;
  const expected = new Set(canonical);
  const actual = new Set(remote);
  return expected.size === canonical.length &&
    actual.size === remote.length &&
    [...expected].every((code) => actual.has(code));
}
