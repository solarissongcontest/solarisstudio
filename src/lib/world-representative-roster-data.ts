import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as client } from "@/integrations/supabase/client";
import {
  WORLD_REPRESENTATIVE_MAX_PAGE,
  WORLD_REPRESENTATIVE_PAGE_SIZE,
  normalizedWorldRepresentativeSearch,
  parseWorldRepresentativeRoster,
  validWorldOrganizationSlug,
  type WorldRepresentativeFilter,
  type WorldRepresentativeRoster,
} from "@/lib/world-representative-roster";

// TG3 is stacked on an unmerged System migration; generated app types are not
// updated on this branch. No direct table writes or service-role keys.
const supabase = client as unknown as SupabaseClient;

export async function readPublicWorldRepresentatives(input: {
  slug: string;
  filter: WorldRepresentativeFilter;
  search: string;
  page: number;
}): Promise<WorldRepresentativeRoster | null> {
  if (!validWorldOrganizationSlug(input.slug) ||
      !["current", "past", "all"].includes(input.filter) ||
      !Number.isSafeInteger(input.page) ||
      input.page < 0 || input.page > WORLD_REPRESENTATIVE_MAX_PAGE) {
    throw new Error("INVALID_WORLD_REPRESENTATIVE_REQUEST");
  }
  const search = normalizedWorldRepresentativeSearch(input.search);
  const { data, error } = await supabase.rpc("world_public_representative_roster_v1", {
    p_slug: input.slug,
    p_status: input.filter,
    p_search: search,
    p_offset: input.page * WORLD_REPRESENTATIVE_PAGE_SIZE,
    p_limit: WORLD_REPRESENTATIVE_PAGE_SIZE,
  });
  if (error) throw error;
  return parseWorldRepresentativeRoster(data, { ...input, search });
}
