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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      action_items: {
        Row: {
          ai_suggestion: string | null
          created_at: string
          deadline: string | null
          id: string
          owner: string | null
          priority: string
          recording_id: string
          sort_order: number
          status: string
          task_description: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_suggestion?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          owner?: string | null
          priority?: string
          recording_id: string
          sort_order?: number
          status?: string
          task_description: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_suggestion?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          owner?: string | null
          priority?: string
          recording_id?: string
          sort_order?: number
          status?: string
          task_description?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_items_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          created_at: string
          cv_text: string
          department: string | null
          education: string | null
          email: string | null
          experience_years: string | null
          first_name: string
          full_name: string
          id: string
          job_description: string | null
          job_title: string
          last_name: string
          notes: string | null
          phone: string | null
          source: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cv_text: string
          department?: string | null
          education?: string | null
          email?: string | null
          experience_years?: string | null
          first_name: string
          full_name: string
          id?: string
          job_description?: string | null
          job_title: string
          last_name: string
          notes?: string | null
          phone?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          cv_text?: string
          department?: string | null
          education?: string | null
          email?: string | null
          experience_years?: string | null
          first_name?: string
          full_name?: string
          id?: string
          job_description?: string | null
          job_title?: string
          last_name?: string
          notes?: string | null
          phone?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      advisor_history: {
        Row: {
          answer: Json | null
          created_at: string | null
          id: string
          question: string
          sources_used: string[] | null
          user_id: string
        }
        Insert: {
          answer?: Json | null
          created_at?: string | null
          id?: string
          question: string
          sources_used?: string[] | null
          user_id: string
        }
        Update: {
          answer?: Json | null
          created_at?: string | null
          id?: string
          question?: string
          sources_used?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      career_profiles: {
        Row: {
          ai_insights: Json | null
          ai_insights_updated_at: string | null
          career_readiness_score: number | null
          certifications: Json | null
          created_at: string
          education: Json | null
          events_trainings: Json | null
          experience: Json | null
          full_name: string | null
          id: string
          linkedin_url: string | null
          projects: Json | null
          skills: string[] | null
          summary: string | null
          target_role: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_insights?: Json | null
          ai_insights_updated_at?: string | null
          career_readiness_score?: number | null
          certifications?: Json | null
          created_at?: string
          education?: Json | null
          events_trainings?: Json | null
          experience?: Json | null
          full_name?: string | null
          id?: string
          linkedin_url?: string | null
          projects?: Json | null
          skills?: string[] | null
          summary?: string | null
          target_role?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_insights?: Json | null
          ai_insights_updated_at?: string | null
          career_readiness_score?: number | null
          certifications?: Json | null
          created_at?: string
          education?: Json | null
          events_trainings?: Json | null
          experience?: Json | null
          full_name?: string | null
          id?: string
          linkedin_url?: string | null
          projects?: Json | null
          skills?: string[] | null
          summary?: string | null
          target_role?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      company_members: {
        Row: {
          ai_analysis: Json | null
          ai_analysis_updated_at: string | null
          created_at: string
          department: string | null
          email: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          position: string | null
          skills: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_analysis?: Json | null
          ai_analysis_updated_at?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          position?: string | null
          skills?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_analysis?: Json | null
          ai_analysis_updated_at?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          position?: string | null
          skills?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      company_profiles: {
        Row: {
          company_name: string | null
          created_at: string | null
          critical_cost_items: string[] | null
          export_structure: string | null
          id: string
          import_structure: string | null
          notes: string | null
          operation_cities: string[] | null
          operation_type: string | null
          products_services: string[] | null
          sector: string | null
          strategic_risks: string[] | null
          sub_sector: string | null
          supply_dependencies: string[] | null
          target_markets: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          critical_cost_items?: string[] | null
          export_structure?: string | null
          id?: string
          import_structure?: string | null
          notes?: string | null
          operation_cities?: string[] | null
          operation_type?: string | null
          products_services?: string[] | null
          sector?: string | null
          strategic_risks?: string[] | null
          sub_sector?: string | null
          supply_dependencies?: string[] | null
          target_markets?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          critical_cost_items?: string[] | null
          export_structure?: string | null
          id?: string
          import_structure?: string | null
          notes?: string | null
          operation_cities?: string[] | null
          operation_type?: string | null
          products_services?: string[] | null
          sector?: string | null
          strategic_risks?: string[] | null
          sub_sector?: string | null
          supply_dependencies?: string[] | null
          target_markets?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      custom_interview_questions: {
        Row: {
          category: string
          created_at: string
          difficulty: string
          id: string
          is_required: boolean
          question: string
          question_type: string
          sort_order: number
          template_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          difficulty?: string
          id?: string
          is_required?: boolean
          question: string
          question_type?: string
          sort_order?: number
          template_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          difficulty?: string
          id?: string
          is_required?: boolean
          question?: string
          question_type?: string
          sort_order?: number
          template_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_interview_questions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "interview_question_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_training: {
        Row: {
          answers: Json | null
          completed: boolean
          created_at: string
          daily_task: string | null
          feedback: Json | null
          id: string
          questions: Json | null
          score: number | null
          streak_count: number | null
          training_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          answers?: Json | null
          completed?: boolean
          created_at?: string
          daily_task?: string | null
          feedback?: Json | null
          id?: string
          questions?: Json | null
          score?: number | null
          streak_count?: number | null
          training_date?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          answers?: Json | null
          completed?: boolean
          created_at?: string
          daily_task?: string | null
          feedback?: Json | null
          id?: string
          questions?: Json | null
          score?: number | null
          streak_count?: number | null
          training_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      interview_question_templates: {
        Row: {
          created_at: string
          department: string | null
          description: string | null
          difficulty: string | null
          id: string
          interview_style: string | null
          name: string
          position: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          description?: string | null
          difficulty?: string | null
          id?: string
          interview_style?: string | null
          name: string
          position?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          department?: string | null
          description?: string | null
          difficulty?: string | null
          id?: string
          interview_style?: string | null
          name?: string
          position?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      member_meeting_insights: {
        Row: {
          areas_for_improvement: string[] | null
          behavioral_insights: string | null
          communication_style: string | null
          confidence_level: string | null
          contribution_score: number | null
          created_at: string
          engagement_level: string | null
          id: string
          member_id: string
          mood: string | null
          recording_id: string
          strengths: string[] | null
          user_id: string
        }
        Insert: {
          areas_for_improvement?: string[] | null
          behavioral_insights?: string | null
          communication_style?: string | null
          confidence_level?: string | null
          contribution_score?: number | null
          created_at?: string
          engagement_level?: string | null
          id?: string
          member_id: string
          mood?: string | null
          recording_id: string
          strengths?: string[] | null
          user_id: string
        }
        Update: {
          areas_for_improvement?: string[] | null
          behavioral_insights?: string | null
          communication_style?: string | null
          confidence_level?: string | null
          contribution_score?: number | null
          created_at?: string
          engagement_level?: string | null
          id?: string
          member_id?: string
          mood?: string | null
          recording_id?: string
          strengths?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_meeting_insights_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_meeting_insights_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_interviews: {
        Row: {
          analysis_data: Json | null
          character_analysis: Json | null
          created_at: string
          department: string | null
          duration: string | null
          experience_years: string | null
          id: string
          position: string
          skills: string[] | null
          transcript: string | null
          user_id: string
        }
        Insert: {
          analysis_data?: Json | null
          character_analysis?: Json | null
          created_at?: string
          department?: string | null
          duration?: string | null
          experience_years?: string | null
          id?: string
          position: string
          skills?: string[] | null
          transcript?: string | null
          user_id: string
        }
        Update: {
          analysis_data?: Json | null
          character_analysis?: Json | null
          created_at?: string
          department?: string | null
          duration?: string | null
          experience_years?: string | null
          id?: string
          position?: string
          skills?: string[] | null
          transcript?: string | null
          user_id?: string
        }
        Relationships: []
      }
      processing_jobs: {
        Row: {
          behavioral_analysis: boolean | null
          completed_at: string | null
          created_at: string
          error_type: string | null
          failed_step: string | null
          failure_reason: string | null
          file_name: string
          file_path: string | null
          file_size: number | null
          id: string
          metadata: Json | null
          pipeline_step: string | null
          progress: number | null
          recording_id: string | null
          recording_type: string | null
          retry_count: number | null
          source_type: string | null
          started_at: string | null
          status: string
          title: string
          transcript_length: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          behavioral_analysis?: boolean | null
          completed_at?: string | null
          created_at?: string
          error_type?: string | null
          failed_step?: string | null
          failure_reason?: string | null
          file_name: string
          file_path?: string | null
          file_size?: number | null
          id?: string
          metadata?: Json | null
          pipeline_step?: string | null
          progress?: number | null
          recording_id?: string | null
          recording_type?: string | null
          retry_count?: number | null
          source_type?: string | null
          started_at?: string | null
          status?: string
          title: string
          transcript_length?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          behavioral_analysis?: boolean | null
          completed_at?: string | null
          created_at?: string
          error_type?: string | null
          failed_step?: string | null
          failure_reason?: string | null
          file_name?: string
          file_path?: string | null
          file_size?: number | null
          id?: string
          metadata?: Json | null
          pipeline_step?: string | null
          progress?: number | null
          recording_id?: string | null
          recording_type?: string | null
          retry_count?: number | null
          source_type?: string | null
          started_at?: string | null
          status?: string
          title?: string
          transcript_length?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "processing_jobs_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: string
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          account_type?: string
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          account_type?: string
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      recordings: {
        Row: {
          analysis_data: Json | null
          biveyos_signals: Json | null
          created_at: string
          date: string
          duration: string | null
          id: string
          summary: string | null
          title: string
          transcript: string | null
          type: string
          updated_at: string
          user_id: string | null
          video_url: string | null
        }
        Insert: {
          analysis_data?: Json | null
          biveyos_signals?: Json | null
          created_at?: string
          date?: string
          duration?: string | null
          id?: string
          summary?: string | null
          title: string
          transcript?: string | null
          type: string
          updated_at?: string
          user_id?: string | null
          video_url?: string | null
        }
        Update: {
          analysis_data?: Json | null
          biveyos_signals?: Json | null
          created_at?: string
          date?: string
          duration?: string | null
          id?: string
          summary?: string | null
          title?: string
          transcript?: string | null
          type?: string
          updated_at?: string
          user_id?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      sector_developments: {
        Row: {
          ai_commentary: string | null
          cost_impact: string | null
          created_at: string | null
          description: string | null
          development_date: string | null
          id: string
          margin_impact: string | null
          market_impact: string | null
          opportunity_level: string | null
          recommended_action: string | null
          relevance_score: number | null
          risk_level: string | null
          sales_impact: string | null
          source: string | null
          supply_impact: string | null
          tags: string[] | null
          title: string
          user_id: string
        }
        Insert: {
          ai_commentary?: string | null
          cost_impact?: string | null
          created_at?: string | null
          description?: string | null
          development_date?: string | null
          id?: string
          margin_impact?: string | null
          market_impact?: string | null
          opportunity_level?: string | null
          recommended_action?: string | null
          relevance_score?: number | null
          risk_level?: string | null
          sales_impact?: string | null
          source?: string | null
          supply_impact?: string | null
          tags?: string[] | null
          title: string
          user_id: string
        }
        Update: {
          ai_commentary?: string | null
          cost_impact?: string | null
          created_at?: string | null
          description?: string | null
          development_date?: string | null
          id?: string
          margin_impact?: string | null
          market_impact?: string | null
          opportunity_level?: string | null
          recommended_action?: string | null
          relevance_score?: number | null
          risk_level?: string | null
          sales_impact?: string | null
          source?: string | null
          supply_impact?: string | null
          tags?: string[] | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
