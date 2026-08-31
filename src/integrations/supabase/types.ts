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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      access_grants: {
        Row: {
          auth_method: string | null
          created_at: string
          current_month_usage: number | null
          expires_at: string | null
          granted_at: string | null
          granted_by: string | null
          id: string
          is_active: boolean
          monthly_limit: number | null
          notes: string | null
          requires_approval: boolean | null
          updated_at: string
          usage_reset_date: string | null
          user_id: string
        }
        Insert: {
          auth_method?: string | null
          created_at?: string
          current_month_usage?: number | null
          expires_at?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          is_active?: boolean
          monthly_limit?: number | null
          notes?: string | null
          requires_approval?: boolean | null
          updated_at?: string
          usage_reset_date?: string | null
          user_id: string
        }
        Update: {
          auth_method?: string | null
          created_at?: string
          current_month_usage?: number | null
          expires_at?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          is_active?: boolean
          monthly_limit?: number | null
          notes?: string | null
          requires_approval?: boolean | null
          updated_at?: string
          usage_reset_date?: string | null
          user_id?: string
        }
        Relationships: []
      }
      account_erasures: {
        Row: {
          created_at: string
          email_at_erasure: string | null
          erased_at: string
          erased_by: string | null
          purge_reason: string | null
          purged_at: string | null
          purged_by: string | null
          reason: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_at_erasure?: string | null
          erased_at?: string
          erased_by?: string | null
          purge_reason?: string | null
          purged_at?: string | null
          purged_by?: string | null
          reason: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_at_erasure?: string | null
          erased_at?: string
          erased_by?: string | null
          purge_reason?: string | null
          purged_at?: string | null
          purged_by?: string | null
          reason?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      account_limit_overrides: {
        Row: {
          assessments_limit: number | null
          created_at: string
          monthly_credits: number | null
          proposals_limit: number | null
          reason: string
          searches_limit: number | null
          set_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assessments_limit?: number | null
          created_at?: string
          monthly_credits?: number | null
          proposals_limit?: number | null
          reason: string
          searches_limit?: number | null
          set_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assessments_limit?: number | null
          created_at?: string
          monthly_credits?: number | null
          proposals_limit?: number | null
          reason?: string
          searches_limit?: number | null
          set_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      account_restrictions: {
        Row: {
          capability: Database["public"]["Enums"]["account_capability"]
          created_at: string
          reason: string
          set_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          capability: Database["public"]["Enums"]["account_capability"]
          created_at?: string
          reason: string
          set_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          capability?: Database["public"]["Enums"]["account_capability"]
          created_at?: string
          reason?: string
          set_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      account_suspensions: {
        Row: {
          active: boolean
          created_at: string
          id: string
          reason: string
          restored_at: string | null
          restored_by: string | null
          suspended_at: string
          suspended_by: string | null
          until: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          reason: string
          restored_at?: string | null
          restored_by?: string | null
          suspended_at?: string
          suspended_by?: string | null
          until?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          reason?: string
          restored_at?: string | null
          restored_by?: string | null
          suspended_at?: string
          suspended_by?: string | null
          until?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_ai_conversations: {
        Row: {
          actions_taken: Json | null
          admin_id: string
          context: Json | null
          created_at: string | null
          id: string
          message: string
          role: string
        }
        Insert: {
          actions_taken?: Json | null
          admin_id: string
          context?: Json | null
          created_at?: string | null
          id?: string
          message: string
          role: string
        }
        Update: {
          actions_taken?: Json | null
          admin_id?: string
          context?: Json | null
          created_at?: string | null
          id?: string
          message?: string
          role?: string
        }
        Relationships: []
      }
      admin_notification_config: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          notification_type: string
          recipient_email: string
          settings: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          notification_type: string
          recipient_email?: string
          settings?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          notification_type?: string
          recipient_email?: string
          settings?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      admin_notification_log: {
        Row: {
          content: string | null
          created_at: string
          error_message: string | null
          id: string
          metadata: Json | null
          notification_type: string
          recipient_email: string
          status: string
          subject: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          notification_type: string
          recipient_email: string
          status?: string
          subject: string
        }
        Update: {
          content?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          notification_type?: string
          recipient_email?: string
          status?: string
          subject?: string
        }
        Relationships: []
      }
      agent_telegram_bots: {
        Row: {
          bot_token: string
          created_at: string
          employee_id: string
          id: string
          is_active: boolean
        }
        Insert: {
          bot_token: string
          created_at?: string
          employee_id: string
          id?: string
          is_active?: boolean
        }
        Update: {
          bot_token?: string
          created_at?: string
          employee_id?: string
          id?: string
          is_active?: boolean
        }
        Relationships: []
      }
      ai_call_telemetry: {
        Row: {
          cache_hit: boolean
          created_at: string
          duration_ms: number | null
          gap_matched: number | null
          gap_missing: number | null
          gap_surfaced: number | null
          id: string
          meta: Json | null
          model: string | null
          purpose: string
          source_map: Json | null
          user_id: string | null
        }
        Insert: {
          cache_hit?: boolean
          created_at?: string
          duration_ms?: number | null
          gap_matched?: number | null
          gap_missing?: number | null
          gap_surfaced?: number | null
          id?: string
          meta?: Json | null
          model?: string | null
          purpose: string
          source_map?: Json | null
          user_id?: string | null
        }
        Update: {
          cache_hit?: boolean
          created_at?: string
          duration_ms?: number | null
          gap_matched?: number | null
          gap_missing?: number | null
          gap_surfaced?: number | null
          id?: string
          meta?: Json | null
          model?: string | null
          purpose?: string
          source_map?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      ai_mode_configs: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          mode_name: string
          updated_at: string
          webhook_url: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          mode_name: string
          updated_at?: string
          webhook_url: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          mode_name?: string
          updated_at?: string
          webhook_url?: string
        }
        Relationships: []
      }
      ai_result_cache: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          payload: Json
          purpose: string
          user_id: string | null
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at: string
          payload: Json
          purpose: string
          user_id?: string | null
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          payload?: Json
          purpose?: string
          user_id?: string | null
        }
        Relationships: []
      }
      alert_history: {
        Row: {
          alert_type: string
          content: string
          created_at: string
          error_message: string | null
          id: string
          metadata: Json | null
          recipient_email_encrypted: string | null
          sent_at: string | null
          status: string | null
          subject: string
          user_id: string | null
        }
        Insert: {
          alert_type: string
          content: string
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          recipient_email_encrypted?: string | null
          sent_at?: string | null
          status?: string | null
          subject: string
          user_id?: string | null
        }
        Update: {
          alert_type?: string
          content?: string
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          recipient_email_encrypted?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string
          user_id?: string | null
        }
        Relationships: []
      }
      api_rate_limits: {
        Row: {
          blocked_until: string | null
          created_at: string | null
          endpoint: string
          id: string
          last_violation: string | null
          max_requests: number | null
          request_count: number | null
          updated_at: string | null
          user_id: string
          violation_count: number | null
          window_start: string | null
        }
        Insert: {
          blocked_until?: string | null
          created_at?: string | null
          endpoint: string
          id?: string
          last_violation?: string | null
          max_requests?: number | null
          request_count?: number | null
          updated_at?: string | null
          user_id: string
          violation_count?: number | null
          window_start?: string | null
        }
        Update: {
          blocked_until?: string | null
          created_at?: string | null
          endpoint?: string
          id?: string
          last_violation?: string | null
          max_requests?: number | null
          request_count?: number | null
          updated_at?: string | null
          user_id?: string
          violation_count?: number | null
          window_start?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      application_replies: {
        Row: {
          application_id: string
          created_at: string | null
          email_error: string | null
          email_sent: boolean | null
          id: string
          message: string
          sent_by: string | null
          subject: string
        }
        Insert: {
          application_id: string
          created_at?: string | null
          email_error?: string | null
          email_sent?: boolean | null
          id?: string
          message: string
          sent_by?: string | null
          subject: string
        }
        Update: {
          application_id?: string
          created_at?: string | null
          email_error?: string | null
          email_sent?: boolean | null
          id?: string
          message?: string
          sent_by?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_replies_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "service_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          applied_at: string | null
          created_at: string
          follow_up_at: string | null
          id: string
          job_id: string
          notes: string | null
          resume_version_id: string | null
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          follow_up_at?: string | null
          id?: string
          job_id: string
          notes?: string | null
          resume_version_id?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          follow_up_at?: string | null
          id?: string
          job_id?: string
          notes?: string | null
          resume_version_id?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      assessment_results: {
        Row: {
          assessment_id: string
          concerns: Json
          created_at: string
          employer_summary: string | null
          id: string
          overall_score: number
          per_question: Json
          seeker_growth_note: string | null
          strengths: Json
          verification_verdict: string
          writing_signal: string | null
          writing_signal_note: string | null
        }
        Insert: {
          assessment_id: string
          concerns?: Json
          created_at?: string
          employer_summary?: string | null
          id?: string
          overall_score?: number
          per_question?: Json
          seeker_growth_note?: string | null
          strengths?: Json
          verification_verdict?: string
          writing_signal?: string | null
          writing_signal_note?: string | null
        }
        Update: {
          assessment_id?: string
          concerns?: Json
          created_at?: string
          employer_summary?: string | null
          id?: string
          overall_score?: number
          per_question?: Json
          seeker_growth_note?: string | null
          strengths?: Json
          verification_verdict?: string
          writing_signal?: string | null
          writing_signal_note?: string | null
        }
        Relationships: []
      }
      assessment_rubrics: {
        Row: {
          assessment_id: string
          created_at: string
          id: string
          question_id: string
          rubric: string
        }
        Insert: {
          assessment_id: string
          created_at?: string
          id?: string
          question_id: string
          rubric: string
        }
        Update: {
          assessment_id?: string
          created_at?: string
          id?: string
          question_id?: string
          rubric?: string
        }
        Relationships: []
      }
      assessments: {
        Row: {
          answers: Json
          candidate_ref: string | null
          candidate_user_id: string
          created_at: string
          created_by: string | null
          current_question_started_at: string | null
          expires_at: string | null
          id: string
          job_title: string | null
          org_id: string
          questions: Json
          search_id: string | null
          sent_at: string | null
          started_at: string | null
          status: string
          submitted_at: string | null
          time_limit_seconds: number
          updated_at: string
        }
        Insert: {
          answers?: Json
          candidate_ref?: string | null
          candidate_user_id: string
          created_at?: string
          created_by?: string | null
          current_question_started_at?: string | null
          expires_at?: string | null
          id?: string
          job_title?: string | null
          org_id: string
          questions?: Json
          search_id?: string | null
          sent_at?: string | null
          started_at?: string | null
          status?: string
          submitted_at?: string | null
          time_limit_seconds?: number
          updated_at?: string
        }
        Update: {
          answers?: Json
          candidate_ref?: string | null
          candidate_user_id?: string
          created_at?: string
          created_by?: string | null
          current_question_started_at?: string | null
          expires_at?: string | null
          id?: string
          job_title?: string | null
          org_id?: string
          questions?: Json
          search_id?: string | null
          sent_at?: string | null
          started_at?: string | null
          status?: string
          submitted_at?: string | null
          time_limit_seconds?: number
          updated_at?: string
        }
        Relationships: []
      }
      ats_config: {
        Row: {
          config: Json
          id: string
          updated_at: string
          version: number
        }
        Insert: {
          config: Json
          id: string
          updated_at?: string
          version?: number
        }
        Update: {
          config?: Json
          id?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      autofill_runs: {
        Row: {
          ai_answered: number | null
          ai_resolved_count: number
          ai_values: Json | null
          ats: string | null
          company: string | null
          completed_at: string | null
          created_at: string
          ext_version: string | null
          failed: number | null
          failure_classes: Json
          fields_scanned: Json | null
          fields_total: number | null
          filled: number | null
          human_typed_count: number
          human_typing_used: boolean
          id: string
          inject_results: Json | null
          job_title: string | null
          memory_exact_count: number
          memory_fuzzy_count: number
          meta: Json | null
          resolved_by: Json
          retry_count: number
          skipped: Json | null
          url: string | null
          user_id: string | null
        }
        Insert: {
          ai_answered?: number | null
          ai_resolved_count?: number
          ai_values?: Json | null
          ats?: string | null
          company?: string | null
          completed_at?: string | null
          created_at?: string
          ext_version?: string | null
          failed?: number | null
          failure_classes?: Json
          fields_scanned?: Json | null
          fields_total?: number | null
          filled?: number | null
          human_typed_count?: number
          human_typing_used?: boolean
          id?: string
          inject_results?: Json | null
          job_title?: string | null
          memory_exact_count?: number
          memory_fuzzy_count?: number
          meta?: Json | null
          resolved_by?: Json
          retry_count?: number
          skipped?: Json | null
          url?: string | null
          user_id?: string | null
        }
        Update: {
          ai_answered?: number | null
          ai_resolved_count?: number
          ai_values?: Json | null
          ats?: string | null
          company?: string | null
          completed_at?: string | null
          created_at?: string
          ext_version?: string | null
          failed?: number | null
          failure_classes?: Json
          fields_scanned?: Json | null
          fields_total?: number | null
          filled?: number | null
          human_typed_count?: number
          human_typing_used?: boolean
          id?: string
          inject_results?: Json | null
          job_title?: string | null
          memory_exact_count?: number
          memory_fuzzy_count?: number
          meta?: Json | null
          resolved_by?: Json
          retry_count?: number
          skipped?: Json | null
          url?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ayn_activity_log: {
        Row: {
          action_type: string
          created_at: string
          details: Json | null
          id: string
          summary: string
          target_id: string | null
          target_type: string | null
          triggered_by: string
        }
        Insert: {
          action_type: string
          created_at?: string
          details?: Json | null
          id?: string
          summary: string
          target_id?: string | null
          target_type?: string | null
          triggered_by?: string
        }
        Update: {
          action_type?: string
          created_at?: string
          details?: Json | null
          id?: string
          summary?: string
          target_id?: string | null
          target_type?: string | null
          triggered_by?: string
        }
        Relationships: []
      }
      ayn_error_log: {
        Row: {
          component: string
          context: Json | null
          created_at: string | null
          error_message: string | null
          error_type: string
          id: string
          operation: string | null
          resolved: boolean | null
          severity: string | null
        }
        Insert: {
          component: string
          context?: Json | null
          created_at?: string | null
          error_message?: string | null
          error_type: string
          id?: string
          operation?: string | null
          resolved?: boolean | null
          severity?: string | null
        }
        Update: {
          component?: string
          context?: Json | null
          created_at?: string | null
          error_message?: string | null
          error_type?: string
          id?: string
          operation?: string | null
          resolved?: boolean | null
          severity?: string | null
        }
        Relationships: []
      }
      ayn_mind: {
        Row: {
          content: string
          context: Json | null
          created_at: string
          id: string
          shared_with_admin: boolean
          type: string
        }
        Insert: {
          content: string
          context?: Json | null
          created_at?: string
          id?: string
          shared_with_admin?: boolean
          type: string
        }
        Update: {
          content?: string
          context?: Json | null
          created_at?: string
          id?: string
          shared_with_admin?: boolean
          type?: string
        }
        Relationships: []
      }
      ayn_sales_pipeline: {
        Row: {
          admin_approved: boolean
          company_name: string
          company_url: string | null
          contact_email: string
          contact_name: string | null
          context: Json | null
          created_at: string
          emails_sent: number
          id: string
          industry: string | null
          last_email_at: string | null
          next_follow_up_at: string | null
          notes: string | null
          pain_points: string[] | null
          recommended_services: string[] | null
          status: string
          updated_at: string
        }
        Insert: {
          admin_approved?: boolean
          company_name: string
          company_url?: string | null
          contact_email: string
          contact_name?: string | null
          context?: Json | null
          created_at?: string
          emails_sent?: number
          id?: string
          industry?: string | null
          last_email_at?: string | null
          next_follow_up_at?: string | null
          notes?: string | null
          pain_points?: string[] | null
          recommended_services?: string[] | null
          status?: string
          updated_at?: string
        }
        Update: {
          admin_approved?: boolean
          company_name?: string
          company_url?: string | null
          contact_email?: string
          contact_name?: string | null
          context?: Json | null
          created_at?: string
          emails_sent?: number
          id?: string
          industry?: string | null
          last_email_at?: string | null
          next_follow_up_at?: string | null
          notes?: string | null
          pain_points?: string[] | null
          recommended_services?: string[] | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      beta_feedback: {
        Row: {
          additional_comments: string | null
          bugs_encountered: string | null
          credits_awarded: number | null
          favorite_features: string[] | null
          id: string
          improvement_suggestions: string | null
          overall_rating: number | null
          submitted_at: string | null
          updated_at: string | null
          user_id: string
          would_recommend: boolean | null
        }
        Insert: {
          additional_comments?: string | null
          bugs_encountered?: string | null
          credits_awarded?: number | null
          favorite_features?: string[] | null
          id?: string
          improvement_suggestions?: string | null
          overall_rating?: number | null
          submitted_at?: string | null
          updated_at?: string | null
          user_id: string
          would_recommend?: boolean | null
        }
        Update: {
          additional_comments?: string | null
          bugs_encountered?: string | null
          credits_awarded?: number | null
          favorite_features?: string[] | null
          id?: string
          improvement_suggestions?: string | null
          overall_rating?: number | null
          submitted_at?: string | null
          updated_at?: string | null
          user_id?: string
          would_recommend?: boolean | null
        }
        Relationships: []
      }
      candidate_index: {
        Row: {
          embedded_at: string | null
          embedding: string | null
          embedding_model: string | null
          headline: string | null
          indexed_at: string | null
          location: string | null
          profile_text: string | null
          seniority: string | null
          summary: string | null
          user_id: string
          years_experience: number | null
        }
        Insert: {
          embedded_at?: string | null
          embedding?: string | null
          embedding_model?: string | null
          headline?: string | null
          indexed_at?: string | null
          location?: string | null
          profile_text?: string | null
          seniority?: string | null
          summary?: string | null
          user_id: string
          years_experience?: number | null
        }
        Update: {
          embedded_at?: string | null
          embedding?: string | null
          embedding_model?: string | null
          headline?: string | null
          indexed_at?: string | null
          location?: string | null
          profile_text?: string | null
          seniority?: string | null
          summary?: string | null
          user_id?: string
          years_experience?: number | null
        }
        Relationships: []
      }
      candidate_skills: {
        Row: {
          created_at: string
          id: string
          last_used: string | null
          level: string | null
          provenance: string
          skill: string
          skill_norm: string
          source: string | null
          user_id: string
          years: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          last_used?: string | null
          level?: string | null
          provenance: string
          skill: string
          skill_norm: string
          source?: string | null
          user_id: string
          years?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          last_used?: string | null
          level?: string | null
          provenance?: string
          skill?: string
          skill_norm?: string
          source?: string | null
          user_id?: string
          years?: number | null
        }
        Relationships: []
      }
      cc_inbox: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          read_at: string | null
          recipient_email: string | null
          recipient_id: string
          sender_id: string
          sender_name: string | null
          source_ids: string[] | null
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          kind?: string
          read_at?: string | null
          recipient_email?: string | null
          recipient_id: string
          sender_id: string
          sender_name?: string | null
          source_ids?: string[] | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          read_at?: string | null
          recipient_email?: string | null
          recipient_id?: string
          sender_id?: string
          sender_name?: string | null
          source_ids?: string[] | null
          title?: string
        }
        Relationships: []
      }
      cc_updates: {
        Row: {
          author: string
          created_at: string
          department: string
          id: string
          impact: string
          text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          author: string
          created_at?: string
          department: string
          id?: string
          impact?: string
          text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          author?: string
          created_at?: string
          department?: string
          id?: string
          impact?: string
          text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_sessions: {
        Row: {
          created_at: string | null
          id: string
          session_id: string
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          session_id: string
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          session_id?: string
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      contact_messages: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      cookie_consent_log: {
        Row: {
          choice: string
          created_at: string
          gpc: boolean
          id: string
          user_id: string | null
        }
        Insert: {
          choice: string
          created_at?: string
          gpc?: boolean
          id?: string
          user_id?: string | null
        }
        Update: {
          choice?: string
          created_at?: string
          gpc?: boolean
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      cover_letters: {
        Row: {
          body: string
          created_at: string
          id: string
          job_id: string
          resume_id: string | null
          tone: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          job_id: string
          resume_id?: string | null
          tone?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          job_id?: string
          resume_id?: string | null
          tone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      credit_gifts: {
        Row: {
          amount: number
          created_at: string | null
          gift_type: string | null
          given_by: string | null
          id: string
          reason: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          gift_type?: string | null
          given_by?: string | null
          id?: string
          reason: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          gift_type?: string | null
          given_by?: string | null
          id?: string
          reason?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      credit_ledger: {
        Row: {
          balance_after: number
          created_at: string
          delta: number
          id: string
          reason: string
          ref_id: string | null
          user_id: string
        }
        Insert: {
          balance_after: number
          created_at?: string
          delta: number
          id?: string
          reason: string
          ref_id?: string | null
          user_id: string
        }
        Update: {
          balance_after?: number
          created_at?: string
          delta?: number
          id?: string
          reason?: string
          ref_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      device_fingerprints: {
        Row: {
          created_at: string
          device_info: Json
          fingerprint_hash: string
          first_seen: string
          id: string
          is_trusted: boolean | null
          last_seen: string
          location_info: Json | null
          login_count: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_info?: Json
          fingerprint_hash: string
          first_seen?: string
          id?: string
          is_trusted?: boolean | null
          last_seen?: string
          location_info?: Json | null
          login_count?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_info?: Json
          fingerprint_hash?: string
          first_seen?: string
          id?: string
          is_trusted?: boolean | null
          last_seen?: string
          location_info?: Json | null
          login_count?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          email_type: string
          error_message: string | null
          id: string
          metadata: Json | null
          recipient_email: string | null
          sent_at: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          email_type: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          recipient_email?: string | null
          sent_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          email_type?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          recipient_email?: string | null
          sent_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      emergency_alerts: {
        Row: {
          alert_level: string
          alert_type: string
          auto_triggered: boolean | null
          created_at: string
          id: string
          is_active: boolean | null
          mitigation_actions: Json | null
          resolved_at: string | null
          resolved_by: string | null
          threat_assessment: Json | null
          trigger_reason: string
          triggered_by: string | null
          updated_at: string
        }
        Insert: {
          alert_level: string
          alert_type: string
          auto_triggered?: boolean | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          mitigation_actions?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          threat_assessment?: Json | null
          trigger_reason: string
          triggered_by?: string | null
          updated_at?: string
        }
        Update: {
          alert_level?: string
          alert_type?: string
          auto_triggered?: boolean | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          mitigation_actions?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          threat_assessment?: Json | null
          trigger_reason?: string
          triggered_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      employer_accounts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company_name: string
          company_size: string | null
          created_at: string
          hiring_need: string | null
          id: string
          internal_note: string | null
          package_notes: string | null
          phone: string | null
          status: Database["public"]["Enums"]["employer_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_name: string
          company_size?: string | null
          created_at?: string
          hiring_need?: string | null
          id?: string
          internal_note?: string | null
          package_notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["employer_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_name?: string
          company_size?: string | null
          created_at?: string
          hiring_need?: string | null
          id?: string
          internal_note?: string | null
          package_notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["employer_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      employer_intake_drafts: {
        Row: {
          answered: string[]
          created_at: string
          id: string
          job_spec: Json
          opening: string
          org_id: string
          phase: string
          updated_at: string
        }
        Insert: {
          answered?: string[]
          created_at?: string
          id?: string
          job_spec?: Json
          opening?: string
          org_id: string
          phase?: string
          updated_at?: string
        }
        Update: {
          answered?: string[]
          created_at?: string
          id?: string
          job_spec?: Json
          opening?: string
          org_id?: string
          phase?: string
          updated_at?: string
        }
        Relationships: []
      }
      employer_searches: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          job_spec: Json
          org_id: string
          ref_map: Json | null
          results: Json | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          job_spec: Json
          org_id: string
          ref_map?: Json | null
          results?: Json | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          job_spec?: Json
          org_id?: string
          ref_map?: Json | null
          results?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "employer_searches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      error_alert_state: {
        Row: {
          id: string
          last_alert_count: number
          last_alert_sent_at: string | null
          last_checked_at: string
        }
        Insert: {
          id?: string
          last_alert_count?: number
          last_alert_sent_at?: string | null
          last_checked_at?: string
        }
        Update: {
          id?: string
          last_alert_count?: number
          last_alert_sent_at?: string | null
          last_checked_at?: string
        }
        Relationships: []
      }
      error_group_resolutions: {
        Row: {
          created_at: string | null
          error_pattern: string
          fix_description: string | null
          id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          error_pattern: string
          fix_description?: string | null
          id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          error_pattern?: string
          fix_description?: string | null
          id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      error_logs: {
        Row: {
          component_stack: string | null
          context: Json | null
          created_at: string | null
          endpoint: string | null
          error_message: string
          error_stack: string | null
          fix_applied: string | null
          id: string
          request_id: string | null
          resolved_at: string | null
          resolved_note: string | null
          severity: string | null
          source: string | null
          status: string | null
          updated_at: string | null
          url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          component_stack?: string | null
          context?: Json | null
          created_at?: string | null
          endpoint?: string | null
          error_message: string
          error_stack?: string | null
          fix_applied?: string | null
          id?: string
          request_id?: string | null
          resolved_at?: string | null
          resolved_note?: string | null
          severity?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          component_stack?: string | null
          context?: Json | null
          created_at?: string | null
          endpoint?: string | null
          error_message?: string
          error_stack?: string | null
          fix_applied?: string | null
          id?: string
          request_id?: string | null
          resolved_at?: string | null
          resolved_note?: string | null
          severity?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ext_answer_memory: {
        Row: {
          answer_option_label: string | null
          answer_option_labels: Json | null
          answer_value: string | null
          ats_hint: string | null
          canonical_label: string
          created_at: string
          id: string
          last_used_at: string
          question_kind: string
          question_signature: string
          semantic_type: string
          times_used: number
          updated_at: string
          user_id: string
          verified_fail_count: number
          verified_ok_count: number
        }
        Insert: {
          answer_option_label?: string | null
          answer_option_labels?: Json | null
          answer_value?: string | null
          ats_hint?: string | null
          canonical_label: string
          created_at?: string
          id?: string
          last_used_at?: string
          question_kind?: string
          question_signature: string
          semantic_type?: string
          times_used?: number
          updated_at?: string
          user_id: string
          verified_fail_count?: number
          verified_ok_count?: number
        }
        Update: {
          answer_option_label?: string | null
          answer_option_labels?: Json | null
          answer_value?: string | null
          ats_hint?: string | null
          canonical_label?: string
          created_at?: string
          id?: string
          last_used_at?: string
          question_kind?: string
          question_signature?: string
          semantic_type?: string
          times_used?: number
          updated_at?: string
          user_id?: string
          verified_fail_count?: number
          verified_ok_count?: number
        }
        Relationships: []
      }
      ext_answers: {
        Row: {
          answer_text: string
          created_at: string
          field_kind: string | null
          id: string
          last_company: string | null
          last_role: string | null
          question_hash: string
          question_text: string
          updated_at: string
          use_count: number
          user_id: string
        }
        Insert: {
          answer_text: string
          created_at?: string
          field_kind?: string | null
          id?: string
          last_company?: string | null
          last_role?: string | null
          question_hash: string
          question_text: string
          updated_at?: string
          use_count?: number
          user_id: string
        }
        Update: {
          answer_text?: string
          created_at?: string
          field_kind?: string | null
          id?: string
          last_company?: string | null
          last_role?: string | null
          question_hash?: string
          question_text?: string
          updated_at?: string
          use_count?: number
          user_id?: string
        }
        Relationships: []
      }
      ext_ask_messages: {
        Row: {
          content: string
          context: Json | null
          created_at: string
          id: string
          role: string
          session_id: string
          user_id: string
        }
        Insert: {
          content: string
          context?: Json | null
          created_at?: string
          id?: string
          role: string
          session_id: string
          user_id: string
        }
        Update: {
          content?: string
          context?: Json | null
          created_at?: string
          id?: string
          role?: string
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      extension_link_codes: {
        Row: {
          approved_at: string | null
          code: string
          created_at: string
          device_label: string
          expires_at: string
          id: string
          status: string
          token: string | null
          user_id: string | null
        }
        Insert: {
          approved_at?: string | null
          code: string
          created_at?: string
          device_label?: string
          expires_at?: string
          id?: string
          status?: string
          token?: string | null
          user_id?: string | null
        }
        Update: {
          approved_at?: string | null
          code?: string
          created_at?: string
          device_label?: string
          expires_at?: string
          id?: string
          status?: string
          token?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      extension_tokens: {
        Row: {
          created_at: string
          device_label: string | null
          id: string
          last_used_at: string | null
          revoked_at: string | null
          token_hash: string
          token_prefix: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_label?: string | null
          id?: string
          last_used_at?: string | null
          revoked_at?: string | null
          token_hash: string
          token_prefix: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_label?: string | null
          id?: string
          last_used_at?: string | null
          revoked_at?: string | null
          token_hash?: string
          token_prefix?: string
          user_id?: string
        }
        Relationships: []
      }
      faq_items: {
        Row: {
          answer: string
          category: string
          created_at: string
          helpful_count: number
          id: string
          is_published: boolean
          order_index: number
          question: string
          updated_at: string
          view_count: number
        }
        Insert: {
          answer: string
          category?: string
          created_at?: string
          helpful_count?: number
          id?: string
          is_published?: boolean
          order_index?: number
          question: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          answer?: string
          category?: string
          created_at?: string
          helpful_count?: number
          id?: string
          is_published?: boolean
          order_index?: number
          question?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: []
      }
      favorite_chats: {
        Row: {
          chat_data: Json
          chat_title: string
          created_at: string
          id: string
          session_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chat_data?: Json
          chat_title: string
          created_at?: string
          id?: string
          session_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chat_data?: Json
          chat_title?: string
          created_at?: string
          id?: string
          session_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      inbound_email_replies: {
        Row: {
          body_html: string | null
          body_text: string | null
          created_at: string
          from_email: string
          from_name: string | null
          id: string
          in_reply_to: string | null
          is_read: boolean
          message_id: string | null
          pipeline_lead_id: string | null
          replied_at: string | null
          replied_by: string | null
          reply_identity: string | null
          subject: string | null
          to_email: string
        }
        Insert: {
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          from_email: string
          from_name?: string | null
          id?: string
          in_reply_to?: string | null
          is_read?: boolean
          message_id?: string | null
          pipeline_lead_id?: string | null
          replied_at?: string | null
          replied_by?: string | null
          reply_identity?: string | null
          subject?: string | null
          to_email: string
        }
        Update: {
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          from_email?: string
          from_name?: string | null
          id?: string
          in_reply_to?: string | null
          is_read?: boolean
          message_id?: string | null
          pipeline_lead_id?: string | null
          replied_at?: string | null
          replied_by?: string | null
          reply_identity?: string | null
          subject?: string | null
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_email_replies_pipeline_lead_id_fkey"
            columns: ["pipeline_lead_id"]
            isOneToOne: false
            referencedRelation: "ayn_sales_pipeline"
            referencedColumns: ["id"]
          },
        ]
      }
      ip_blocks: {
        Row: {
          block_reason: string
          block_type: string
          blocked_at: string
          blocked_until: string | null
          created_at: string
          created_by: string | null
          id: string
          ip_address: unknown
          is_active: boolean | null
          metadata: Json | null
          threat_level: string
          updated_at: string
        }
        Insert: {
          block_reason: string
          block_type?: string
          blocked_at?: string
          blocked_until?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          ip_address: unknown
          is_active?: boolean | null
          metadata?: Json | null
          threat_level?: string
          updated_at?: string
        }
        Update: {
          block_reason?: string
          block_type?: string
          blocked_at?: string
          blocked_until?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          ip_address?: unknown
          is_active?: boolean | null
          metadata?: Json | null
          threat_level?: string
          updated_at?: string
        }
        Relationships: []
      }
      job_applications: {
        Row: {
          applied_at: string | null
          company: string
          created_at: string
          id: string
          job_id: string | null
          job_title: string
          job_url: string | null
          match_score: number | null
          notes: string | null
          salary_estimate: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          company: string
          created_at?: string
          id?: string
          job_id?: string | null
          job_title: string
          job_url?: string | null
          match_score?: number | null
          notes?: string | null
          salary_estimate?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_at?: string | null
          company?: string
          created_at?: string
          id?: string
          job_id?: string | null
          job_title?: string
          job_url?: string | null
          match_score?: number | null
          notes?: string | null
          salary_estimate?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      job_cache: {
        Row: {
          company: string | null
          created_at: string
          expires_at: string
          full_jd: string
          parsed: Json
          title: string | null
          url: string | null
          url_hash: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          expires_at?: string
          full_jd: string
          parsed?: Json
          title?: string | null
          url?: string | null
          url_hash: string
        }
        Update: {
          company?: string | null
          created_at?: string
          expires_at?: string
          full_jd?: string
          parsed?: Json
          title?: string | null
          url?: string | null
          url_hash?: string
        }
        Relationships: []
      }
      job_matches: {
        Row: {
          breakdown: Json
          generated_at: string
          id: string
          job_id: string
          resume_id: string
          score: number
          user_id: string
        }
        Insert: {
          breakdown?: Json
          generated_at?: string
          id?: string
          job_id: string
          resume_id: string
          score: number
          user_id: string
        }
        Update: {
          breakdown?: Json
          generated_at?: string
          id?: string
          job_id?: string
          resume_id?: string
          score?: number
          user_id?: string
        }
        Relationships: []
      }
      skills_to_learn: {
        Row: {
          added_at: string
          company: string | null
          id: string
          job_id: string | null
          job_title: string | null
          learned_at: string | null
          skill: string
          user_id: string
        }
        Insert: {
          added_at?: string
          company?: string | null
          id?: string
          job_id?: string | null
          job_title?: string | null
          learned_at?: string | null
          skill: string
          user_id: string
        }
        Update: {
          added_at?: string
          company?: string | null
          id?: string
          job_id?: string | null
          job_title?: string | null
          learned_at?: string | null
          skill?: string
          user_id?: string
        }
        Relationships: []
      }
      job_postings: {
        Row: {
          apply_url: string
          company: string
          company_logo_url: string | null
          company_slug: string | null
          created_at: string
          description: string
          external_id: string
          id: string
          location: string | null
          posted_at: string
          source: string
          title: string
        }
        Insert: {
          apply_url: string
          company: string
          company_logo_url?: string | null
          company_slug?: string | null
          created_at?: string
          description: string
          external_id: string
          id?: string
          location?: string | null
          posted_at: string
          source: string
          title: string
        }
        Update: {
          apply_url?: string
          company?: string
          company_logo_url?: string | null
          company_slug?: string | null
          created_at?: string
          description?: string
          external_id?: string
          id?: string
          location?: string | null
          posted_at?: string
          source?: string
          title?: string
        }
        Relationships: []
      }
      jobs: {
        Row: {
          captured_at: string
          company: string | null
          created_at: string
          dedupe_hash: string | null
          id: string
          jd_html: string | null
          jd_text: string | null
          location: string | null
          posted_at: string | null
          remote: boolean | null
          salary_currency: string | null
          salary_max: number | null
          salary_min: number | null
          source: string
          source_url: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          captured_at?: string
          company?: string | null
          created_at?: string
          dedupe_hash?: string | null
          id?: string
          jd_html?: string | null
          jd_text?: string | null
          location?: string | null
          posted_at?: string | null
          remote?: boolean | null
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          source?: string
          source_url?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          captured_at?: string
          company?: string | null
          created_at?: string
          dedupe_hash?: string | null
          id?: string
          jd_html?: string | null
          jd_text?: string | null
          location?: string | null
          posted_at?: string | null
          remote?: boolean | null
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          source?: string
          source_url?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      llm_cost_daily: {
        Row: {
          date: string
          id: string
          intent_breakdown: Json | null
          model_breakdown: Json | null
          total_cost_usd: number
          total_requests: number
          total_tokens: number
          updated_at: string
        }
        Insert: {
          date?: string
          id?: string
          intent_breakdown?: Json | null
          model_breakdown?: Json | null
          total_cost_usd?: number
          total_requests?: number
          total_tokens?: number
          updated_at?: string
        }
        Update: {
          date?: string
          id?: string
          intent_breakdown?: Json | null
          model_breakdown?: Json | null
          total_cost_usd?: number
          total_requests?: number
          total_tokens?: number
          updated_at?: string
        }
        Relationships: []
      }
      llm_failures: {
        Row: {
          created_at: string | null
          error_message: string | null
          error_type: string
          id: string
          model_id: string | null
          request_payload: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          error_type: string
          id?: string
          model_id?: string | null
          request_payload?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          error_type?: string
          id?: string
          model_id?: string | null
          request_payload?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "llm_failures_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "llm_models"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_models: {
        Row: {
          api_endpoint: string | null
          cost_per_1k_input: number | null
          cost_per_1k_output: number | null
          created_at: string | null
          display_name: string
          id: string
          intent_type: string
          is_enabled: boolean | null
          max_tokens: number | null
          model_id: string
          priority: number | null
          provider: string
          supports_streaming: boolean | null
          updated_at: string | null
        }
        Insert: {
          api_endpoint?: string | null
          cost_per_1k_input?: number | null
          cost_per_1k_output?: number | null
          created_at?: string | null
          display_name: string
          id?: string
          intent_type: string
          is_enabled?: boolean | null
          max_tokens?: number | null
          model_id: string
          priority?: number | null
          provider: string
          supports_streaming?: boolean | null
          updated_at?: string | null
        }
        Update: {
          api_endpoint?: string | null
          cost_per_1k_input?: number | null
          cost_per_1k_output?: number | null
          created_at?: string | null
          display_name?: string
          id?: string
          intent_type?: string
          is_enabled?: boolean | null
          max_tokens?: number | null
          model_id?: string
          priority?: number | null
          provider?: string
          supports_streaming?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      llm_usage_logs: {
        Row: {
          cost_sar: number | null
          created_at: string | null
          fallback_reason: string | null
          id: string
          input_tokens: number | null
          intent_type: string
          model_id: string | null
          model_name: string | null
          output_tokens: number | null
          response_time_ms: number | null
          updated_at: string | null
          user_id: string
          was_fallback: boolean | null
        }
        Insert: {
          cost_sar?: number | null
          created_at?: string | null
          fallback_reason?: string | null
          id?: string
          input_tokens?: number | null
          intent_type: string
          model_id?: string | null
          model_name?: string | null
          output_tokens?: number | null
          response_time_ms?: number | null
          updated_at?: string | null
          user_id: string
          was_fallback?: boolean | null
        }
        Update: {
          cost_sar?: number | null
          created_at?: string | null
          fallback_reason?: string | null
          id?: string
          input_tokens?: number | null
          intent_type?: string
          model_id?: string | null
          model_name?: string | null
          output_tokens?: number | null
          response_time_ms?: number | null
          updated_at?: string | null
          user_id?: string
          was_fallback?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "llm_usage_logs_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "llm_models"
            referencedColumns: ["id"]
          },
        ]
      }
      message_ratings: {
        Row: {
          created_at: string | null
          id: string
          message_preview: string
          rating: string
          session_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          message_preview: string
          rating: string
          session_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          message_preview?: string
          rating?: string
          session_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          attachment_name: string | null
          attachment_type: string | null
          attachment_url: string | null
          content: string
          created_at: string
          id: string
          mode_used: string | null
          sender: string
          session_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          content: string
          created_at?: string
          id?: string
          mode_used?: string | null
          sender?: string
          session_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attachment_name?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          content?: string
          created_at?: string
          id?: string
          mode_used?: string | null
          sender?: string
          session_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      news_cache: {
        Row: {
          created_at: string
          news_data: Json
          ticker: string
        }
        Insert: {
          created_at?: string
          news_data?: Json
          ticker: string
        }
        Update: {
          created_at?: string
          news_data?: Json
          ticker?: string
        }
        Relationships: []
      }
      org_members: {
        Row: {
          created_at: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          about: string | null
          company_size: string | null
          created_at: string
          created_by: string | null
          headquarters: string | null
          id: string
          industry: string | null
          linkedin_url: string | null
          logo_url: string | null
          name: string
          website: string | null
        }
        Insert: {
          about?: string | null
          company_size?: string | null
          created_at?: string
          created_by?: string | null
          headquarters?: string | null
          id?: string
          industry?: string | null
          linkedin_url?: string | null
          logo_url?: string | null
          name: string
          website?: string | null
        }
        Update: {
          about?: string | null
          company_size?: string | null
          created_at?: string
          created_by?: string | null
          headquarters?: string | null
          id?: string
          industry?: string | null
          linkedin_url?: string | null
          logo_url?: string | null
          name?: string
          website?: string | null
        }
        Relationships: []
      }
      pending_pin_changes: {
        Row: {
          approval_token: string
          created_at: string
          expires_at: string
          id: string
          new_pin_hash: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approval_token: string
          created_at?: string
          expires_at: string
          id?: string
          new_pin_hash: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approval_token?: string
          created_at?: string
          expires_at?: string
          id?: string
          new_pin_hash?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      performance_metrics: {
        Row: {
          created_at: string
          details: Json | null
          id: string
          measurement_time: string
          metric_type: string
          metric_value: number
        }
        Insert: {
          created_at?: string
          details?: Json | null
          id?: string
          measurement_time?: string
          metric_type: string
          metric_value: number
        }
        Update: {
          created_at?: string
          details?: Json | null
          id?: string
          measurement_time?: string
          metric_type?: string
          metric_value?: number
        }
        Relationships: []
      }
      plans: {
        Row: {
          active: boolean
          assessments_limit: number | null
          audience: string
          created_at: string
          credits: number | null
          interval: string
          key: string
          name: string
          price_cents: number
          proposals_limit: number | null
          searches_limit: number | null
          sort: number
          stripe_price_id: string | null
          stripe_product_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          assessments_limit?: number | null
          audience: string
          created_at?: string
          credits?: number | null
          interval?: string
          key: string
          name: string
          price_cents?: number
          proposals_limit?: number | null
          searches_limit?: number | null
          sort?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          assessments_limit?: number | null
          audience?: string
          created_at?: string
          credits?: number | null
          interval?: string
          key?: string
          name?: string
          price_cents?: number
          proposals_limit?: number | null
          searches_limit?: number | null
          sort?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_status: string | null
          avatar_url: string | null
          business_context: string | null
          business_context_encrypted: string | null
          business_type: string | null
          company_name: string | null
          contact_person: string | null
          created_at: string
          id: string
          last_login: string | null
          role: Database["public"]["Enums"]["user_role"]
          total_sessions: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_status?: string | null
          avatar_url?: string | null
          business_context?: string | null
          business_context_encrypted?: string | null
          business_type?: string | null
          company_name?: string | null
          contact_person?: string | null
          created_at?: string
          id?: string
          last_login?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          total_sessions?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_status?: string | null
          avatar_url?: string | null
          business_context?: string | null
          business_context_encrypted?: string | null
          business_type?: string | null
          company_name?: string | null
          contact_person?: string | null
          created_at?: string
          id?: string
          last_login?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          total_sessions?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          action_type: string
          attempt_count: number | null
          blocked_until: string | null
          created_at: string | null
          id: string
          last_attempt: string | null
          user_id: string | null
        }
        Insert: {
          action_type: string
          attempt_count?: number | null
          blocked_until?: string | null
          created_at?: string | null
          id?: string
          last_attempt?: string | null
          user_id?: string | null
        }
        Update: {
          action_type?: string
          attempt_count?: number | null
          blocked_until?: string | null
          created_at?: string | null
          id?: string
          last_attempt?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      resume_versions: {
        Row: {
          content: Json
          created_at: string
          created_for_job_id: string | null
          id: string
          pdf_path: string | null
          resume_id: string
          user_id: string
        }
        Insert: {
          content: Json
          created_at?: string
          created_for_job_id?: string | null
          id?: string
          pdf_path?: string | null
          resume_id: string
          user_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          created_for_job_id?: string | null
          id?: string
          pdf_path?: string | null
          resume_id?: string
          user_id?: string
        }
        Relationships: []
      }
      resumes: {
        Row: {
          ats_issues: Json | null
          ats_score: number | null
          content: Json
          created_at: string
          id: string
          is_primary: boolean
          pdf_path: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ats_issues?: Json | null
          ats_score?: number | null
          content?: Json
          created_at?: string
          id?: string
          is_primary?: boolean
          pdf_path?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ats_issues?: Json | null
          ats_score?: number | null
          content?: Json
          created_at?: string
          id?: string
          is_primary?: boolean
          pdf_path?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reveal_requests: {
        Row: {
          candidate_ref: string | null
          candidate_user_id: string | null
          created_at: string
          decided_at: string | null
          employment_type: string | null
          id: string
          job_location: string | null
          job_title: string
          job_url: string | null
          message: string
          org_id: string
          responded_at: string | null
          salary_range: string | null
          search_id: string | null
          sent_at: string
          status: string
        }
        Insert: {
          candidate_ref?: string | null
          candidate_user_id?: string | null
          created_at?: string
          decided_at?: string | null
          employment_type?: string | null
          id?: string
          job_location?: string | null
          job_title?: string
          job_url?: string | null
          message?: string
          org_id: string
          responded_at?: string | null
          salary_range?: string | null
          search_id?: string | null
          sent_at?: string
          status?: string
        }
        Update: {
          candidate_ref?: string | null
          candidate_user_id?: string | null
          created_at?: string
          decided_at?: string | null
          employment_type?: string | null
          id?: string
          job_location?: string | null
          job_title?: string
          job_url?: string | null
          message?: string
          org_id?: string
          responded_at?: string | null
          salary_range?: string | null
          search_id?: string | null
          sent_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reveal_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reveal_requests_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "employer_searches"
            referencedColumns: ["id"]
          },
        ]
      }
      security_audit_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          ip_address: unknown
          severity: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: unknown
          severity?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: unknown
          severity?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      security_incidents: {
        Row: {
          action_taken: string | null
          blocked_until: string | null
          created_at: string
          details: Json | null
          id: string
          incident_type: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          strike_count: number
          user_id: string | null
        }
        Insert: {
          action_taken?: string | null
          blocked_until?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          incident_type: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          strike_count?: number
          user_id?: string | null
        }
        Update: {
          action_taken?: string | null
          blocked_until?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          incident_type?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          strike_count?: number
          user_id?: string | null
        }
        Relationships: []
      }
      security_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: unknown
          severity: string | null
          updated_at: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: unknown
          severity?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: unknown
          severity?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      service_applications: {
        Row: {
          assigned_to: string | null
          created_at: string
          custom_fields: Json | null
          email: string
          email_error: string | null
          email_sent: boolean | null
          full_name: string
          id: string
          last_contacted_at: string | null
          message: string | null
          phone: string | null
          service_type: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          custom_fields?: Json | null
          email: string
          email_error?: string | null
          email_sent?: boolean | null
          full_name: string
          id?: string
          last_contacted_at?: string | null
          message?: string | null
          phone?: string | null
          service_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          custom_fields?: Json | null
          email?: string
          email_error?: string | null
          email_sent?: boolean | null
          full_name?: string
          id?: string
          last_contacted_at?: string | null
          message?: string | null
          phone?: string | null
          service_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string
          current_period_start: string
          plan_key: string
          status: string
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          plan_key: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          plan_key?: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_key_fkey"
            columns: ["plan_key"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["key"]
          },
        ]
      }
      support_admin_reads: {
        Row: {
          admin_id: string
          id: string
          read_at: string
          row_id: string | null
          table_name: string
          ticket_id: string | null
          user_id: string
        }
        Insert: {
          admin_id: string
          id?: string
          read_at?: string
          row_id?: string | null
          table_name: string
          ticket_id?: string | null
          user_id: string
        }
        Update: {
          admin_id?: string
          id?: string
          read_at?: string
          row_id?: string | null
          table_name?: string
          ticket_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      support_ticket_replies: {
        Row: {
          created_at: string
          id: string
          is_ai_generated: boolean | null
          message: string
          sent_by: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_ai_generated?: boolean | null
          message: string
          sent_by?: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_ai_generated?: boolean | null
          message?: string
          sent_by?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_replies_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: Database["public"]["Enums"]["support_ticket_category"]
          created_at: string
          guest_email: string | null
          guest_name: string | null
          guest_token: string | null
          has_unread_reply: boolean
          id: string
          priority: Database["public"]["Enums"]["support_ticket_priority"]
          status: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["support_ticket_category"]
          created_at?: string
          guest_email?: string | null
          guest_name?: string | null
          guest_token?: string | null
          has_unread_reply?: boolean
          id?: string
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["support_ticket_category"]
          created_at?: string
          guest_email?: string | null
          guest_name?: string | null
          guest_token?: string | null
          has_unread_reply?: boolean
          id?: string
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      system_config: {
        Row: {
          created_at: string | null
          id: string
          key: string
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string | null
          id?: string
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: Json
        }
        Update: {
          created_at?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      system_health_checks: {
        Row: {
          checked_at: string
          error_message: string | null
          function_name: string
          id: string
          is_healthy: boolean | null
          response_time_ms: number | null
          status_code: number | null
        }
        Insert: {
          checked_at?: string
          error_message?: string | null
          function_name: string
          id?: string
          is_healthy?: boolean | null
          response_time_ms?: number | null
          status_code?: number | null
        }
        Update: {
          checked_at?: string
          error_message?: string | null
          function_name?: string
          id?: string
          is_healthy?: boolean | null
          response_time_ms?: number | null
          status_code?: number | null
        }
        Relationships: []
      }
      system_logs: {
        Row: {
          created_at: string
          endpoint: string
          error: string | null
          id: string
          intent: string | null
          latency_ms: number | null
          metadata: Json | null
          request_id: string
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          endpoint: string
          error?: string | null
          id?: string
          intent?: string | null
          latency_ms?: number | null
          metadata?: Json | null
          request_id: string
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          endpoint?: string
          error?: string | null
          id?: string
          intent?: string | null
          latency_ms?: number | null
          metadata?: Json | null
          request_id?: string
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      system_status: {
        Row: {
          created_at: string
          id: string
          is_emergency_shutdown: boolean
          last_updated_at: string
          shutdown_initiated_at: string | null
          shutdown_initiated_by: string | null
          shutdown_reason: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_emergency_shutdown?: boolean
          last_updated_at?: string
          shutdown_initiated_at?: string | null
          shutdown_initiated_by?: string | null
          shutdown_reason?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_emergency_shutdown?: boolean
          last_updated_at?: string
          shutdown_initiated_at?: string | null
          shutdown_initiated_by?: string | null
          shutdown_reason?: string | null
        }
        Relationships: []
      }
      talent_pool_consent: {
        Row: {
          consent_version: string | null
          consented_at: string | null
          opted_in: boolean
          revoked_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          consent_version?: string | null
          consented_at?: string | null
          opted_in?: boolean
          revoked_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          consent_version?: string | null
          consented_at?: string | null
          opted_in?: boolean
          revoked_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      terms_consent_log: {
        Row: {
          accepted_at: string
          ai_disclaimer_accepted: boolean
          id: string
          ip_address: string | null
          privacy_accepted: boolean
          privacy_version: string | null
          source: string
          terms_accepted: boolean
          terms_version: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          ai_disclaimer_accepted?: boolean
          id?: string
          ip_address?: string | null
          privacy_accepted?: boolean
          privacy_version?: string | null
          source?: string
          terms_accepted?: boolean
          terms_version?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          ai_disclaimer_accepted?: boolean
          id?: string
          ip_address?: string | null
          privacy_accepted?: boolean
          privacy_version?: string | null
          source?: string
          terms_accepted?: boolean
          terms_version?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      test_results: {
        Row: {
          browser: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          retry_count: number | null
          run_id: string
          screenshot_url: string | null
          status: string
          test_name: string
          test_suite: string
          viewport: string | null
        }
        Insert: {
          browser?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          retry_count?: number | null
          run_id: string
          screenshot_url?: string | null
          status: string
          test_name: string
          test_suite: string
          viewport?: string | null
        }
        Update: {
          browser?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          retry_count?: number | null
          run_id?: string
          screenshot_url?: string | null
          status?: string
          test_name?: string
          test_suite?: string
          viewport?: string | null
        }
        Relationships: []
      }
      test_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          environment: string | null
          failed_tests: number | null
          git_commit: string | null
          id: string
          passed_tests: number | null
          run_name: string | null
          skipped_tests: number | null
          total_tests: number | null
          triggered_by: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          environment?: string | null
          failed_tests?: number | null
          git_commit?: string | null
          id?: string
          passed_tests?: number | null
          run_name?: string | null
          skipped_tests?: number | null
          total_tests?: number | null
          triggered_by?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          environment?: string | null
          failed_tests?: number | null
          git_commit?: string | null
          id?: string
          passed_tests?: number | null
          run_name?: string | null
          skipped_tests?: number | null
          total_tests?: number | null
          triggered_by?: string | null
        }
        Relationships: []
      }
      threat_detection: {
        Row: {
          blocked_until: string | null
          created_at: string
          details: Json
          detected_at: string
          endpoint: string | null
          id: string
          is_blocked: boolean | null
          request_count: number | null
          severity: string
          source_ip: unknown
          threat_type: string
          updated_at: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          blocked_until?: string | null
          created_at?: string
          details?: Json
          detected_at?: string
          endpoint?: string | null
          id?: string
          is_blocked?: boolean | null
          request_count?: number | null
          severity?: string
          source_ip: unknown
          threat_type: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          blocked_until?: string | null
          created_at?: string
          details?: Json
          detected_at?: string
          endpoint?: string | null
          id?: string
          is_blocked?: boolean | null
          request_count?: number | null
          severity?: string
          source_ip?: unknown
          threat_type?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ticket_messages: {
        Row: {
          attachments: Json | null
          created_at: string
          guest_token: string | null
          id: string
          is_internal_note: boolean
          message: string
          sender_id: string | null
          sender_type: Database["public"]["Enums"]["ticket_sender_type"]
          ticket_id: string
        }
        Insert: {
          attachments?: Json | null
          created_at?: string
          guest_token?: string | null
          id?: string
          is_internal_note?: boolean
          message: string
          sender_id?: string | null
          sender_type: Database["public"]["Enums"]["ticket_sender_type"]
          ticket_id: string
        }
        Update: {
          attachments?: Json | null
          created_at?: string
          guest_token?: string | null
          id?: string
          is_internal_note?: boolean
          message?: string
          sender_id?: string | null
          sender_type?: Database["public"]["Enums"]["ticket_sender_type"]
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      upgrade_intents: {
        Row: {
          created_at: string
          id: string
          note: string | null
          plan_key: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          plan_key: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          plan_key?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      usage_logs: {
        Row: {
          action_type: string
          created_at: string | null
          id: string
          metadata: Json | null
          usage_count: number | null
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          usage_count?: number | null
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          usage_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      user_ai_limits: {
        Row: {
          bonus_credits: number | null
          created_at: string | null
          current_daily_engineering: number | null
          current_daily_files: number | null
          current_daily_messages: number | null
          current_daily_search: number | null
          current_month_cost_sar: number | null
          current_monthly_engineering: number | null
          current_monthly_messages: number | null
          daily_engineering: number | null
          daily_files: number | null
          daily_messages: number | null
          daily_reset_at: string | null
          daily_search: number | null
          id: string
          is_unlimited: boolean | null
          monthly_cost_limit_sar: number | null
          monthly_engineering: number | null
          monthly_messages: number | null
          monthly_reset_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          bonus_credits?: number | null
          created_at?: string | null
          current_daily_engineering?: number | null
          current_daily_files?: number | null
          current_daily_messages?: number | null
          current_daily_search?: number | null
          current_month_cost_sar?: number | null
          current_monthly_engineering?: number | null
          current_monthly_messages?: number | null
          daily_engineering?: number | null
          daily_files?: number | null
          daily_messages?: number | null
          daily_reset_at?: string | null
          daily_search?: number | null
          id?: string
          is_unlimited?: boolean | null
          monthly_cost_limit_sar?: number | null
          monthly_engineering?: number | null
          monthly_messages?: number | null
          monthly_reset_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          bonus_credits?: number | null
          created_at?: string | null
          current_daily_engineering?: number | null
          current_daily_files?: number | null
          current_daily_messages?: number | null
          current_daily_search?: number | null
          current_month_cost_sar?: number | null
          current_monthly_engineering?: number | null
          current_monthly_messages?: number | null
          daily_engineering?: number | null
          daily_files?: number | null
          daily_messages?: number | null
          daily_reset_at?: string | null
          daily_search?: number | null
          id?: string
          is_unlimited?: boolean | null
          monthly_cost_limit_sar?: number | null
          monthly_engineering?: number | null
          monthly_messages?: number | null
          monthly_reset_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_memory: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          memory_data: Json
          memory_key: string
          memory_type: string
          priority: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          memory_data?: Json
          memory_key: string
          memory_type: string
          priority?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          memory_data?: Json
          memory_key?: string
          memory_type?: string
          priority?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          building_code: string | null
          communication_style: string | null
          created_at: string | null
          currency: string | null
          id: string
          personalization_enabled: boolean | null
          preferred_language: string | null
          region: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          building_code?: string | null
          communication_style?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          personalization_enabled?: boolean | null
          preferred_language?: string | null
          region?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          building_code?: string | null
          communication_style?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          personalization_enabled?: boolean | null
          preferred_language?: string | null
          region?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_profile_canonical: {
        Row: {
          certifications: Json
          created_at: string
          derived: Json
          education: Json
          experiences: Json
          extracted_at: string | null
          preferences: Json
          skills: Json
          source_resume_id: string | null
          updated_at: string
          user_id: string
          work_auth: Json
        }
        Insert: {
          certifications?: Json
          created_at?: string
          derived?: Json
          education?: Json
          experiences?: Json
          extracted_at?: string | null
          preferences?: Json
          skills?: Json
          source_resume_id?: string | null
          updated_at?: string
          user_id: string
          work_auth?: Json
        }
        Update: {
          certifications?: Json
          created_at?: string
          derived?: Json
          education?: Json
          experiences?: Json
          extracted_at?: string | null
          preferences?: Json
          skills?: Json
          source_resume_id?: string | null
          updated_at?: string
          user_id?: string
          work_auth?: Json
        }
        Relationships: []
      }
      user_profile_data: {
        Row: {
          address: Json | null
          created_at: string
          default_answers: Json | null
          demographics: Json | null
          email: string | null
          legal_first_name: string | null
          legal_last_name: string | null
          links: Json | null
          phone: string | null
          preferred_name: string | null
          primary_resume_id: string | null
          updated_at: string
          user_id: string
          work_auth: Json | null
        }
        Insert: {
          address?: Json | null
          created_at?: string
          default_answers?: Json | null
          demographics?: Json | null
          email?: string | null
          legal_first_name?: string | null
          legal_last_name?: string | null
          links?: Json | null
          phone?: string | null
          preferred_name?: string | null
          primary_resume_id?: string | null
          updated_at?: string
          user_id: string
          work_auth?: Json | null
        }
        Update: {
          address?: Json | null
          created_at?: string
          default_answers?: Json | null
          demographics?: Json | null
          email?: string | null
          legal_first_name?: string | null
          legal_last_name?: string | null
          links?: Json | null
          phone?: string | null
          preferred_name?: string | null
          primary_resume_id?: string | null
          updated_at?: string
          user_id?: string
          work_auth?: Json | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          allow_personalization: boolean | null
          created_at: string | null
          desktop_notifications: boolean | null
          email_marketing: boolean | null
          email_system_alerts: boolean | null
          email_usage_warnings: boolean | null
          email_weekly_summary: boolean | null
          has_accepted_terms: boolean | null
          has_completed_tutorial: boolean | null
          id: string
          in_app_sounds: boolean | null
          share_anonymous_data: boolean | null
          store_chat_history: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          allow_personalization?: boolean | null
          created_at?: string | null
          desktop_notifications?: boolean | null
          email_marketing?: boolean | null
          email_system_alerts?: boolean | null
          email_usage_warnings?: boolean | null
          email_weekly_summary?: boolean | null
          has_accepted_terms?: boolean | null
          has_completed_tutorial?: boolean | null
          id?: string
          in_app_sounds?: boolean | null
          share_anonymous_data?: boolean | null
          store_chat_history?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          allow_personalization?: boolean | null
          created_at?: string | null
          desktop_notifications?: boolean | null
          email_marketing?: boolean | null
          email_system_alerts?: boolean | null
          email_usage_warnings?: boolean | null
          email_weekly_summary?: boolean | null
          has_accepted_terms?: boolean | null
          has_completed_tutorial?: boolean | null
          id?: string
          in_app_sounds?: boolean | null
          share_anonymous_data?: boolean | null
          store_chat_history?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          created_at: string | null
          current_period_end: string | null
          id: string
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_tier: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_period_end?: string | null
          id?: string
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_tier?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_period_end?: string | null
          id?: string
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_tier?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_usage_daily: {
        Row: {
          date: string
          engineering_count: number
          id: string
          intent_breakdown: Json | null
          message_count: number
          total_cost_usd: number
          total_tokens: number
          updated_at: string
          user_id: string
        }
        Insert: {
          date?: string
          engineering_count?: number
          id?: string
          intent_breakdown?: Json | null
          message_count?: number
          total_cost_usd?: number
          total_tokens?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          date?: string
          engineering_count?: number
          id?: string
          intent_breakdown?: Json | null
          message_count?: number
          total_cost_usd?: number
          total_tokens?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      visitor_analytics: {
        Row: {
          browser: string | null
          city: string | null
          country: string | null
          country_code: string | null
          created_at: string
          device_type: string | null
          id: string
          os: string | null
          page_path: string
          referrer: string | null
          region: string | null
          session_id: string | null
          updated_at: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          visitor_id: string
        }
        Insert: {
          browser?: string | null
          city?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          device_type?: string | null
          id?: string
          os?: string | null
          page_path: string
          referrer?: string | null
          region?: string | null
          session_id?: string | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_id: string
        }
        Update: {
          browser?: string | null
          city?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          device_type?: string | null
          id?: string
          os?: string | null
          page_path?: string
          referrer?: string | null
          region?: string | null
          session_id?: string | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      admin_visitor_analytics_summary: {
        Row: {
          last_event_at: string | null
          this_month_views: number | null
          this_month_visitors: number | null
          this_week_sessions: number | null
          this_week_views: number | null
          today_sessions: number | null
          today_views: number | null
          total_views: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_adjust_credits: {
        Args: { p_amount: number; p_reason: string; p_user_id: string }
        Returns: Json
      }
      admin_can_view_message_with_logging: {
        Args: { message_user_id: string }
        Returns: boolean
      }
      admin_clear_limit_override: { Args: { p_user_id: string }; Returns: Json }
      admin_employer_approve: {
        Args: { p_note?: string; p_user_id: string }
        Returns: Json
      }
      admin_employer_decline: {
        Args: { p_note: string; p_user_id: string }
        Returns: Json
      }
      admin_employer_override: {
        Args: { p_extend_days?: number; p_plan_key?: string; p_user_id: string }
        Returns: Json
      }
      admin_erase_account: {
        Args: { p_confirm_email: string; p_reason: string; p_user_id: string }
        Returns: Json
      }
      admin_erase_storage: { Args: { p_user_id: string }; Returns: number }
      admin_insert_ticket_message: {
        Args: { p_content: string; p_sender?: string; p_ticket_id: string }
        Returns: Json
      }
      admin_mark_candidates_stale: {
        Args: { p_user_ids: string[] }
        Returns: Json
      }
      admin_mark_inbox_read: {
        Args: { p_id: string; p_read: boolean }
        Returns: Json
      }
      admin_moderate_assessment: {
        Args: { p_id: string; p_note?: string }
        Returns: Json
      }
      admin_moderate_proposal: {
        Args: { p_action: string; p_id: string; p_note?: string }
        Returns: Json
      }
      admin_purge_account: {
        Args: { p_confirm_email: string; p_reason: string; p_user_id: string }
        Returns: Json
      }
      admin_restore_account: { Args: { p_user_id: string }; Returns: Json }
      admin_set_admin_role: {
        Args: { p_grant: boolean; p_reason: string; p_user_id: string }
        Returns: Json
      }
      admin_set_feature_flag: {
        Args: { p_enabled: boolean; p_key: string }
        Returns: Json
      }
      admin_set_feature_message: {
        Args: { p_key: string; p_message: string }
        Returns: Json
      }
      admin_set_limit_override: {
        Args: {
          p_assessments_limit: number
          p_monthly_credits: number
          p_proposals_limit: number
          p_reason: string
          p_searches_limit: number
          p_user_id: string
        }
        Returns: Json
      }
      admin_set_pin: { Args: { p_hash: string }; Returns: Json }
      admin_set_restriction: {
        Args: {
          p_capability: string
          p_on: boolean
          p_reason?: string
          p_user_id: string
        }
        Returns: Json
      }
      admin_suspend_account: {
        Args: { p_reason: string; p_until?: string; p_user_id: string }
        Returns: Json
      }
      admin_unblock_user: {
        Args: { p_endpoint?: string; p_user_id: string }
        Returns: undefined
      }
      admin_update_plan: {
        Args: {
          p_active: boolean
          p_assessments_limit: number
          p_credits: number
          p_key: string
          p_name: string
          p_proposals_limit: number
          p_searches_limit: number
        }
        Returns: Json
      }
      admin_update_ticket: {
        Args: { p_data: Json; p_id: string }
        Returns: boolean
      }
      admin_upsert_system_config: {
        Args: { p_key: string; p_value: Json }
        Returns: boolean
      }
      admin_user_snapshot: { Args: { p_user_id: string }; Returns: Json }
      admin_view_contact_with_logging: { Args: never; Returns: boolean }
      backfill_missing_session_titles: { Args: never; Returns: number }
      billing_ensure: {
        Args: { _audience?: string; _user_id: string }
        Returns: {
          created_at: string
          current_period_end: string
          current_period_start: string
          plan_key: string
          status: string
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      check_api_rate_limit: {
        Args: {
          p_endpoint: string
          p_max_requests?: number
          p_user_id: string
          p_window_minutes?: number
        }
        Returns: {
          allowed: boolean
          remaining_requests: number
          reset_at: string
          retry_after_seconds: number
        }[]
      }
      check_contact_rate_limit: { Args: { _email: string }; Returns: boolean }
      check_emergency_shutdown: { Args: never; Returns: boolean }
      check_rate_limit: {
        Args: {
          _action_type: string
          _max_attempts?: number
          _window_minutes?: number
        }
        Returns: boolean
      }
      check_user_exists_by_email: {
        Args: { p_email: string }
        Returns: boolean
      }
      check_visitor_analytics_rate_limit: {
        Args: { _visitor_id: string }
        Returns: boolean
      }
      cleanup_location_data: { Args: never; Returns: undefined }
      cleanup_old_health_checks_v2: { Args: never; Returns: undefined }
      cleanup_old_health_metrics: { Args: never; Returns: undefined }
      cleanup_old_logs: { Args: never; Returns: Json }
      cleanup_old_security_logs: { Args: never; Returns: undefined }
      cleanup_old_system_reports: { Args: never; Returns: undefined }
      cleanup_security_data: { Args: never; Returns: undefined }
      cleanup_security_tables: { Args: never; Returns: undefined }
      cleanup_webhook_logs: { Args: never; Returns: undefined }
      credit_balance: { Args: { _user_id: string }; Returns: number }
      credit_grant: {
        Args: {
          _amount: number
          _reason: string
          _ref?: string
          _user_id: string
        }
        Returns: number
      }
      credit_spend: {
        Args: {
          _amount: number
          _reason: string
          _ref?: string
          _user_id: string
        }
        Returns: Json
      }
      detect_suspicious_ip: {
        Args: {
          _details?: Json
          _ip_address: unknown
          _severity?: string
          _threat_type: string
        }
        Returns: boolean
      }
      enhanced_rate_limit_check: {
        Args: {
          _action_type: string
          _max_attempts?: number
          _user_identifier?: string
          _window_minutes?: number
        }
        Returns: boolean
      }
      erase_account_core: {
        Args: { p_actor: string; p_reason: string; p_user_id: string }
        Returns: Json
      }
      generate_monthly_summaries: { Args: never; Returns: number }
      get_admin_account_detail: { Args: { p_user_id: string }; Returns: Json }
      get_admin_account_governance: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_admin_accounts: { Args: { p_search?: string }; Returns: Json }
      get_admin_activity_log: { Args: { p_limit?: number }; Returns: Json }
      get_admin_admins: { Args: never; Returns: Json }
      get_admin_ai_cost_stats: { Args: never; Returns: Json }
      get_admin_ai_usage: { Args: never; Returns: Json }
      get_admin_candidates: { Args: never; Returns: Json }
      get_admin_consent_gap: {
        Args: { p_privacy_version: string; p_terms_version: string }
        Returns: Json
      }
      get_admin_cookie_consent: { Args: never; Returns: Json }
      get_admin_email_audience: { Args: never; Returns: Json }
      get_admin_email_log: { Args: { p_limit?: number }; Returns: Json }
      get_admin_employers: { Args: never; Returns: Json }
      get_admin_error_monitoring: { Args: { p_limit?: number }; Returns: Json }
      get_admin_feature_flags: { Args: never; Returns: Json }
      get_admin_inbox: { Args: never; Returns: Json }
      get_admin_marketplace: { Args: never; Returns: Json }
      get_admin_moderation: { Args: { p_limit?: number }; Returns: Json }
      get_admin_money: { Args: never; Returns: Json }
      get_admin_overview: { Args: never; Returns: Json }
      get_admin_plans: { Args: never; Returns: Json }
      get_admin_rate_limit_stats: { Args: never; Returns: Json }
      get_admin_security_definer_audit: {
        Args: never
        Returns: {
          args: string
          granted_to: string
          proname: string
        }[]
      }
      get_admin_support_tickets: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Json
      }
      get_admin_system_config: { Args: never; Returns: Json }
      get_admin_terms_consent: { Args: never; Returns: Json }
      get_broadcast_recipients: {
        Args: { p_admin_id: string; p_audience: string }
        Returns: Json
      }
      get_feature_flags: { Args: never; Returns: Json }
      get_security_headers: { Args: never; Returns: Json }
      has_active_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_engineering_daily: { Args: { uid: string }; Returns: undefined }
      increment_engineering_monthly: {
        Args: { uid: string }
        Returns: undefined
      }
      increment_faq_helpful: { Args: { faq_id: string }; Returns: undefined }
      increment_faq_view: { Args: { faq_id: string }; Returns: undefined }
      increment_messages_daily: { Args: { uid: string }; Returns: undefined }
      increment_messages_monthly: { Args: { uid: string }; Returns: undefined }
      increment_usage: {
        Args: { _action_type?: string; _count?: number; _user_id: string }
        Returns: boolean
      }
      is_ip_blocked: { Args: { _ip_address: unknown }; Returns: boolean }
      legal_version_num: { Args: { p_version: string }; Returns: number }
      log_admin_action:
        | {
            Args: {
              _action: string
              _details?: Json
              _target_id?: string
              _target_table?: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_action_type: string
              p_details?: Json
              p_target_email?: string
              p_target_user_id?: string
            }
            Returns: string
          }
      log_chat_security_event: {
        Args: { _action: string; _details?: Json; _session_id?: string }
        Returns: undefined
      }
      log_llm_usage: {
        Args: {
          _fallback_reason?: string
          _input_tokens: number
          _intent_type: string
          _model_id: string
          _output_tokens: number
          _response_time_ms: number
          _user_id: string
          _was_fallback?: boolean
        }
        Returns: string
      }
      log_profiles_sensitive_access: {
        Args: {
          _accessed_fields?: string[]
          _additional_context?: Json
          _operation: string
          _user_id: string
        }
        Returns: undefined
      }
      log_security_event:
        | {
            Args: {
              _action: string
              _details?: Json
              _ip_address?: unknown
              _severity?: string
              _user_agent?: string
            }
            Returns: undefined
          }
        | {
            Args: {
              _action: string
              _details?: Json
              _severity?: string
              _user_agent?: string
            }
            Returns: undefined
          }
      log_sensitive_data_audit: {
        Args: { _details?: Json; _operation: string; _table_name: string }
        Returns: undefined
      }
      log_webhook_security_event: {
        Args: {
          p_action: string
          p_details?: Json
          p_endpoint: string
          p_severity?: string
          p_user_id?: string
        }
        Returns: undefined
      }
      mark_email_opened: { Args: { p_tracking_id: string }; Returns: undefined }
      match_candidates_by_embedding: {
        Args: {
          p_embedding: string
          p_ids: string[]
          p_limit?: number
          p_model: string
        }
        Returns: {
          headline: string
          location: string
          profile_text: string
          seniority: string
          similarity: number
          user_id: string
          years_experience: number
        }[]
      }
      record_cookie_consent: {
        Args: { p_choice: string; p_gpc?: boolean }
        Returns: undefined
      }
      record_device_fingerprint: {
        Args: {
          _device_info: Json
          _fingerprint_hash: string
          _user_id: string
        }
        Returns: string
      }
      refresh_daily_summaries: { Args: never; Returns: undefined }
      refresh_llm_cost_daily: { Args: { p_date?: string }; Returns: undefined }
      refresh_user_usage_daily: {
        Args: { p_date?: string }
        Returns: undefined
      }
      self_delete_account: { Args: { p_confirm_email: string }; Returns: Json }
      self_export_account: { Args: never; Returns: Json }
      self_list_sessions: { Args: never; Returns: Json }
      self_pause_account: { Args: never; Returns: Json }
      self_revoke_session: { Args: { p_session_id: string }; Returns: Json }
      ticket_belongs_to_caller: {
        Args: { p_guest_token?: string; p_ticket_id: string }
        Returns: boolean
      }
      trigger_emergency_alert: {
        Args: {
          _alert_level: string
          _alert_type: string
          _threat_assessment?: Json
          _trigger_reason: string
        }
        Returns: string
      }
      validate_input_sanitization: {
        Args: { input_text: string }
        Returns: boolean
      }
      validate_session_ownership: {
        Args: { _session_id: string; _user_id: string }
        Returns: boolean
      }
      validate_session_security: { Args: never; Returns: boolean }
      validate_system_security: { Args: never; Returns: Json }
      verify_encryption_configured: { Args: never; Returns: boolean }
    }
    Enums: {
      account_capability: "discovery" | "proposals" | "assessments" | "ai"
      app_role: "admin" | "user" | "duty"
      application_status:
        | "saved"
        | "applied"
        | "interview"
        | "offer"
        | "rejected"
      employer_status:
        | "pending_approval"
        | "approved"
        | "suspended"
        | "declined"
      support_ticket_category:
        | "general"
        | "billing"
        | "technical"
        | "feature_request"
        | "bug_report"
      support_ticket_priority: "low" | "medium" | "high" | "urgent"
      support_ticket_status:
        | "open"
        | "in_progress"
        | "waiting_reply"
        | "resolved"
        | "closed"
      ticket_sender_type: "user" | "admin" | "ai_bot"
      user_role: "job_seeker" | "employer"
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
      account_capability: ["discovery", "proposals", "assessments", "ai"],
      app_role: ["admin", "user", "duty"],
      application_status: [
        "saved",
        "applied",
        "interview",
        "offer",
        "rejected",
      ],
      employer_status: [
        "pending_approval",
        "approved",
        "suspended",
        "declined",
      ],
      support_ticket_category: [
        "general",
        "billing",
        "technical",
        "feature_request",
        "bug_report",
      ],
      support_ticket_priority: ["low", "medium", "high", "urgent"],
      support_ticket_status: [
        "open",
        "in_progress",
        "waiting_reply",
        "resolved",
        "closed",
      ],
      ticket_sender_type: ["user", "admin", "ai_bot"],
      user_role: ["job_seeker", "employer"],
    },
  },
} as const
