import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase as typedSupabase } from "@/integrations/supabase/client";

const supabase = typedSupabase as any;

export type OwnedCountryIdentityEdition = {
  edition_id: string;
  edition_number: number | null;
  edition_name: string;
  display_name: string | null;
  flag_image: string | null;
};

export type OwnedCountryIdentityHistory = {
  country_id: string;
  editions: OwnedCountryIdentityEdition[];
};

export type PublicCountryIdentityHistoryRow = {
  edition_id: string;
  edition_number: number | null;
  edition_name: string;
  display_name: string;
  flag_image: string | null;
};

export function useOwnedCountryIdentityHistory(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ["owned-country-identity-history"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("owned_country_identity_history");
      if (error) throw error;
      const value = (data ?? {}) as Partial<OwnedCountryIdentityHistory>;
      return {
        country_id: String(value.country_id ?? ""),
        editions: Array.isArray(value.editions)
          ? (value.editions as OwnedCountryIdentityEdition[])
          : [],
      } satisfies OwnedCountryIdentityHistory;
    },
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}

export function useSetOwnedCountryEditionIdentity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      editionId: string;
      displayName: string;
      flagImage?: string | null;
    }) => {
      const { data, error } = await supabase.rpc("set_owned_country_edition_identity", {
        _edition_id: input.editionId,
        _display_name: input.displayName,
        _flag_image: input.flagImage ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["owned-country-identity-history"] }),
        qc.invalidateQueries({ queryKey: ["contest_entities"] }),
        qc.invalidateQueries({ queryKey: ["participants"] }),
      ]);
    },
  });
}

export function useClearOwnedCountryEditionIdentity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (editionId: string) => {
      const { error } = await supabase.rpc("clear_owned_country_edition_identity", {
        _edition_id: editionId,
      });
      if (error) throw error;
      return true;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["owned-country-identity-history"] }),
        qc.invalidateQueries({ queryKey: ["contest_entities"] }),
      ]);
    },
  });
}

export function usePublicCountryIdentityHistory(countryId?: string) {
  return useQuery({
    enabled: Boolean(countryId),
    queryKey: ["public-country-identity-history", countryId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_country_identity_history", {
        _country_id: countryId,
      });
      if (error) throw error;
      return (data ?? []) as PublicCountryIdentityHistoryRow[];
    },
    staleTime: 60_000,
  });
}
