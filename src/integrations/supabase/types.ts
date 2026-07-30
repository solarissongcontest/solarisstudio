export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      countries: {
        Row: {
          accent_color: string
          created_at: string
          description: string | null
          first_participation: number | null
          flag_image: string | null
          id: string
          name: string
          native_name: string | null
          region: string
          short_code: string
          statistics: Json
        }
        Insert: {
          accent_color?: string
          created_at?: string
          description?: string | null
          first_participation?: number | null
          flag_image?: string | null
          id?: string
          name: string
          native_name?: string | null
          region?: string
          short_code: string
          statistics?: Json
        }
        Update: {
          accent_color?: string
          created_at?: string
          description?: string | null
          first_participation?: number | null
          flag_image?: string | null
          id?: string
          name?: string
          native_name?: string | null
          region?: string
          short_code?: string
          statistics?: Json
        }
        Relationships: []
      }
      editions: {
        Row: {
          created_at: string
          description: string | null
          edition_number: number | null
          host_city: string | null
          host_country_id: string | null
          id: string
          jury_weight: number
          logo: string | null
          name: string
          published: boolean
          slug: string
          status: string
          theme_colors: Json
          theme_id: string | null
          year: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          edition_number?: number | null
          host_city?: string | null
          host_country_id?: string | null
          id?: string
          jury_weight?: number
          logo?: string | null
          name: string
          published?: boolean
          slug: string
          status?: string
          theme_colors?: Json
          theme_id?: string | null
          year?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          edition_number?: number | null
          host_city?: string | null
          host_country_id?: string | null
          id?: string
          jury_weight?: number
          logo?: string | null
          name?: string
          published?: boolean
          slug?: string
          status?: string
          theme_colors?: Json
          theme_id?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "editions_host_country_id_fkey"
            columns: ["host_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editions_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      jury_votes: {
        Row: {
          created_at: string
          edition_id: string
          id: string
          points: number
          receiving_country_id: string
          show_id: string | null
          voter_country_id: string | null
          voter_id: string | null
        }
        Insert: {
          created_at?: string
          edition_id: string
          id?: string
          points: number
          receiving_country_id: string
          show_id?: string | null
          voter_country_id?: string | null
          voter_id?: string | null
        }
        Update: {
          created_at?: string
          edition_id?: string
          id?: string
          points?: number
          receiving_country_id?: string
          show_id?: string | null
          voter_country_id?: string | null
          voter_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jury_votes_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jury_votes_receiving_country_id_fkey"
            columns: ["receiving_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jury_votes_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jury_votes_voter_country_id_fkey"
            columns: ["voter_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jury_votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "voters"
            referencedColumns: ["id"]
          },
        ]
      }
      participants: {
        Row: {
          artist: string | null
          country_id: string
          created_at: string
          edition_id: string
          id: string
          notes: string | null
          qualified: boolean | null
          running_order: number | null
          semi_final: string
          show_id: string | null
          song: string | null
        }
        Insert: {
          artist?: string | null
          country_id: string
          created_at?: string
          edition_id: string
          id?: string
          notes?: string | null
          qualified?: boolean | null
          running_order?: number | null
          semi_final?: string
          show_id?: string | null
          song?: string | null
        }
        Update: {
          artist?: string | null
          country_id?: string
          created_at?: string
          edition_id?: string
          id?: string
          notes?: string | null
          qualified?: boolean | null
          running_order?: number | null
          semi_final?: string
          show_id?: string | null
          song?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "participants_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participants_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participants_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
        ]
      }
      results: {
        Row: {
          country_id: string
          edition_id: string
          final_rank: number | null
          id: string
          jury_points: number
          show_id: string | null
          televote_points: number
          total_points: number
          updated_at: string
        }
        Insert: {
          country_id: string
          edition_id: string
          final_rank?: number | null
          id?: string
          jury_points?: number
          show_id?: string | null
          televote_points?: number
          total_points?: number
          updated_at?: string
        }
        Update: {
          country_id?: string
          edition_id?: string
          final_rank?: number | null
          id?: string
          jury_points?: number
          show_id?: string | null
          televote_points?: number
          total_points?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "results_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
        ]
      }
      shows: {
        Row: {
          broadcast_config: Json
          created_at: string
          edition_id: string
          id: string
          kind: string
          name: string
          published: boolean
          qualifier_count: number | null
          sort_order: number
          status: string
          theme_id: string | null
          updated_at: string
          voting_config: Json
        }
        Insert: {
          broadcast_config?: Json
          created_at?: string
          edition_id: string
          id?: string
          kind?: string
          name: string
          published?: boolean
          qualifier_count?: number | null
          sort_order?: number
          status?: string
          theme_id?: string | null
          updated_at?: string
          voting_config?: Json
        }
        Update: {
          broadcast_config?: Json
          created_at?: string
          edition_id?: string
          id?: string
          kind?: string
          name?: string
          published?: boolean
          qualifier_count?: number | null
          sort_order?: number
          status?: string
          theme_id?: string | null
          updated_at?: string
          voting_config?: Json
        }
        Relationships: [
          {
            foreignKeyName: "shows_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shows_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      televote_votes: {
        Row: {
          country_id: string
          created_at: string
          edition_id: string
          id: string
          points: number
          show_id: string | null
        }
        Insert: {
          country_id: string
          created_at?: string
          edition_id: string
          id?: string
          points?: number
          show_id?: string | null
        }
        Update: {
          country_id?: string
          created_at?: string
          edition_id?: string
          id?: string
          points?: number
          show_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "televote_votes_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "televote_votes_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "televote_votes_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
        ]
      }
      themes: {
        Row: {
          config: Json
          created_at: string
          description: string | null
          id: string
          is_public: boolean
          name: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      voters: {
        Row: {
          accent_color: string
          country_id: string | null
          created_at: string
          edition_id: string
          flag_image: string | null
          id: string
          kind: string
          name: string
          show_id: string | null
          sort_order: number
        }
        Insert: {
          accent_color?: string
          country_id?: string | null
          created_at?: string
          edition_id: string
          flag_image?: string | null
          id?: string
          kind?: string
          name: string
          show_id?: string | null
          sort_order?: number
        }
        Update: {
          accent_color?: string
          country_id?: string | null
          created_at?: string
          edition_id?: string
          flag_image?: string | null
          id?: string
          kind?: string
          name?: string
          show_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "voters_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voters_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voters_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      voting_history: {
        Row: {
          edition_id: string | null
          edition_name: string | null
          points: number | null
          receiving_country_id: string | null
          source: string | null
          voter_country_id: string | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "jury_votes_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jury_votes_receiving_country_id_fkey"
            columns: ["receiving_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jury_votes_voter_country_id_fkey"
            columns: ["voter_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      organizer_exists: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "organizer" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["organizer", "viewer"],
    },
  },
} as const
