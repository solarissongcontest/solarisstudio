import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase as typedSupabase } from "@/integrations/supabase/client";
import type { PublicNationalFinal } from "@/lib/national-finals";

const supabase = typedSupabase as any;

export type HistoricalNationalFinalEntryInput = {
  artist: string;
  song_title: string;
  song_url?: string;
  next_in_line?: boolean;
  result_position?: number | null;
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
      const { data, error } = await supabase.rpc("manage_country_national_finals", {
        _country_id: countryId!,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as Array<PublicNationalFinal & { source?: string }>;
    },
    staleTime: 10_000,
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

export function useSetCountryNationalFinalWinner(countryId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      nationalFinalId: string;
      winnerEntryId: string | null;
      previousWinnerEntryId: string | null;
      source?: string;
    }) => {
      if (!countryId) throw new Error("No country is selected.");

      // Manual/historical country finals are a separate country-history domain.
      // Confirmation-backed finals use the same exact-version Selection
      // authority as Organizer so MySolaris cannot bypass S2 receipts or current
      // reviewed Entry-version invariants.
      if (input.source !== "confirmation") {
        const { data, error } = await supabase.rpc("set_country_national_final_winner", {
          _country_id: countryId,
          _national_final_id: input.nationalFinalId,
          _winning_entry_id: input.winnerEntryId,
        });
        if (error) throw error;
        return data as {
          id: string;
          winning_entry_id: string | null;
        };
      }

      const action = input.winnerEntryId ? "select" : "clear";
      const previewResult = await supabase.rpc("studio2_confirmation_winner_change_preview", {
        p_national_final_id: input.nationalFinalId,
        p_action: action,
        p_entry_id: input.winnerEntryId,
      });
      if (previewResult.error) throw previewResult.error;

      const preview = previewResult.data as {
        expectedVersion?: number;
        currentVersionId?: string | null;
        alreadyApplied?: boolean;
      } | null;
      if (!preview || !Number.isSafeInteger(preview.expectedVersion)) {
        throw new Error("Could not load the canonical National Final winner version.");
      }

      // A lost-response retry or repeated tap must not manufacture another audit
      // transition merely because the browser generated a fresh operation id.
      if (action === "select" && preview.alreadyApplied === true) {
        return {
          id: input.nationalFinalId,
          winning_entry_id: input.winnerEntryId,
        };
      }

      if (action === "select" && !preview.currentVersionId) {
        throw new Error("The selected winner is missing its current reviewed Entry version.");
      }

      const operationId = crypto.randomUUID();
      const applyResult = await supabase.rpc("studio2_apply_confirmation_winner_change", {
        p_national_final_id: input.nationalFinalId,
        p_action: action,
        p_entry_id: input.winnerEntryId,
        p_reason: "Country account updated the National Final winner.",
        p_operation_id: operationId,
        p_idempotency_key: `country-nf-winner:${input.nationalFinalId}:${operationId}`,
        p_expected_version: preview.expectedVersion,
        p_expected_entry_version: action === "select" ? preview.currentVersionId : null,
      });
      if (applyResult.error) throw applyResult.error;

      const result = applyResult.data as {
        nationalFinalId?: string;
        winnerEntryId?: string | null;
      } | null;
      return {
        id: result?.nationalFinalId ?? input.nationalFinalId,
        winning_entry_id: result?.winnerEntryId ?? null,
      };
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["country-historical-national-finals", countryId] }),
        queryClient.invalidateQueries({ queryKey: ["country-national-finals", countryId] }),
      ]);
    },
  });
}

export function useSaveCountryNationalFinalResultOrder(countryId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { nationalFinalId: string; orderedEntryIds: string[] }) => {
      if (!countryId) throw new Error("No country is selected.");
      const { data, error } = await supabase.rpc("set_country_national_final_result_order", {
        _country_id: countryId,
        _national_final_id: input.nationalFinalId,
        _ordered_entry_ids: input.orderedEntryIds,
      });
      if (error) throw error;
      return data as { id: string; entry_count: number; winning_entry_id: string | null };
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["country-historical-national-finals", countryId] }),
        queryClient.invalidateQueries({ queryKey: ["country-national-finals", countryId] }),
      ]);
    },
  });
}

export function useSetCountryNationalFinalPublication(countryId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      nationalFinalId: string;
      lineupPublished?: boolean;
      resultsPublished?: boolean;
    }) => {
      if (!countryId) throw new Error("No country is selected.");
      const { data, error } = await supabase.rpc("set_country_national_final_publication", {
        _country_id: countryId,
        _national_final_id: input.nationalFinalId,
        _lineup_published: input.lineupPublished ?? null,
        _results_published: input.resultsPublished ?? null,
      });
      if (error) throw error;
      return data as {
        id: string;
        lineup_published: boolean;
        results_published: boolean;
      };
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
