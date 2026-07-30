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
    PostgrestVersion: "13.0.5"
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
      agent_society_messages: {
        Row: {
          belief_score: number | null
          concrete_action: string | null
          created_at: string
          emotion: string | null
          emotion_intensity: number | null
          id: string
          inner_thought: string | null
          layer: number
          persona_category: string | null
          persona_id: string
          persona_name: string | null
          public_statement: string | null
          round: number
          run_id: string
          user_id: string
        }
        Insert: {
          belief_score?: number | null
          concrete_action?: string | null
          created_at?: string
          emotion?: string | null
          emotion_intensity?: number | null
          id?: string
          inner_thought?: string | null
          layer: number
          persona_category?: string | null
          persona_id: string
          persona_name?: string | null
          public_statement?: string | null
          round?: number
          run_id: string
          user_id: string
        }
        Update: {
          belief_score?: number | null
          concrete_action?: string | null
          created_at?: string
          emotion?: string | null
          emotion_intensity?: number | null
          id?: string
          inner_thought?: string | null
          layer?: number
          persona_category?: string | null
          persona_id?: string
          persona_name?: string | null
          public_statement?: string | null
          round?: number
          run_id?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_society_news_feed: {
        Row: {
          agents_affected: number | null
          category: string | null
          created_at: string
          headline: string
          id: string
          source: string | null
          summary: string | null
          url: string | null
          user_id: string
        }
        Insert: {
          agents_affected?: number | null
          category?: string | null
          created_at?: string
          headline: string
          id?: string
          source?: string | null
          summary?: string | null
          url?: string | null
          user_id: string
        }
        Update: {
          agents_affected?: number | null
          category?: string | null
          created_at?: string
          headline?: string
          id?: string
          source?: string | null
          summary?: string | null
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      agent_society_runs: {
        Row: {
          agent_count: number
          completed_at: string | null
          created_at: string
          current_layer: number | null
          depth: string
          duration_ms: number | null
          error: string | null
          id: string
          question: string
          report: Json | null
          report_type: string
          seed: string
          status: string
          user_id: string
          user_target: Json | null
        }
        Insert: {
          agent_count?: number
          completed_at?: string | null
          created_at?: string
          current_layer?: number | null
          depth?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          question: string
          report?: Json | null
          report_type?: string
          seed: string
          status?: string
          user_id: string
          user_target?: Json | null
        }
        Update: {
          agent_count?: number
          completed_at?: string | null
          created_at?: string
          current_layer?: number | null
          depth?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          question?: string
          report?: Json | null
          report_type?: string
          seed?: string
          status?: string
          user_id?: string
          user_target?: Json | null
        }
        Relationships: []
      }
      agent_society_state: {
        Row: {
          belief_score: number | null
          emotion: string | null
          emotion_intensity: number | null
          id: string
          persona_id: string
          recent_summary: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          belief_score?: number | null
          emotion?: string | null
          emotion_intensity?: number | null
          id?: string
          persona_id: string
          recent_summary?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          belief_score?: number | null
          emotion?: string | null
          emotion_intensity?: number | null
          id?: string
          persona_id?: string
          recent_summary?: string | null
          updated_at?: string
          user_id?: string
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
      ayn_business_news: {
        Row: {
          country_code: string | null
          fetched_at: string | null
          headlines: Json | null
          id: string
          sector: string | null
          sentiment: string | null
          singleton_key: number | null
          summary: string | null
        }
        Insert: {
          country_code?: string | null
          fetched_at?: string | null
          headlines?: Json | null
          id?: string
          sector?: string | null
          sentiment?: string | null
          singleton_key?: number | null
          summary?: string | null
        }
        Update: {
          country_code?: string | null
          fetched_at?: string | null
          headlines?: Json | null
          id?: string
          sector?: string | null
          sentiment?: string | null
          singleton_key?: number | null
          summary?: string | null
        }
        Relationships: []
      }
      ayn_consumer_sentiment: {
        Row: {
          confidence_index: Json | null
          country_code: string
          country_name: string
          cutting_spending: Json | null
          debt_levels: Json | null
          fetched_at: string | null
          id: string
          intelligence_brief: Json | null
          saving_rate: Json | null
          spending_trends: Json | null
          top_purchases: Json | null
        }
        Insert: {
          confidence_index?: Json | null
          country_code: string
          country_name: string
          cutting_spending?: Json | null
          debt_levels?: Json | null
          fetched_at?: string | null
          id?: string
          intelligence_brief?: Json | null
          saving_rate?: Json | null
          spending_trends?: Json | null
          top_purchases?: Json | null
        }
        Update: {
          confidence_index?: Json | null
          country_code?: string
          country_name?: string
          cutting_spending?: Json | null
          debt_levels?: Json | null
          fetched_at?: string | null
          id?: string
          intelligence_brief?: Json | null
          saving_rate?: Json | null
          spending_trends?: Json | null
          top_purchases?: Json | null
        }
        Relationships: []
      }
      ayn_country_intelligence: {
        Row: {
          business_climate: Json | null
          consumer: Json | null
          country_code: string
          country_name: string
          economy: Json | null
          emerging: Json | null
          fetched_at: string | null
          government: Json | null
          health_sector: Json | null
          hot_sectors: Json | null
          id: string
          intelligence_brief: Json | null
          job_market: Json | null
          opportunities: Json | null
          region: string
        }
        Insert: {
          business_climate?: Json | null
          consumer?: Json | null
          country_code: string
          country_name: string
          economy?: Json | null
          emerging?: Json | null
          fetched_at?: string | null
          government?: Json | null
          health_sector?: Json | null
          hot_sectors?: Json | null
          id?: string
          intelligence_brief?: Json | null
          job_market?: Json | null
          opportunities?: Json | null
          region: string
        }
        Update: {
          business_climate?: Json | null
          consumer?: Json | null
          country_code?: string
          country_name?: string
          economy?: Json | null
          emerging?: Json | null
          fetched_at?: string | null
          government?: Json | null
          health_sector?: Json | null
          hot_sectors?: Json | null
          id?: string
          intelligence_brief?: Json | null
          job_market?: Json | null
          opportunities?: Json | null
          region?: string
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
      ayn_geopolitical: {
        Row: {
          active_conflicts: Json | null
          elections_upcoming: Json | null
          fetched_at: string | null
          id: string
          intelligence_brief: Json | null
          risk_by_region: Json | null
          sanctions: Json | null
          singleton_key: number | null
          trade_tensions: Json | null
        }
        Insert: {
          active_conflicts?: Json | null
          elections_upcoming?: Json | null
          fetched_at?: string | null
          id?: string
          intelligence_brief?: Json | null
          risk_by_region?: Json | null
          sanctions?: Json | null
          singleton_key?: number | null
          trade_tensions?: Json | null
        }
        Update: {
          active_conflicts?: Json | null
          elections_upcoming?: Json | null
          fetched_at?: string | null
          id?: string
          intelligence_brief?: Json | null
          risk_by_region?: Json | null
          sanctions?: Json | null
          singleton_key?: number | null
          trade_tensions?: Json | null
        }
        Relationships: []
      }
      ayn_gov_policies: {
        Row: {
          central_bank: Json | null
          country_code: string
          country_name: string
          elections: Json | null
          fetched_at: string | null
          id: string
          intelligence_brief: Json | null
          regulations: Json | null
          tax_policy: Json | null
          trade_policy: Json | null
        }
        Insert: {
          central_bank?: Json | null
          country_code: string
          country_name: string
          elections?: Json | null
          fetched_at?: string | null
          id?: string
          intelligence_brief?: Json | null
          regulations?: Json | null
          tax_policy?: Json | null
          trade_policy?: Json | null
        }
        Update: {
          central_bank?: Json | null
          country_code?: string
          country_name?: string
          elections?: Json | null
          fetched_at?: string | null
          id?: string
          intelligence_brief?: Json | null
          regulations?: Json | null
          tax_policy?: Json | null
          trade_policy?: Json | null
        }
        Relationships: []
      }
      ayn_health_intel: {
        Row: {
          country_code: string
          country_name: string
          digital_health: Json | null
          drug_pipeline: Json | null
          fetched_at: string | null
          gaps: Json | null
          growth_areas: Json | null
          id: string
          intelligence_brief: Json | null
          market_size: Json | null
          mental_health: Json | null
        }
        Insert: {
          country_code: string
          country_name: string
          digital_health?: Json | null
          drug_pipeline?: Json | null
          fetched_at?: string | null
          gaps?: Json | null
          growth_areas?: Json | null
          id?: string
          intelligence_brief?: Json | null
          market_size?: Json | null
          mental_health?: Json | null
        }
        Update: {
          country_code?: string
          country_name?: string
          digital_health?: Json | null
          drug_pipeline?: Json | null
          fetched_at?: string | null
          gaps?: Json | null
          growth_areas?: Json | null
          id?: string
          intelligence_brief?: Json | null
          market_size?: Json | null
          mental_health?: Json | null
        }
        Relationships: []
      }
      ayn_job_market: {
        Row: {
          country_code: string
          country_name: string
          fetched_at: string | null
          hiring_sectors: Json | null
          id: string
          intelligence_brief: Json | null
          layoff_sectors: Json | null
          remote_trends: Json | null
          salary_trends: Json | null
          top_roles: Json | null
          top_skills: Json | null
        }
        Insert: {
          country_code: string
          country_name: string
          fetched_at?: string | null
          hiring_sectors?: Json | null
          id?: string
          intelligence_brief?: Json | null
          layoff_sectors?: Json | null
          remote_trends?: Json | null
          salary_trends?: Json | null
          top_roles?: Json | null
          top_skills?: Json | null
        }
        Update: {
          country_code?: string
          country_name?: string
          fetched_at?: string | null
          hiring_sectors?: Json | null
          id?: string
          intelligence_brief?: Json | null
          layoff_sectors?: Json | null
          remote_trends?: Json | null
          salary_trends?: Json | null
          top_roles?: Json | null
          top_skills?: Json | null
        }
        Relationships: []
      }
      ayn_market_prices: {
        Row: {
          agriculture: Json | null
          correlations: Json | null
          crypto: Json | null
          currencies: Json | null
          energy: Json | null
          fetched_at: string | null
          id: string
          indices: Json | null
          metals: Json | null
          narrative: Json | null
          singleton_key: number | null
        }
        Insert: {
          agriculture?: Json | null
          correlations?: Json | null
          crypto?: Json | null
          currencies?: Json | null
          energy?: Json | null
          fetched_at?: string | null
          id?: string
          indices?: Json | null
          metals?: Json | null
          narrative?: Json | null
          singleton_key?: number | null
        }
        Update: {
          agriculture?: Json | null
          correlations?: Json | null
          crypto?: Json | null
          currencies?: Json | null
          energy?: Json | null
          fetched_at?: string | null
          id?: string
          indices?: Json | null
          metals?: Json | null
          narrative?: Json | null
          singleton_key?: number | null
        }
        Relationships: []
      }
      ayn_market_snapshot: {
        Row: {
          fetch_errors: string[] | null
          fetched_at: string
          id: string
          singleton_key: number | null
          snapshot: Json
          sources_used: string[] | null
        }
        Insert: {
          fetch_errors?: string[] | null
          fetched_at?: string
          id?: string
          singleton_key?: number | null
          snapshot?: Json
          sources_used?: string[] | null
        }
        Update: {
          fetch_errors?: string[] | null
          fetched_at?: string
          id?: string
          singleton_key?: number | null
          snapshot?: Json
          sources_used?: string[] | null
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
      ayn_prediction_outcomes: {
        Row: {
          accuracy_score: number | null
          actual_date: string | null
          actual_direction: string | null
          actual_pct_change: number | null
          actual_value: number | null
          data_source: string | null
          error_magnitude: string | null
          id: string
          prediction_id: string
          range_hit: boolean | null
          resolved_at: string
          value_error_pct: number | null
          was_direction_correct: boolean | null
          what_happened: string | null
        }
        Insert: {
          accuracy_score?: number | null
          actual_date?: string | null
          actual_direction?: string | null
          actual_pct_change?: number | null
          actual_value?: number | null
          data_source?: string | null
          error_magnitude?: string | null
          id?: string
          prediction_id: string
          range_hit?: boolean | null
          resolved_at?: string
          value_error_pct?: number | null
          was_direction_correct?: boolean | null
          what_happened?: string | null
        }
        Update: {
          accuracy_score?: number | null
          actual_date?: string | null
          actual_direction?: string | null
          actual_pct_change?: number | null
          actual_value?: number | null
          data_source?: string | null
          error_magnitude?: string | null
          id?: string
          prediction_id?: string
          range_hit?: boolean | null
          resolved_at?: string
          value_error_pct?: number | null
          was_direction_correct?: boolean | null
          what_happened?: string | null
        }
        Relationships: []
      }
      ayn_real_estate: {
        Row: {
          commercial: Json | null
          cooling_markets: Json | null
          country_code: string
          country_name: string
          fetched_at: string | null
          hot_cities: Json | null
          id: string
          intelligence_brief: Json | null
          rental_yields: Json | null
          residential: Json | null
        }
        Insert: {
          commercial?: Json | null
          cooling_markets?: Json | null
          country_code: string
          country_name: string
          fetched_at?: string | null
          hot_cities?: Json | null
          id?: string
          intelligence_brief?: Json | null
          rental_yields?: Json | null
          residential?: Json | null
        }
        Update: {
          commercial?: Json | null
          cooling_markets?: Json | null
          country_code?: string
          country_name?: string
          fetched_at?: string | null
          hot_cities?: Json | null
          id?: string
          intelligence_brief?: Json | null
          rental_yields?: Json | null
          residential?: Json | null
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
      ayn_sector_intel: {
        Row: {
          dying_trends: Json | null
          fetched_at: string | null
          growth_rate: string | null
          hot_markets: Json | null
          id: string
          intelligence_brief: Json | null
          new_entrants: Json | null
          opportunities: Json | null
          sector: string
        }
        Insert: {
          dying_trends?: Json | null
          fetched_at?: string | null
          growth_rate?: string | null
          hot_markets?: Json | null
          id?: string
          intelligence_brief?: Json | null
          new_entrants?: Json | null
          opportunities?: Json | null
          sector: string
        }
        Update: {
          dying_trends?: Json | null
          fetched_at?: string | null
          growth_rate?: string | null
          hot_markets?: Json | null
          id?: string
          intelligence_brief?: Json | null
          new_entrants?: Json | null
          opportunities?: Json | null
          sector?: string
        }
        Relationships: []
      }
      ayn_startup_intel: {
        Row: {
          big_rounds: Json | null
          dead_trends: Json | null
          emerging_themes: Json | null
          exits: Json | null
          fetched_at: string | null
          hot_sectors: Json | null
          id: string
          intelligence_brief: Json | null
          singleton_key: number | null
        }
        Insert: {
          big_rounds?: Json | null
          dead_trends?: Json | null
          emerging_themes?: Json | null
          exits?: Json | null
          fetched_at?: string | null
          hot_sectors?: Json | null
          id?: string
          intelligence_brief?: Json | null
          singleton_key?: number | null
        }
        Update: {
          big_rounds?: Json | null
          dead_trends?: Json | null
          emerging_themes?: Json | null
          exits?: Json | null
          fetched_at?: string | null
          hot_sectors?: Json | null
          id?: string
          intelligence_brief?: Json | null
          singleton_key?: number | null
        }
        Relationships: []
      }
      ayn_supply_chain: {
        Row: {
          bottlenecks: Json | null
          fetched_at: string | null
          id: string
          intelligence_brief: Json | null
          inventory_signals: Json | null
          port_congestion: Json | null
          risk_alerts: Json | null
          shipping_rates: Json | null
          singleton_key: number | null
        }
        Insert: {
          bottlenecks?: Json | null
          fetched_at?: string | null
          id?: string
          intelligence_brief?: Json | null
          inventory_signals?: Json | null
          port_congestion?: Json | null
          risk_alerts?: Json | null
          shipping_rates?: Json | null
          singleton_key?: number | null
        }
        Update: {
          bottlenecks?: Json | null
          fetched_at?: string | null
          id?: string
          intelligence_brief?: Json | null
          inventory_signals?: Json | null
          port_congestion?: Json | null
          risk_alerts?: Json | null
          shipping_rates?: Json | null
          singleton_key?: number | null
        }
        Relationships: []
      }
      ayn_tech_disruption: {
        Row: {
          ai_developments: Json | null
          disrupted_industries: Json | null
          emerging_tech: Json | null
          fetched_at: string | null
          id: string
          intelligence_brief: Json | null
          patents_filed: Json | null
          rd_leaders: Json | null
          singleton_key: number | null
        }
        Insert: {
          ai_developments?: Json | null
          disrupted_industries?: Json | null
          emerging_tech?: Json | null
          fetched_at?: string | null
          id?: string
          intelligence_brief?: Json | null
          patents_filed?: Json | null
          rd_leaders?: Json | null
          singleton_key?: number | null
        }
        Update: {
          ai_developments?: Json | null
          disrupted_industries?: Json | null
          emerging_tech?: Json | null
          fetched_at?: string | null
          id?: string
          intelligence_brief?: Json | null
          patents_filed?: Json | null
          rd_leaders?: Json | null
          singleton_key?: number | null
        }
        Relationships: []
      }
      ayn_trade_flows: {
        Row: {
          country_code: string
          country_name: string
          dependencies: Json | null
          fetched_at: string | null
          id: string
          intelligence_brief: Json | null
          opportunities: Json | null
          top_exports: Json | null
          top_imports: Json | null
          trade_balance: Json | null
        }
        Insert: {
          country_code: string
          country_name: string
          dependencies?: Json | null
          fetched_at?: string | null
          id?: string
          intelligence_brief?: Json | null
          opportunities?: Json | null
          top_exports?: Json | null
          top_imports?: Json | null
          trade_balance?: Json | null
        }
        Update: {
          country_code?: string
          country_name?: string
          dependencies?: Json | null
          fetched_at?: string | null
          id?: string
          intelligence_brief?: Json | null
          opportunities?: Json | null
          top_exports?: Json | null
          top_imports?: Json | null
          trade_balance?: Json | null
        }
        Relationships: []
      }
      ayn_world_signals: {
        Row: {
          ancient_parallel: string | null
          biblical_parallel: string | null
          confidence_impact: number | null
          countries_involved: string[] | null
          created_at: string | null
          headline: string
          historical_parallel: string | null
          id: string
          impact_on_btc: string | null
          impact_on_equities: string | null
          impact_on_gold: string | null
          impact_on_oil: string | null
          impact_on_usd: string | null
          overrides_regime: boolean | null
          region: string | null
          severity: string
          signal_date: string
          signal_type: string
          source_url: string | null
          status: string | null
          summary: string | null
          verified: boolean | null
        }
        Insert: {
          ancient_parallel?: string | null
          biblical_parallel?: string | null
          confidence_impact?: number | null
          countries_involved?: string[] | null
          created_at?: string | null
          headline: string
          historical_parallel?: string | null
          id?: string
          impact_on_btc?: string | null
          impact_on_equities?: string | null
          impact_on_gold?: string | null
          impact_on_oil?: string | null
          impact_on_usd?: string | null
          overrides_regime?: boolean | null
          region?: string | null
          severity?: string
          signal_date?: string
          signal_type: string
          source_url?: string | null
          status?: string | null
          summary?: string | null
          verified?: boolean | null
        }
        Update: {
          ancient_parallel?: string | null
          biblical_parallel?: string | null
          confidence_impact?: number | null
          countries_involved?: string[] | null
          created_at?: string | null
          headline?: string
          historical_parallel?: string | null
          id?: string
          impact_on_btc?: string | null
          impact_on_equities?: string | null
          impact_on_gold?: string | null
          impact_on_oil?: string | null
          impact_on_usd?: string | null
          overrides_regime?: boolean | null
          region?: string | null
          severity?: string
          signal_date?: string
          signal_type?: string
          source_url?: string | null
          status?: string | null
          summary?: string | null
          verified?: boolean | null
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
          embedding_model: string
          headline: string | null
          indexed_at: string
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
          embedding_model?: string
          headline?: string | null
          indexed_at?: string
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
          embedding_model?: string
          headline?: string | null
          indexed_at?: string
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
      custom_orders: {
        Row: {
          additional_services: string | null
          admin_signature_url: string | null
          admin_signed_at: string | null
          after_sale_services: string | null
          client_responsibilities: string | null
          client_signature_url: string | null
          client_signed_at: string | null
          client_viewed_at: string | null
          company_address: string | null
          company_email: string
          company_name: string
          company_phone: string | null
          contact_person: string
          contract_pdf_url: string | null
          created_at: string
          created_by: string | null
          currency: string
          delivery_timeline: string | null
          discount_percent: number | null
          email_open_count: number | null
          email_opened_at: string | null
          email_sent_at: string | null
          governing_law: string | null
          id: string
          last_opened_at: string | null
          loyalty_discount: string | null
          notes: string | null
          order_description: string | null
          order_title: string
          out_of_scope: string | null
          paid_at: string | null
          payment_split: string | null
          payment_terms: string | null
          phase_breakdown: Json | null
          privacy_notes: string | null
          receipt_sent_at: string | null
          scope_of_work: string | null
          services: Json
          signing_token: string | null
          status: string
          stripe_payment_id: string | null
          stripe_payment_link: string | null
          subtotal: number
          system_plan: string | null
          tax_percent: number | null
          termination_clause: string | null
          terms_and_conditions: string | null
          total_amount: number
          updated_at: string
          warranty: string | null
        }
        Insert: {
          additional_services?: string | null
          admin_signature_url?: string | null
          admin_signed_at?: string | null
          after_sale_services?: string | null
          client_responsibilities?: string | null
          client_signature_url?: string | null
          client_signed_at?: string | null
          client_viewed_at?: string | null
          company_address?: string | null
          company_email: string
          company_name: string
          company_phone?: string | null
          contact_person: string
          contract_pdf_url?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          delivery_timeline?: string | null
          discount_percent?: number | null
          email_open_count?: number | null
          email_opened_at?: string | null
          email_sent_at?: string | null
          governing_law?: string | null
          id?: string
          last_opened_at?: string | null
          loyalty_discount?: string | null
          notes?: string | null
          order_description?: string | null
          order_title: string
          out_of_scope?: string | null
          paid_at?: string | null
          payment_split?: string | null
          payment_terms?: string | null
          phase_breakdown?: Json | null
          privacy_notes?: string | null
          receipt_sent_at?: string | null
          scope_of_work?: string | null
          services?: Json
          signing_token?: string | null
          status?: string
          stripe_payment_id?: string | null
          stripe_payment_link?: string | null
          subtotal?: number
          system_plan?: string | null
          tax_percent?: number | null
          termination_clause?: string | null
          terms_and_conditions?: string | null
          total_amount?: number
          updated_at?: string
          warranty?: string | null
        }
        Update: {
          additional_services?: string | null
          admin_signature_url?: string | null
          admin_signed_at?: string | null
          after_sale_services?: string | null
          client_responsibilities?: string | null
          client_signature_url?: string | null
          client_signed_at?: string | null
          client_viewed_at?: string | null
          company_address?: string | null
          company_email?: string
          company_name?: string
          company_phone?: string | null
          contact_person?: string
          contract_pdf_url?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          delivery_timeline?: string | null
          discount_percent?: number | null
          email_open_count?: number | null
          email_opened_at?: string | null
          email_sent_at?: string | null
          governing_law?: string | null
          id?: string
          last_opened_at?: string | null
          loyalty_discount?: string | null
          notes?: string | null
          order_description?: string | null
          order_title?: string
          out_of_scope?: string | null
          paid_at?: string | null
          payment_split?: string | null
          payment_terms?: string | null
          phase_breakdown?: Json | null
          privacy_notes?: string | null
          receipt_sent_at?: string | null
          scope_of_work?: string | null
          services?: Json
          signing_token?: string | null
          status?: string
          stripe_payment_id?: string | null
          stripe_payment_link?: string | null
          subtotal?: number
          system_plan?: string | null
          tax_percent?: number | null
          termination_clause?: string | null
          terms_and_conditions?: string | null
          total_amount?: number
          updated_at?: string
          warranty?: string | null
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
          package_notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["employer_status"]
          updated_at?: string
          user_id?: string
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
      nda_agreements: {
        Row: {
          additional_clauses: string | null
          admin_signature_url: string | null
          admin_signed_at: string | null
          client_signature_url: string | null
          client_signed_at: string | null
          client_viewed_at: string | null
          company_address: string | null
          company_email: string
          company_name: string
          company_phone: string | null
          confidential_info: string | null
          contact_person: string
          created_at: string | null
          created_by: string | null
          duration: string | null
          email_sent_at: string | null
          exclusions: string | null
          governing_law: string | null
          id: string
          nda_purpose: string | null
          notes: string | null
          obligations: string | null
          signing_token: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          additional_clauses?: string | null
          admin_signature_url?: string | null
          admin_signed_at?: string | null
          client_signature_url?: string | null
          client_signed_at?: string | null
          client_viewed_at?: string | null
          company_address?: string | null
          company_email: string
          company_name: string
          company_phone?: string | null
          confidential_info?: string | null
          contact_person: string
          created_at?: string | null
          created_by?: string | null
          duration?: string | null
          email_sent_at?: string | null
          exclusions?: string | null
          governing_law?: string | null
          id?: string
          nda_purpose?: string | null
          notes?: string | null
          obligations?: string | null
          signing_token?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          additional_clauses?: string | null
          admin_signature_url?: string | null
          admin_signed_at?: string | null
          client_signature_url?: string | null
          client_signed_at?: string | null
          client_viewed_at?: string | null
          company_address?: string | null
          company_email?: string
          company_name?: string
          company_phone?: string | null
          confidential_info?: string | null
          contact_person?: string
          created_at?: string | null
          created_by?: string | null
          duration?: string | null
          email_sent_at?: string | null
          exclusions?: string | null
          governing_law?: string | null
          id?: string
          nda_purpose?: string | null
          notes?: string | null
          obligations?: string | null
          signing_token?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
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
          created_at: string
          created_by: string | null
          id: string
          name: string
          website: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          website?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
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
          candidate_user_id: string
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
          candidate_user_id: string
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
          candidate_user_id?: string
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
          privacy_accepted: boolean
          terms_accepted: boolean
          terms_version: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          ai_disclaimer_accepted?: boolean
          id?: string
          privacy_accepted?: boolean
          terms_accepted?: boolean
          terms_version?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          ai_disclaimer_accepted?: boolean
          id?: string
          privacy_accepted?: boolean
          terms_accepted?: boolean
          terms_version?: string
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
      world_personas: {
        Row: {
          active: boolean
          age: number | null
          beliefs: string | null
          biases: string | null
          bio: string | null
          category: string
          country: string | null
          created_at: string
          culture: string | null
          ethnicity: string | null
          flag: string | null
          gender: string | null
          id: string
          income_class: string | null
          layer: number
          name: string
          occupation: string | null
          region: string | null
          religion: string | null
          speaking_style: string | null
          subcategory: string | null
        }
        Insert: {
          active?: boolean
          age?: number | null
          beliefs?: string | null
          biases?: string | null
          bio?: string | null
          category: string
          country?: string | null
          created_at?: string
          culture?: string | null
          ethnicity?: string | null
          flag?: string | null
          gender?: string | null
          id: string
          income_class?: string | null
          layer?: number
          name: string
          occupation?: string | null
          region?: string | null
          religion?: string | null
          speaking_style?: string | null
          subcategory?: string | null
        }
        Update: {
          active?: boolean
          age?: number | null
          beliefs?: string | null
          biases?: string | null
          bio?: string | null
          category?: string
          country?: string | null
          created_at?: string
          culture?: string | null
          ethnicity?: string | null
          flag?: string | null
          gender?: string | null
          id?: string
          income_class?: string | null
          layer?: number
          name?: string
          occupation?: string | null
          region?: string | null
          religion?: string | null
          speaking_style?: string | null
          subcategory?: string | null
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
      ayn_accuracy_dashboard: {
        Row: {
          accuracy_30d_pct: number | null
          avg_accuracy_score: number | null
          avg_value_error_pct: number | null
          best_asset: string | null
          correct_30d: number | null
          direction_accuracy_pct: number | null
          direction_correct: number | null
          direction_wrong: number | null
          resolved_30d: number | null
          total_resolved: number | null
          total_world: number | null
          world_accuracy_pct: number | null
          world_correct: number | null
          world_pending: number | null
          world_wrong: number | null
        }
        Relationships: []
      }
      ayn_prediction_context: {
        Row: {
          market_regime_json: string | null
          recent_signals: Json | null
          track_record: Json | null
          wisdom_frameworks: Json | null
        }
        Relationships: []
      }
      ayn_prediction_scorecard: {
        Row: {
          accuracy_pct: number | null
          avg_accuracy_score: number | null
          avg_coherence: number | null
          correct: number | null
          happening_now: number | null
          last_verified_at: string | null
          partial: number | null
          pending: number | null
          total_checked: number | null
          total_predictions: number | null
          wrong: number | null
        }
        Relationships: []
      }
      ayn_prediction_vote_counts: {
        Row: {
          agree_count: number | null
          disagree_count: number | null
          prediction_id: string | null
          total_votes: number | null
        }
        Relationships: []
      }
      ayn_system_accuracy_dashboard: {
        Row: {
          accuracy_pct: number | null
          avg_score: number | null
          category: string | null
          correct: number | null
          correct_30d: number | null
          grade: string | null
          total_30d: number | null
          total_resolved: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_bonus_credits: {
        Args: {
          p_amount: number
          p_gift_type?: string
          p_given_by?: string
          p_reason: string
          p_user_id: string
        }
        Returns: undefined
      }
      admin_can_view_message_with_logging: {
        Args: { message_user_id: string }
        Returns: boolean
      }
      admin_delete_custom_order: { Args: { p_id: string }; Returns: boolean }
      admin_insert_ticket_message: {
        Args: { p_content: string; p_sender?: string; p_ticket_id: string }
        Returns: Json
      }
      admin_unblock_user: {
        Args: { p_endpoint?: string; p_user_id: string }
        Returns: undefined
      }
      admin_update_ticket: {
        Args: { p_data: Json; p_id: string }
        Returns: boolean
      }
      admin_upsert_custom_order: {
        Args: { p_data: Json; p_id?: string }
        Returns: Json
      }
      admin_upsert_system_config: {
        Args: { p_key: string; p_value: Json }
        Returns: boolean
      }
      admin_view_contact_with_logging: { Args: never; Returns: boolean }
      apply_credit_topup: {
        Args: { _credits?: number; _user_id: string }
        Returns: Json
      }
      ayn_adjust_trust: {
        Args: { p_agent_id: string; p_delta: number; p_target: string }
        Returns: undefined
      }
      backfill_missing_session_titles: { Args: never; Returns: number }
      call_agent_if_not_debounced: {
        Args: {
          p_agent_name: string
          p_debounce_seconds?: number
          p_function_name: string
          p_payload?: Json
        }
        Returns: undefined
      }
      cc_lookup_user_by_email: { Args: { p_email: string }; Returns: string }
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
      check_application_rate_limit: {
        Args: { _email: string }
        Returns: boolean
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
      check_usage_limit: { Args: { _user_id: string }; Returns: boolean }
      check_user_ai_limit: {
        Args: { _intent_type?: string; _user_id: string }
        Returns: Json
      }
      check_user_exists_by_email: {
        Args: { p_email: string }
        Returns: boolean
      }
      check_visitor_analytics_rate_limit: {
        Args: { _visitor_id: string }
        Returns: boolean
      }
      check_webhook_rate_limit: {
        Args: { p_endpoint: string; p_user_id: string }
        Returns: boolean
      }
      cleanup_expired_memories: { Args: never; Returns: number }
      cleanup_location_data: { Args: never; Returns: undefined }
      cleanup_old_health_checks_v2: { Args: never; Returns: undefined }
      cleanup_old_health_metrics: { Args: never; Returns: undefined }
      cleanup_old_logs: { Args: never; Returns: Json }
      cleanup_old_security_logs: { Args: never; Returns: undefined }
      cleanup_old_system_reports: { Args: never; Returns: undefined }
      cleanup_security_data: { Args: never; Returns: undefined }
      cleanup_security_tables: { Args: never; Returns: undefined }
      cleanup_webhook_logs: { Args: never; Returns: undefined }
      create_system_alert: {
        Args: {
          p_alert_type: string
          p_content: string
          p_metadata?: Json
          p_recipient_email: string
          p_subject: string
          p_user_id?: string
        }
        Returns: string
      }
      decrypt_email: {
        Args: { encrypted_email: string; encryption_key: string }
        Returns: string
      }
      decrypt_text: {
        Args: { encrypted_data: string; encryption_key: string }
        Returns: string
      }
      delete_user_chat_sessions: {
        Args: { _session_ids: string[]; _user_id: string }
        Returns: boolean
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
      encrypt_email: {
        Args: { email: string; encryption_key: string }
        Returns: string
      }
      encrypt_text: {
        Args: { encryption_key: string; plaintext: string }
        Returns: string
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
      generate_monthly_summaries: { Args: never; Returns: number }
      get_admin_activity_log: { Args: { p_limit?: number }; Returns: Json }
      get_admin_ai_cost_stats: { Args: never; Returns: Json }
      get_admin_ai_limits: { Args: never; Returns: Json }
      get_admin_applications: { Args: never; Returns: Json }
      get_admin_beta_feedback: { Args: never; Returns: Json }
      get_admin_churn_alerts: { Args: never; Returns: Json }
      get_admin_contact_messages: { Args: { p_limit?: number }; Returns: Json }
      get_admin_conversations: { Args: never; Returns: Json }
      get_admin_credit_gifts: { Args: never; Returns: Json }
      get_admin_custom_orders: { Args: never; Returns: Json }
      get_admin_dashboard_stats: { Args: never; Returns: Json }
      get_admin_email_broadcast_users: { Args: never; Returns: Json }
      get_admin_error_logs: { Args: { p_limit?: number }; Returns: Json }
      get_admin_error_monitoring: { Args: { p_limit?: number }; Returns: Json }
      get_admin_error_monitoring_data: { Args: never; Returns: Json }
      get_admin_llm_management: { Args: never; Returns: Json }
      get_admin_llm_stats: { Args: { p_hours?: number }; Returns: Json }
      get_admin_message_ratings: { Args: never; Returns: Json }
      get_admin_nda_agreements: { Args: never; Returns: Json }
      get_admin_nda_list: { Args: never; Returns: Json }
      get_admin_notification_log: { Args: never; Returns: Json }
      get_admin_rate_limit_stats: { Args: never; Returns: Json }
      get_admin_subscriptions: { Args: never; Returns: Json }
      get_admin_support_data: { Args: never; Returns: Json }
      get_admin_support_tickets: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Json
      }
      get_admin_system_config: { Args: never; Returns: Json }
      get_admin_system_metrics: { Args: never; Returns: Json }
      get_admin_system_monitoring: { Args: never; Returns: Json }
      get_admin_terms_consent: { Args: never; Returns: Json }
      get_admin_test_results: { Args: never; Returns: Json }
      get_admin_test_results_data: { Args: never; Returns: Json }
      get_admin_user_growth: { Args: never; Returns: Json }
      get_admin_user_messages: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: Json
      }
      get_admin_users: { Args: never; Returns: Json }
      get_admin_visitor_analytics: { Args: { p_days?: number }; Returns: Json }
      get_alert_history_with_emails: {
        Args: { p_alert_id?: string; p_encryption_key?: string }
        Returns: {
          alert_type: string
          content: string
          created_at: string
          error_message: string
          id: string
          metadata: Json
          recipient_email_decrypted: string
          sent_at: string
          status: string
          subject: string
          user_id: string
        }[]
      }
      get_extension_security_status: {
        Args: never
        Returns: {
          extension_name: string
          recommendation: string
          schema_name: string
          security_risk: string
        }[]
      }
      get_global_intelligence_dashboard: { Args: never; Returns: Json }
      get_predictions_by_domain: {
        Args: { p_domain?: string; p_region?: string }
        Returns: Json
      }
      get_profile_business_context: {
        Args: { _user_id: string; p_encryption_key?: string }
        Returns: string
      }
      get_rate_limit_stats: {
        Args: never
        Returns: {
          blocked_until: string
          endpoint: string
          is_blocked: boolean
          last_activity: string
          max_requests: number
          request_count: number
          user_id: string
          violation_count: number
        }[]
      }
      get_security_extension_audit: {
        Args: never
        Returns: {
          extension_name: string
          schema_name: string
          security_note: string
          version: string
        }[]
      }
      get_security_headers: { Args: never; Returns: Json }
      get_usage_stats: {
        Args: { _user_id?: string }
        Returns: {
          company_name: string
          current_usage: number
          monthly_limit: number
          reset_date: string
          usage_percentage: number
          user_email: string
          user_id: string
        }[]
      }
      get_user_context: { Args: { _user_id: string }; Returns: Json }
      get_user_profile_secure: {
        Args: { _user_id: string }
        Returns: {
          avatar_url: string
          business_type: string
          company_name: string
          contact_person: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }[]
      }
      get_user_status: { Args: { uid: string }; Returns: Json }
      has_active_access: { Args: { _user_id: string }; Returns: boolean }
      has_duty_access: { Args: { _user_id: string }; Returns: boolean }
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
      increment_template_usage: {
        Args: { template_id: string }
        Returns: undefined
      }
      increment_usage: {
        Args: { _action_type?: string; _count?: number; _user_id: string }
        Returns: boolean
      }
      is_ip_blocked: { Args: { _ip_address: unknown }; Returns: boolean }
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
      manage_user_role: {
        Args: {
          p_new_role: Database["public"]["Enums"]["app_role"]
          p_target_user_id: string
        }
        Returns: undefined
      }
      mark_email_opened:
        | { Args: { order_id: string }; Returns: undefined }
        | { Args: { p_tracking_id: string }; Returns: undefined }
      record_device_fingerprint: {
        Args: {
          _device_info: Json
          _fingerprint_hash: string
          _user_id: string
        }
        Returns: string
      }
      refresh_daily_summaries: { Args: never; Returns: undefined }
      refresh_intelligence_brief: { Args: never; Returns: undefined }
      refresh_llm_cost_daily: { Args: { p_date?: string }; Returns: undefined }
      refresh_user_usage_daily: {
        Args: { p_date?: string }
        Returns: undefined
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
      update_profile_business_context: {
        Args: {
          _business_context: string
          _user_id: string
          p_encryption_key?: string
        }
        Returns: undefined
      }
      upsert_user_memory: {
        Args: {
          _memory_data: Json
          _memory_key: string
          _memory_type: string
          _priority?: number
          _user_id: string
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
      app_role: "admin" | "user" | "duty"
      application_status:
        | "saved"
        | "applied"
        | "interview"
        | "offer"
        | "rejected"
      employer_status: "pending_approval" | "approved" | "suspended"
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
      app_role: ["admin", "user", "duty"],
      application_status: [
        "saved",
        "applied",
        "interview",
        "offer",
        "rejected",
      ],
      employer_status: ["pending_approval", "approved", "suspended"],
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
