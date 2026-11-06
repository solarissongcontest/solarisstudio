import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { assertOwnedHistoryCountry, scopedOwnedHistoryQueryKey } from "@/lib/owned-history-scope";
import { useOwnedHistoryScope } from "@/lib/owned-history-scope-runtime";

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
  const scope = useOwnedHistoryScope();
  return useQuery({
    enabled: enabled && scope !== null,
    queryKey: scopedOwnedHistoryQueryKey("owned-country-identity-history", scope),
    queryFn: async () => {
      if (!scope) throw new Error("Verified delegation access is required for history.");
      const { data, error } = await supabase.rpc("owned_country_identity_history");
      if (error) throw error;
      assertOwnedHistoryCountry(data, scope);
      const value = data as Partial<OwnedCountryIdentityHistory>;
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

export function usePublicCountryIdentityHistory(countryId?: string, verifyOnMount = false) {
  return useQuery({
    enabled: Boolean(countryId),
    queryKey: ["public-country-identity-history", countryId],
    queryFn: async ({ signal }) => {
      if (signal.aborted) throw new DOMException("Country history read cancelled", "AbortError");
      const { data, error } = await supabase.rpc("public_country_identity_history", {
        _country_id: countryId,
      }).abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as PublicCountryIdentityHistoryRow[];
    },
    staleTime: 60_000,
    // Canonical public Country uses a fresh server check before revealing
    // historical flags; other consumers retain the existing cache contract.
    refetchOnMount: verifyOnMount ? "always" : undefined,
    retry: false,
  });
}
