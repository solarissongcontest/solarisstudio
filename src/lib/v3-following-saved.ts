export type V3FollowNotificationLevel = "all" | "important" | "none";
export type V3FollowEntityType = "country" | "edition" | "show";

export type V3FollowRecord = {
  id: string;
  profile_id: string;
  entity_type: V3FollowEntityType;
  entity_id: string;
  notification_level: V3FollowNotificationLevel;
  created_at: string;
  updated_at: string;
};

type CountryLike = { id: string; name: string; short_code: string };
type EditionLike = { id: string; name: string; slug: string; edition_number: number | null };
type ShowLike = { id: string; name: string; edition_id: string };

export type V3FollowingSavedItem = {
  followId: string;
  entityType: V3FollowEntityType;
  entityId: string;
  title: string;
  context: string | null;
  href: string | null;
  notificationLevel: V3FollowNotificationLevel;
  resolved: boolean;
};

export type V3FollowingSavedProjection = {
  scoped: boolean;
  items: V3FollowingSavedItem[];
  counts: Record<V3FollowEntityType, number>;
};

function editionName(edition: EditionLike) {
  if (edition.edition_number != null) {
    return edition.name?.trim() || `Edition ${edition.edition_number}`;
  }
  return edition.name?.trim() || "Edition";
}

export function buildV3FollowingSavedProjection({
  viewerId,
  follows,
  countries,
  editions,
  shows,
}: {
  viewerId: string;
  follows: readonly V3FollowRecord[];
  countries: readonly CountryLike[];
  editions: readonly EditionLike[];
  shows: readonly ShowLike[];
}): V3FollowingSavedProjection {
  const scoped = follows.every((follow) => follow.profile_id === viewerId);
  if (!scoped) {
    return {
      scoped: false,
      items: [],
      counts: { country: 0, edition: 0, show: 0 },
    };
  }

  const countryById = new Map(countries.map((country) => [country.id, country]));
  const editionById = new Map(editions.map((edition) => [edition.id, edition]));
  const showById = new Map(shows.map((show) => [show.id, show]));

  const items = follows.map((follow): V3FollowingSavedItem => {
    if (follow.entity_type === "country") {
      const country = countryById.get(follow.entity_id);
      return {
        followId: follow.id,
        entityType: follow.entity_type,
        entityId: follow.entity_id,
        title: country?.name ?? "Unavailable country",
        context: "Country",
        href: country ? `/countries/${encodeURIComponent(country.short_code)}` : null,
        notificationLevel: follow.notification_level,
        resolved: Boolean(country),
      };
    }

    if (follow.entity_type === "edition") {
      const edition = editionById.get(follow.entity_id);
      return {
        followId: follow.id,
        entityType: follow.entity_type,
        entityId: follow.entity_id,
        title: edition ? editionName(edition) : "Unavailable edition",
        context: "Edition",
        href: edition ? `/editions/${encodeURIComponent(edition.slug)}` : null,
        notificationLevel: follow.notification_level,
        resolved: Boolean(edition),
      };
    }

    const show = showById.get(follow.entity_id);
    const edition = show ? editionById.get(show.edition_id) : null;
    return {
      followId: follow.id,
      entityType: follow.entity_type,
      entityId: follow.entity_id,
      title: show?.name ?? "Unavailable show",
      context: edition ? editionName(edition) : "Show",
      href: show ? `/shows/${encodeURIComponent(show.id)}` : null,
      notificationLevel: follow.notification_level,
      resolved: Boolean(show),
    };
  });

  return {
    scoped: true,
    items,
    counts: {
      country: items.filter((item) => item.entityType === "country").length,
      edition: items.filter((item) => item.entityType === "edition").length,
      show: items.filter((item) => item.entityType === "show").length,
    },
  };
}
