import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AppDatabase,
  ContentEventRow,
  FanFollowRow,
  NotificationPreferenceRow,
} from "@/integrations/supabase/app-types";
import { supabase as baseSupabase } from "@/integrations/supabase/client";

import { missingEngagementSchema } from "./prediction-data";

const supabase = baseSupabase as unknown as SupabaseClient<AppDatabase>;

export type FollowEntityType = FanFollowRow["entity_type"];

export function useMyFollows(profileId?: string) {
  return useQuery({
    enabled: Boolean(profileId),
    queryKey: ["fan-follows", profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fan_follows")
        .select("*")
        .eq("profile_id", profileId!)
        .order("created_at", { ascending: false });
      if (missingEngagementSchema(error)) {
        return { schemaReady: false, follows: [] as FanFollowRow[] };
      }
      if (error) throw error;
      return { schemaReady: true, follows: data ?? [] };
    },
  });
}

export function useSetFanFollow(profileId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      entityType,
      entityId,
      following,
      notificationLevel = "important",
    }: {
      entityType: FollowEntityType;
      entityId: string;
      following: boolean;
      notificationLevel?: FanFollowRow["notification_level"];
    }) => {
      if (!profileId) throw new Error("Sign in to follow this item.");
      const { data, error } = await supabase.rpc("set_fan_follow", {
        _entity_type: entityType,
        _entity_id: entityId,
        _following: following,
        _notification_level: notificationLevel,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["fan-follows", profileId] });
    },
  });
}

export function useContentEvents(limit = 30) {
  return useQuery({
    queryKey: ["content-events", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_events")
        .select("*")
        .lte("published_at", new Date().toISOString())
        .order("published_at", { ascending: false })
        .limit(limit);
      if (missingEngagementSchema(error)) {
        return { schemaReady: false, events: [] as ContentEventRow[] };
      }
      if (error) throw error;
      return { schemaReady: true, events: data ?? [] };
    },
    staleTime: 30_000,
  });
}

export function useEventReads(profileId?: string) {
  return useQuery({
    enabled: Boolean(profileId),
    queryKey: ["fan-event-reads", profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fan_event_reads")
        .select("event_id, read_at")
        .eq("profile_id", profileId!);
      if (missingEngagementSchema(error)) return [];
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMarkEventRead(profileId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (eventId: string) => {
      if (!profileId) return;
      const { error } = await supabase.rpc("mark_content_event_read", { _event_id: eventId });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["fan-event-reads", profileId] });
    },
  });
}

export function useNotificationPreferences(profileId?: string) {
  return useQuery({
    enabled: Boolean(profileId),
    queryKey: ["notification-preferences", profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("profile_id", profileId!)
        .maybeSingle();
      if (missingEngagementSchema(error)) return null;
      if (error) throw error;
      return data as NotificationPreferenceRow | null;
    },
  });
}

export function useSaveNotificationPreferences(profileId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      preferences: Pick<
        NotificationPreferenceRow,
        "in_app_enabled" | "categories" | "external_enabled"
      >,
    ) => {
      if (!profileId) throw new Error("Sign in before updating notifications.");
      const { error: profileError } = await supabase
        .from("fan_profiles")
        .upsert({ id: profileId }, { onConflict: "id" });
      if (profileError) throw profileError;
      const { data, error } = await supabase
        .from("notification_preferences")
        .upsert(
          { profile_id: profileId, ...preferences, updated_at: new Date().toISOString() },
          { onConflict: "profile_id" },
        )
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["notification-preferences", profileId],
      });
    },
  });
}
