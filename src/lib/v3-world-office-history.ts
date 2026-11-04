import { supabase } from "@/integrations/supabase/client";

export const OFFICE_HISTORY_PAGE_SIZE = 12;

export type PublicOfficeHistoryCursor = { startedAt: string; termId: string };
export type PublicOfficeOption = { slug: string; title: string };

export interface PublicOfficeTerm {
  id: string;
  officeId: string;
  officeTitle: string;
  holderDisplayName: string;
  representedCountryName: string | null;
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
  offices: PublicOfficeOption[];
  terms: PublicOfficeTerm[];
  hasMore: boolean;
  nextCursor: PublicOfficeHistoryCursor | null;
}

type RpcClient = {
  rpc(name: string, args: {
    p_slug: string;
    p_cursor_started_at: string | null;
    p_cursor_term_id: string | null;
    p_office_slug: string | null;
    p_limit: number;
  }): Promise<{ data: unknown; error: { message: string } | null }>;
};

// New TG3 RPC remains separate from the already-owned TG2 current-office
// projection; generated Supabase types can be updated after migrations merge.
const readClient = supabase as unknown as RpcClient;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;
const TERM_KINDS = new Set(["full", "acting", "interim", "partial", "renewed"]);
function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && TIMESTAMP_PATTERN.test(value)
    && Number.isFinite(Date.parse(value));
}

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
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new Error("Invalid published SSC edition");
  }
  return Number(value);
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
  const options = root?.offices;
  const rawCursor = root?.nextCursor === null ? null : record(root?.nextCursor);
  const nextCursor = rawCursor && text(rawCursor.startedAt) && UUID_PATTERN.test(text(rawCursor.termId))
      && isTimestamp(rawCursor.startedAt)
    ? { startedAt: text(rawCursor.startedAt), termId: text(rawCursor.termId) }
    : null;
  if (!root || !org || !slug || slug !== canonicalHistorySlug(expectedSlug)
      || !text(org.shortName) || !text(org.officialName)
      || !Array.isArray(options) || options.length > 100
      || !Array.isArray(items) || typeof root.hasMore !== "boolean"
      || items.length > OFFICE_HISTORY_PAGE_SIZE
      || (root.hasMore && (items.length !== OFFICE_HISTORY_PAGE_SIZE || !nextCursor))
      || (!root.hasMore && root.nextCursor !== null)) {
    throw new Error("Invalid public office history response");
  }
  const offices = options.map((item): PublicOfficeOption => {
    const office = record(item);
    if (!office || !canonicalHistorySlug(text(office.slug)) || !text(office.title)) {
      throw new Error("Invalid public office history office option");
    }
    return { slug: canonicalHistorySlug(text(office.slug))!, title: text(office.title) };
  });

  const terms = items.map((item): PublicOfficeTerm => {
    const row = record(item);
    const status = text(row?.status);
    const startedAt = text(row?.startedAt);
    const actualEndAt = text(row?.actualEndAt);
    if (!row || !UUID_PATTERN.test(text(row.id)) || !UUID_PATTERN.test(text(row.officeId))
        || !text(row.officeTitle) || !text(row.holderDisplayName)
        || !["ended", "removed", "resigned"].includes(status)
        || !TERM_KINDS.has(text(row.termKind))
        || !isTimestamp(startedAt) || !isTimestamp(actualEndAt)
        || (row.scheduledEndAt !== null && !isTimestamp(row.scheduledEndAt))
        || (row.representedCountryName !== null
          && (typeof row.representedCountryName !== "string"
            || !row.representedCountryName.trim()))
        || Date.parse(actualEndAt) < Date.parse(startedAt)) {
      throw new Error("Invalid public office history term");
    }
    return {
      id: text(row.id),
      officeId: text(row.officeId),
      officeTitle: text(row.officeTitle),
      holderDisplayName: text(row.holderDisplayName),
      representedCountryName: nullableText(row.representedCountryName),
      termKind: text(row.termKind),
      status: status as PublicOfficeTerm["status"],
      startedAt,
      scheduledEndAt: nullableText(row.scheduledEndAt),
      actualEndAt,
      startEditionNumber: edition(row.startEditionNumber),
      endEditionNumber: edition(row.endEditionNumber),
    };
  });
  // A forged or defective cursor could make infinite-query replay the same
  // public page indefinitely. Never trust an unbound continuation token.
  if (new Set(terms.map((term) => term.id)).size !== terms.length
      || (root.hasMore && (
        terms.at(-1)?.id !== nextCursor?.termId
        || terms.at(-1)?.startedAt !== nextCursor?.startedAt
      ))) {
    throw new Error("Invalid public office history continuation");
  }
  return {
    organization: { slug, shortName: text(org.shortName), officialName: text(org.officialName) },
    offices,
    terms,
    hasMore: root.hasMore,
    nextCursor,
  };
}

export async function loadPublicOfficeHistory(
  slug: string,
  cursor: PublicOfficeHistoryCursor | null = null,
  officeSlug: string | null = null,
): Promise<PublicOfficeHistoryPage | null> {
  const canonical = canonicalHistorySlug(slug);
  if (!canonical) return null;
  const office = officeSlug === null ? null : canonicalHistorySlug(officeSlug);
  if (officeSlug !== null && !office) throw new Error("Invalid history office filter");
  if (cursor !== null && (!UUID_PATTERN.test(cursor.termId)
      || !isTimestamp(cursor.startedAt))) {
    throw new Error("Invalid history page cursor");
  }
  const { data, error } = await readClient.rpc("world_public_office_history_v1", {
    p_slug: canonical,
    p_cursor_started_at: cursor?.startedAt ?? null,
    p_cursor_term_id: cursor?.termId ?? null,
    p_office_slug: office,
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
