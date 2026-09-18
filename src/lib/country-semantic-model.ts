export type CountryFact = {
  id: string;
  label: string;
  value: string;
};

export type CountryStatistic = {
  id: string;
  label: string;
  value: string | number;
  hint?: string;
};

export type EntrySummary = {
  editionId: string;
  editionLabel: string;
  artist?: string | null;
  song?: string | null;
  placement?: number | null;
  status?: string | null;
};

export type CountryHistoryItem = EntrySummary & {
  points?: number | null;
};

export type CountryAction = {
  label: string;
  href: string;
};

export type CountryGeography = {
  /**
   * [longitude, latitude]. Omit this unless Solaris stores verified coordinates.
   * Atlas must never invent a center from a country name.
   */
  center?: readonly [number, number] | null;
  /**
   * [west, south, east, north]. Used when verified bounds are available.
   */
  bounds?: readonly [number, number, number, number] | null;
  /**
   * Verified GeoJSON only. The public Atlas view may render this geometry.
   */
  geojson?: Record<string, unknown> | null;
};

export interface CountryIdentityModel {
  code: string;
  name: string;
  nativeName?: string | null;
  region?: string | null;
  description?: string | null;
  flag: {
    src?: string | null;
    alt: string;
    aspectRatio?: number | null;
  };
  colors: {
    primary?: string | null;
    secondary?: string | null;
    accent?: string | null;
  };
  facts: CountryFact[];
  statistics: CountryStatistic[];
  currentEntry?: EntrySummary | null;
  history: CountryHistoryItem[];
  geography?: CountryGeography | null;
  actions: {
    wiki?: CountryAction | null;
    compare?: CountryAction | null;
    follow?: CountryAction | null;
  };
}

export interface CountryWikiModel {
  identity: CountryIdentityModel;
  lead?: string | null;
  sections: Array<{
    id: string;
    title: string;
    body?: string | null;
  }>;
  facts: CountryFact[];
  images?: Array<{
    src: string;
    alt: string;
    caption?: string | null;
  }>;
  tables?: Array<{
    id: string;
    columns: string[];
    rows: string[][];
  }>;
}

export function hasVerifiedCountryGeography(
  geography: CountryGeography | null | undefined,
): geography is CountryGeography {
  if (!geography) return false;
  if (geography.geojson && typeof geography.geojson === "object") return true;
  if (
    geography.center &&
    geography.center.length === 2 &&
    Number.isFinite(geography.center[0]) &&
    Number.isFinite(geography.center[1]) &&
    geography.center[0] >= -180 &&
    geography.center[0] <= 180 &&
    geography.center[1] >= -90 &&
    geography.center[1] <= 90
  ) {
    return true;
  }
  if (
    geography.bounds &&
    geography.bounds.length === 4 &&
    geography.bounds.every(Number.isFinite)
  ) {
    const [west, south, east, north] = geography.bounds;
    return west >= -180 && east <= 180 && south >= -90 && north <= 90 && west < east && south < north;
  }
  return false;
}
