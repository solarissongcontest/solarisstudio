import { supabase } from "@/integrations/supabase/client";
import {
  WORLD_BODY_OFFICE_LIMIT,
  WORLD_PUBLISHED_BODY_PARENT_STATUSES,
  decodePublicBodyOffice,
  validWorldSlug,
  type PublicWorldBody,
  type PublicWorldBodyOffice,
  type PublicWorldInstitution,
} from "./terra-world-bodies-public";

/**
 * Backwards-compatible paged reader for the public office sidebar.
 * Deliberately separate from the legacy twenty-item preview until WORLD-00
 * approves consumer integration. This creates NO second canonical state.
 */
export const WORLD_BODY_OFFICE_MAX_PAGE = 1000;
export type PublicWorldBodyOfficePage = {
  offices: PublicWorldBodyOffice[];
  total: number;
  page: number;
};

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
const countValid = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export function checkedPublicBodyOfficePage(page: number): number {
  if (!Number.isSafeInteger(page) || page < 0 || page > WORLD_BODY_OFFICE_MAX_PAGE) {
    throw new Error("Invalid bounded public office page");
  }
  return page;
}

function verifyPublicationJoins(value: unknown, orgId: string, bodyId: string): boolean {
  const source = record(value);
  const parent = record(source?.world_organizations);
  const organ = record(source?.world_organization_organs);
  return parent?.id === orgId && parent.public_visibility === "public" &&
    (WORLD_PUBLISHED_BODY_PARENT_STATUSES as readonly string[]).includes(String(parent.status)) &&
    organ?.id === bodyId && organ.organization_id === orgId && organ.visibility === "public";
}

export function verifyPublicOfficePage(
  rows: unknown, total: unknown, page: number,
  organizationId: string, bodyId: string,
): PublicWorldBodyOfficePage {
  const checked = checkedPublicBodyOfficePage(page);
  if (!Array.isArray(rows) || !countValid(total)) {
    throw new Error("Public institutional office page could not be verified.");
  }
  const offset = checked * WORLD_BODY_OFFICE_LIMIT;
  const expectedRows = Math.min(WORLD_BODY_OFFICE_LIMIT, Math.max(0, total - offset));
  if (rows.length !== expectedRows) {
    throw new Error("Public institutional office count and page disagree.");
  }
  const offices = rows.map((raw: unknown) =>
    verifyPublicationJoins(raw, organizationId, bodyId)
      ? decodePublicBodyOffice(raw, organizationId, bodyId) : null);
  if (offices.some((office: PublicWorldBodyOffice | null) => !office)) {
    throw new Error("Public institutional office identity could not be verified.");
  }
  if (new Set(offices.map((office: PublicWorldBodyOffice | null) => office!.id)).size !== offices.length) {
    throw new Error("Duplicate public institutional office identity.");
  }
  return { offices: offices as PublicWorldBodyOffice[], total, page: checked };
}

const OFFICE_COLUMNS = "id,organization_id,organ_id,title,office_type,active,world_organizations!inner(id,public_visibility,status),world_organization_organs:world_organization_organs!world_offices_organ_same_organization_fk!inner(id,organization_id,visibility)";
const RECOUNT_COLUMNS = "id,world_organizations!inner(id,public_visibility,status),world_organization_organs:world_organization_organs!world_offices_organ_same_organization_fk!inner(id,organization_id,visibility)";

function publishedOfficeQuery(
  organization: PublicWorldInstitution, body: PublicWorldBody,
  head = false,
) {
  return (supabase as any).from("world_organization_offices")
    .select(head ? RECOUNT_COLUMNS : OFFICE_COLUMNS, { count: "exact", ...(head ? { head: true } : {}) })
    .eq("organization_id", organization.id)
    .eq("organ_id", body.id)
    .eq("active", true)
    .eq("world_organizations.public_visibility", "public")
    .in("world_organizations.status", [...WORLD_PUBLISHED_BODY_PARENT_STATUSES])
    .eq("world_organization_organs.organization_id", organization.id)
    .eq("world_organization_organs.visibility", "public");
}

export async function readPublicBodyOfficesPage(
  organization: PublicWorldInstitution, body: PublicWorldBody,
  requestedPage: number, signal?: AbortSignal,
): Promise<PublicWorldBodyOfficePage> {
  const page = checkedPublicBodyOfficePage(requestedPage);
  if (!organization.id || body.organizationId !== organization.id ||
      !body.id || !validWorldSlug(organization.slug) || !validWorldSlug(body.slug) ||
      !(WORLD_PUBLISHED_BODY_PARENT_STATUSES as readonly string[]).includes(organization.status)) {
    throw new Error("Institutional body identity is inconsistent.");
  }
  let request = publishedOfficeQuery(organization, body, false)
    .order("display_priority", { ascending: true })
    .order("id", { ascending: true });
  if (signal) request = request.abortSignal(signal);
  const offset = page * WORLD_BODY_OFFICE_LIMIT;
  const { data, count, error } = await request.range(offset, offset + WORLD_BODY_OFFICE_LIMIT - 1);

  if (error) {
    if (record(error)?.code !== "PGRST103") {
      throw new Error("Public institutional offices could not be loaded.");
    }
    // Publication changes can invalidate a previously existing page. Recount
    // the SAME public parent, organ and active-office predicates using HEAD.
    let recount = publishedOfficeQuery(organization, body, true);
    if (signal) recount = recount.abortSignal(signal);
    const checked = await recount;
    if (checked.error || !countValid(checked.count) || offset < checked.count) {
      throw new Error("Public institutional offices could not be verified.");
    }
    return { offices: [], total: checked.count, page };
  }
  return verifyPublicOfficePage(data, count, page, organization.id, body.id);
}
