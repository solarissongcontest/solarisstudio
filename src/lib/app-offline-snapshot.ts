export const OFFLINE_PUBLIC_INDEX_KEY = "solaris:offline-public-index:v1";

export type OfflinePublicIndex = {
  savedAt: string;
  editions: Array<{ id: string; label: string; path: string }>;
  shows: Array<{ id: string; label: string; path: string }>;
  countries: Array<{ id: string; label: string; path: string }>;
};

// This device cache is deliberately public-only. It is localStorage, not a
// trusted server projection: old clients, extensions and shared-device state
// can all leave malformed or private records behind. Fail closed at the
// exported read boundary instead of trusting array shape alone.
const OFFLINE_PUBLIC_LIMITS = {
  editions: 12,
  shows: 24,
  countries: 80,
} as const;

type OfflinePublicCollection = keyof typeof OFFLINE_PUBLIC_LIMITS;

const OFFLINE_PUBLIC_PREFIX: Record<OfflinePublicCollection, string> = {
  editions: "/editions/",
  shows: "/shows/",
  countries: "/countries/",
};

function isPlainDataObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactlyKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function isSafePublicPath(path: unknown, collection: OfflinePublicCollection): path is string {
  if (typeof path !== "string" || path.length > 512) return false;
  const prefix = OFFLINE_PUBLIC_PREFIX[collection];
  if (!path.startsWith(prefix) || /[\\?#\u0000-\u001f\u007f]/.test(path)) return false;
  try {
    const decoded = decodeURIComponent(path);
    // Never allow encoded separators, dot traversal or double-encoding to
    // smuggle a private route behind a legitimate public collection prefix.
    if (
      decoded.includes("%") ||
      decoded.includes("\\") ||
      decoded.includes("?") ||
      decoded.includes("#") ||
      /[\u0000-\u001f\u007f]/.test(decoded) ||
      decoded.split("/").length !== path.split("/").length
    ) return false;
    const segment = decoded.slice(prefix.length);
    return Boolean(segment) && !segment.includes("/") && segment !== "." && segment !== "..";
  } catch {
    return false;
  }
}

function isSafePublicIndexItem(value: unknown, collection: OfflinePublicCollection) {
  if (!isPlainDataObject(value) || !hasExactlyKeys(value, ["id", "label", "path"])) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    value.id.length <= 128 &&
    !/[\u0000-\u001f\u007f]/.test(value.id) &&
    typeof value.label === "string" &&
    value.label.trim().length > 0 &&
    value.label.length <= 250 &&
    !/[\u0000-\u001f\u007f]/.test(value.label) &&
    isSafePublicPath(value.path, collection)
  );
}

function isValidOfflinePublicIndex(value: unknown): value is OfflinePublicIndex {
  if (!isPlainDataObject(value) ||
      !hasExactlyKeys(value, ["savedAt", "editions", "shows", "countries"])) {
    return false;
  }
  if (typeof value.savedAt !== "string" ||
      !/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$/.test(value.savedAt)) {
    return false;
  }
  const savedAt = new Date(value.savedAt);
  if (!Number.isFinite(savedAt.getTime()) || savedAt.toISOString() !== value.savedAt) {
    return false;
  }
  return (Object.keys(OFFLINE_PUBLIC_LIMITS) as OfflinePublicCollection[]).every((collection) => {
    const rows = value[collection];
    return Array.isArray(rows) &&
      rows.length <= OFFLINE_PUBLIC_LIMITS[collection] &&
      rows.every((row) => isSafePublicIndexItem(row, collection));
  });
}

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

  // Do not persist private-looking or malformed routes even if a caller
  // accidentally supplied unfiltered data.
  if (!isValidOfflinePublicIndex(snapshot)) return;

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
    const parsed: unknown = JSON.parse(raw);
    return isValidOfflinePublicIndex(parsed) ? parsed : null;
  } catch {
    return null;
  }
}


export function clearOfflinePublicIndex(
  storage: Pick<Storage, "removeItem"> | null =
    typeof window === "undefined" ? null : window.localStorage,
) {
  if (!storage) return;
  try {
    storage.removeItem(OFFLINE_PUBLIC_INDEX_KEY);
  } catch {
    // Clearing optional public metadata must never affect critical local drafts.
  }
}
