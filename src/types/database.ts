export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      body_measurements: {
        Row: {
          body_fat_pct: number | null;
          created_at: string;
          id: string;
          measured_on: string;
          muscle_pct: number | null;
          notes: string | null;
          user_id: string;
          water_pct: number | null;
          weight_kg: number | null;
        };
        Insert: {
          body_fat_pct?: number | null;
          created_at?: string;
          id?: string;
          measured_on: string;
          muscle_pct?: number | null;
          notes?: string | null;
          user_id: string;
          water_pct?: number | null;
          weight_kg?: number | null;
        };
        Update: {
          body_fat_pct?: number | null;
          created_at?: string;
          id?: string;
          measured_on?: string;
          muscle_pct?: number | null;
          notes?: string | null;
          user_id?: string;
          water_pct?: number | null;
          weight_kg?: number | null;
        };
        Relationships: [];
      };
      daily_nutrition_history: {
        Row: {
          computed_at: string;
          consumed_carbs_g: number | null;
          consumed_fat_g: number | null;
          consumed_fiber_g: number | null;
          consumed_kcal: number | null;
          consumed_protein_g: number | null;
          had_active_plan: boolean;
          logged_on: string;
          planned_carbs_g: number | null;
          planned_fat_g: number | null;
          planned_fiber_g: number | null;
          planned_kcal: number | null;
          planned_protein_g: number | null;
          user_id: string;
        };
        Insert: {
          computed_at?: string;
          consumed_carbs_g?: number | null;
          consumed_fat_g?: number | null;
          consumed_fiber_g?: number | null;
          consumed_kcal?: number | null;
          consumed_protein_g?: number | null;
          had_active_plan?: boolean;
          logged_on: string;
          planned_carbs_g?: number | null;
          planned_fat_g?: number | null;
          planned_fiber_g?: number | null;
          planned_kcal?: number | null;
          planned_protein_g?: number | null;
          user_id: string;
        };
        Update: {
          computed_at?: string;
          consumed_carbs_g?: number | null;
          consumed_fat_g?: number | null;
          consumed_fiber_g?: number | null;
          consumed_kcal?: number | null;
          consumed_protein_g?: number | null;
          had_active_plan?: boolean;
          logged_on?: string;
          planned_carbs_g?: number | null;
          planned_fat_g?: number | null;
          planned_fiber_g?: number | null;
          planned_kcal?: number | null;
          planned_protein_g?: number | null;
          user_id?: string;
        };
        Relationships: [];
      };
      goals: {
        Row: {
          notes: string | null;
          target_body_fat_pct: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          notes?: string | null;
          target_body_fat_pct?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          notes?: string | null;
          target_body_fat_pct?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      ingredients: {
        Row: {
          brand: string | null;
          carbs_g_per_unit: number;
          created_at: string;
          created_by_user_id: string | null;
          external_id: string | null;
          fat_g_per_unit: number;
          fiber_g_per_unit: number;
          id: string;
          is_verified: boolean;
          kcal_per_unit: number;
          name: string;
          protein_g_per_unit: number;
          source: string;
          unit_type: string;
          updated_at: string;
        };
        Insert: {
          brand?: string | null;
          carbs_g_per_unit: number;
          created_at?: string;
          created_by_user_id?: string | null;
          external_id?: string | null;
          fat_g_per_unit: number;
          fiber_g_per_unit?: number;
          id?: string;
          is_verified?: boolean;
          kcal_per_unit: number;
          name: string;
          protein_g_per_unit: number;
          source?: string;
          unit_type?: string;
          updated_at?: string;
        };
        Update: {
          brand?: string | null;
          carbs_g_per_unit?: number;
          created_at?: string;
          created_by_user_id?: string | null;
          external_id?: string | null;
          fat_g_per_unit?: number;
          fiber_g_per_unit?: number;
          id?: string;
          is_verified?: boolean;
          kcal_per_unit?: number;
          name?: string;
          protein_g_per_unit?: number;
          source?: string;
          unit_type?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      meal_logs: {
        Row: {
          created_at: string;
          custom_carbs_g: number | null;
          custom_fat_g: number | null;
          custom_fiber_g: number | null;
          custom_kcal: number | null;
          custom_name: string | null;
          custom_protein_g: number | null;
          from_plan: boolean;
          id: string;
          ingredient_id: string | null;
          logged_on: string;
          meal_type: string | null;
          notes: string | null;
          plan_week_slot_id: string | null;
          quantity: number | null;
          recipe_id: string | null;
          servings: number | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          custom_carbs_g?: number | null;
          custom_fat_g?: number | null;
          custom_fiber_g?: number | null;
          custom_kcal?: number | null;
          custom_name?: string | null;
          custom_protein_g?: number | null;
          from_plan?: boolean;
          id?: string;
          ingredient_id?: string | null;
          logged_on: string;
          meal_type?: string | null;
          notes?: string | null;
          plan_week_slot_id?: string | null;
          quantity?: number | null;
          recipe_id?: string | null;
          servings?: number | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          custom_carbs_g?: number | null;
          custom_fat_g?: number | null;
          custom_fiber_g?: number | null;
          custom_kcal?: number | null;
          custom_name?: string | null;
          custom_protein_g?: number | null;
          from_plan?: boolean;
          id?: string;
          ingredient_id?: string | null;
          logged_on?: string;
          meal_type?: string | null;
          notes?: string | null;
          plan_week_slot_id?: string | null;
          quantity?: number | null;
          recipe_id?: string | null;
          servings?: number | null;
          user_id?: string;
        };
        Relationships: [];
      };
      meal_plan_template_day_times: {
        Row: {
          day_of_week: number;
          id: string;
          meal_times: string[];
          template_id: string;
        };
        Insert: {
          day_of_week: number;
          id?: string;
          meal_times: string[];
          template_id: string;
        };
        Update: {
          day_of_week?: number;
          id?: string;
          meal_times?: string[];
          template_id?: string;
        };
        Relationships: [];
      };
      meal_plan_template_slots: {
        Row: {
          created_at: string;
          day_of_week: number;
          display_order: number;
          id: string;
          meal_index: number;
          recipe_id: string;
          servings: number;
          template_id: string;
        };
        Insert: {
          created_at?: string;
          day_of_week: number;
          display_order?: number;
          id?: string;
          meal_index: number;
          recipe_id: string;
          servings?: number;
          template_id: string;
        };
        Update: {
          created_at?: string;
          day_of_week?: number;
          display_order?: number;
          id?: string;
          meal_index?: number;
          recipe_id?: string;
          servings?: number;
          template_id?: string;
        };
        Relationships: [];
      };
      meal_plan_templates: {
        Row: {
          created_at: string;
          default_meal_times: string[];
          id: string;
          is_auto_generated: boolean;
          name: string;
          notes: string | null;
          same_schedule_all_days: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          default_meal_times?: string[];
          id?: string;
          is_auto_generated?: boolean;
          name: string;
          notes?: string | null;
          same_schedule_all_days?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          default_meal_times?: string[];
          id?: string;
          is_auto_generated?: boolean;
          name?: string;
          notes?: string | null;
          same_schedule_all_days?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      meal_plan_week_slots: {
        Row: {
          created_at: string;
          date: string;
          display_order: number;
          id: string;
          meal_index: number;
          meal_time: string | null;
          plan_week_id: string;
          recipe_id: string;
          servings: number;
        };
        Insert: {
          created_at?: string;
          date: string;
          display_order?: number;
          id?: string;
          meal_index: number;
          meal_time?: string | null;
          plan_week_id: string;
          recipe_id: string;
          servings?: number;
        };
        Update: {
          created_at?: string;
          date?: string;
          display_order?: number;
          id?: string;
          meal_index?: number;
          meal_time?: string | null;
          plan_week_id?: string;
          recipe_id?: string;
          servings?: number;
        };
        Relationships: [];
      };
      meal_plan_weeks: {
        Row: {
          created_at: string;
          has_diverged: boolean;
          id: string;
          source_template_id: string | null;
          updated_at: string;
          user_id: string;
          week_start: string;
        };
        Insert: {
          created_at?: string;
          has_diverged?: boolean;
          id?: string;
          source_template_id?: string | null;
          updated_at?: string;
          user_id: string;
          week_start: string;
        };
        Update: {
          created_at?: string;
          has_diverged?: boolean;
          id?: string;
          source_template_id?: string | null;
          updated_at?: string;
          user_id?: string;
          week_start?: string;
        };
        Relationships: [];
      };
      phases: {
        Row: {
          created_at: string;
          end_date: string | null;
          fat_pct_of_kcal: number;
          fiber_mode: string;
          fiber_value: number;
          id: string;
          kcal_mode: string;
          kcal_value: number;
          name: string;
          notes: string | null;
          phase_type: string;
          protein_g_per_kg: number;
          start_date: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          end_date?: string | null;
          fat_pct_of_kcal?: number;
          fiber_mode?: string;
          fiber_value?: number;
          id?: string;
          kcal_mode: string;
          kcal_value: number;
          name: string;
          notes?: string | null;
          phase_type: string;
          protein_g_per_kg?: number;
          start_date: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          end_date?: string | null;
          fat_pct_of_kcal?: number;
          fiber_mode?: string;
          fiber_value?: number;
          id?: string;
          kcal_mode?: string;
          kcal_value?: number;
          name?: string;
          notes?: string | null;
          phase_type?: string;
          protein_g_per_kg?: number;
          start_date?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          birth_date: string | null;
          bone_kg: number | null;
          created_at: string;
          display_name: string | null;
          height_cm: number | null;
          id: string;
          initial_weight_kg: number | null;
          language: string;
          sex: string | null;
          start_date: string;
          units: string;
          updated_at: string;
        };
        Insert: {
          birth_date?: string | null;
          bone_kg?: number | null;
          created_at?: string;
          display_name?: string | null;
          height_cm?: number | null;
          id: string;
          initial_weight_kg?: number | null;
          language?: string;
          sex?: string | null;
          start_date?: string;
          units?: string;
          updated_at?: string;
        };
        Update: {
          birth_date?: string | null;
          bone_kg?: number | null;
          created_at?: string;
          display_name?: string | null;
          height_cm?: number | null;
          id?: string;
          initial_weight_kg?: number | null;
          language?: string;
          sex?: string | null;
          start_date?: string;
          units?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      recipe_ingredients: {
        Row: {
          created_at: string;
          display_order: number;
          id: string;
          ingredient_id: string;
          per_serving: boolean;
          quantity: number;
          recipe_id: string;
        };
        Insert: {
          created_at?: string;
          display_order?: number;
          id?: string;
          ingredient_id: string;
          per_serving?: boolean;
          quantity: number;
          recipe_id: string;
        };
        Update: {
          created_at?: string;
          display_order?: number;
          id?: string;
          ingredient_id?: string;
          per_serving?: boolean;
          quantity?: number;
          recipe_id?: string;
        };
        Relationships: [];
      };
      recipes: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          description: string | null;
          id: string;
          instructions: string | null;
          name: string;
          photo_url: string | null;
          servings: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          instructions?: string | null;
          name: string;
          photo_url?: string | null;
          servings?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          instructions?: string | null;
          name?: string;
          photo_url?: string | null;
          servings?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      tdee_estimates: {
        Row: {
          activity_kcal: number | null;
          avg_kcal_intake: number;
          bmr_kcal: number | null;
          computed_on: string;
          created_at: string;
          estimated_tdee_kcal: number;
          id: string;
          neat_residual_kcal: number | null;
          user_id: string;
          weight_delta_kg: number;
          window_days: number;
          workout_kcal_logged: number | null;
        };
        Insert: {
          activity_kcal?: number | null;
          avg_kcal_intake: number;
          bmr_kcal?: number | null;
          computed_on: string;
          created_at?: string;
          estimated_tdee_kcal: number;
          id?: string;
          neat_residual_kcal?: number | null;
          user_id: string;
          weight_delta_kg: number;
          window_days: number;
          workout_kcal_logged?: number | null;
        };
        Update: {
          activity_kcal?: number | null;
          avg_kcal_intake?: number;
          bmr_kcal?: number | null;
          computed_on?: string;
          created_at?: string;
          estimated_tdee_kcal?: number;
          id?: string;
          neat_residual_kcal?: number | null;
          user_id?: string;
          weight_delta_kg?: number;
          window_days?: number;
          workout_kcal_logged?: number | null;
        };
        Relationships: [];
      };
    };
    Views: {
      body_measurements_smoothed: {
        Row: {
          body_fat_pct: number | null;
          created_at: string | null;
          id: string | null;
          measured_on: string | null;
          muscle_pct: number | null;
          notes: string | null;
          user_id: string | null;
          water_pct: number | null;
          weight_kg: number | null;
          weight_kg_5day_avg: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      save_recipe: {
        Args: {
          p_recipe_id: string | null;
          p_name: string;
          p_servings: number;
          p_description: string | null;
          p_instructions: string | null;
          p_ingredients: Json;
        };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type DefaultSchema = Database['public'];

export type Tables<
  Name extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views']),
> = (DefaultSchema['Tables'] & DefaultSchema['Views'])[Name] extends { Row: infer R } ? R : never;

export type TablesInsert<Name extends keyof DefaultSchema['Tables']> =
  DefaultSchema['Tables'][Name] extends { Insert: infer I } ? I : never;

export type TablesUpdate<Name extends keyof DefaultSchema['Tables']> =
  DefaultSchema['Tables'][Name] extends { Update: infer U } ? U : never;
