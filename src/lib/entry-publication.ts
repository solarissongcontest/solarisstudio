import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase as typedSupabase } from "@/integrations/supabase/client";

const supabase = typedSupabase as any;

export type EntryPublicationStatus = "draft" | "scheduled" | "published";
export type EntryPublicationSource = "legacy" | "manual" | "confirmation";

export type EntryPublicationState = {
  exists: boolean;
  participant_id?: string;
  edition_id: string;
  country_id?: string;
  artist?: string | null;
  song?: string | null;
  publication_status?: EntryPublicationStatus;
  scheduled_publish_at?: string | null;
  published_at?: string | null;
  publication_source?: EntryPublicationSource;
  publication_overridden?: boolean;
};

export function useOwnedEntryPublication(editionId?: string) {
  return useQuery({
    enabled: Boolean(editionId),
    queryKey: ["owned-entry-publication", editionId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("owned_country_entry_publication", {
        _edition_id: editionId!,
      });
      if (error) throw error;
      return (data ?? { exists: false, edition_id: editionId! }) as EntryPublicationState;
    },
    staleTime: 15_000,
  });
}

export function useSetOwnedEntryPublication(editionId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      mode,
      scheduledAt,
      source = "manual",
    }: {
      mode: "publish" | "schedule" | "draft";
      scheduledAt?: string | null;
      source?: "manual" | "confirmation";
    }) => {
      if (!editionId) throw new Error("Choose an edition first.");
      const { data, error } = await supabase.rpc("set_owned_country_entry_publication", {
        _edition_id: editionId,
        _mode: mode,
        _scheduled_at: scheduledAt ?? null,
        _source: source,
      });
      if (error) throw error;
      return data as EntryPublicationState;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["owned-entry-publication", editionId] }),
        queryClient.invalidateQueries({ queryKey: ["participants"] }),
        queryClient.invalidateQueries({ queryKey: ["content-events"] }),
      ]);
    },
  });
}
