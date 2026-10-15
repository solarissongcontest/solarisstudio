import {
  createSolarisAuthenticatedClientServer,
  getSolarisAccessTokenServer,
} from "@/integrations/supabase/organizer.server";
import type {
  V3SavedItem,
  V3SavedNotificationLevel,
  V3SavedProjection,
} from "@/lib/v3-saved";

type RpcClient = {
  auth: {
    getUser(token?: string): Promise<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
  };
  from(table: string): any;
};

type FollowRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  notification_level: string | null;
  created_at: string | null;
};

type CountryRow = {
  id: string;
  name: string;
  short_code: string;
  flag_image: string | null;
};

type EditionRow = {
  id: string;
  edition_number: number | null;
  name: string;
  year: number | null;
  slug: string;
  published: boolean;
};

function notificationLevel(value: string | null): V3SavedNotificationLevel {
  return value === "none" || value === "all" ? value : "important";
}

function editionTitle(row: EditionRow) {
  return row.edition_number == null ? row.name : `SSC ${row.edition_number} · ${row.name}`;
}

function staleItem(row: FollowRow): V3SavedItem {
  return {
    followId: row.id,
    entityType: row.entity_type === "edition" ? "edition" : "country",
    entityId: row.entity_id,
    notificationLevel: notificationLevel(row.notification_level),
    createdAt: row.created_at,
    title: "Unavailable saved item",
    subtitle: "This item is no longer publicly available.",
    href: null,
    flagUrl: null,
    available: false,
  };
}

/**
 * Focused authenticated Saved/Following projection.
 *
 * The browser never downloads every country and edition merely to hydrate a
 * user's handful of follow rows. RLS owns follow visibility; public entity
 * hydration is bounded to the followed IDs and unpublished editions are not
 * exposed through this private convenience surface.
 */
export async function loadCurrentV3SavedProjection(): Promise<V3SavedProjection> {
  const token = getSolarisAccessTokenServer();
  const client = createSolarisAuthenticatedClientServer() as unknown as RpcClient;
  const auth = await client.auth.getUser(token);
  if (auth.error || !auth.data.user) throw new Error("Solaris session is not authenticated.");
  const viewerId = auth.data.user.id;

  const followsResult = await client
    .from("fan_follows")
    .select("id,entity_type,entity_id,notification_level,created_at")
    .eq("profile_id", viewerId)
    .in("entity_type", ["country", "edition"])
    .order("created_at", { ascending: false });
  if (followsResult.error) throw followsResult.error;
  const follows = (followsResult.data ?? []) as FollowRow[];

  const countryIds = [...new Set(follows.filter((row) => row.entity_type === "country").map((row) => row.entity_id))];
  const editionIds = [...new Set(follows.filter((row) => row.entity_type === "edition").map((row) => row.entity_id))];

  const [countriesResult, editionsResult] = await Promise.all([
    countryIds.length
      ? client
          .from("countries")
          .select("id,name,short_code,flag_image")
          .in("id", countryIds)
      : Promise.resolve({ data: [] as CountryRow[], error: null }),
    editionIds.length
      ? client
          .from("editions")
          .select("id,edition_number,name,year,slug,published")
          .in("id", editionIds)
          .eq("published", true)
      : Promise.resolve({ data: [] as EditionRow[], error: null }),
  ]);
  if (countriesResult.error) throw countriesResult.error;
  if (editionsResult.error) throw editionsResult.error;

  const countries = new Map(
    ((countriesResult.data ?? []) as CountryRow[]).map((row) => [row.id, row]),
  );
  const editions = new Map(
    ((editionsResult.data ?? []) as EditionRow[]).map((row) => [row.id, row]),
  );

  const projected = follows.map((row): V3SavedItem => {
    if (row.entity_type === "country") {
      const entity = countries.get(row.entity_id);
      if (!entity) return staleItem(row);
      return {
        followId: row.id,
        entityType: "country",
        entityId: row.entity_id,
        notificationLevel: notificationLevel(row.notification_level),
        createdAt: row.created_at,
        title: entity.name,
        subtitle: entity.short_code.toUpperCase(),
        href: `/countries/${encodeURIComponent(entity.short_code)}`,
        flagUrl: entity.flag_image,
        available: true,
      };
    }

    const entity = editions.get(row.entity_id);
    if (!entity) return staleItem(row);
    return {
      followId: row.id,
      entityType: "edition",
      entityId: row.entity_id,
      notificationLevel: notificationLevel(row.notification_level),
      createdAt: row.created_at,
      title: editionTitle(entity),
      subtitle: entity.year == null ? null : String(entity.year),
      href: `/editions/${encodeURIComponent(entity.slug)}`,
      flagUrl: null,
      available: true,
    };
  });

  return {
    viewerId,
    countries: projected.filter((item) => item.available && item.entityType === "country"),
    editions: projected.filter((item) => item.available && item.entityType === "edition"),
    unavailable: projected.filter((item) => !item.available),
    generatedAt: new Date().toISOString(),
  };
}
