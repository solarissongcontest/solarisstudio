export const OFFLINE_PUBLIC_INDEX_KEY = "solaris:offline-public-index:v1";

export type OfflinePublicIndex = {
  savedAt: string;
  editions: Array<{ id: string; label: string; path: string }>;
  shows: Array<{ id: string; label: string; path: string }>;
  countries: Array<{ id: string; label: string; path: string }>;
};

type OfflineIndexInput = {
  editions: Array<{
    id: string;
    name: string;
    slug: string;
    edition_number?: number | null;
  }>;
  shows: Array<{ id: string; name: string }>;
  countries: Array<{ id: string; name: string; short_code: string }>;
};

export function writeOfflinePublicIndex(
  input: OfflineIndexInput,
  storage: Pick<Storage, "setItem"> = window.localStorage,
) {
  const editions = [...input.editions]
    .sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))
    .slice(0, 12)
    .map((edition) => ({
      id: edition.id,
      label:
        edition.edition_number == null
          ? edition.name
          : `SSC ${edition.edition_number} · ${edition.name}`,
      path: `/editions/${edition.slug}`,
    }));

  const shows = input.shows.slice(0, 24).map((show) => ({
    id: show.id,
    label: show.name,
    path: `/shows/${show.id}`,
  }));

  const countries = [...input.countries]
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 80)
    .map((country) => ({
      id: country.id,
      label: country.name,
      path: `/countries/${country.short_code}`,
    }));

  const snapshot: OfflinePublicIndex = {
    savedAt: new Date().toISOString(),
    editions,
    shows,
    countries,
  };

  try {
    storage.setItem(OFFLINE_PUBLIC_INDEX_KEY, JSON.stringify(snapshot));
  } catch {
    // The offline index is best-effort public metadata, never a submission dependency.
  }
}

export function readOfflinePublicIndex(
  storage: Pick<Storage, "getItem"> = window.localStorage,
): OfflinePublicIndex | null {
  try {
    const raw = storage.getItem(OFFLINE_PUBLIC_INDEX_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OfflinePublicIndex;
    if (!parsed || typeof parsed.savedAt !== "string") return null;
    if (!Array.isArray(parsed.editions) || !Array.isArray(parsed.shows) || !Array.isArray(parsed.countries)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
