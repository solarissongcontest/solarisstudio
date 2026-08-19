import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase as typedSupabase } from "@/integrations/supabase/client";

const supabase = typedSupabase as any;

export type EntryListeningInput = {
  participantId: string | null;
  editionId: string;
  youtubeUrl: string;
  spotifyUrl: string;
  appleMusicUrl: string;
};

export function useSaveEntryListeningLinks(countryId: string, organizerOverride = false) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: EntryListeningInput) => {
      const args = organizerOverride
        ? {
            _country_id: countryId,
            _participant_id: input.participantId,
            _edition_id: input.editionId,
            _youtube_url: input.youtubeUrl,
            _spotify_url: input.spotifyUrl,
            _apple_music_url: input.appleMusicUrl,
          }
        : {
            _participant_id: input.participantId,
            _edition_id: input.editionId,
            _youtube_url: input.youtubeUrl,
            _spotify_url: input.spotifyUrl,
            _apple_music_url: input.appleMusicUrl,
          };

      const { data, error } = await supabase.rpc(
        organizerOverride
          ? "admin_update_country_entry_listen_links"
          : "update_owned_country_entry_listen_links",
        args,
      );

      if (error) throw error;
      return data;
    },
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["participants", "all"] }),
        queryClient.invalidateQueries({ queryKey: ["participants", variables.editionId] }),
        queryClient.invalidateQueries({ queryKey: ["participants"] }),
      ]);
    },
  });
}
