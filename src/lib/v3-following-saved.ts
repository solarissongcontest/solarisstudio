export type V3FollowNotificationLevel = "all" | "important" | "none";
export type V3FollowEntityType = "country" | "edition" | "show" | "organization" | "unsupported";

export type V3FollowRecord = {
  id: string;
  profile_id: string;
  // The DB may introduce new follow types before this consumer is migrated.
  entity_type: string;
  entity_id: string;
  notification_level: V3FollowNotificationLevel;
  created_at: string;
  updated_at: string;
};

type CountryLike = { id: string; name: string; short_code: string };
type EditionLike = { id: string; name: string; slug: string; edition_number: number | null };
type ShowLike = { id: string; name: string; edition_id: string };
type OrganizationLike = { id: string; slug: string; officialName: string };

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

/**
 * Search only the already verified fan-owned projection. This must never trigger
 * another Supabase query or substitute an unverified profile's saved items.
 */
export function searchV3FollowingSavedItems(
  items: readonly V3FollowingSavedItem[],
  query: string,
): V3FollowingSavedItem[] {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return [...items];
  return items.filter((item) =>
    [item.title, item.context ?? "", item.entityType]
      .some((text) => text.toLocaleLowerCase().includes(term)),
  );
}

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
  organizations = [],
}: {
  viewerId: string;
  follows: readonly V3FollowRecord[];
  countries: readonly CountryLike[];
  editions: readonly EditionLike[];
  shows: readonly ShowLike[];
  organizations?: readonly OrganizationLike[];
}): V3FollowingSavedProjection {
  const scoped = follows.every((follow) => follow.profile_id === viewerId);
  if (!scoped) {
    return {
      scoped: false,
      items: [],
      counts: { country: 0, edition: 0, show: 0, organization: 0, unsupported: 0 },
    };
  }

  const countryById = new Map(countries.map((country) => [country.id, country]));
  const editionById = new Map(editions.map((edition) => [edition.id, edition]));
  const showById = new Map(shows.map((show) => [show.id, show]));
  const organizationById = new Map(organizations.map((organization) => [organization.id, organization]));

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

    if (follow.entity_type === "organization") {
      const organization = organizationById.get(follow.entity_id);
      return {
        followId: follow.id,
        entityType: "organization",
        entityId: follow.entity_id,
        title: organization?.officialName ?? "Unavailable institution",
        context: "Institution",
        href: organization ? `/world/organizations/${encodeURIComponent(organization.slug)}` : null,
        notificationLevel: follow.notification_level,
        resolved: Boolean(organization),
      };
    }

    // Never silently classify a future follow kind as a Show.
    if (follow.entity_type !== "show") {
      return {
        followId: follow.id,
        entityType: "unsupported",
        entityId: follow.entity_id,
        title: "Unsupported saved item",
        context: "Saved item",
        href: null,
        notificationLevel: follow.notification_level,
        resolved: false,
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
      organization: items.filter((item) => item.entityType === "organization").length,
      unsupported: items.filter((item) => item.entityType === "unsupported").length,
    },
  };
}
