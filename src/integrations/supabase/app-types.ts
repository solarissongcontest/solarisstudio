import type { Database, Json } from "./types";

type TableDefinition<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type FanProfileRow = {
  id: string;
  display_name: string;
  visibility: "private" | "unlisted" | "public";
  leaderboard_opt_in: boolean;
  created_at: string;
  updated_at: string;
};

export type PredictionRoundRow = {
  id: string;
  show_id: string;
  opens_at: string;
  locks_at: string;
  status: "draft" | "open" | "locked" | "scoring" | "scored" | "cancelled";
  prediction_types: string[];
  scoring_version: string;
  consensus_minimum: number;
  created_at: string;
  updated_at: string;
};

export type PredictionEntryRow = {
  id: string;
  round_id: string;
  profile_id: string;
  version: number;
  state: "draft" | "submitted" | "locked" | "scored";
  submitted_at: string | null;
  locked_at: string | null;
  share_token: string | null;
  created_at: string;
  updated_at: string;
};

export type PredictionItemRow = {
  id: string;
  entry_id: string;
  country_id: string;
  prediction_type: string;
  rank: number | null;
  confidence: number | null;
  created_at: string;
};

export type PredictionEntryVersionRow = {
  id: string;
  entry_id: string;
  version: number;
  payload: Json;
  submitted_at: string;
};

export type PredictionScoreRow = {
  entry_id: string;
  score: number;
  percentile: number | null;
  breakdown: Json;
  scoring_version: string;
  scored_at: string;
};

export type FanFollowRow = {
  id: string;
  profile_id: string;
  entity_type: "country" | "edition" | "show";
  entity_id: string;
  notification_level: "all" | "important" | "none";
  created_at: string;
  updated_at: string;
};

export type ContentEventRow = {
  id: string;
  event_type: string;
  entity_type: "country" | "edition" | "show";
  entity_id: string;
  title: string;
  summary: string;
  route: string;
  importance: "normal" | "important";
  payload: Json;
  published_at: string;
  created_at: string;
};

export type FanEventReadRow = {
  profile_id: string;
  event_id: string;
  read_at: string;
};

export type NotificationPreferenceRow = {
  profile_id: string;
  in_app_enabled: boolean;
  categories: string[];
  external_enabled: boolean;
  updated_at: string;
};

type PublicSchema = Database["public"];

export type AppDatabase = Omit<Database, "public"> & {
  public: Omit<PublicSchema, "Tables" | "Functions"> & {
    Tables: PublicSchema["Tables"] & {
      fan_profiles: TableDefinition<
        FanProfileRow,
        {
          id: string;
          display_name?: string;
          visibility?: FanProfileRow["visibility"];
          leaderboard_opt_in?: boolean;
          created_at?: string;
          updated_at?: string;
        },
        Partial<FanProfileRow>
      >;
      prediction_rounds: TableDefinition<
        PredictionRoundRow,
        {
          id?: string;
          show_id: string;
          opens_at: string;
          locks_at: string;
          status?: PredictionRoundRow["status"];
          prediction_types?: string[];
          scoring_version?: string;
          consensus_minimum?: number;
          created_at?: string;
          updated_at?: string;
        },
        Partial<PredictionRoundRow>
      >;
      prediction_entries: TableDefinition<
        PredictionEntryRow,
        {
          id?: string;
          round_id: string;
          profile_id: string;
          version?: number;
          state?: PredictionEntryRow["state"];
          submitted_at?: string | null;
          locked_at?: string | null;
          share_token?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<PredictionEntryRow>
      >;
      prediction_items: TableDefinition<
        PredictionItemRow,
        {
          id?: string;
          entry_id: string;
          country_id: string;
          prediction_type: string;
          rank?: number | null;
          confidence?: number | null;
          created_at?: string;
        },
        Partial<PredictionItemRow>
      >;
      prediction_entry_versions: TableDefinition<
        PredictionEntryVersionRow,
        {
          id?: string;
          entry_id: string;
          version: number;
          payload: Json;
          submitted_at?: string;
        },
        Partial<PredictionEntryVersionRow>
      >;
      prediction_scores: TableDefinition<
        PredictionScoreRow,
        {
          entry_id: string;
          score: number;
          percentile?: number | null;
          breakdown?: Json;
          scoring_version: string;
          scored_at?: string;
        },
        Partial<PredictionScoreRow>
      >;
      fan_follows: TableDefinition<
        FanFollowRow,
        {
          id?: string;
          profile_id: string;
          entity_type: FanFollowRow["entity_type"];
          entity_id: string;
          notification_level?: FanFollowRow["notification_level"];
          created_at?: string;
          updated_at?: string;
        },
        Partial<FanFollowRow>
      >;
      content_events: TableDefinition<
        ContentEventRow,
        {
          id?: string;
          event_type: string;
          entity_type: ContentEventRow["entity_type"];
          entity_id: string;
          title: string;
          summary?: string;
          route: string;
          importance?: ContentEventRow["importance"];
          payload?: Json;
          published_at?: string;
          created_at?: string;
        },
        Partial<ContentEventRow>
      >;
      fan_event_reads: TableDefinition<
        FanEventReadRow,
        FanEventReadRow,
        Partial<FanEventReadRow>
      >;
      notification_preferences: TableDefinition<
        NotificationPreferenceRow,
        {
          profile_id: string;
          in_app_enabled?: boolean;
          categories?: string[];
          external_enabled?: boolean;
          updated_at?: string;
        },
        Partial<NotificationPreferenceRow>
      >;
    };
    Functions: PublicSchema["Functions"] & {
      submit_prediction: {
        Args: { _round_id: string; _payload: Json };
        Returns: string;
      };
      prediction_consensus: {
        Args: { _round_id: string };
        Returns: Json;
      };
      score_prediction_round: {
        Args: { _round_id: string };
        Returns: number;
      };
      enable_prediction_share: {
        Args: { _entry_id: string };
        Returns: string;
      };
      shared_prediction: {
        Args: { _share_token: string };
        Returns: Json;
      };
      set_fan_follow: {
        Args: {
          _entity_type: string;
          _entity_id: string;
          _following: boolean;
          _notification_level?: string;
        };
        Returns: boolean;
      };
      mark_content_event_read: {
        Args: { _event_id: string };
        Returns: undefined;
      };
      mark_content_events_read: {
        Args: { _event_ids: string[] };
        Returns: number;
      };
      prediction_consensus_movement: {
        Args: { _round_id: string };
        Returns: Json;
      };
    };
  };
};
