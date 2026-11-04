/** Public TG2 read-model only. Server RLS and world_organization_projection_v1 own publication. */
export const WORLD_ORGANIZATIONS_PAGE_SIZE = 24;
export const WORLD_MEMBERS_PAGE_SIZE = 20;
export type WorldDirectoryFilter = "all" | "active" | "recognized" | "historical";
export type WorldOrganizationStatus = "proposed" | "recognized" | "active" | "suspended" | "dissolved" | "historical";
export type WorldOrganizationSummary = {
  id: string; slug: string; name: string; shortName: string; kind: string;
  description: string | null; status: WorldOrganizationStatus; emblemUrl: string | null;
};
export type WorldOrgan = { id: string; slug: string; name: string; type: string; sortOrder: number };
export type WorldMember = {
  id: string; countryId: string; status: string; membershipType: string;
  joinedAt: string | null; endedAt: string | null;
};
export type WorldOffice = {
  id: string; title: string; termLengthEditions: number | null; currentHolder: string | null;
};
export type WorldOrganizationDetail = {
  organization: WorldOrganizationSummary; organs: WorldOrgan[];
  members: WorldMember[]; offices: WorldOffice[];
};
export type WorldMemberCountry = { id: string; name: string; shortCode: string; flagUrl: string | null };
export type WorldDirectoryPage = { rows: WorldOrganizationSummary[]; hasNext: boolean };

const statuses = new Set<WorldOrganizationStatus>([
  "proposed", "recognized", "active", "suspended", "dissolved", "historical",
]);
function obj(x: unknown): Record<string, unknown> | null {
  return !!x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : null;
}
function str(x: unknown): string | null {
  return typeof x === "string" && x.trim() ? x.trim() : null;
}
function safeImage(x: unknown): string | null {
  return typeof x === "string" && (/^https:\/\/[^<>"\s]+$/i.test(x) || /^\/(?!\/)[^<>"\s]*$/.test(x)) ? x : null;
}
function organization(x: Record<string, unknown>, sql: boolean): WorldOrganizationSummary | null {
  const id = str(x.id), slug = str(x.slug);
  const name = str(sql ? x.official_name : x.officialName);
  const shortName = str(sql ? x.short_name : x.shortName);
  if (!id || !slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
      !name || !shortName || !statuses.has(x.status as WorldOrganizationStatus)) return null;
  return {
    id, slug, name, shortName, kind: str(x.type) ?? "organization",
    description: str(x.description), status: x.status as WorldOrganizationStatus,
    emblemUrl: safeImage(sql ? x.emblem_url : x.emblemUrl),
  };
}
export function parseWorldDirectoryRow(input: unknown): WorldOrganizationSummary | null {
  const x = obj(input);
  return x?.public_visibility === "public" ? organization(x, true) : null;
}
export function parseWorldOrganizationDetail(input: unknown): WorldOrganizationDetail | null {
  const root = obj(input), org = obj(root?.organization);
  if (!root || !org || !Array.isArray(root.organs) ||
      !Array.isArray(root.memberships) || !Array.isArray(root.offices)) return null;
  const parsedOrg = organization(org, false);
  if (!parsedOrg) return null;
  const organs: WorldOrgan[] = [];
  for (const raw of root.organs) {
    const x = obj(raw), id = str(x?.id), slug = str(x?.slug), name = str(x?.name);
    if (!id || !slug || !name) return null;
    organs.push({
      id, slug, name, type: str(x?.type) ?? "organ",
      sortOrder: typeof x?.sortOrder === "number" && Number.isFinite(x.sortOrder) ? x.sortOrder : 0,
    });
  }
  const members: WorldMember[] = [];
  for (const raw of root.memberships) {
    const x = obj(raw), id = str(x?.id), countryId = str(x?.countryId), status = str(x?.status);
    if (!id || !countryId || !status) return null;
    members.push({
      id, countryId, status, membershipType: str(x?.membershipType) ?? "member",
      joinedAt: str(x?.joinedAt), endedAt: str(x?.endedAt),
    });
  }
  const offices: WorldOffice[] = [];
  for (const raw of root.offices) {
    const x = obj(raw), id = str(x?.id), title = str(x?.title);
    if (!x || !id || !title) return null;
    const term = x.currentTerm == null ? null : obj(x.currentTerm);
    if (x.currentTerm != null && !term) return null;
    const n = x.defaultTermLengthEditions;
    offices.push({
      id, title,
      termLengthEditions: typeof n === "number" && Number.isInteger(n) && n > 0 ? n : null,
      currentHolder: str(term?.holderDisplayName),
    });
  }
  return {
    organization: parsedOrg,
    organs: organs.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    members, offices,
  };
}
export function currentWorldMembers(members: readonly WorldMember[]): WorldMember[] {
  return members.filter((item) =>
    !item.endedAt && ["member", "observer", "associate", "suspended"].includes(item.status));
}
export function parseWorldMemberCountry(input: unknown): WorldMemberCountry | null {
  const x = obj(input), id = str(x?.id), name = str(x?.name), shortCode = str(x?.short_code);
  return id && name && shortCode
    ? { id, name, shortCode, flagUrl: safeImage(x?.flag_image) } : null;
}
/** PostgREST .or() takes raw filter syntax; remove all grammar delimiters. */
export function normalizedWorldSearch(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9 \-]/g, "").replace(/\s+/g, " ").slice(0, 64);
}
