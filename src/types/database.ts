export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      _r01_recipes_owner_backup: {
        Row: {
          deleted_at: string | null
          recipe_id: string
          user_id: string | null
        }
        Insert: {
          deleted_at?: string | null
          recipe_id: string
          user_id?: string | null
        }
        Update: {
          deleted_at?: string | null
          recipe_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
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
      exercises: {
        Row: {
          category: string | null
          created_at: string
          created_by_user_id: string | null
          default_increment_kg: number | null
          equipment: string | null
          external_id: string | null
          force: string | null
          id: string
          images: string[]
          instructions_en: string[]
          instructions_es: string[]
          is_verified: boolean
          level: string | null
          mechanic: string | null
          name_en: string | null
          name_es: string
          primary_muscles: string[]
          secondary_muscles: string[]
          source: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by_user_id?: string | null
          default_increment_kg?: number | null
          equipment?: string | null
          external_id?: string | null
          force?: string | null
          id?: string
          images?: string[]
          instructions_en?: string[]
          instructions_es?: string[]
          is_verified?: boolean
          level?: string | null
          mechanic?: string | null
          name_en?: string | null
          name_es: string
          primary_muscles?: string[]
          secondary_muscles?: string[]
          source?: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by_user_id?: string | null
          default_increment_kg?: number | null
          equipment?: string | null
          external_id?: string | null
          force?: string | null
          id?: string
          images?: string[]
          instructions_en?: string[]
          instructions_es?: string[]
          is_verified?: boolean
          level?: string | null
          mechanic?: string | null
          name_en?: string | null
          name_es?: string
          primary_muscles?: string[]
          secondary_muscles?: string[]
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
          salt_g_per_unit: number | null
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
          salt_g_per_unit?: number | null
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
          salt_g_per_unit?: number | null
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
          phase_type: string | null
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
          phase_type?: string | null
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
          phase_type?: string | null
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
      muscles: {
        Row: {
          body_region_slug: string | null
          code: string
          display_order: number
          is_full_body: boolean
          muscle_group: string
        }
        Insert: {
          body_region_slug?: string | null
          code: string
          display_order?: number
          is_full_body?: boolean
          muscle_group: string
        }
        Update: {
          body_region_slug?: string | null
          code?: string
          display_order?: number
          is_full_body?: boolean
          muscle_group?: string
        }
        Relationships: []
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
      program_days: {
        Row: {
          day_index: number
          id: string
          is_rest: boolean
          program_id: string
          routine_id: string | null
        }
        Insert: {
          day_index: number
          id?: string
          is_rest?: boolean
          program_id: string
          routine_id?: string | null
        }
        Update: {
          day_index?: number
          id?: string
          is_rest?: boolean
          program_id?: string
          routine_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "program_days_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_days_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          anchor_date: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          anchor_date?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          anchor_date?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id?: string
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
      recipe_steps: {
        Row: {
          created_at: string
          display_order: number
          id: string
          recipe_id: string
          text: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          recipe_id: string
          text: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          recipe_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_steps_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          created_at: string
          created_by_user_id: string
          description: string | null
          id: string
          meal_types: string[]
          name: string
          photo_url: string | null
          prep_time_minutes: number | null
          servings: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          description?: string | null
          id?: string
          meal_types?: string[]
          name: string
          photo_url?: string | null
          prep_time_minutes?: number | null
          servings?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          description?: string | null
          id?: string
          meal_types?: string[]
          name?: string
          photo_url?: string | null
          prep_time_minutes?: number | null
          servings?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_exercises: {
        Row: {
          exercise_id: string
          id: string
          position: number
          rest_seconds: number | null
          routine_id: string
          target_reps_max: number
          target_reps_min: number
          target_rpe: number | null
          target_sets: number
          warmup_sets: Json
        }
        Insert: {
          exercise_id: string
          id?: string
          position: number
          rest_seconds?: number | null
          routine_id: string
          target_reps_max: number
          target_reps_min: number
          target_rpe?: number | null
          target_sets: number
          warmup_sets?: Json
        }
        Update: {
          exercise_id?: string
          id?: string
          position?: number
          rest_seconds?: number | null
          routine_id?: string
          target_reps_max?: number
          target_reps_min?: number
          target_rpe?: number | null
          target_sets?: number
          warmup_sets?: Json
        }
        Relationships: [
          {
            foreignKeyName: "routine_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_exercises_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id"]
          },
        ]
      }
      routines: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
        ]
      }
      workout_sessions: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          performed_on: string
          program_id: string | null
          routine_id: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          performed_on?: string
          program_id?: string | null
          routine_id?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          performed_on?: string
          program_id?: string | null
          routine_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_sessions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sessions_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "workout_sets_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
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
    // The marked args below are nullable BY DESIGN — a null create-or-update id
    // (p_recipe_id / p_template_id / p_program_id / p_routine_id / p_session_id)
    // means "create new", p_phase_type null means "no phase / clear the phase"
    // (R-33 wave 4), p_prep_time_minutes null means "no time recorded / clear
    // the prep time" (R-33 wave 5), and p_notes / p_title / p_performed_on /
    // p_anchor_date are optional metadata. Restored to `… | null` so call sites
    // stay honest instead of casting NULL to ''. Re-apply to save_recipe /
    // save_template / save_week_as_template / save_program / save_routine /
    // save_workout / set_active_program after any regen — see
    // docs/conventions.md (generated-types caveats).
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
      copy_week_meal: {
        Args: {
          p_meal_index: number
          p_plan_week_id: string
          p_source_date: string
          p_target_dates: string[]
        }
        Returns: undefined
      }
      hide_owned_ingredient: {
        Args: { p_ingredient_id: string }
        Returns: undefined
      }
      hide_owned_recipe: { Args: { p_recipe_id: string }; Returns: undefined }
      materialize_plan_for_date: {
        Args: { p_date: string; p_user_id: string }
        Returns: number
      }
      reconcile_account_delete: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      save_program: {
        Args: { p_days: Json; p_name: string; p_program_id: string | null }
        Returns: string
      }
      save_recipe: {
        Args: {
          p_description: string | null
          p_ingredients: Json
          p_meal_types?: string[]
          p_name: string
          p_prep_time_minutes?: number | null
          p_recipe_id: string | null
          p_servings: number
          p_steps?: Json
        }
        Returns: string
      }
      save_routine: {
        Args: {
          p_exercises: Json
          p_name: string
          p_notes: string | null
          p_routine_id: string | null
        }
        Returns: string
      }
      save_template: {
        Args: {
          p_day_times?: Json
          p_default_meal_times: string[]
          p_name: string
          p_phase_type?: string | null
          p_same_schedule_all_days: boolean
          p_slots: Json
          p_template_id: string | null
        }
        Returns: string
      }
      save_week_as_template: {
        Args: {
          p_name: string
          p_phase_type?: string | null
          p_week_id: string
        }
        Returns: string
      }
      save_workout: {
        Args: {
          p_notes: string | null
          p_performed_on: string | null
          p_program_id?: string | null
          p_routine_id?: string | null
          p_session_id: string | null
          p_sets: Json
          p_title: string | null
        }
        Returns: string
      }
      set_active_program: {
        Args: { p_anchor_date: string | null; p_program_id: string }
        Returns: undefined
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

