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
      body_measurements: {
        Row: {
          body_fat_pct: number | null
          created_at: string
          id: string
          measured_on: string
          muscle_pct: number | null
          notes: string | null
          user_id: string
          water_pct: number | null
          weight_kg: number | null
        }
        Insert: {
          body_fat_pct?: number | null
          created_at?: string
          id?: string
          measured_on: string
          muscle_pct?: number | null
          notes?: string | null
          user_id: string
          water_pct?: number | null
          weight_kg?: number | null
        }
        Update: {
          body_fat_pct?: number | null
          created_at?: string
          id?: string
          measured_on?: string
          muscle_pct?: number | null
          notes?: string | null
          user_id?: string
          water_pct?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "body_measurements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      // U-1 sub-macros interim hand-edit (until R-04 generated-types regen):
      // sugar/saturated-fat known-sum grams + per-field completeness booleans —
      // see supabase/migrations/20260525120000_u1_sub_macros.sql.
      daily_nutrition_history: {
        Row: {
          computed_at: string
          consumed_carbs_g: number | null
          consumed_fat_g: number | null
          consumed_fiber_g: number | null
          consumed_kcal: number | null
          consumed_protein_g: number | null
          consumed_saturated_fat_complete: boolean
          consumed_saturated_fat_g: number | null
          consumed_sugar_complete: boolean
          consumed_sugar_g: number | null
          had_active_plan: boolean
          logged_on: string
          planned_carbs_g: number | null
          planned_fat_g: number | null
          planned_fiber_g: number | null
          planned_kcal: number | null
          planned_protein_g: number | null
          planned_saturated_fat_complete: boolean
          planned_saturated_fat_g: number | null
          planned_sugar_complete: boolean
          planned_sugar_g: number | null
          user_id: string
        }
        Insert: {
          computed_at?: string
          consumed_carbs_g?: number | null
          consumed_fat_g?: number | null
          consumed_fiber_g?: number | null
          consumed_kcal?: number | null
          consumed_protein_g?: number | null
          consumed_saturated_fat_complete?: boolean
          consumed_saturated_fat_g?: number | null
          consumed_sugar_complete?: boolean
          consumed_sugar_g?: number | null
          had_active_plan?: boolean
          logged_on: string
          planned_carbs_g?: number | null
          planned_fat_g?: number | null
          planned_fiber_g?: number | null
          planned_kcal?: number | null
          planned_protein_g?: number | null
          planned_saturated_fat_complete?: boolean
          planned_saturated_fat_g?: number | null
          planned_sugar_complete?: boolean
          planned_sugar_g?: number | null
          user_id: string
        }
        Update: {
          computed_at?: string
          consumed_carbs_g?: number | null
          consumed_fat_g?: number | null
          consumed_fiber_g?: number | null
          consumed_kcal?: number | null
          consumed_protein_g?: number | null
          consumed_saturated_fat_complete?: boolean
          consumed_saturated_fat_g?: number | null
          consumed_sugar_complete?: boolean
          consumed_sugar_g?: number | null
          had_active_plan?: boolean
          logged_on?: string
          planned_carbs_g?: number | null
          planned_fat_g?: number | null
          planned_fiber_g?: number | null
          planned_kcal?: number | null
          planned_protein_g?: number | null
          planned_saturated_fat_complete?: boolean
          planned_saturated_fat_g?: number | null
          planned_sugar_complete?: boolean
          planned_sugar_g?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_nutrition_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      // Training MVP hand-edit (interim until R-04 generated-types regen):
      // exercises pool — see supabase/migrations/20260522120000_training_exercises.sql
      // for the source of truth (post-R-01 shape, bilingual names,
      // expanded equipment vocab, per-exercise default_increment_kg).
      exercises: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          default_increment_kg: number | null
          equipment: string | null
          id: string
          is_verified: boolean
          name_en: string | null
          name_es: string
          primary_muscle: string | null
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          default_increment_kg?: number | null
          equipment?: string | null
          id?: string
          is_verified?: boolean
          name_en?: string | null
          name_es: string
          primary_muscle?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          default_increment_kg?: number | null
          equipment?: string | null
          id?: string
          is_verified?: boolean
          name_en?: string | null
          name_es?: string
          primary_muscle?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          notes: string | null
          target_body_fat_pct: number
          updated_at: string
          user_id: string
        }
        Insert: {
          notes?: string | null
          target_body_fat_pct?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          notes?: string | null
          target_body_fat_pct?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      // U-1 sub-macros interim hand-edit (until R-04 regen): optional sugar +
      // saturated fat per unit (nullable; NULL = unknown).
      ingredients: {
        Row: {
          brand: string | null
          carbs_g_per_unit: number
          created_at: string
          created_by_user_id: string | null
          external_id: string | null
          fat_g_per_unit: number
          fiber_g_per_unit: number
          id: string
          is_verified: boolean
          kcal_per_unit: number
          name: string
          name_en: string | null
          protein_g_per_unit: number
          saturated_fat_g_per_unit: number | null
          source: string
          sugar_g_per_unit: number | null
          unit_type: string
          updated_at: string
        }
        Insert: {
          brand?: string | null
          carbs_g_per_unit: number
          created_at?: string
          created_by_user_id?: string | null
          external_id?: string | null
          fat_g_per_unit: number
          fiber_g_per_unit?: number
          id?: string
          is_verified?: boolean
          kcal_per_unit: number
          name: string
          name_en?: string | null
          protein_g_per_unit: number
          saturated_fat_g_per_unit?: number | null
          source?: string
          sugar_g_per_unit?: number | null
          unit_type?: string
          updated_at?: string
        }
        Update: {
          brand?: string | null
          carbs_g_per_unit?: number
          created_at?: string
          created_by_user_id?: string | null
          external_id?: string | null
          fat_g_per_unit?: number
          fiber_g_per_unit?: number
          id?: string
          is_verified?: boolean
          kcal_per_unit?: number
          name?: string
          name_en?: string | null
          protein_g_per_unit?: number
          saturated_fat_g_per_unit?: number | null
          source?: string
          sugar_g_per_unit?: number | null
          unit_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_logs: {
        Row: {
          created_at: string
          custom_carbs_g: number | null
          custom_fat_g: number | null
          custom_fiber_g: number | null
          custom_kcal: number | null
          custom_name: string | null
          custom_protein_g: number | null
          custom_saturated_fat_g: number | null
          custom_sugar_g: number | null
          from_plan: boolean
          id: string
          ingredient_id: string | null
          logged_on: string
          meal_type: string | null
          notes: string | null
          plan_week_slot_id: string | null
          quantity: number | null
          recipe_id: string | null
          servings: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_carbs_g?: number | null
          custom_fat_g?: number | null
          custom_fiber_g?: number | null
          custom_kcal?: number | null
          custom_name?: string | null
          custom_protein_g?: number | null
          custom_saturated_fat_g?: number | null
          custom_sugar_g?: number | null
          from_plan?: boolean
          id?: string
          ingredient_id?: string | null
          logged_on: string
          meal_type?: string | null
          notes?: string | null
          plan_week_slot_id?: string | null
          quantity?: number | null
          recipe_id?: string | null
          servings?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          custom_carbs_g?: number | null
          custom_fat_g?: number | null
          custom_fiber_g?: number | null
          custom_kcal?: number | null
          custom_name?: string | null
          custom_protein_g?: number | null
          custom_saturated_fat_g?: number | null
          custom_sugar_g?: number | null
          from_plan?: boolean
          id?: string
          ingredient_id?: string | null
          logged_on?: string
          meal_type?: string | null
          notes?: string | null
          plan_week_slot_id?: string | null
          quantity?: number | null
          recipe_id?: string | null
          servings?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_logs_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_logs_plan_week_slot_id_fkey"
            columns: ["plan_week_slot_id"]
            isOneToOne: false
            referencedRelation: "meal_plan_week_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_logs_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_template_day_times: {
        Row: {
          day_of_week: number
          id: string
          meal_times: string[]
          template_id: string
        }
        Insert: {
          day_of_week: number
          id?: string
          meal_times: string[]
          template_id: string
        }
        Update: {
          day_of_week?: number
          id?: string
          meal_times?: string[]
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_template_day_times_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "meal_plan_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_template_slots: {
        Row: {
          created_at: string
          day_of_week: number
          display_order: number
          id: string
          meal_index: number
          recipe_id: string
          servings: number
          template_id: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          display_order?: number
          id?: string
          meal_index: number
          recipe_id: string
          servings?: number
          template_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          display_order?: number
          id?: string
          meal_index?: number
          recipe_id?: string
          servings?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_template_slots_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_template_slots_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "meal_plan_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_templates: {
        Row: {
          created_at: string
          default_meal_times: string[]
          id: string
          is_auto_generated: boolean
          name: string
          notes: string | null
          same_schedule_all_days: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_meal_times?: string[]
          id?: string
          is_auto_generated?: boolean
          name: string
          notes?: string | null
          same_schedule_all_days?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_meal_times?: string[]
          id?: string
          is_auto_generated?: boolean
          name?: string
          notes?: string | null
          same_schedule_all_days?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_week_slots: {
        Row: {
          created_at: string
          date: string
          display_order: number
          id: string
          meal_index: number
          meal_time: string | null
          plan_week_id: string
          recipe_id: string
          servings: number
        }
        Insert: {
          created_at?: string
          date: string
          display_order?: number
          id?: string
          meal_index: number
          meal_time?: string | null
          plan_week_id: string
          recipe_id: string
          servings?: number
        }
        Update: {
          created_at?: string
          date?: string
          display_order?: number
          id?: string
          meal_index?: number
          meal_time?: string | null
          plan_week_id?: string
          recipe_id?: string
          servings?: number
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_week_slots_plan_week_id_fkey"
            columns: ["plan_week_id"]
            isOneToOne: false
            referencedRelation: "meal_plan_weeks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_week_slots_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_weeks: {
        Row: {
          created_at: string
          has_diverged: boolean
          id: string
          source_template_id: string | null
          updated_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          has_diverged?: boolean
          id?: string
          source_template_id?: string | null
          updated_at?: string
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          has_diverged?: boolean
          id?: string
          source_template_id?: string | null
          updated_at?: string
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_weeks_source_template_id_fkey"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "meal_plan_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_weeks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      phases: {
        Row: {
          created_at: string
          end_date: string | null
          fat_pct_of_kcal: number
          fiber_mode: string
          fiber_value: number
          id: string
          kcal_mode: string
          kcal_value: number
          name: string
          notes: string | null
          phase_type: string
          protein_g_per_kg: number
          start_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          fat_pct_of_kcal?: number
          fiber_mode?: string
          fiber_value?: number
          id?: string
          kcal_mode: string
          kcal_value: number
          name: string
          notes?: string | null
          phase_type: string
          protein_g_per_kg?: number
          start_date: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          fat_pct_of_kcal?: number
          fiber_mode?: string
          fiber_value?: number
          id?: string
          kcal_mode?: string
          kcal_value?: number
          name?: string
          notes?: string | null
          phase_type?: string
          protein_g_per_kg?: number
          start_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          birth_date: string | null
          created_at: string
          display_name: string | null
          height_cm: number | null
          id: string
          initial_weight_kg: number | null
          language: string
          sex: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          display_name?: string | null
          height_cm?: number | null
          id: string
          initial_weight_kg?: number | null
          language?: string
          sex?: string | null
          start_date?: string
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          display_name?: string | null
          height_cm?: number | null
          id?: string
          initial_weight_kg?: number | null
          language?: string
          sex?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      recipe_ingredients: {
        Row: {
          created_at: string
          display_order: number
          id: string
          ingredient_id: string
          per_serving: boolean
          quantity: number
          recipe_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          ingredient_id: string
          per_serving?: boolean
          quantity: number
          recipe_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          ingredient_id?: string
          per_serving?: boolean
          quantity?: number
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        // R-01 hand-edit (interim until R-04 regen): `deleted_at` removed
        // (staged migration 20260520120030); `user_id` → `created_by_user_id`
        // (same migration; semantic shift from per-user FK to the
        // three-state pool-owner pointer matching `ingredients`).
        // U-2 interim hand-edit (until R-04 regen): + meal_types text[]
        // (migration 20260526120000).
        Row: {
          created_at: string
          created_by_user_id: string | null
          description: string | null
          id: string
          instructions: string | null
          meal_types: string[]
          name: string
          photo_url: string | null
          servings: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          id?: string
          instructions?: string | null
          meal_types?: string[]
          name: string
          photo_url?: string | null
          servings?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          id?: string
          instructions?: string | null
          meal_types?: string[]
          name?: string
          photo_url?: string | null
          servings?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      // R-01 hand-edit (interim until R-04 regen): two new ref tables that
      // carry the per-user "I have this in my library" relationship + the
      // private `note` PII firewall (spec §2/§3, staged migration
      // 20260520120010).
      user_ingredient_refs: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          note: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          note?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          note?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_ingredient_refs_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_ingredient_refs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_recipe_refs: {
        Row: {
          created_at: string
          id: string
          note: string | null
          recipe_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          recipe_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          recipe_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_recipe_refs_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_recipe_refs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tdee_estimates: {
        Row: {
          avg_kcal_intake: number
          computed_on: string
          confidence: string | null
          created_at: string
          estimated_tdee_kcal: number
          id: string
          is_warmup: boolean
          user_id: string
          weight_delta_kg: number
          window_days: number
        }
        Insert: {
          avg_kcal_intake: number
          computed_on: string
          confidence?: string | null
          created_at?: string
          estimated_tdee_kcal: number
          id?: string
          is_warmup?: boolean
          user_id: string
          weight_delta_kg: number
          window_days: number
        }
        Update: {
          avg_kcal_intake?: number
          computed_on?: string
          confidence?: string | null
          created_at?: string
          estimated_tdee_kcal?: number
          id?: string
          is_warmup?: boolean
          user_id?: string
          weight_delta_kg?: number
          window_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "tdee_estimates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tdee_state: {
        Row: {
          cov_ee: number
          cov_we: number
          cov_ww: number
          created_at: string
          expenditure_kcal: number
          last_updated_on: string
          observations_count: number
          trend_weight_kg: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cov_ee: number
          cov_we: number
          cov_ww: number
          created_at?: string
          expenditure_kcal: number
          last_updated_on: string
          observations_count?: number
          trend_weight_kg: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cov_ee?: number
          cov_we?: number
          cov_ww?: number
          created_at?: string
          expenditure_kcal?: number
          last_updated_on?: string
          observations_count?: number
          trend_weight_kg?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tdee_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      // Training MVP hand-edit (interim until R-04 generated-types regen):
      // workout_sessions + workout_sets — see
      // supabase/migrations/20260522120010_training_sessions_sets.sql
      // for the source of truth (RLS-via-join on workout_sets per §0.5).
      workout_sessions: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          performed_on: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          performed_on?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          performed_on?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workout_sets: {
        Row: {
          created_at: string
          exercise_id: string
          id: string
          is_warmup: boolean
          reps: number
          rpe: number | null
          session_id: string
          set_index: number
          weight_kg: number
        }
        Insert: {
          created_at?: string
          exercise_id: string
          id?: string
          is_warmup?: boolean
          reps: number
          rpe?: number | null
          session_id: string
          set_index: number
          weight_kg: number
        }
        Update: {
          created_at?: string
          exercise_id?: string
          id?: string
          is_warmup?: boolean
          reps?: number
          rpe?: number | null
          session_id?: string
          set_index?: number
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "workout_sets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sets_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      body_measurements_smoothed: {
        Row: {
          body_fat_pct: number | null
          created_at: string | null
          id: string | null
          measured_on: string | null
          muscle_pct: number | null
          notes: string | null
          user_id: string | null
          water_pct: number | null
          weight_kg: number | null
          weight_kg_5day_avg: number | null
        }
        Relationships: [
          {
            foreignKeyName: "body_measurements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    // Post-generation correction: `supabase gen types` cannot infer
    // nullability of SQL function parameters (Postgres carries no NULL flag
    // on function args), so it emits every text arg as non-null `string`.
    // The marked args below are nullable BY DESIGN (a null p_recipe_id /
    // p_template_id means "create new"); restored to `string | null` so call
    // sites stay honest instead of casting NULL to ''. Re-apply after any
    // regen — see docs/conventions.md (generated-types caveats).
    Functions: {
      apply_template_to_week: {
        Args: { p_target_date: string; p_template_id: string }
        Returns: string
      }
      apply_template_to_week_admin: {
        Args: {
          p_target_date: string
          p_template_id: string
          p_user_id: string
        }
        Returns: string
      }
      // R-01 hand-edit (staged migration 20260520120040): "Remove from my
      // library" surface; same RPC serves "creator-hide" (owner-transfer
      // to anon happens) and "drop my ref" (UPDATE no-ops, only ref
      // deleted). See spec §6 + the hide RPC SQL for the full semantics.
      hide_owned_ingredient: {
        Args: { p_ingredient_id: string }
        Returns: undefined
      }
      hide_owned_recipe: {
        Args: { p_recipe_id: string }
        Returns: undefined
      }
      materialize_plan_for_date: {
        Args: { p_date: string; p_user_id: string }
        Returns: number
      }
      save_recipe: {
        // U-2 interim hand-edit (until R-04 regen): + p_meal_types (defaulted,
        // so optional) — see migration 20260526120000_u2_recipe_meal_types.sql.
        Args: {
          p_description: string | null
          p_ingredients: Json
          p_instructions: string | null
          p_meal_types?: string[]
          p_name: string
          p_recipe_id: string | null
          p_servings: number
        }
        Returns: string
      }
      save_template: {
        Args: {
          p_day_times?: Json
          p_default_meal_times: string[]
          p_name: string
          p_same_schedule_all_days: boolean
          p_slots: Json
          p_template_id: string | null
        }
        Returns: string
      }
      save_week_as_template: {
        Args: { p_name: string; p_week_id: string }
        Returns: string
      }
      // Training MVP hand-edit (interim until R-04 generated-types regen):
      // save_workout — see supabase/migrations/20260522120020_training_save_workout_rpc.sql
      // (INVOKER, replace-children, mirrors save_recipe shape).
      save_workout: {
        Args: {
          p_notes: string | null
          p_performed_on: string | null
          p_session_id: string | null
          p_sets: Json
          p_title: string | null
        }
        Returns: string
      }
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
    Enums: {},
  },
} as const
