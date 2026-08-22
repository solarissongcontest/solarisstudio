import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase as typedSupabase } from "@/integrations/supabase/client";
import type { PublicNationalFinal } from "@/lib/national-finals";

const supabase = typedSupabase as any;

export type HistoricalNationalFinalEntryInput = {
  artist: string;
  song_title: string;
  song_url?: string;
};

export type HistoricalNationalFinalInput = {
  id?: string | null;
  editionId: string;
  name: string;
  nfDate?: string | null;
  resultDate?: string | null;
  entries: HistoricalNationalFinalEntryInput[];
  winningPosition?: number | null;
};

export function useCountryHistoricalNationalFinals(countryId?: string) {
  return useQuery({
    enabled: Boolean(countryId),
    queryKey: ["country-historical-national-finals", countryId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_country_national_finals", {
        _country_id: countryId!,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as Array<PublicNationalFinal & { source?: string }>;
    },
    staleTime: 30_000,
  });
}

export function useSaveCountryHistoricalNationalFinal(countryId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: HistoricalNationalFinalInput) => {
      if (!countryId) throw new Error("No country is selected.");
      const { data, error } = await supabase.rpc("save_country_historical_national_final", {
        _country_id: countryId,
        _edition_id: input.editionId,
        _nf_name: input.name,
        _nf_date: input.nfDate || null,
        _result_date: input.resultDate || null,
        _entries: input.entries,
        _winning_position: input.winningPosition ?? null,
        _national_final_id: input.id ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["country-historical-national-finals", countryId] }),
        queryClient.invalidateQueries({ queryKey: ["country-national-finals", countryId] }),
      ]);
    },
  });
}

export function useDeleteCountryHistoricalNationalFinal(countryId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (nationalFinalId: string) => {
      if (!countryId) throw new Error("No country is selected.");
      const { data, error } = await supabase.rpc("delete_country_historical_national_final", {
        _country_id: countryId,
        _national_final_id: nationalFinalId,
      });
      if (error) throw error;
      return Boolean(data);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["country-historical-national-finals", countryId] }),
        queryClient.invalidateQueries({ queryKey: ["country-national-finals", countryId] }),
      ]);
    },
  });
}
