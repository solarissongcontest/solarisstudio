import { supabase } from "@/integrations/supabase/client";

export const OFFICE_HISTORY_PAGE_SIZE = 12;

export interface PublicOfficeTerm {
  id: string;
  officeId: string;
  officeTitle: string;
  holderDisplayName: string;
  termKind: string;
  status: "ended" | "removed" | "resigned";
  startedAt: string;
  scheduledEndAt: string | null;
  actualEndAt: string;
  startEditionNumber: number | null;
  endEditionNumber: number | null;
}

export interface PublicOfficeHistoryPage {
  organization: { slug: string; shortName: string; officialName: string };
  terms: PublicOfficeTerm[];
  hasMore: boolean;
}

type RpcClient = {
  rpc(name: string, args: {
    p_slug: string;
    p_offset: number;
    p_limit: number;
  }): Promise<{ data: unknown; error: { message: string } | null }>;
};

// New TG3 RPC remains separate from the already-owned TG2 current-office
// projection; generated Supabase types can be updated after migrations merge.
const readClient = supabase as unknown as RpcClient;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
function edition(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 1 ? Number(value) : null;
}

export function canonicalHistorySlug(value: string): string | null {
  const slug = value.trim().toLowerCase();
  return slug.length <= 80 && SLUG_PATTERN.test(slug) ? slug : null;
}

export function parsePublicOfficeHistoryPage(
  value: unknown,
  expectedSlug: string,
): PublicOfficeHistoryPage {
  const root = record(value);
  const org = record(root?.organization);
  const slug = canonicalHistorySlug(text(org?.slug));
  const items = root?.terms;
  if (!root || !org || !slug || slug !== canonicalHistorySlug(expectedSlug)
      || !text(org.shortName) || !text(org.officialName)
      || !Array.isArray(items) || typeof root.hasMore !== "boolean"
      || items.length > OFFICE_HISTORY_PAGE_SIZE) {
    throw new Error("Invalid public office history response");
  }

  const terms = items.map((item): PublicOfficeTerm => {
    const row = record(item);
    const status = text(row?.status);
    const startedAt = text(row?.startedAt);
    const actualEndAt = text(row?.actualEndAt);
    if (!row || !text(row.id) || !text(row.officeId)
        || !text(row.officeTitle) || !text(row.holderDisplayName)
        || !["ended", "removed", "resigned"].includes(status)
        || !startedAt || !actualEndAt
        || !Number.isFinite(Date.parse(startedAt))
        || !Number.isFinite(Date.parse(actualEndAt))
        || Date.parse(actualEndAt) < Date.parse(startedAt)) {
      throw new Error("Invalid public office history term");
    }
    return {
      id: text(row.id),
      officeId: text(row.officeId),
      officeTitle: text(row.officeTitle),
      holderDisplayName: text(row.holderDisplayName),
      termKind: text(row.termKind),
      status: status as PublicOfficeTerm["status"],
      startedAt,
      scheduledEndAt: nullableText(row.scheduledEndAt),
      actualEndAt,
      startEditionNumber: edition(row.startEditionNumber),
      endEditionNumber: edition(row.endEditionNumber),
    };
  });
  return {
    organization: { slug, shortName: text(org.shortName), officialName: text(org.officialName) },
    terms,
    hasMore: root.hasMore,
  };
}

export async function loadPublicOfficeHistory(
  slug: string,
  offset = 0,
): Promise<PublicOfficeHistoryPage | null> {
  const canonical = canonicalHistorySlug(slug);
  if (!canonical) return null;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000
      || offset % OFFICE_HISTORY_PAGE_SIZE !== 0) {
    throw new Error("Invalid history page offset");
  }
  const { data, error } = await readClient.rpc("world_public_office_history_v1", {
    p_slug: canonical,
    p_offset: offset,
    p_limit: OFFICE_HISTORY_PAGE_SIZE,
  });
  if (error) throw new Error("Institutional history unavailable: " + error.message);
  // Null deliberately means either no such organization or non-public.
  if (data === null) return null;
  return parsePublicOfficeHistoryPage(data, canonical);
}

export function historicalTermEditionLabel(term: PublicOfficeTerm): string | null {
  if (term.startEditionNumber !== null && term.endEditionNumber !== null) {
    return "SSC " + term.startEditionNumber + "–" + term.endEditionNumber;
  }
  if (term.startEditionNumber !== null) return "From SSC " + term.startEditionNumber;
  if (term.endEditionNumber !== null) return "Through SSC " + term.endEditionNumber;
  // No calendar-year substitution: those are real-world times, not Terra
  // Solaris political years, and unpublished edition context stays hidden.
  return null;
}
