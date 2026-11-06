import { supabase } from "@/integrations/supabase/client";

export const WORLD_HISTORY_PAGE_SIZE = 20;
export type WorldHistorySource = "editorial" | "domestic_election" | "institutional";
export type WorldHistoryEvent = {
  id: string;
  occurredAt: string;
  title: string;
  summary: string;
  sourceType: WorldHistorySource;
  provenance: string;
  countryCode: string | null;
  organizationSlug: string | null;
};
export type WorldHistoryPage = {
  events: WorldHistoryEvent[];
  page: number;
  pageSize: 20;
  hasMore: boolean;
};
const isRecord = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);

export function parseWorldHistoryPage(value: unknown, requestedPage: number): WorldHistoryPage {
  if (!isRecord(value) || value.page !== requestedPage || value.pageSize !== WORLD_HISTORY_PAGE_SIZE ||
      typeof value.hasMore !== "boolean" || !Array.isArray(value.events) ||
      value.events.length > WORLD_HISTORY_PAGE_SIZE) throw new Error("Invalid World Archive response");
  const events = value.events.map((event): WorldHistoryEvent => {
    if (!isRecord(event) || typeof event.id !== "string" || !event.id ||
        typeof event.occurred_at !== "string" || !Number.isFinite(Date.parse(event.occurred_at)) ||
        typeof event.title !== "string" || !event.title.trim() ||
        typeof event.summary !== "string" || !event.summary.trim() ||
        !["editorial","domestic_election","institutional"].includes(String(event.source_type)) ||
        typeof event.provenance !== "string" ||
        !(event.country_code === null || typeof event.country_code === "string") ||
        !(event.organization_slug === null || typeof event.organization_slug === "string")) {
      throw new Error("Invalid World Archive event");
    }
    return { id: event.id, occurredAt: event.occurred_at, title: event.title,
      summary: event.summary, sourceType: event.source_type as WorldHistorySource,
      provenance: event.provenance, countryCode: event.country_code,
      organizationSlug: event.organization_slug };
  });
  return { events, page: requestedPage, pageSize: 20, hasMore: value.hasMore };
}

/** Bounded public derived projection; never query private institutional drafts or votes. */
export async function readWorldHistoryPage(
  page: number, countryCode: string | null = null, signal?: AbortSignal,
): Promise<WorldHistoryPage> {
  if (!Number.isSafeInteger(page) || page < 0 || page > 100 ||
      (countryCode !== null && !/^[a-z0-9-]{2,12}$/i.test(countryCode))) {
    throw new Error("Invalid archive page or country");
  }
  if (signal?.aborted) throw new Error("Request cancelled");
  const query = (supabase as any).rpc("world_history_timeline_v1", {
    p_page: page, p_country_code: countryCode,
  });
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  if (error) throw new Error("World Archive could not be loaded");
  return parseWorldHistoryPage(data, page);
}
