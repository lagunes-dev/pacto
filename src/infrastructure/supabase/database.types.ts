export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; display_name: string; timezone: string; created_at: string };
        Insert: { id: string; display_name: string; timezone?: string; created_at?: string };
        Update: { display_name?: string; timezone?: string };
        Relationships: [];
      };
      goals: {
        Row: { id: string; user_id: string; name: string; priority: number; active: boolean; created_at: string };
        Insert: { id?: string; user_id: string; name: string; priority?: number; active?: boolean; created_at?: string };
        Update: { name?: string; priority?: number; active?: boolean };
        Relationships: [];
      };
      daily_entries: {
        Row: { id: string; user_id: string; entry_date: string; craving_level: number | null; completed_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; entry_date: string; craving_level?: number | null; completed_at?: string | null };
        Update: { craving_level?: number | null; completed_at?: string | null; updated_at?: string };
        Relationships: [];
      };
      habit_entries: {
        Row: { id: string; daily_entry_id: string; goal_id: string; state: Database["public"]["Enums"]["habit_state"]; trigger: string | null; alternative_used: string | null; created_at: string };
        Insert: { id?: string; daily_entry_id: string; goal_id: string; state: Database["public"]["Enums"]["habit_state"]; trigger?: string | null };
        Update: { state?: Database["public"]["Enums"]["habit_state"]; trigger?: string | null };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      save_daily_checkin: {
        Args: { p_timezone: string; p_craving_level: number; p_habits: unknown };
        Returns: { id: string; entry_date: string; craving_level: number; completed_at: string; habits: unknown }[];
      };
    };
    Enums: { habit_state: "done" | "event" | "unset" };
    CompositeTypes: Record<string, never>;
  };
};
