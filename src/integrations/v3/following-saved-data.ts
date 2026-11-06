import { useQuery } from "@tanstack/react-query";

import type { FanFollowRow } from "@/integrations/supabase/app-types";
import { supabase } from "@/integrations/supabase/client";

export type V3FollowCountryDetail = {
  id: string;
  name: string;
  short_code: string;
};

export type V3FollowEditionDetail = {
  id: string;
  name: string;
  slug: string;
  edition_number: number | null;
};

export type V3FollowShowDetail = {
  id: string;
  name: string;
  edition_id: string;
};

export type V3FollowEntityDetails = {
  countries: V3FollowCountryDetail[];
  editions: V3FollowEditionDetail[];
  shows: V3FollowShowDetail[];
};

function unique(values: readonly string[]) {
  return [...new Set(values)].sort();
}

function followEntitySignature(follows: readonly FanFollowRow[]) {
  return follows
    .map((follow) => `${follow.entity_type}:${follow.entity_id}`)
    .sort()
    .join("|");
}

export function useV3FollowEntityDetails(
  profileId: string,
  follows: readonly FanFollowRow[] | undefined,
) {
  const scoped = follows?.every((follow) => follow.profile_id === profileId) ?? false;
  const signature = follows ? followEntitySignature(follows) : "pending";

  return useQuery({
    enabled: follows !== undefined && scoped,
    queryKey: ["v3-follow-entity-details", profileId, signature],
    staleTime: 60_000,
    queryFn: async (): Promise<V3FollowEntityDetails> => {
      if (!follows || !scoped) {
        return { countries: [], editions: [], shows: [] };
      }

      const countryIds = unique(
        follows
          .filter((follow) => follow.entity_type === "country")
          .map((follow) => follow.entity_id),
      );
      const followedEditionIds = unique(
        follows
          .filter((follow) => follow.entity_type === "edition")
          .map((follow) => follow.entity_id),
      );
      const showIds = unique(
        follows
          .filter((follow) => follow.entity_type === "show")
          .map((follow) => follow.entity_id),
      );

      const countriesPromise = countryIds.length
        ? supabase
            .from("countries")
            .select("id,name,short_code")
            .in("id", countryIds)
        : Promise.resolve({ data: [] as V3FollowCountryDetail[], error: null });

      const showsPromise = showIds.length
        ? supabase
            .from("shows")
            .select("id,name,edition_id")
            .in("id", showIds)
            .eq("published", true)
        : Promise.resolve({ data: [] as V3FollowShowDetail[], error: null });

      const [countriesResult, showsResult] = await Promise.all([
        countriesPromise,
        showsPromise,
      ]);

      if (countriesResult.error) throw countriesResult.error;
      if (showsResult.error) throw showsResult.error;

      const countries = (countriesResult.data ?? []) as V3FollowCountryDetail[];
      const shows = (showsResult.data ?? []) as V3FollowShowDetail[];
      const editionIds = unique([
        ...followedEditionIds,
        ...shows.map((show) => show.edition_id),
      ]);

      if (!editionIds.length) {
        return { countries, editions: [], shows };
      }

      const editionsResult = await supabase
        .from("editions")
        .select("id,name,slug,edition_number")
        .in("id", editionIds)
        .eq("published", true);

      if (editionsResult.error) throw editionsResult.error;

      return {
        countries,
        editions: (editionsResult.data ?? []) as V3FollowEditionDetail[],
        shows,
      };
    },
  });
}
