import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";

/**
 * Public Terra Solaris directory reads. TG2 owns the underlying tables, RLS,
 * organization projection and historical identity. This module never mutates
 * world state or constructs privileged membership/leadership decisions.
 *
 * The generated Supabase types predate TG2 while its migration is unmerged.
 * These narrow response validators are temporary integration boundaries,
 * not a competing domain schema.
 */
export const WORLD_DIRECTORY_PAGE_SIZE = 12;
export const WORLD_DIRECTORY_STALE_MS = 60_000;

export type WorldDirectoryStatus = "all" | "active" | "recognized" | "historical";

const directoryRowSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  official_name: z.string().min(1),
  short_name: z.string().min(1),
  type: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  public_visibility: z.literal("public"),
});

export type PublicWorldOrganization = z.infer<typeof directoryRowSchema>;

const currentTermSchema = z.object({
  id: z.string().uuid(),
  holderDisplayName: z.string().min(1),
  representedCountryId: z.string().uuid().nullable(),
  startEditionId: z.string().uuid().nullable(),
  endEditionId: z.string().uuid().nullable(),
  status: z.string(),
}).passthrough();

const projectionSchema = z.object({
  organization: z.object({
    id: z.string().uuid(),
    slug: z.string().min(1),
    officialName: z.string().min(1),
    shortName: z.string().min(1),
    type: z.string(),
    description: z.string().nullable(),
    status: z.string(),
    emblemUrl: z.string().nullable(),
    bannerUrl: z.string().nullable(),
    revision: z.number().int().positive(),
  }),
  organs: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    shortName: z.string().nullable(),
    type: z.string(),
    status: z.string(),
  }).passthrough()),
  memberships: z.array(z.object({
    id: z.string().uuid(),
    countryId: z.string().uuid(),
    membershipType: z.string(),
    status: z.string(),
    joinedAt: z.string(),
    endedAt: z.string().nullable(),
  }).passthrough()),
  offices: z.array(z.object({
    id: z.string().uuid(),
    title: z.string().min(1),
    active: z.boolean(),
    currentTerm: currentTermSchema.nullable(),
  }).passthrough()),
}).passthrough();

export type PublicWorldProjection = z.infer<typeof projectionSchema>;

/**
 * PostgREST .or() accepts a filter expression, not parameter placeholders.
 * Remove expression punctuation rather than interpolating raw user input.
 * This also bounds both query complexity and server response size.
 */
export function normalizeWorldSearch(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64)
    .trim();
}

export function parsePublicWorldProjection(value: unknown): PublicWorldProjection {
  return projectionSchema.parse(value);
}

export function currentWorldMemberships(projection: PublicWorldProjection) {
  return projection.memberships.filter((member) =>
    member.endedAt === null &&
    ["member", "observer", "associate", "suspended"].includes(member.status),
  );
}

export function currentWorldLeadership(projection: PublicWorldProjection) {
  return projection.offices.filter((office) =>
    office.active && office.currentTerm?.status === "active",
  );
}

export function publicWorldOrganizationStatus(status: string): string {
  const labels: Record<string, string> = {
    proposed: "Proposed",
    recognized: "Recognized",
    active: "Active",
    suspended: "Suspended",
    dissolved: "Dissolved",
    historical: "Historical",
  };
  return labels[status] ?? "Status unavailable";
}

export async function getPublicWorldDirectory(options: {
  search: string;
  status: WorldDirectoryStatus;
  page: number;
}): Promise<{ organizations: PublicWorldOrganization[]; total: number }> {
  const page = Number.isSafeInteger(options.page) ? Math.max(0, options.page) : 0;
  const term = normalizeWorldSearch(options.search);

  // Reject punctuation-only searches instead of silently listing everything.
  if (options.search.trim() && !term) return { organizations: [], total: 0 };

  let query = supabase
    .from("world_organizations" as never)
    .select(
      "id,slug,official_name,short_name,type,description,status,public_visibility",
      { count: "exact" },
    )
    .eq("public_visibility", "public");

  if (options.status !== "all") query = query.eq("status", options.status);
  if (term) {
    query = query.or(
      "official_name.ilike.%" + term + "%,short_name.ilike.%" + term + "%",
    );
  }

  const { data, error, count } = await query
    .order("short_name", { ascending: true })
    .range(
      page * WORLD_DIRECTORY_PAGE_SIZE,
      (page + 1) * WORLD_DIRECTORY_PAGE_SIZE - 1,
    );

  if (error) throw new Error(error.message);
  return {
    organizations: z.array(directoryRowSchema).parse(data ?? []),
    total: count ?? 0,
  };
}

export async function getPublicWorldOrganization(slug: string): Promise<PublicWorldProjection | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;

  // The SQL function is TG2's publication-filtered SECURITY DEFINER read.
  // It returns null for private, members-only and nonexistent organizations.
  const client = supabase as unknown as {
    rpc: (name: "world_organization_projection_v1", args: { p_slug: string }) =>
      Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await client.rpc(
    "world_organization_projection_v1",
    { p_slug: slug },
  );
  if (error) throw new Error(error.message);
  return data == null ? null : parsePublicWorldProjection(data);
}

export type PublicWorldCountry = {
  id: string;
  name: string;
  flag_image: string | null;
};

export async function getPublicWorldMemberCountries(
  projection: PublicWorldProjection,
): Promise<Record<string, PublicWorldCountry>> {
  const ids = [...new Set(currentWorldMemberships(projection).map((member) => member.countryId))];
  if (!ids.length) return {};
  if (ids.length > 120) throw new Error("Membership list is too large to display safely.");
  const { data, error } = await supabase
    .from("countries")
    .select("id,name,flag_image")
    .in("id", ids)
    .limit(ids.length);
  if (error) throw new Error(error.message);
  const countries = z.array(z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
    flag_image: z.string().nullable(),
  })).parse(data ?? []);

  return Object.fromEntries(countries.map((country) => [country.id, country]));
}
