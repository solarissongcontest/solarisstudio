import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase as typedSupabase } from "@/integrations/supabase/client";

const supabase = typedSupabase as any;

export type OwnedHodEditionStatus = "mine" | "other" | "unknown";

export type OwnedHodEdition = {
  edition_id: string;
  edition_number: number | null;
  edition_name: string;
  status: OwnedHodEditionStatus;
};

export type OwnedHodHistory = {
  country_id: string;
  auto_assign_future: boolean;
  editions: OwnedHodEdition[];
};

export type OwnedHodClaim = {
  user_id: string;
  country_id: string;
  edition_id: string;
  status: OwnedHodEditionStatus;
  updated_at: string;
};

export function useOwnedHodHistory(enabled = true, viewerId?: string | null) {
  return useQuery({
    enabled,
    queryKey: ["owned-hod-edition-history", viewerId ?? "current-viewer"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("owned_hod_edition_history");
      if (error) throw error;
      const value = (data ?? {}) as Partial<OwnedHodHistory>;
      return {
        country_id: String(value.country_id ?? ""),
        auto_assign_future: value.auto_assign_future !== false,
        editions: Array.isArray(value.editions) ? value.editions as OwnedHodEdition[] : [],
      } satisfies OwnedHodHistory;
    },
    staleTime: 15_000,
  });
}

/**
 * Historical self-claims are deliberately read from their canonical RLS-bound
 * table instead of widening the current-country RPC. The explicit user filter
 * keeps Organizer capability from broadening this private Me projection while
 * RLS independently enforces user_id = auth.uid() for normal viewers.
 */
export function useOwnedHodClaims(viewerId?: string | null, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(viewerId),
    queryKey: ["owned-hod-edition-claims", viewerId ?? "no-viewer"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("country_hod_edition_claims")
        .select("user_id,country_id,edition_id,status,updated_at")
        .eq("user_id", viewerId!)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as OwnedHodClaim[]).filter((row) => row.user_id === viewerId);
    },
    staleTime: 15_000,
  });
}

export function useSetOwnedHodEditionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { editionId: string; status: OwnedHodEditionStatus }) => {
      const { error } = await supabase.rpc("set_owned_hod_edition_status", {
        _edition_id: input.editionId,
        _status: input.status,
      });
      if (error) throw error;
      return true;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["owned-hod-edition-history"] }),
        qc.invalidateQueries({ queryKey: ["owned-hod-edition-claims"] }),
      ]);
    },
  });
}

export function useSetOwnedHodAutoAssign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase.rpc("set_owned_hod_auto_assign", { _enabled: enabled });
      if (error) throw error;
      return true;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["owned-hod-edition-history"] });
    },
  });
}
