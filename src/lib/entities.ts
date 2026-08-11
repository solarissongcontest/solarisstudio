/**
 * Contest entities — the canonical identity of a participating nation inside one edition.
 *
 * An entity is either:
 *  - `global`: a stable link to a row in the global `countries` library, or
 *  - `custom`: a nation invented for this edition only (never added to the library).
 *
 * Every show-scoped surface (line-up, jury, televote, results, broadcast) keys on the
 * entity id. Global lifetime history (country profiles, compare, relationships, records)
 * keeps keying on `country_id`, so custom nations can never contaminate a real country's
 * all-time record while still appearing in their own edition's statistics.
 */

import type { Country } from "./data";

export type ContestEntityRow = {
  id: string;
  edition_id: string;
  entity_type: "global" | "custom";
  country_id: string | null;
  display_name: string;
  abbreviation: string;
  flag_image: string | null;
  region: string | null;
};

export type GlobalContestEntity = ContestEntityRow & { entity_type: "global"; country_id: string };
export type CustomContestEntity = ContestEntityRow & { entity_type: "custom"; country_id: null };
export type ContestEntity = GlobalContestEntity | CustomContestEntity;

export const isGlobalEntity = (e: ContestEntityRow): e is GlobalContestEntity =>
  e.entity_type === "global" && !!e.country_id;
export const isCustomEntity = (e: ContestEntityRow): e is CustomContestEntity =>
  e.entity_type === "custom";

/** Any row that identifies a nation either by entity or by legacy country column. */
export type EntityRef = { contest_entity_id?: string | null; country_id?: string | null };

/** Canonical key for a stored row: the entity when present, otherwise the legacy country. */
export function entityKeyOf(row: EntityRef): string {
  return row.contest_entity_id ?? row.country_id ?? "";
}

export const DEFAULT_ACCENT = "#7dd3fc";

/**
 * One normalized display shape used by scoreboards, broadcast and organizer lists,
 * so no component has to write `custom_name ?? country.name` by hand.
 *
 * Structurally compatible with `Country`, which lets existing scoreboard components
 * consume entities without changes.
 */
export type EntityDisplay = {
  /**
   * Canonical contest key — the same value stored rows normalise to
   * (`country_id` for a global entity, the entity id for a custom nation).
   * Pickers, scoreboards and vote rows all key on this, so they can never drift apart.
   */
  id: string;
  /** The `contest_entities` row id, when this display is backed by one. */
  entityId: string | null;
  entityType: "global" | "custom";
  /** Global country behind this entity, when there is one. */
  countryId: string | null;
  name: string;
  native_name: string | null;
  short_code: string;
  /** Null means "no artwork" — render the intentional initials fallback, never a broken image. */
  flag_image: string | null;
  region: string;
  accent_color: string;
  description: string | null;
  first_participation: number | null;
};

export function displayFromEntity(
  entity: ContestEntityRow,
  countries?: Map<string, Country>,
): EntityDisplay {
  const c = entity.country_id ? countries?.get(entity.country_id) : undefined;
  return {
    id: entity.country_id ?? entity.id,
    entityId: entity.id,
    entityType: entity.entity_type,
    countryId: entity.country_id,
    name: c?.name ?? entity.display_name,
    native_name: c?.native_name ?? null,
    short_code: c?.short_code ?? entity.abbreviation,
    // Global countries are live identities. Their current flag/region must win over
    // an edition snapshot so owner edits propagate everywhere. Custom entities still
    // use their own stored artwork because they have no global country row.
    flag_image: c?.flag_image ?? entity.flag_image ?? null,
    region: c?.region ?? entity.region ?? "Terra Solaris",
    accent_color: c?.accent_color ?? DEFAULT_ACCENT,
    description: c?.description ?? null,
    first_participation: c?.first_participation ?? null,
  };
}

export function displayFromCountry(c: Country): EntityDisplay {
  return {
    id: c.id,
    entityId: null,
    entityType: "global",
    countryId: c.id,
    name: c.name,
    native_name: c.native_name,
    short_code: c.short_code,
    flag_image: c.flag_image,
    region: c.region,
    accent_color: c.accent_color,
    description: c.description,
    first_participation: c.first_participation,
  };
}

/**
 * Lookup used by every show-scoped view. Entities are indexed by their own id and,
 * for global entities, additionally by their country id so legacy rows that only
 * carry `country_id` still resolve to a name and flag.
 */
export function entityDisplayMap(
  entities: ContestEntityRow[] | undefined,
  countries: Country[] | undefined,
): Map<string, EntityDisplay> {
  const cMap = new Map((countries ?? []).map((c) => [c.id, c]));
  const map = new Map<string, EntityDisplay>();
  (countries ?? []).forEach((c) => map.set(c.id, displayFromCountry(c)));
  (entities ?? []).forEach((e) => {
    const d = displayFromEntity(e, cMap);
    map.set(e.id, d);
    if (e.country_id) map.set(e.country_id, d);
  });
  return map;
}
