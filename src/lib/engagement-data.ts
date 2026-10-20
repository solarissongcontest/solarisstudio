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
import type { PredictionMovementPayload } from "./pulse";

const supabase = baseSupabase as unknown as SupabaseClient<AppDatabase>;

export type FollowEntityType = FanFollowRow["entity_type"];

type PublicPulseEventItem = {
  id: string;
  eventType: string;
  entityType: ContentEventRow["entity_type"];
  entityId: string;
  title: string;
  summary: string;
  route: string | null;
  importance: ContentEventRow["importance"];
  payload: ContentEventRow["payload"];
  publishedAt: string;
};

type PublicPulseProjection = {
  items: PublicPulseEventItem[];
  nextCursor: { publishedAt: string; id: string } | null;
  serverTime: string;
};

function isPulseEntityType(value: unknown): value is ContentEventRow["entity_type"] {
  return value === "country" || value === "edition" || value === "show";
}

function isPulseImportance(value: unknown): value is ContentEventRow["importance"] {
  return value === "normal" || value === "important";
}

function parsePublicPulseProjection(value: unknown): PublicPulseProjection {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Pulse projection returned an invalid response.");
  }

  const projection = value as Record<string, unknown>;
  if (!Array.isArray(projection.items) || typeof projection.serverTime !== "string") {
    throw new Error("Pulse projection returned an invalid response.");
  }

  const items = projection.items.map((rawItem) => {
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
      throw new Error("Pulse projection returned an invalid event.");
    }
    const item = rawItem as Record<string, unknown>;
    if (
      typeof item.id !== "string" ||
      typeof item.eventType !== "string" ||
      !isPulseEntityType(item.entityType) ||
      typeof item.entityId !== "string" ||
      typeof item.title !== "string" ||
      typeof item.summary !== "string" ||
      !(typeof item.route === "string" || item.route === null) ||
      !isPulseImportance(item.importance) ||
      typeof item.publishedAt !== "string"
    ) {
      throw new Error("Pulse projection returned an invalid event.");
    }

    return {
      id: item.id,
      eventType: item.eventType,
      entityType: item.entityType,
      entityId: item.entityId,
      title: item.title,
      summary: item.summary,
      route: item.route,
      importance: item.importance,
      payload: (item.payload ?? {}) as ContentEventRow["payload"],
      publishedAt: item.publishedAt,
    } satisfies PublicPulseEventItem;
  });

  let nextCursor: PublicPulseProjection["nextCursor"] = null;
  if (projection.nextCursor != null) {
    if (
      typeof projection.nextCursor !== "object" ||
      Array.isArray(projection.nextCursor) ||
      typeof (projection.nextCursor as Record<string, unknown>).publishedAt !== "string" ||
      typeof (projection.nextCursor as Record<string, unknown>).id !== "string"
    ) {
      throw new Error("Pulse projection returned an invalid cursor.");
    }
    nextCursor = {
      publishedAt: (projection.nextCursor as Record<string, string>).publishedAt,
      id: (projection.nextCursor as Record<string, string>).id,
    };
  }

  return {
    items,
    nextCursor,
    serverTime: projection.serverTime,
  };
}

function missingPublicPulseProjection(error: { code?: string; message?: string } | null) {
  if (missingEngagementSchema(error)) return true;
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "PGRST202" ||
    (message.includes("v3_public_pulse_events") &&
      (message.includes("schema cache") ||
        message.includes("could not find") ||
        message.includes("does not exist")))
  );
}

function publicPulseEventRow(item: PublicPulseEventItem): ContentEventRow {
  return {
    id: item.id,
    event_type: item.eventType,
    entity_type: item.entityType,
    entity_id: item.entityId,
    title: item.title,
    summary: item.summary,
    route: item.route ?? "/pulse",
    importance: item.importance,
    payload: item.payload,
    published_at: item.publishedAt,
    created_at: item.publishedAt,
    dedupe_key: null,
  };
}

export const DEFAULT_SOLARIS_NOTIFICATION_CATEGORIES = [
  "confirmations",
  "jury",
  "televoting",
  "deadlines",
  "official",
  "results",
] as const;

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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["fan-follows", profileId] }),
        queryClient.invalidateQueries({ queryKey: ["content-events"] }),
      ]);
    },
  });
}

export function useContentEvents(limit = 30) {
  return useQuery({
    queryKey: ["content-events", limit],
    queryFn: async () => {
      const pageSize = Math.min(50, Math.max(1, Math.trunc(limit)));
      const { data, error } = await supabase.rpc("v3_public_pulse_events", {
        p_limit: pageSize,
        p_before_published_at: null,
        p_before_id: null,
        p_category: null,
      });
      if (missingPublicPulseProjection(error)) {
        return {
          schemaReady: false,
          events: [] as ContentEventRow[],
          nextCursor: null as PublicPulseProjection["nextCursor"],
          serverTime: null as string | null,
        };
      }
      if (error) throw error;

      const projection = parsePublicPulseProjection(data);
      return {
        schemaReady: true,
        events: projection.items.map(publicPulseEventRow),
        nextCursor: projection.nextCursor,
        serverTime: projection.serverTime,
      };
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

export function useMarkAllEventsRead(profileId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (eventIds: string[]) => {
      if (!profileId || !eventIds.length) return 0;
      const { data, error } = await supabase.rpc("mark_content_events_read", {
        _event_ids: eventIds,
      });
      if (missingEngagementSchema(error)) return 0;
      if (error) throw error;
      return Number(data ?? 0);
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
      > &
        Partial<
          Pick<
            NotificationPreferenceRow,
            | "quiet_hours_start"
            | "quiet_hours_end"
            | "urgent_deadline_reminders"
            | "spoiler_free"
            | "timezone"
          >
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

export function usePredictionMovement(roundId?: string, enabled = false) {
  return useQuery({
    enabled: Boolean(roundId && enabled),
    queryKey: ["prediction-movement", roundId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("prediction_consensus_movement", {
        _round_id: roundId!,
      });

      if (missingEngagementSchema(error)) {
        return {
          schemaReady: false,
          movement: null as PredictionMovementPayload | null,
        };
      }

      const message = error?.message?.toLowerCase() ?? "";
      if (message.includes("submit a prediction") || message.includes("authentication required")) {
        return {
          schemaReady: true,
          movement: null as PredictionMovementPayload | null,
        };
      }

      if (error) throw error;
      return {
        schemaReady: true,
        movement: data as unknown as PredictionMovementPayload,
      };
    },
    staleTime: 30_000,
  });
}
