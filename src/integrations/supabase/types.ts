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
      app_secrets: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      countries: {
        Row: {
          code: string
          name: string | null
          updated_at: string
        }
        Insert: {
          code: string
          name?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          event_code: string
          gender: string | null
          name: string | null
          sport_code: string
          updated_at: string
        }
        Insert: {
          event_code: string
          gender?: string | null
          name?: string | null
          sport_code: string
          updated_at?: string
        }
        Update: {
          event_code?: string
          gender?: string | null
          name?: string | null
          sport_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      fetch_log: {
        Row: {
          errors: Json | null
          feed_calls: number
          finished_at: string | null
          id: number
          india_items: number
          items_seen: number
          mode: string | null
          ok: boolean | null
          params: Json | null
          rows_changed: number
          started_at: string
        }
        Insert: {
          errors?: Json | null
          feed_calls?: number
          finished_at?: string | null
          id?: number
          india_items?: number
          items_seen?: number
          mode?: string | null
          ok?: boolean | null
          params?: Json | null
          rows_changed?: number
          started_at?: string
        }
        Update: {
          errors?: Json | null
          feed_calls?: number
          finished_at?: string | null
          id?: number
          india_items?: number
          items_seen?: number
          mode?: string | null
          ok?: boolean | null
          params?: Json | null
          rows_changed?: number
          started_at?: string
        }
        Relationships: []
      }
      india_entries: {
        Row: {
          event_code: string
          event_name: string | null
          gender: string | null
          is_member: boolean
          name: string | null
          reg: string
          spoken_name: string | null
          sport_code: string
          sport_name: string | null
          type: string | null
          updated_at: string
        }
        Insert: {
          event_code: string
          event_name?: string | null
          gender?: string | null
          is_member?: boolean
          name?: string | null
          reg: string
          spoken_name?: string | null
          sport_code: string
          sport_name?: string | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          event_code?: string
          event_name?: string | null
          gender?: string | null
          is_member?: boolean
          name?: string | null
          reg?: string
          spoken_name?: string | null
          sport_code?: string
          sport_name?: string | null
          type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      india_medals: {
        Row: {
          athlete_or_team: string | null
          competitor_key: string
          created_at: string
          date_ist: string | null
          event_code: string
          event_name: string | null
          gender: string | null
          medal: string | null
          members: Json | null
          members_spoken: string | null
          reg: string | null
          res_code: string | null
          spoken_name: string | null
          spoken_summary_en: string | null
          sport_code: string
          sport_name: string | null
          updated_at: string | null
          won_at: string | null
        }
        Insert: {
          athlete_or_team?: string | null
          competitor_key: string
          created_at?: string
          date_ist?: string | null
          event_code: string
          event_name?: string | null
          gender?: string | null
          medal?: string | null
          members?: Json | null
          members_spoken?: string | null
          reg?: string | null
          res_code?: string | null
          spoken_name?: string | null
          spoken_summary_en?: string | null
          sport_code: string
          sport_name?: string | null
          updated_at?: string | null
          won_at?: string | null
        }
        Update: {
          athlete_or_team?: string | null
          competitor_key?: string
          created_at?: string
          date_ist?: string | null
          event_code?: string
          event_name?: string | null
          gender?: string | null
          medal?: string | null
          members?: Json | null
          members_spoken?: string | null
          reg?: string | null
          res_code?: string | null
          spoken_name?: string | null
          spoken_summary_en?: string | null
          sport_code?: string
          sport_name?: string | null
          updated_at?: string | null
          won_at?: string | null
        }
        Relationships: []
      }
      india_results: {
        Row: {
          athlete_or_team: string | null
          competitor_key: string
          india_score: string | null
          irm: string | null
          is_team: boolean
          medal: string | null
          medal_raw: string | null
          opponent_code: string | null
          opponent_country_code: string | null
          opponent_country_name: string | null
          opponent_name: string | null
          opponent_score: string | null
          outcome: string | null
          periods: Json | null
          qualified: string | null
          rank: string | null
          res_code: string
          result_mark: string | null
          spoken_name: string | null
          spoken_summary_en: string | null
          sport_code: string
          start_time: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          athlete_or_team?: string | null
          competitor_key: string
          india_score?: string | null
          irm?: string | null
          is_team?: boolean
          medal?: string | null
          medal_raw?: string | null
          opponent_code?: string | null
          opponent_country_code?: string | null
          opponent_country_name?: string | null
          opponent_name?: string | null
          opponent_score?: string | null
          outcome?: string | null
          periods?: Json | null
          qualified?: string | null
          rank?: string | null
          res_code: string
          result_mark?: string | null
          spoken_name?: string | null
          spoken_summary_en?: string | null
          sport_code: string
          start_time?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          athlete_or_team?: string | null
          competitor_key?: string
          india_score?: string | null
          irm?: string | null
          is_team?: boolean
          medal?: string | null
          medal_raw?: string | null
          opponent_code?: string | null
          opponent_country_code?: string | null
          opponent_country_name?: string | null
          opponent_name?: string | null
          opponent_score?: string | null
          outcome?: string | null
          periods?: Json | null
          qualified?: string | null
          rank?: string | null
          res_code?: string
          result_mark?: string | null
          spoken_name?: string | null
          spoken_summary_en?: string | null
          sport_code?: string
          start_time?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      medal_standings: {
        Row: {
          bronze: number
          gold: number
          org_code: string
          org_name: string | null
          rank: string | null
          silver: number
          total: number
          updated_at: string
        }
        Insert: {
          bronze?: number
          gold?: number
          org_code: string
          org_name?: string | null
          rank?: string | null
          silver?: number
          total?: number
          updated_at?: string
        }
        Update: {
          bronze?: number
          gold?: number
          org_code?: string
          org_name?: string | null
          rank?: string | null
          silver?: number
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      schedule_items: {
        Row: {
          away: Json | null
          date_ist: string | null
          date_jst: string | null
          event_code: string | null
          event_name: string | null
          first_seen_at: string
          has_india: boolean
          home: Json | null
          india_entered: boolean
          india_result_fetched_at: string | null
          is_h2h: boolean
          is_live: boolean
          location_name: string | null
          medal_flag: string | null
          orgs: string[]
          phase_code: string | null
          phase_name: string | null
          raw: Json | null
          res_code: string
          short_id: number
          sport_code: string
          start_ist: string | null
          start_jst: string | null
          start_time: string | null
          status: string | null
          status_desc: string | null
          unit_name: string | null
          unit_name_short: string | null
          unit_num: string | null
          updated_at: string
          venue_code: string | null
          venue_name: string | null
        }
        Insert: {
          away?: Json | null
          date_ist?: string | null
          date_jst?: string | null
          event_code?: string | null
          event_name?: string | null
          first_seen_at?: string
          has_india?: boolean
          home?: Json | null
          india_entered?: boolean
          india_result_fetched_at?: string | null
          is_h2h?: boolean
          is_live?: boolean
          location_name?: string | null
          medal_flag?: string | null
          orgs?: string[]
          phase_code?: string | null
          phase_name?: string | null
          raw?: Json | null
          res_code: string
          short_id?: number
          sport_code: string
          start_ist?: string | null
          start_jst?: string | null
          start_time?: string | null
          status?: string | null
          status_desc?: string | null
          unit_name?: string | null
          unit_name_short?: string | null
          unit_num?: string | null
          updated_at?: string
          venue_code?: string | null
          venue_name?: string | null
        }
        Update: {
          away?: Json | null
          date_ist?: string | null
          date_jst?: string | null
          event_code?: string | null
          event_name?: string | null
          first_seen_at?: string
          has_india?: boolean
          home?: Json | null
          india_entered?: boolean
          india_result_fetched_at?: string | null
          is_h2h?: boolean
          is_live?: boolean
          location_name?: string | null
          medal_flag?: string | null
          orgs?: string[]
          phase_code?: string | null
          phase_name?: string | null
          raw?: Json | null
          res_code?: string
          short_id?: number
          sport_code?: string
          start_ist?: string | null
          start_jst?: string | null
          start_time?: string | null
          status?: string | null
          status_desc?: string | null
          unit_name?: string | null
          unit_name_short?: string | null
          unit_num?: string | null
          updated_at?: string
          venue_code?: string | null
          venue_name?: string | null
        }
        Relationships: []
      }
      sports: {
        Row: {
          code: string
          name: string | null
          updated_at: string
        }
        Insert: {
          code: string
          name?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      clear_ingest_schedule: { Args: never; Returns: undefined }
      refresh_india_entered: { Args: never; Returns: undefined }
      setup_ingest_schedule: { Args: { base_url: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
