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
      group_join_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          group_id: string
          id: string
          invited_by: string | null
          invited_email: string | null
          invited_name: string | null
          note: string | null
          status: Database["public"]["Enums"]["join_request_status"]
          user_id: string | null
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          group_id: string
          id?: string
          invited_by?: string | null
          invited_email?: string | null
          invited_name?: string | null
          note?: string | null
          status?: Database["public"]["Enums"]["join_request_status"]
          user_id?: string | null
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          group_id?: string
          id?: string
          invited_by?: string | null
          invited_email?: string | null
          invited_name?: string | null
          note?: string | null
          status?: Database["public"]["Enums"]["join_request_status"]
          user_id?: string | null
        }
        Relationships: []
      }
      group_members: {
        Row: {
          group_id: string
          joined_at: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          group_id: string
          joined_at?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          group_id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          invite_code: string | null
          kicker: string | null
          name: string
          owner_id: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          invite_code?: string | null
          kicker?: string | null
          name: string
          owner_id: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          invite_code?: string | null
          kicker?: string | null
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      holes: {
        Row: {
          id: string
          number: number
          par: number
          stroke_index: number | null
          tee_time_id: string
          yards: number | null
        }
        Insert: {
          id?: string
          number: number
          par?: number
          stroke_index?: number | null
          tee_time_id: string
          yards?: number | null
        }
        Update: {
          id?: string
          number?: number
          par?: number
          stroke_index?: number | null
          tee_time_id?: string
          yards?: number | null
        }
        Relationships: []
      }
      message_mutes: {
        Row: {
          group_id: string
          muted_at: string
          user_id: string
        }
        Insert: {
          group_id: string
          muted_at?: string
          user_id: string
        }
        Update: {
          group_id?: string
          muted_at?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          created_at: string
          group_id: string
          id: string
          kind: string
          reactions: Json
          reply_to: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          group_id: string
          id?: string
          kind?: string
          reactions?: Json
          reply_to?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          group_id?: string
          id?: string
          kind?: string
          reactions?: Json
          reply_to?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          handicap: number | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          handicap?: number | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          handicap?: number | null
          id?: string
        }
        Relationships: []
      }
      round_results: {
        Row: {
          created_at: string
          game_format: string
          gross: number | null
          id: string
          net: number | null
          points_awarded: number | null
          position: number | null
          published_at: string | null
          published_by: string | null
          stableford: number | null
          team_id: string | null
          tee_time_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          game_format: string
          gross?: number | null
          id?: string
          net?: number | null
          points_awarded?: number | null
          position?: number | null
          published_at?: string | null
          published_by?: string | null
          stableford?: number | null
          team_id?: string | null
          tee_time_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          game_format?: string
          gross?: number | null
          id?: string
          net?: number | null
          points_awarded?: number | null
          position?: number | null
          published_at?: string | null
          published_by?: string | null
          stableford?: number | null
          team_id?: string | null
          tee_time_id?: string
          user_id?: string
        }
        Relationships: []
      }
      rsvps: {
        Row: {
          status: Database["public"]["Enums"]["rsvp_status"]
          tee_time_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          status: Database["public"]["Enums"]["rsvp_status"]
          tee_time_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          status?: Database["public"]["Enums"]["rsvp_status"]
          tee_time_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rsvps_tee_time_id_fkey"
            columns: ["tee_time_id"]
            isOneToOne: false
            referencedRelation: "tee_times"
            referencedColumns: ["id"]
          },
        ]
      }
      scores: {
        Row: {
          hole: number
          id: string
          points: number | null
          strokes: number | null
          tee_time_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          hole: number
          id?: string
          points?: number | null
          strokes?: number | null
          tee_time_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          hole?: number
          id?: string
          points?: number | null
          strokes?: number | null
          tee_time_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      season_scores: {
        Row: {
          created_at: string
          gross_score: number | null
          group_id: string
          id: string
          points: number
          position: number | null
          season_year: number
          stableford_points: number | null
          tee_time_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          gross_score?: number | null
          group_id: string
          id?: string
          points?: number
          position?: number | null
          season_year: number
          stableford_points?: number | null
          tee_time_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          gross_score?: number | null
          group_id?: string
          id?: string
          points?: number
          position?: number | null
          season_year?: number
          stableford_points?: number | null
          tee_time_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "season_scores_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_scores_tee_time_id_fkey"
            columns: ["tee_time_id"]
            isOneToOne: false
            referencedRelation: "tee_times"
            referencedColumns: ["id"]
          },
        ]
      }
      tee_time_grouping_players: {
        Row: {
          grouping_id: string
          position: number
          user_id: string
        }
        Insert: {
          grouping_id: string
          position?: number
          user_id: string
        }
        Update: {
          grouping_id?: string
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tee_time_grouping_players_grouping_id_fkey"
            columns: ["grouping_id"]
            isOneToOne: false
            referencedRelation: "tee_time_groupings"
            referencedColumns: ["id"]
          },
        ]
      }
      tee_time_groupings: {
        Row: {
          created_at: string
          id: string
          label: string
          position: number
          tee_time_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          position?: number
          tee_time_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          position?: number
          tee_time_id?: string
        }
        Relationships: []
      }
      tee_times: {
        Row: {
          cost: number | null
          course_name: string
          created_at: string
          created_by: string
          dress_code: string | null
          format: Database["public"]["Enums"]["game_format"]
          group_id: string
          id: string
          last_reminded_at: string | null
          notes: string | null
          spots: number
          tee_at: string
        }
        Insert: {
          cost?: number | null
          course_name: string
          created_at?: string
          created_by: string
          dress_code?: string | null
          format?: Database["public"]["Enums"]["game_format"]
          group_id: string
          id?: string
          last_reminded_at?: string | null
          notes?: string | null
          spots?: number
          tee_at: string
        }
        Update: {
          cost?: number | null
          course_name?: string
          created_at?: string
          created_by?: string
          dress_code?: string | null
          format?: Database["public"]["Enums"]["game_format"]
          group_id?: string
          id?: string
          last_reminded_at?: string | null
          notes?: string | null
          spots?: number
          tee_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tee_times_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_members: {
        Row: {
          status: Database["public"]["Enums"]["rsvp_status"]
          trip_id: string
          user_id: string
        }
        Insert: {
          status?: Database["public"]["Enums"]["rsvp_status"]
          trip_id: string
          user_id: string
        }
        Update: {
          status?: Database["public"]["Enums"]["rsvp_status"]
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_members_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          cost: number | null
          cover_url: string | null
          created_at: string
          created_by: string
          destination: string
          end_date: string
          group_id: string
          id: string
          name: string
          notes: string | null
          start_date: string
        }
        Insert: {
          cost?: number | null
          cover_url?: string | null
          created_at?: string
          created_by: string
          destination: string
          end_date: string
          group_id: string
          id?: string
          name: string
          notes?: string | null
          start_date: string
        }
        Update: {
          cost?: number | null
          cover_url?: string | null
          created_at?: string
          created_by?: string
          destination?: string
          end_date?: string
          group_id?: string
          id?: string
          name?: string
          notes?: string | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_join_request: { Args: { _req_id: string }; Returns: undefined }
      create_group_safe: {
        Args: { _kicker?: string; _name: string }
        Returns: {
          id: string
          invite_code: string
        }[]
      }
      find_group_by_code: {
        Args: { _code: string }
        Returns: {
          cover_url: string
          id: string
          kicker: string
          name: string
        }[]
      }
      is_group_admin: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_group_staff: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      publish_round_results: {
        Args: { _tee_time_id: string }
        Returns: undefined
      }
      randomize_fourballs: {
        Args: { _group_size?: number; _tee_time_id: string }
        Returns: undefined
      }
      request_join_by_code: {
        Args: { _code: string; _note?: string }
        Returns: string
      }
      rotate_invite_code: { Args: { _group_id: string }; Returns: string }
      send_reminder: { Args: { _tee_time_id: string }; Returns: undefined }
      set_member_role: {
        Args: {
          _group_id: string
          _role: Database["public"]["Enums"]["member_role"]
          _user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      game_format:
        | "stableford"
        | "best_ball"
        | "four_ball_alliance"
        | "match_play"
        | "stroke_play"
        | "skins"
        | "custom"
      join_request_status: "pending" | "approved" | "declined"
      member_role: "admin" | "member" | "coadmin"
      rsvp_status: "in" | "out" | "maybe"
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
      game_format: [
        "stableford",
        "best_ball",
        "four_ball_alliance",
        "match_play",
        "stroke_play",
        "skins",
        "custom",
      ],
      join_request_status: ["pending", "approved", "declined"],
      member_role: ["admin", "member", "coadmin"],
      rsvp_status: ["in", "out", "maybe"],
    },
  },
} as const
