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
      agent_event_debounce: {
        Row: {
          agent_name: string
          last_triggered_at: string
        }
        Insert: {
          agent_name: string
          last_triggered_at?: string
        }
        Update: {
          agent_name?: string
          last_triggered_at?: string
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
      ayn_accuracy_calibration: {
        Row: {
          asset: string
          avg_claimed_confidence: number | null
          calibration_factor: number | null
          correct: number
          id: string
          last_updated: string | null
          overconfidence_gap: number | null
          real_accuracy_pct: number
          reliability_tier: string | null
          should_show_uncertainty: boolean | null
          total_resolved: number
        }
        Insert: {
          asset: string
          avg_claimed_confidence?: number | null
          calibration_factor?: number | null
          correct?: number
          id?: string
          last_updated?: string | null
          overconfidence_gap?: number | null
          real_accuracy_pct: number
          reliability_tier?: string | null
          should_show_uncertainty?: boolean | null
          total_resolved?: number
        }
        Update: {
          asset?: string
          avg_claimed_confidence?: number | null
          calibration_factor?: number | null
          correct?: number
          id?: string
          last_updated?: string | null
          overconfidence_gap?: number | null
          real_accuracy_pct?: number
          reliability_tier?: string | null
          should_show_uncertainty?: boolean | null
          total_resolved?: number
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
      ayn_agent_coalitions: {
        Row: {
          coalition_name: string
          conversation_id: string | null
          formed_at: string | null
          id: string
          member_agents: string[]
          shared_position: string | null
          topic_key: string
        }
        Insert: {
          coalition_name: string
          conversation_id?: string | null
          formed_at?: string | null
          id?: string
          member_agents: string[]
          shared_position?: string | null
          topic_key: string
        }
        Update: {
          coalition_name?: string
          conversation_id?: string | null
          formed_at?: string | null
          id?: string
          member_agents?: string[]
          shared_position?: string | null
          topic_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "ayn_agent_coalitions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ayn_agent_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ayn_agent_conversations: {
        Row: {
          created_at: string | null
          id: string
          simulation_run_id: string | null
          status: string | null
          topic: string
          topic_summary: string | null
          updated_at: string | null
          world_event_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          simulation_run_id?: string | null
          status?: string | null
          topic: string
          topic_summary?: string | null
          updated_at?: string | null
          world_event_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          simulation_run_id?: string | null
          status?: string | null
          topic?: string
          topic_summary?: string | null
          updated_at?: string | null
          world_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ayn_agent_conversations_simulation_run_id_fkey"
            columns: ["simulation_run_id"]
            isOneToOne: false
            referencedRelation: "ayn_world_simulations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ayn_agent_conversations_world_event_id_fkey"
            columns: ["world_event_id"]
            isOneToOne: false
            referencedRelation: "ayn_world_events"
            referencedColumns: ["id"]
          },
        ]
      }
      ayn_agent_memory: {
        Row: {
          agent_id: string
          content: string
          decay_rate: number | null
          formed_at: string | null
          id: string
          last_reinforced: string | null
          memory_type: string
          source_conversation_id: string | null
          strength: number | null
          subject: string
          valence: string | null
        }
        Insert: {
          agent_id: string
          content: string
          decay_rate?: number | null
          formed_at?: string | null
          id?: string
          last_reinforced?: string | null
          memory_type: string
          source_conversation_id?: string | null
          strength?: number | null
          subject: string
          valence?: string | null
        }
        Update: {
          agent_id?: string
          content?: string
          decay_rate?: number | null
          formed_at?: string | null
          id?: string
          last_reinforced?: string | null
          memory_type?: string
          source_conversation_id?: string | null
          strength?: number | null
          subject?: string
          valence?: string | null
        }
        Relationships: []
      }
      ayn_agent_messages: {
        Row: {
          agent_flag: string | null
          agent_id: string
          agent_name: string
          agent_role: string
          confidence_level: number | null
          conversation_id: string | null
          created_at: string | null
          emotion: string
          emotion_intensity: number | null
          id: string
          internal_thought: string | null
          market_action: Json | null
          message: string
          message_type: string | null
          responding_to_agent: string | null
          sequence_order: number
        }
        Insert: {
          agent_flag?: string | null
          agent_id: string
          agent_name: string
          agent_role: string
          confidence_level?: number | null
          conversation_id?: string | null
          created_at?: string | null
          emotion?: string
          emotion_intensity?: number | null
          id?: string
          internal_thought?: string | null
          market_action?: Json | null
          message: string
          message_type?: string | null
          responding_to_agent?: string | null
          sequence_order: number
        }
        Update: {
          agent_flag?: string | null
          agent_id?: string
          agent_name?: string
          agent_role?: string
          confidence_level?: number | null
          conversation_id?: string | null
          created_at?: string | null
          emotion?: string
          emotion_intensity?: number | null
          id?: string
          internal_thought?: string | null
          market_action?: Json | null
          message?: string
          message_type?: string | null
          responding_to_agent?: string | null
          sequence_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "ayn_agent_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ayn_agent_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ayn_agent_relationships: {
        Row: {
          agent_id: string
          alignment: string | null
          id: string
          interaction_count: number | null
          last_interaction: string | null
          notes: string | null
          target_agent_id: string
          trust_level: number | null
        }
        Insert: {
          agent_id: string
          alignment?: string | null
          id?: string
          interaction_count?: number | null
          last_interaction?: string | null
          notes?: string | null
          target_agent_id: string
          trust_level?: number | null
        }
        Update: {
          agent_id?: string
          alignment?: string | null
          id?: string
          interaction_count?: number | null
          last_interaction?: string | null
          notes?: string | null
          target_agent_id?: string
          trust_level?: number | null
        }
        Relationships: []
      }
      ayn_agent_run_state: {
        Row: {
          completed_at: string | null
          conversation_id: string
          current_node: string
          error_message: string | null
          error_node: string | null
          id: string
          node_data: Json | null
          retry_count: number | null
          started_at: string | null
        }
        Insert: {
          completed_at?: string | null
          conversation_id: string
          current_node?: string
          error_message?: string | null
          error_node?: string | null
          id?: string
          node_data?: Json | null
          retry_count?: number | null
          started_at?: string | null
        }
        Update: {
          completed_at?: string | null
          conversation_id?: string
          current_node?: string
          error_message?: string | null
          error_node?: string | null
          id?: string
          node_data?: Json | null
          retry_count?: number | null
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ayn_agent_run_state_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ayn_agent_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ayn_agent_states: {
        Row: {
          agent_id: string
          agent_name: string
          confidence: number | null
          current_emotion: string | null
          emotion_intensity: number | null
          id: string
          key_concern: string | null
          last_action: string | null
          stance_summary: string | null
          stress_level: number | null
          updated_at: string | null
        }
        Insert: {
          agent_id: string
          agent_name: string
          confidence?: number | null
          current_emotion?: string | null
          emotion_intensity?: number | null
          id?: string
          key_concern?: string | null
          last_action?: string | null
          stance_summary?: string | null
          stress_level?: number | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string
          agent_name?: string
          confidence?: number | null
          current_emotion?: string | null
          emotion_intensity?: number | null
          id?: string
          key_concern?: string | null
          last_action?: string | null
          stance_summary?: string | null
          stress_level?: number | null
          updated_at?: string | null
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
      ayn_business_timing: {
        Row: {
          best_time_to_enter: string | null
          confidence: number | null
          created_at: string | null
          expires_at: string | null
          id: string
          key_headwinds: string[] | null
          key_tailwinds: string[] | null
          long_term_outlook: string | null
          medium_term_outlook: string | null
          opportunity_window: string | null
          prediction_date: string | null
          reason: string
          region: string | null
          sector: string
          short_term_outlook: string | null
          status: string | null
          sub_sector: string | null
          supported_by_signals: string[] | null
          timing_score: number | null
          timing_signal: string
          updated_at: string | null
          warning_signals: string[] | null
          wisdom_framework_refs: string[] | null
        }
        Insert: {
          best_time_to_enter?: string | null
          confidence?: number | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          key_headwinds?: string[] | null
          key_tailwinds?: string[] | null
          long_term_outlook?: string | null
          medium_term_outlook?: string | null
          opportunity_window?: string | null
          prediction_date?: string | null
          reason: string
          region?: string | null
          sector: string
          short_term_outlook?: string | null
          status?: string | null
          sub_sector?: string | null
          supported_by_signals?: string[] | null
          timing_score?: number | null
          timing_signal: string
          updated_at?: string | null
          warning_signals?: string[] | null
          wisdom_framework_refs?: string[] | null
        }
        Update: {
          best_time_to_enter?: string | null
          confidence?: number | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          key_headwinds?: string[] | null
          key_tailwinds?: string[] | null
          long_term_outlook?: string | null
          medium_term_outlook?: string | null
          opportunity_window?: string | null
          prediction_date?: string | null
          reason?: string
          region?: string | null
          sector?: string
          short_term_outlook?: string | null
          status?: string | null
          sub_sector?: string | null
          supported_by_signals?: string[] | null
          timing_score?: number | null
          timing_signal?: string
          updated_at?: string | null
          warning_signals?: string[] | null
          wisdom_framework_refs?: string[] | null
        }
        Relationships: []
      }
      ayn_consensus_predictions: {
        Row: {
          agreement: boolean | null
          asset: string
          asset_category: string | null
          ayn_confidence: number | null
          ayn_direction: string | null
          ayn_key_drivers: Json | null
          ayn_pct_change: number | null
          ayn_reasoning: string | null
          ayn_regime: string | null
          ayn_regime_confidence: number | null
          ayn_weight: number | null
          baseline_date: string | null
          baseline_value: number | null
          boost_factor: string | null
          consensus_confidence: number | null
          consensus_direction: string | null
          consensus_pct_change: number | null
          consensus_strength: string | null
          created_at: string | null
          fusion_method: string | null
          fusion_notes: string | null
          generated_by: string | null
          horizon: string
          id: string
          ml_confidence: number | null
          ml_direction: string | null
          ml_fear_greed: number | null
          ml_pct_change: number | null
          ml_rmse: number | null
          ml_top_drivers: Json | null
          ml_weight: number | null
          status: string | null
          target_date: string | null
          updated_at: string | null
        }
        Insert: {
          agreement?: boolean | null
          asset: string
          asset_category?: string | null
          ayn_confidence?: number | null
          ayn_direction?: string | null
          ayn_key_drivers?: Json | null
          ayn_pct_change?: number | null
          ayn_reasoning?: string | null
          ayn_regime?: string | null
          ayn_regime_confidence?: number | null
          ayn_weight?: number | null
          baseline_date?: string | null
          baseline_value?: number | null
          boost_factor?: string | null
          consensus_confidence?: number | null
          consensus_direction?: string | null
          consensus_pct_change?: number | null
          consensus_strength?: string | null
          created_at?: string | null
          fusion_method?: string | null
          fusion_notes?: string | null
          generated_by?: string | null
          horizon: string
          id?: string
          ml_confidence?: number | null
          ml_direction?: string | null
          ml_fear_greed?: number | null
          ml_pct_change?: number | null
          ml_rmse?: number | null
          ml_top_drivers?: Json | null
          ml_weight?: number | null
          status?: string | null
          target_date?: string | null
          updated_at?: string | null
        }
        Update: {
          agreement?: boolean | null
          asset?: string
          asset_category?: string | null
          ayn_confidence?: number | null
          ayn_direction?: string | null
          ayn_key_drivers?: Json | null
          ayn_pct_change?: number | null
          ayn_reasoning?: string | null
          ayn_regime?: string | null
          ayn_regime_confidence?: number | null
          ayn_weight?: number | null
          baseline_date?: string | null
          baseline_value?: number | null
          boost_factor?: string | null
          consensus_confidence?: number | null
          consensus_direction?: string | null
          consensus_pct_change?: number | null
          consensus_strength?: string | null
          created_at?: string | null
          fusion_method?: string | null
          fusion_notes?: string | null
          generated_by?: string | null
          horizon?: string
          id?: string
          ml_confidence?: number | null
          ml_direction?: string | null
          ml_fear_greed?: number | null
          ml_pct_change?: number | null
          ml_rmse?: number | null
          ml_top_drivers?: Json | null
          ml_weight?: number | null
          status?: string | null
          target_date?: string | null
          updated_at?: string | null
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
      ayn_daily_run_log: {
        Row: {
          created_at: string | null
          id: string
          predictions_written: number | null
          run_date: string
          run_type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          predictions_written?: number | null
          run_date: string
          run_type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          predictions_written?: number | null
          run_date?: string
          run_type?: string
        }
        Relationships: []
      }
      ayn_decision_memory: {
        Row: {
          context: string | null
          created_at: string | null
          decision: string
          id: string
          lesson: string | null
          outcome: string | null
          outcome_date: string | null
          status: string | null
          updated_at: string | null
          user_id: string
          world_conditions: Json | null
        }
        Insert: {
          context?: string | null
          created_at?: string | null
          decision: string
          id?: string
          lesson?: string | null
          outcome?: string | null
          outcome_date?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
          world_conditions?: Json | null
        }
        Update: {
          context?: string | null
          created_at?: string | null
          decision?: string
          id?: string
          lesson?: string | null
          outcome?: string | null
          outcome_date?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
          world_conditions?: Json | null
        }
        Relationships: []
      }
      ayn_dev_agent_memory: {
        Row: {
          category: string
          created_at: string | null
          id: string
          key: string
          source: string | null
          updated_at: string | null
          value: string
        }
        Insert: {
          category: string
          created_at?: string | null
          id?: string
          key: string
          source?: string | null
          updated_at?: string | null
          value: string
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          key?: string
          source?: string | null
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      ayn_dev_conversations: {
        Row: {
          created_at: string | null
          id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          title?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ayn_dev_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ayn_dev_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ayn_dev_conversations"
            referencedColumns: ["id"]
          },
        ]
      }

      ayn_dev_skills: {
        Row: {
          category: string
          content: string
          created_at: string | null
          description: string
          enabled: boolean
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          category?: string
          content: string
          created_at?: string | null
          description: string
          enabled?: boolean
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string | null
          description?: string
          enabled?: boolean
          id?: string
          name?: string
          updated_at?: string | null
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
      ayn_historical_patterns: {
        Row: {
          confidence: number | null
          created_at: string
          current_parallel: string
          domain: string | null
          id: string
          likely_outcome: string
          pattern_name: string
          period_reference: string
          prediction_date: string
          tags: Json | null
          what_came_next: string
          what_happened: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          current_parallel: string
          domain?: string | null
          id?: string
          likely_outcome: string
          pattern_name: string
          period_reference: string
          prediction_date?: string
          tags?: Json | null
          what_came_next: string
          what_happened: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          current_parallel?: string
          domain?: string | null
          id?: string
          likely_outcome?: string
          pattern_name?: string
          period_reference?: string
          prediction_date?: string
          tags?: Json | null
          what_came_next?: string
          what_happened?: string
        }
        Relationships: []
      }
      ayn_intelligence_accuracy: {
        Row: {
          accuracy_pct: number | null
          avg_confidence_given: number | null
          calibration_error: number | null
          correct: number | null
          created_at: string | null
          domain: string | null
          grade: string | null
          id: string
          lessons: string | null
          meets_threshold: boolean | null
          pending: number | null
          period_end: string
          period_start: string
          prediction_type: string
          total: number | null
          what_we_got_right: string | null
          what_we_got_wrong: string | null
          wrong: number | null
        }
        Insert: {
          accuracy_pct?: number | null
          avg_confidence_given?: number | null
          calibration_error?: number | null
          correct?: number | null
          created_at?: string | null
          domain?: string | null
          grade?: string | null
          id?: string
          lessons?: string | null
          meets_threshold?: boolean | null
          pending?: number | null
          period_end: string
          period_start: string
          prediction_type: string
          total?: number | null
          what_we_got_right?: string | null
          what_we_got_wrong?: string | null
          wrong?: number | null
        }
        Update: {
          accuracy_pct?: number | null
          avg_confidence_given?: number | null
          calibration_error?: number | null
          correct?: number | null
          created_at?: string | null
          domain?: string | null
          grade?: string | null
          id?: string
          lessons?: string | null
          meets_threshold?: boolean | null
          pending?: number | null
          period_end?: string
          period_start?: string
          prediction_type?: string
          total?: number | null
          what_we_got_right?: string | null
          what_we_got_wrong?: string | null
          wrong?: number | null
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
      ayn_lean_context: {
        Row: {
          brief: string
          id: number
          regime: string
          updated_at: string | null
        }
        Insert: {
          brief?: string
          id?: number
          regime?: string
          updated_at?: string | null
        }
        Update: {
          brief?: string
          id?: number
          regime?: string
          updated_at?: string | null
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
      ayn_opportunity_alerts: {
        Row: {
          category: string
          created_at: string
          description: string
          evidence: Json | null
          expires_at: string | null
          how_to_act: string
          id: string
          prediction_date: string
          region: string | null
          tags: Json | null
          title: string
          urgency: string
          who_benefits: string
          why_now: string
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          evidence?: Json | null
          expires_at?: string | null
          how_to_act: string
          id?: string
          prediction_date?: string
          region?: string | null
          tags?: Json | null
          title: string
          urgency: string
          who_benefits: string
          why_now: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          evidence?: Json | null
          expires_at?: string | null
          how_to_act?: string
          id?: string
          prediction_date?: string
          region?: string | null
          tags?: Json | null
          title?: string
          urgency?: string
          who_benefits?: string
          why_now?: string
        }
        Relationships: []
      }
      ayn_prediction_accuracy: {
        Row: {
          asset_accuracy: Json | null
          avg_accuracy_score: number | null
          avg_value_error_pct: number | null
          created_at: string | null
          direction_accuracy_pct: number | null
          direction_correct: number | null
          direction_wrong: number | null
          horizon_accuracy: Json | null
          id: string
          meets_80_threshold: boolean | null
          notes: string | null
          overall_grade: string | null
          period_end: string
          period_start: string
          resolved_price_predictions: number | null
          total_price_predictions: number | null
          total_world_predictions: number | null
          world_accuracy_pct: number | null
          world_pending_review: number | null
          world_verified_correct: number | null
          world_verified_wrong: number | null
        }
        Insert: {
          asset_accuracy?: Json | null
          avg_accuracy_score?: number | null
          avg_value_error_pct?: number | null
          created_at?: string | null
          direction_accuracy_pct?: number | null
          direction_correct?: number | null
          direction_wrong?: number | null
          horizon_accuracy?: Json | null
          id?: string
          meets_80_threshold?: boolean | null
          notes?: string | null
          overall_grade?: string | null
          period_end: string
          period_start: string
          resolved_price_predictions?: number | null
          total_price_predictions?: number | null
          total_world_predictions?: number | null
          world_accuracy_pct?: number | null
          world_pending_review?: number | null
          world_verified_correct?: number | null
          world_verified_wrong?: number | null
        }
        Update: {
          asset_accuracy?: Json | null
          avg_accuracy_score?: number | null
          avg_value_error_pct?: number | null
          created_at?: string | null
          direction_accuracy_pct?: number | null
          direction_correct?: number | null
          direction_wrong?: number | null
          horizon_accuracy?: Json | null
          id?: string
          meets_80_threshold?: boolean | null
          notes?: string | null
          overall_grade?: string | null
          period_end?: string
          period_start?: string
          resolved_price_predictions?: number | null
          total_price_predictions?: number | null
          total_world_predictions?: number | null
          world_accuracy_pct?: number | null
          world_pending_review?: number | null
          world_verified_correct?: number | null
          world_verified_wrong?: number | null
        }
        Relationships: []
      }
      ayn_prediction_lessons: {
        Row: {
          applied_count: number | null
          asset_affected: string | null
          created_at: string
          horizon_affected: string | null
          id: string
          lesson_confidence: number | null
          lesson_detail: string
          lesson_title: string
          lesson_type: string
          outcome_id: string | null
          prediction_id: string | null
          rule_update: string | null
        }
        Insert: {
          applied_count?: number | null
          asset_affected?: string | null
          created_at?: string
          horizon_affected?: string | null
          id?: string
          lesson_confidence?: number | null
          lesson_detail: string
          lesson_title: string
          lesson_type: string
          outcome_id?: string | null
          prediction_id?: string | null
          rule_update?: string | null
        }
        Update: {
          applied_count?: number | null
          asset_affected?: string | null
          created_at?: string
          horizon_affected?: string | null
          id?: string
          lesson_confidence?: number | null
          lesson_detail?: string
          lesson_title?: string
          lesson_type?: string
          outcome_id?: string | null
          prediction_id?: string | null
          rule_update?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ayn_prediction_lessons_outcome_id_fkey"
            columns: ["outcome_id"]
            isOneToOne: false
            referencedRelation: "ayn_prediction_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ayn_prediction_lessons_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "ayn_predictions"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "ayn_prediction_outcomes_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "ayn_predictions"
            referencedColumns: ["id"]
          },
        ]
      }
      ayn_prediction_performance: {
        Row: {
          asset: string
          avg_accuracy_score: number | null
          avg_value_error: number | null
          close_count: number | null
          direction_accuracy: number | null
          exact_count: number | null
          horizon: string
          id: string
          moderate_count: number | null
          off_count: number | null
          resolved_count: number | null
          top_miss_reasons: Json | null
          total_predictions: number | null
          updated_at: string
          wrong_count: number | null
        }
        Insert: {
          asset: string
          avg_accuracy_score?: number | null
          avg_value_error?: number | null
          close_count?: number | null
          direction_accuracy?: number | null
          exact_count?: number | null
          horizon: string
          id?: string
          moderate_count?: number | null
          off_count?: number | null
          resolved_count?: number | null
          top_miss_reasons?: Json | null
          total_predictions?: number | null
          updated_at?: string
          wrong_count?: number | null
        }
        Update: {
          asset?: string
          avg_accuracy_score?: number | null
          avg_value_error?: number | null
          close_count?: number | null
          direction_accuracy?: number | null
          exact_count?: number | null
          horizon?: string
          id?: string
          moderate_count?: number | null
          off_count?: number | null
          resolved_count?: number | null
          top_miss_reasons?: Json | null
          total_predictions?: number | null
          updated_at?: string
          wrong_count?: number | null
        }
        Relationships: []
      }
      ayn_prediction_rules: {
        Row: {
          accuracy_pct: number | null
          adjustment: string
          asset: string | null
          condition: string
          confidence: number | null
          created_at: string
          horizon: string | null
          id: string
          is_active: boolean | null
          rule_name: string
          source: string | null
          times_correct: number | null
          times_wrong: number | null
          updated_at: string
        }
        Insert: {
          accuracy_pct?: number | null
          adjustment: string
          asset?: string | null
          condition: string
          confidence?: number | null
          created_at?: string
          horizon?: string | null
          id?: string
          is_active?: boolean | null
          rule_name: string
          source?: string | null
          times_correct?: number | null
          times_wrong?: number | null
          updated_at?: string
        }
        Update: {
          accuracy_pct?: number | null
          adjustment?: string
          asset?: string | null
          condition?: string
          confidence?: number | null
          created_at?: string
          horizon?: string | null
          id?: string
          is_active?: boolean | null
          rule_name?: string
          source?: string | null
          times_correct?: number | null
          times_wrong?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      ayn_prediction_votes: {
        Row: {
          created_at: string | null
          id: string
          prediction_id: string
          user_id: string
          vote: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          prediction_id: string
          user_id: string
          vote: string
        }
        Update: {
          created_at?: string | null
          id?: string
          prediction_id?: string
          user_id?: string
          vote?: string
        }
        Relationships: [
          {
            foreignKeyName: "ayn_prediction_votes_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "ayn_predictions"
            referencedColumns: ["id"]
          },
        ]
      }
      ayn_predictions: {
        Row: {
          asset: string
          asset_category: string
          baseline_date: string | null
          baseline_value: number | null
          confidence: number | null
          created_at: string
          fear_greed_at_prediction: number | null
          generated_by: string | null
          horizon: string
          id: string
          key_drivers: Json | null
          market_context: Json | null
          market_regime: string | null
          metric: string
          predicted_direction: string | null
          predicted_high: number | null
          predicted_low: number | null
          predicted_pct_change: number | null
          predicted_value: number | null
          reasoning: string
          risks: Json | null
          signal_used: Json | null
          status: string
          target_date: string
        }
        Insert: {
          asset: string
          asset_category: string
          baseline_date?: string | null
          baseline_value?: number | null
          confidence?: number | null
          created_at?: string
          fear_greed_at_prediction?: number | null
          generated_by?: string | null
          horizon: string
          id?: string
          key_drivers?: Json | null
          market_context?: Json | null
          market_regime?: string | null
          metric?: string
          predicted_direction?: string | null
          predicted_high?: number | null
          predicted_low?: number | null
          predicted_pct_change?: number | null
          predicted_value?: number | null
          reasoning: string
          risks?: Json | null
          signal_used?: Json | null
          status?: string
          target_date: string
        }
        Update: {
          asset?: string
          asset_category?: string
          baseline_date?: string | null
          baseline_value?: number | null
          confidence?: number | null
          created_at?: string
          fear_greed_at_prediction?: number | null
          generated_by?: string | null
          horizon?: string
          id?: string
          key_drivers?: Json | null
          market_context?: Json | null
          market_regime?: string | null
          metric?: string
          predicted_direction?: string | null
          predicted_high?: number | null
          predicted_low?: number | null
          predicted_pct_change?: number | null
          predicted_value?: number | null
          reasoning?: string
          risks?: Json | null
          signal_used?: Json | null
          status?: string
          target_date?: string
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
      ayn_resolution_queue: {
        Row: {
          accuracy_score: number | null
          created_at: string | null
          id: string
          prediction_id: string | null
          priority: string | null
          resolution_evidence: string | null
          resolution_notes: string | null
          resolution_status: string | null
          resolved_at: string | null
          resolved_by: string | null
          timing_accuracy: string | null
        }
        Insert: {
          accuracy_score?: number | null
          created_at?: string | null
          id?: string
          prediction_id?: string | null
          priority?: string | null
          resolution_evidence?: string | null
          resolution_notes?: string | null
          resolution_status?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          timing_accuracy?: string | null
        }
        Update: {
          accuracy_score?: number | null
          created_at?: string | null
          id?: string
          prediction_id?: string | null
          priority?: string | null
          resolution_evidence?: string | null
          resolution_notes?: string | null
          resolution_status?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          timing_accuracy?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ayn_resolution_queue_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "ayn_world_predictions"
            referencedColumns: ["id"]
          },
        ]
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
      ayn_snapshot_history: {
        Row: {
          brief_items: number | null
          btc_dominance: number | null
          captured_at: string
          environment_label: string | null
          environment_score: number | null
          fear_greed: number | null
          fed_rate: number | null
          fetch_errors: string[] | null
          gold: number | null
          id: number
          inflation_cpi: number | null
          nasdaq: number | null
          oil_wti: number | null
          snapshot: Json | null
          sources_used: string[] | null
          sp500: number | null
          unemployment: number | null
          yield_curve_signal: string | null
          yield_spread_2_10: number | null
          yield_spread_3m_10: number | null
        }
        Insert: {
          brief_items?: number | null
          btc_dominance?: number | null
          captured_at?: string
          environment_label?: string | null
          environment_score?: number | null
          fear_greed?: number | null
          fed_rate?: number | null
          fetch_errors?: string[] | null
          gold?: number | null
          id?: number
          inflation_cpi?: number | null
          nasdaq?: number | null
          oil_wti?: number | null
          snapshot?: Json | null
          sources_used?: string[] | null
          sp500?: number | null
          unemployment?: number | null
          yield_curve_signal?: string | null
          yield_spread_2_10?: number | null
          yield_spread_3m_10?: number | null
        }
        Update: {
          brief_items?: number | null
          btc_dominance?: number | null
          captured_at?: string
          environment_label?: string | null
          environment_score?: number | null
          fear_greed?: number | null
          fed_rate?: number | null
          fetch_errors?: string[] | null
          gold?: number | null
          id?: number
          inflation_cpi?: number | null
          nasdaq?: number | null
          oil_wti?: number | null
          snapshot?: Json | null
          sources_used?: string[] | null
          sp500?: number | null
          unemployment?: number | null
          yield_curve_signal?: string | null
          yield_spread_2_10?: number | null
          yield_spread_3m_10?: number | null
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
      ayn_wisdom_frameworks: {
        Row: {
          active: boolean | null
          applies_to_assets: string[] | null
          category: string
          confidence_weight: number | null
          created_at: string | null
          id: string
          prediction_bias: string | null
          principle: string
          quote: string | null
          reference: string | null
          source: string
          source_full: string | null
          trigger_conditions: string[] | null
        }
        Insert: {
          active?: boolean | null
          applies_to_assets?: string[] | null
          category: string
          confidence_weight?: number | null
          created_at?: string | null
          id?: string
          prediction_bias?: string | null
          principle: string
          quote?: string | null
          reference?: string | null
          source: string
          source_full?: string | null
          trigger_conditions?: string[] | null
        }
        Update: {
          active?: boolean | null
          applies_to_assets?: string[] | null
          category?: string
          confidence_weight?: number | null
          created_at?: string | null
          id?: string
          prediction_bias?: string | null
          principle?: string
          quote?: string | null
          reference?: string | null
          source?: string
          source_full?: string | null
          trigger_conditions?: string[] | null
        }
        Relationships: []
      }
      ayn_world_actors: {
        Row: {
          actor_name: string
          actor_type: string
          behavior_profile: Json | null
          current_stance: Json | null
          id: string
          last_updated: string | null
          region: string | null
        }
        Insert: {
          actor_name: string
          actor_type: string
          behavior_profile?: Json | null
          current_stance?: Json | null
          id?: string
          last_updated?: string | null
          region?: string | null
        }
        Update: {
          actor_name?: string
          actor_type?: string
          behavior_profile?: Json | null
          current_stance?: Json | null
          id?: string
          last_updated?: string | null
          region?: string | null
        }
        Relationships: []
      }
      ayn_world_events: {
        Row: {
          actor_reactions: Json | null
          cascade_depth: number | null
          category: string
          caused_by_ids: string[] | null
          confidence: number | null
          countries_involved: string[] | null
          created_at: string | null
          event_date: string | null
          event_type: string
          historical_outcome: string | null
          historical_parallel: string | null
          id: string
          market_impact: Json | null
          predicted_date: string | null
          probability: number | null
          region: string | null
          signal_type: string | null
          simulation_run_id: string | null
          source_signal_id: string | null
          status: string | null
          summary: string
          time_layer: string
          title: string
          triggers_ids: string[] | null
          updated_at: string | null
          verified: boolean | null
          will_cause_ids: string[] | null
        }
        Insert: {
          actor_reactions?: Json | null
          cascade_depth?: number | null
          category: string
          caused_by_ids?: string[] | null
          confidence?: number | null
          countries_involved?: string[] | null
          created_at?: string | null
          event_date?: string | null
          event_type: string
          historical_outcome?: string | null
          historical_parallel?: string | null
          id?: string
          market_impact?: Json | null
          predicted_date?: string | null
          probability?: number | null
          region?: string | null
          signal_type?: string | null
          simulation_run_id?: string | null
          source_signal_id?: string | null
          status?: string | null
          summary: string
          time_layer?: string
          title: string
          triggers_ids?: string[] | null
          updated_at?: string | null
          verified?: boolean | null
          will_cause_ids?: string[] | null
        }
        Update: {
          actor_reactions?: Json | null
          cascade_depth?: number | null
          category?: string
          caused_by_ids?: string[] | null
          confidence?: number | null
          countries_involved?: string[] | null
          created_at?: string | null
          event_date?: string | null
          event_type?: string
          historical_outcome?: string | null
          historical_parallel?: string | null
          id?: string
          market_impact?: Json | null
          predicted_date?: string | null
          probability?: number | null
          region?: string | null
          signal_type?: string | null
          simulation_run_id?: string | null
          source_signal_id?: string | null
          status?: string | null
          summary?: string
          time_layer?: string
          title?: string
          triggers_ids?: string[] | null
          updated_at?: string | null
          verified?: boolean | null
          will_cause_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "ayn_world_events_source_signal_id_fkey"
            columns: ["source_signal_id"]
            isOneToOne: false
            referencedRelation: "ayn_world_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      ayn_world_predictions: {
        Row: {
          actionable_move: string | null
          confidence: number | null
          conflict_signals: Json | null
          created_at: string
          data_sources: Json | null
          domain: string
          escalation_risk: string | null
          expires_at: string | null
          financial_trigger: string | null
          historical_parallel: string
          horizon: string
          id: string
          key_drivers: Json | null
          main_risks: Json | null
          outcome_notes: string | null
          prediction_date: string
          probability: string | null
          region: string
          resolution_correct: boolean | null
          resolution_notes: string | null
          resolution_source: string | null
          resolved_at: string | null
          signal_quality: number | null
          status: string | null
          tags: Json | null
          target_period: string | null
          title: string
          verified_by: string | null
          what_is_happening: string
          what_it_means: string
          what_to_do_now: string
          who_gets_hurt: string
          who_wins: string
        }
        Insert: {
          actionable_move?: string | null
          confidence?: number | null
          conflict_signals?: Json | null
          created_at?: string
          data_sources?: Json | null
          domain: string
          escalation_risk?: string | null
          expires_at?: string | null
          financial_trigger?: string | null
          historical_parallel: string
          horizon: string
          id?: string
          key_drivers?: Json | null
          main_risks?: Json | null
          outcome_notes?: string | null
          prediction_date?: string
          probability?: string | null
          region?: string
          resolution_correct?: boolean | null
          resolution_notes?: string | null
          resolution_source?: string | null
          resolved_at?: string | null
          signal_quality?: number | null
          status?: string | null
          tags?: Json | null
          target_period?: string | null
          title: string
          verified_by?: string | null
          what_is_happening: string
          what_it_means: string
          what_to_do_now: string
          who_gets_hurt: string
          who_wins: string
        }
        Update: {
          actionable_move?: string | null
          confidence?: number | null
          conflict_signals?: Json | null
          created_at?: string
          data_sources?: Json | null
          domain?: string
          escalation_risk?: string | null
          expires_at?: string | null
          financial_trigger?: string | null
          historical_parallel?: string
          horizon?: string
          id?: string
          key_drivers?: Json | null
          main_risks?: Json | null
          outcome_notes?: string | null
          prediction_date?: string
          probability?: string | null
          region?: string
          resolution_correct?: boolean | null
          resolution_notes?: string | null
          resolution_source?: string | null
          resolved_at?: string | null
          signal_quality?: number | null
          status?: string | null
          tags?: Json | null
          target_period?: string | null
          title?: string
          verified_by?: string | null
          what_is_happening?: string
          what_it_means?: string
          what_to_do_now?: string
          who_gets_hurt?: string
          who_wins?: string
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
      ayn_world_simulations: {
        Row: {
          actors_activated: string[] | null
          cascade_depth_reached: number | null
          created_at: string | null
          id: string
          market_scenarios: Json | null
          simulation_summary: string | null
          total_events_generated: number | null
          trigger_event_id: string | null
          trigger_title: string | null
        }
        Insert: {
          actors_activated?: string[] | null
          cascade_depth_reached?: number | null
          created_at?: string | null
          id?: string
          market_scenarios?: Json | null
          simulation_summary?: string | null
          total_events_generated?: number | null
          trigger_event_id?: string | null
          trigger_title?: string | null
        }
        Update: {
          actors_activated?: string[] | null
          cascade_depth_reached?: number | null
          created_at?: string | null
          id?: string
          market_scenarios?: Json | null
          simulation_summary?: string | null
          total_events_generated?: number | null
          trigger_event_id?: string | null
          trigger_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ayn_world_simulations_trigger_event_id_fkey"
            columns: ["trigger_event_id"]
            isOneToOne: false
            referencedRelation: "ayn_world_events"
            referencedColumns: ["id"]
          },
        ]
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
          user_id?: string
          would_recommend?: boolean | null
        }
        Relationships: []
      }
      brain_insights: {
        Row: {
          category: string
          content: string
          created_at: string | null
          id: string
          title: string
        }
        Insert: {
          category: string
          content: string
          created_at?: string | null
          id?: string
          title: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string | null
          id?: string
          title?: string
        }
        Relationships: []
      }
      brain_logs: {
        Row: {
          created_at: string | null
          id: string
          iterations: number | null
          message: string | null
          model_used: string | null
          response: string | null
          tools_used: string[] | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          iterations?: number | null
          message?: string | null
          model_used?: string | null
          response?: string | null
          tools_used?: string[] | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          iterations?: number | null
          message?: string | null
          model_used?: string | null
          response?: string | null
          tools_used?: string[] | null
          user_id?: string | null
        }
        Relationships: []
      }
      building_codes: {
        Row: {
          applies_to: string | null
          category: string
          check_type: string
          code_system: string
          created_at: string
          exception_notes: string | null
          fix_suggestion: string | null
          id: string
          requirement_id: string
          requirement_name: string
          unit: string | null
          value_max: number | null
          value_min: number | null
        }
        Insert: {
          applies_to?: string | null
          category: string
          check_type: string
          code_system: string
          created_at?: string
          exception_notes?: string | null
          fix_suggestion?: string | null
          id?: string
          requirement_id: string
          requirement_name: string
          unit?: string | null
          value_max?: number | null
          value_min?: number | null
        }
        Update: {
          applies_to?: string | null
          category?: string
          check_type?: string
          code_system?: string
          created_at?: string
          exception_notes?: string | null
          fix_suggestion?: string | null
          id?: string
          requirement_id?: string
          requirement_name?: string
          unit?: string | null
          value_max?: number | null
          value_min?: number | null
        }
        Relationships: []
      }
      calculation_history: {
        Row: {
          ai_analysis: Json | null
          calculation_type: string
          created_at: string
          id: string
          inputs: Json
          outputs: Json
          project_id: string | null
          user_id: string
        }
        Insert: {
          ai_analysis?: Json | null
          calculation_type: string
          created_at?: string
          id?: string
          inputs?: Json
          outputs?: Json
          project_id?: string | null
          user_id: string
        }
        Update: {
          ai_analysis?: Json | null
          calculation_type?: string
          created_at?: string
          id?: string
          inputs?: Json
          outputs?: Json
          project_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calculation_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "engineering_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_analyses: {
        Row: {
          asset_type: string | null
          confidence: number | null
          created_at: string | null
          id: string
          image_url: string | null
          news_data: Json | null
          prediction_details: Json | null
          prediction_signal: string | null
          sentiment_score: number | null
          session_id: string | null
          technical_analysis: Json | null
          ticker: string | null
          timeframe: string | null
          user_id: string
        }
        Insert: {
          asset_type?: string | null
          confidence?: number | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          news_data?: Json | null
          prediction_details?: Json | null
          prediction_signal?: string | null
          sentiment_score?: number | null
          session_id?: string | null
          technical_analysis?: Json | null
          ticker?: string | null
          timeframe?: string | null
          user_id: string
        }
        Update: {
          asset_type?: string | null
          confidence?: number | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          news_data?: Json | null
          prediction_details?: Json | null
          prediction_signal?: string | null
          sentiment_score?: number | null
          session_id?: string | null
          technical_analysis?: Json | null
          ticker?: string | null
          timeframe?: string | null
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
      climate_zones: {
        Row: {
          air_sealing_max_ach50: number | null
          ceiling_insulation_min: string | null
          country: string
          frost_depth_mm: number | null
          ground_snow_load_kpa: number | null
          heating_degree_days: number | null
          id: string
          region: string
          seismic_category: string | null
          wall_insulation_min: string | null
          wind_speed_kmh: number | null
          window_u_factor_max: number | null
          zone_code: string | null
        }
        Insert: {
          air_sealing_max_ach50?: number | null
          ceiling_insulation_min?: string | null
          country: string
          frost_depth_mm?: number | null
          ground_snow_load_kpa?: number | null
          heating_degree_days?: number | null
          id?: string
          region: string
          seismic_category?: string | null
          wall_insulation_min?: string | null
          wind_speed_kmh?: number | null
          window_u_factor_max?: number | null
          zone_code?: string | null
        }
        Update: {
          air_sealing_max_ach50?: number | null
          ceiling_insulation_min?: string | null
          country?: string
          frost_depth_mm?: number | null
          ground_snow_load_kpa?: number | null
          heating_degree_days?: number | null
          id?: string
          region?: string
          seismic_category?: string | null
          wall_insulation_min?: string | null
          wind_speed_kmh?: number | null
          window_u_factor_max?: number | null
          zone_code?: string | null
        }
        Relationships: []
      }
      company_journal: {
        Row: {
          created_at: string
          created_by: string
          id: string
          key_losses: Json | null
          key_wins: Json | null
          period: string
          strategic_shift: string | null
          summary: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          key_losses?: Json | null
          key_wins?: Json | null
          period: string
          strategic_shift?: string | null
          summary?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          key_losses?: Json | null
          key_wins?: Json | null
          period?: string
          strategic_shift?: string | null
          summary?: string | null
        }
        Relationships: []
      }
      company_objectives: {
        Row: {
          created_at: string
          current_value: number
          deadline: string | null
          id: string
          metric: string | null
          priority: number
          status: string
          target_value: number | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_value?: number
          deadline?: string | null
          id?: string
          metric?: string | null
          priority?: number
          status?: string
          target_value?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_value?: number
          deadline?: string | null
          id?: string
          metric?: string | null
          priority?: number
          status?: string
          target_value?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_state: {
        Row: {
          context: Json | null
          growth_velocity: string
          id: string
          momentum: string
          morale: string
          risk_exposure: string
          stress_level: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          context?: Json | null
          growth_velocity?: string
          id?: string
          momentum?: string
          morale?: string
          risk_exposure?: string
          stress_level?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          context?: Json | null
          growth_velocity?: string
          id?: string
          momentum?: string
          morale?: string
          risk_exposure?: string
          stress_level?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      competitor_tweets: {
        Row: {
          competitor_id: string
          content: string | null
          id: string
          impressions: number | null
          likes: number | null
          posted_at: string | null
          replies: number | null
          retweets: number | null
          scraped_at: string
          tweet_id: string | null
        }
        Insert: {
          competitor_id: string
          content?: string | null
          id?: string
          impressions?: number | null
          likes?: number | null
          posted_at?: string | null
          replies?: number | null
          retweets?: number | null
          scraped_at?: string
          tweet_id?: string | null
        }
        Update: {
          competitor_id?: string
          content?: string | null
          id?: string
          impressions?: number | null
          likes?: number | null
          posted_at?: string | null
          replies?: number | null
          retweets?: number | null
          scraped_at?: string
          tweet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_tweets_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "marketing_competitors"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_inputs: {
        Row: {
          ceiling_height: number | null
          created_at: string
          door_height: number | null
          door_is_egress: boolean | null
          door_width: number | null
          has_sloped_ceiling: boolean | null
          id: string
          input_type: string
          project_id: string
          room_area: number | null
          room_min_dimension: number | null
          room_name: string | null
          room_type: string | null
          sloped_area_above_min_pct: number | null
          stair_flight_height: number | null
          stair_handrail_height: number | null
          stair_has_handrail: boolean | null
          stair_has_landing: boolean | null
          stair_headroom: number | null
          stair_landing_length: number | null
          stair_num_risers: number | null
          stair_riser_height: number | null
          stair_tread_depth: number | null
          stair_width: number | null
          unit_system: string | null
          window_glazing_area: number | null
          window_is_egress: boolean | null
          window_opening_area: number | null
          window_opening_height: number | null
          window_opening_width: number | null
          window_sill_height: number | null
        }
        Insert: {
          ceiling_height?: number | null
          created_at?: string
          door_height?: number | null
          door_is_egress?: boolean | null
          door_width?: number | null
          has_sloped_ceiling?: boolean | null
          id?: string
          input_type: string
          project_id: string
          room_area?: number | null
          room_min_dimension?: number | null
          room_name?: string | null
          room_type?: string | null
          sloped_area_above_min_pct?: number | null
          stair_flight_height?: number | null
          stair_handrail_height?: number | null
          stair_has_handrail?: boolean | null
          stair_has_landing?: boolean | null
          stair_headroom?: number | null
          stair_landing_length?: number | null
          stair_num_risers?: number | null
          stair_riser_height?: number | null
          stair_tread_depth?: number | null
          stair_width?: number | null
          unit_system?: string | null
          window_glazing_area?: number | null
          window_is_egress?: boolean | null
          window_opening_area?: number | null
          window_opening_height?: number | null
          window_opening_width?: number | null
          window_sill_height?: number | null
        }
        Update: {
          ceiling_height?: number | null
          created_at?: string
          door_height?: number | null
          door_is_egress?: boolean | null
          door_width?: number | null
          has_sloped_ceiling?: boolean | null
          id?: string
          input_type?: string
          project_id?: string
          room_area?: number | null
          room_min_dimension?: number | null
          room_name?: string | null
          room_type?: string | null
          sloped_area_above_min_pct?: number | null
          stair_flight_height?: number | null
          stair_handrail_height?: number | null
          stair_has_handrail?: boolean | null
          stair_has_landing?: boolean | null
          stair_headroom?: number | null
          stair_landing_length?: number | null
          stair_num_risers?: number | null
          stair_riser_height?: number | null
          stair_tread_depth?: number | null
          stair_width?: number | null
          unit_system?: string | null
          window_glazing_area?: number | null
          window_is_egress?: boolean | null
          window_opening_area?: number | null
          window_opening_height?: number | null
          window_opening_width?: number | null
          window_sill_height?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_inputs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "compliance_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_projects: {
        Row: {
          building_type: string | null
          climate_zone_id: string | null
          code_system: string | null
          created_at: string
          failed_checks: number | null
          garage_attached: boolean | null
          has_basement: boolean | null
          has_fuel_burning_appliance: boolean | null
          has_garage: boolean | null
          id: string
          location_city: string | null
          location_country: string | null
          location_state_province: string | null
          location_zip_postal: string | null
          num_storeys: number | null
          passed_checks: number | null
          project_name: string
          report_pdf_url: string | null
          total_checks: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          building_type?: string | null
          climate_zone_id?: string | null
          code_system?: string | null
          created_at?: string
          failed_checks?: number | null
          garage_attached?: boolean | null
          has_basement?: boolean | null
          has_fuel_burning_appliance?: boolean | null
          has_garage?: boolean | null
          id?: string
          location_city?: string | null
          location_country?: string | null
          location_state_province?: string | null
          location_zip_postal?: string | null
          num_storeys?: number | null
          passed_checks?: number | null
          project_name: string
          report_pdf_url?: string | null
          total_checks?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          building_type?: string | null
          climate_zone_id?: string | null
          code_system?: string | null
          created_at?: string
          failed_checks?: number | null
          garage_attached?: boolean | null
          has_basement?: boolean | null
          has_fuel_burning_appliance?: boolean | null
          has_garage?: boolean | null
          id?: string
          location_city?: string | null
          location_country?: string | null
          location_state_province?: string | null
          location_zip_postal?: string | null
          num_storeys?: number | null
          passed_checks?: number | null
          project_name?: string
          report_pdf_url?: string | null
          total_checks?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_projects_climate_zone_id_fkey"
            columns: ["climate_zone_id"]
            isOneToOne: false
            referencedRelation: "climate_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_results: {
        Row: {
          code_requirement_id: string | null
          created_at: string
          fix_suggestion: string | null
          id: string
          input_id: string | null
          project_id: string
          required_value: string | null
          requirement_clause: string | null
          requirement_name: string | null
          room_name: string | null
          status: string
          unit: string | null
          user_value: number | null
        }
        Insert: {
          code_requirement_id?: string | null
          created_at?: string
          fix_suggestion?: string | null
          id?: string
          input_id?: string | null
          project_id: string
          required_value?: string | null
          requirement_clause?: string | null
          requirement_name?: string | null
          room_name?: string | null
          status: string
          unit?: string | null
          user_value?: number | null
        }
        Update: {
          code_requirement_id?: string | null
          created_at?: string
          fix_suggestion?: string | null
          id?: string
          input_id?: string | null
          project_id?: string
          required_value?: string | null
          requirement_clause?: string | null
          requirement_name?: string | null
          room_name?: string | null
          status?: string
          unit?: string | null
          user_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_results_code_requirement_id_fkey"
            columns: ["code_requirement_id"]
            isOneToOne: false
            referencedRelation: "building_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_results_input_id_fkey"
            columns: ["input_id"]
            isOneToOne: false
            referencedRelation: "compliance_inputs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_results_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "compliance_projects"
            referencedColumns: ["id"]
          },
        ]
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
      creator_profiles: {
        Row: {
          application_id: string | null
          bio: string | null
          content_niche: string[] | null
          created_at: string | null
          display_name: string
          engagement_rate: number | null
          follower_count: string | null
          id: string
          instagram_handle: string | null
          is_published: boolean | null
          is_verified: boolean | null
          profile_image_url: string | null
          show_instagram: boolean | null
          show_tiktok: boolean | null
          show_twitter: boolean | null
          show_youtube: boolean | null
          tiktok_handle: string | null
          twitter_handle: string | null
          updated_at: string | null
          user_id: string | null
          youtube_handle: string | null
        }
        Insert: {
          application_id?: string | null
          bio?: string | null
          content_niche?: string[] | null
          created_at?: string | null
          display_name: string
          engagement_rate?: number | null
          follower_count?: string | null
          id?: string
          instagram_handle?: string | null
          is_published?: boolean | null
          is_verified?: boolean | null
          profile_image_url?: string | null
          show_instagram?: boolean | null
          show_tiktok?: boolean | null
          show_twitter?: boolean | null
          show_youtube?: boolean | null
          tiktok_handle?: string | null
          twitter_handle?: string | null
          updated_at?: string | null
          user_id?: string | null
          youtube_handle?: string | null
        }
        Update: {
          application_id?: string | null
          bio?: string | null
          content_niche?: string[] | null
          created_at?: string | null
          display_name?: string
          engagement_rate?: number | null
          follower_count?: string | null
          id?: string
          instagram_handle?: string | null
          is_published?: boolean | null
          is_verified?: boolean | null
          profile_image_url?: string | null
          show_instagram?: boolean | null
          show_tiktok?: boolean | null
          show_twitter?: boolean | null
          show_youtube?: boolean | null
          tiktok_handle?: string | null
          twitter_handle?: string | null
          updated_at?: string | null
          user_id?: string | null
          youtube_handle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_profiles_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "service_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_gifts: {
        Row: {
          amount: number
          created_at: string | null
          gift_type: string | null
          given_by: string | null
          id: string
          reason: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          gift_type?: string | null
          given_by?: string | null
          id?: string
          reason: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          gift_type?: string | null
          given_by?: string | null
          id?: string
          reason?: string
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
      drawing_projects: {
        Row: {
          compliance_project_id: string | null
          conversation_history: Json | null
          created_at: string
          custom_description: string | null
          exterior_materials: string[] | null
          garage_type: string | null
          has_garage: boolean | null
          id: string
          layout_json: Json | null
          location_country: string | null
          location_state_province: string | null
          num_bathrooms: number | null
          num_bedrooms: number | null
          num_storeys: number | null
          project_name: string | null
          style_preset: string | null
          target_sqft: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          compliance_project_id?: string | null
          conversation_history?: Json | null
          created_at?: string
          custom_description?: string | null
          exterior_materials?: string[] | null
          garage_type?: string | null
          has_garage?: boolean | null
          id?: string
          layout_json?: Json | null
          location_country?: string | null
          location_state_province?: string | null
          num_bathrooms?: number | null
          num_bedrooms?: number | null
          num_storeys?: number | null
          project_name?: string | null
          style_preset?: string | null
          target_sqft?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          compliance_project_id?: string | null
          conversation_history?: Json | null
          created_at?: string
          custom_description?: string | null
          exterior_materials?: string[] | null
          garage_type?: string | null
          has_garage?: boolean | null
          id?: string
          layout_json?: Json | null
          location_country?: string | null
          location_state_province?: string | null
          num_bathrooms?: number | null
          num_bedrooms?: number | null
          num_storeys?: number | null
          project_name?: string | null
          style_preset?: string | null
          target_sqft?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drawing_projects_compliance_project_id_fkey"
            columns: ["compliance_project_id"]
            isOneToOne: false
            referencedRelation: "compliance_projects"
            referencedColumns: ["id"]
          },
        ]
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
      employee_discussions: {
        Row: {
          confidence: number | null
          created_at: string
          discussion_id: string
          employee_id: string
          id: string
          impact_level: string
          objections: string | null
          objective_impact: Json | null
          position: string | null
          reasoning: string | null
          topic: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          discussion_id?: string
          employee_id: string
          id?: string
          impact_level?: string
          objections?: string | null
          objective_impact?: Json | null
          position?: string | null
          reasoning?: string | null
          topic: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          discussion_id?: string
          employee_id?: string
          id?: string
          impact_level?: string
          objections?: string | null
          objective_impact?: Json | null
          position?: string | null
          reasoning?: string | null
          topic?: string
        }
        Relationships: []
      }
      employee_reflections: {
        Row: {
          action_ref: string | null
          actual_outcome: string | null
          confidence: number | null
          created_at: string
          employee_id: string
          expected_outcome: string | null
          id: string
          outcome_evaluated: boolean
          reasoning: string | null
          what_would_change_mind: string | null
        }
        Insert: {
          action_ref?: string | null
          actual_outcome?: string | null
          confidence?: number | null
          created_at?: string
          employee_id: string
          expected_outcome?: string | null
          id?: string
          outcome_evaluated?: boolean
          reasoning?: string | null
          what_would_change_mind?: string | null
        }
        Update: {
          action_ref?: string | null
          actual_outcome?: string | null
          confidence?: number | null
          created_at?: string
          employee_id?: string
          expected_outcome?: string | null
          id?: string
          outcome_evaluated?: boolean
          reasoning?: string | null
          what_would_change_mind?: string | null
        }
        Relationships: []
      }
      employee_states: {
        Row: {
          active_objectives: string[] | null
          beliefs: Json
          chime_in_threshold: number
          cognitive_load: number
          confidence: number
          core_motivation: string | null
          created_at: string
          emotional_memory: Json
          emotional_stance: string
          employee_id: string
          founder_model: Json | null
          id: string
          initiative_score: number
          peer_models: Json
          performance_metrics: Json | null
          recent_decisions: Json | null
          reputation_score: number
          updated_at: string
        }
        Insert: {
          active_objectives?: string[] | null
          beliefs?: Json
          chime_in_threshold?: number
          cognitive_load?: number
          confidence?: number
          core_motivation?: string | null
          created_at?: string
          emotional_memory?: Json
          emotional_stance?: string
          employee_id: string
          founder_model?: Json | null
          id?: string
          initiative_score?: number
          peer_models?: Json
          performance_metrics?: Json | null
          recent_decisions?: Json | null
          reputation_score?: number
          updated_at?: string
        }
        Update: {
          active_objectives?: string[] | null
          beliefs?: Json
          chime_in_threshold?: number
          cognitive_load?: number
          confidence?: number
          core_motivation?: string | null
          created_at?: string
          emotional_memory?: Json
          emotional_stance?: string
          employee_id?: string
          founder_model?: Json | null
          id?: string
          initiative_score?: number
          peer_models?: Json
          performance_metrics?: Json | null
          recent_decisions?: Json | null
          reputation_score?: number
          updated_at?: string
        }
        Relationships: []
      }
      employee_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          from_employee: string
          id: string
          input_data: Json | null
          output_data: Json | null
          priority: string
          status: string
          task_type: string
          to_employee: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          from_employee: string
          id?: string
          input_data?: Json | null
          output_data?: Json | null
          priority?: string
          status?: string
          task_type: string
          to_employee: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          from_employee?: string
          id?: string
          input_data?: Json | null
          output_data?: Json | null
          priority?: string
          status?: string
          task_type?: string
          to_employee?: string
        }
        Relationships: []
      }
      engineering_activity: {
        Row: {
          activity_type: string
          created_at: string
          details: Json | null
          id: string
          summary: string
          user_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string
          details?: Json | null
          id?: string
          summary: string
          user_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          details?: Json | null
          id?: string
          summary?: string
          user_id?: string
        }
        Relationships: []
      }
      engineering_portfolio: {
        Row: {
          calculation_id: string | null
          created_at: string
          description: string | null
          id: string
          is_public: boolean | null
          key_specs: Json | null
          project_type: string
          thumbnail_url: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          calculation_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean | null
          key_specs?: Json | null
          project_type: string
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          calculation_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean | null
          key_specs?: Json | null
          project_type?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engineering_portfolio_calculation_id_fkey"
            columns: ["calculation_id"]
            isOneToOne: false
            referencedRelation: "calculation_history"
            referencedColumns: ["id"]
          },
        ]
      }
      engineering_projects: {
        Row: {
          created_at: string
          id: string
          inputs: Json
          project_name: string
          project_type: string
          results: Json | null
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inputs?: Json
          project_name: string
          project_type: string
          results?: Json | null
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inputs?: Json
          project_name?: string
          project_type?: string
          results?: Json | null
          status?: string | null
          updated_at?: string
          user_id?: string
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
          created_at: string | null
          error_message: string
          error_stack: string | null
          fix_applied: string | null
          id: string
          resolved_at: string | null
          resolved_note: string | null
          status: string | null
          url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          component_stack?: string | null
          created_at?: string | null
          error_message: string
          error_stack?: string | null
          fix_applied?: string | null
          id?: string
          resolved_at?: string | null
          resolved_note?: string | null
          status?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          component_stack?: string | null
          created_at?: string | null
          error_message?: string
          error_stack?: string | null
          fix_applied?: string | null
          id?: string
          resolved_at?: string | null
          resolved_note?: string | null
          status?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
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
      founder_context: {
        Row: {
          current_priorities: string[] | null
          current_projects: Json | null
          id: number
          last_topics: Json | null
          mood_signal: string | null
          open_decisions: Json | null
          people_context: Json | null
          preferences: Json | null
          updated_at: string | null
        }
        Insert: {
          current_priorities?: string[] | null
          current_projects?: Json | null
          id?: number
          last_topics?: Json | null
          mood_signal?: string | null
          open_decisions?: Json | null
          people_context?: Json | null
          preferences?: Json | null
          updated_at?: string | null
        }
        Update: {
          current_priorities?: string[] | null
          current_projects?: Json | null
          id?: number
          last_topics?: Json | null
          mood_signal?: string | null
          open_decisions?: Json | null
          people_context?: Json | null
          preferences?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      founder_directives: {
        Row: {
          category: string | null
          created_at: string | null
          directive: string
          expires_at: string | null
          id: string
          is_active: boolean | null
          priority: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          directive: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          priority?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          directive?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          priority?: number | null
        }
        Relationships: []
      }
      grading_projects: {
        Row: {
          created_at: string
          cut_volume: number | null
          description: string | null
          design_result: Json | null
          fill_volume: number | null
          id: string
          net_volume: number | null
          project_name: string
          requirements: string | null
          status: string | null
          survey_points: Json
          terrain_analysis: Json | null
          total_cost: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cut_volume?: number | null
          description?: string | null
          design_result?: Json | null
          fill_volume?: number | null
          id?: string
          net_volume?: number | null
          project_name: string
          requirements?: string | null
          status?: string | null
          survey_points?: Json
          terrain_analysis?: Json | null
          total_cost?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          cut_volume?: number | null
          description?: string | null
          design_result?: Json | null
          fill_volume?: number | null
          id?: string
          net_volume?: number | null
          project_name?: string
          requirements?: string | null
          status?: string | null
          survey_points?: Json
          terrain_analysis?: Json | null
          total_cost?: number | null
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
      marketing_competitors: {
        Row: {
          created_at: string
          handle: string
          id: string
          is_active: boolean
          last_scraped_at: string | null
          name: string | null
          notes: string | null
        }
        Insert: {
          created_at?: string
          handle: string
          id?: string
          is_active?: boolean
          last_scraped_at?: string | null
          name?: string | null
          notes?: string | null
        }
        Update: {
          created_at?: string
          handle?: string
          id?: string
          is_active?: boolean
          last_scraped_at?: string | null
          name?: string | null
          notes?: string | null
        }
        Relationships: []
      }
      material_prices: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          material_category: string
          material_name: string
          price_sar: number
          region: string | null
          supplier: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          material_category: string
          material_name: string
          price_sar: number
          region?: string | null
          supplier?: string | null
          unit: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          material_category?: string
          material_name?: string
          price_sar?: number
          region?: string | null
          supplier?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      message_ratings: {
        Row: {
          created_at: string | null
          id: string
          message_preview: string
          rating: string
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          message_preview: string
          rating: string
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          message_preview?: string
          rating?: string
          session_id?: string | null
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
        Relationships: []
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
      pinned_sessions: {
        Row: {
          id: string
          pinned_at: string | null
          session_id: string
          user_id: string
        }
        Insert: {
          id?: string
          pinned_at?: string | null
          session_id: string
          user_id: string
        }
        Update: {
          id?: string
          pinned_at?: string | null
          session_id?: string
          user_id?: string
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
      saved_insights: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          insight_text: string
          tags: string[] | null
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          insight_text: string
          tags?: string[] | null
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          insight_text?: string
          tags?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      saved_responses: {
        Row: {
          content: string
          created_at: string
          emotion: string | null
          id: string
          mode: string | null
          session_id: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          emotion?: string | null
          id?: string
          mode?: string | null
          session_id?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          emotion?: string | null
          id?: string
          mode?: string | null
          session_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      service_economics: {
        Row: {
          acquisition_difficulty: number
          average_margin: number
          category: string
          id: string
          notes: string | null
          operational_complexity: number
          retention_probability: number
          scalability_score: number
          service_id: string
          service_name: string
          time_to_deploy: string | null
          updated_at: string
        }
        Insert: {
          acquisition_difficulty?: number
          average_margin?: number
          category?: string
          id?: string
          notes?: string | null
          operational_complexity?: number
          retention_probability?: number
          scalability_score?: number
          service_id: string
          service_name: string
          time_to_deploy?: string | null
          updated_at?: string
        }
        Update: {
          acquisition_difficulty?: number
          average_margin?: number
          category?: string
          id?: string
          notes?: string | null
          operational_complexity?: number
          retention_probability?: number
          scalability_score?: number
          service_id?: string
          service_name?: string
          time_to_deploy?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      stress_test_metrics: {
        Row: {
          avg_response_time_ms: number | null
          concurrent_users: number | null
          created_at: string
          error_rate: number | null
          failure_count: number | null
          id: string
          p50_response_time_ms: number | null
          p95_response_time_ms: number | null
          p99_response_time_ms: number | null
          requests_per_second: number | null
          run_id: string
          success_count: number | null
          test_name: string
        }
        Insert: {
          avg_response_time_ms?: number | null
          concurrent_users?: number | null
          created_at?: string
          error_rate?: number | null
          failure_count?: number | null
          id?: string
          p50_response_time_ms?: number | null
          p95_response_time_ms?: number | null
          p99_response_time_ms?: number | null
          requests_per_second?: number | null
          run_id: string
          success_count?: number | null
          test_name: string
        }
        Update: {
          avg_response_time_ms?: number | null
          concurrent_users?: number | null
          created_at?: string
          error_rate?: number | null
          failure_count?: number | null
          id?: string
          p50_response_time_ms?: number | null
          p95_response_time_ms?: number | null
          p99_response_time_ms?: number | null
          requests_per_second?: number | null
          run_id?: string
          success_count?: number | null
          test_name?: string
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
      system_reports: {
        Row: {
          created_at: string
          generated_at: string
          id: string
          issues: Json | null
          issues_fixed: number
          issues_requiring_attention: number
          performance_metrics: Json | null
          recommendations: string[] | null
          report_data: Json | null
          report_id: string
          system_status: string
          total_issues: number
        }
        Insert: {
          created_at?: string
          generated_at?: string
          id?: string
          issues?: Json | null
          issues_fixed?: number
          issues_requiring_attention?: number
          performance_metrics?: Json | null
          recommendations?: string[] | null
          report_data?: Json | null
          report_id: string
          system_status: string
          total_issues?: number
        }
        Update: {
          created_at?: string
          generated_at?: string
          id?: string
          issues?: Json | null
          issues_fixed?: number
          issues_requiring_attention?: number
          performance_metrics?: Json | null
          recommendations?: string[] | null
          report_data?: Json | null
          report_id?: string
          system_status?: string
          total_issues?: number
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
      twitter_posts: {
        Row: {
          content: string
          content_type: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          error_message: string | null
          id: string
          image_url: string | null
          posted_at: string | null
          psychological_strategy: string | null
          quality_score: Json | null
          scheduled_at: string | null
          status: string
          target_audience: string | null
          thread_id: string | null
          thread_order: number | null
          tweet_id: string | null
          updated_at: string
        }
        Insert: {
          content: string
          content_type?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          error_message?: string | null
          id?: string
          image_url?: string | null
          posted_at?: string | null
          psychological_strategy?: string | null
          quality_score?: Json | null
          scheduled_at?: string | null
          status?: string
          target_audience?: string | null
          thread_id?: string | null
          thread_order?: number | null
          tweet_id?: string | null
          updated_at?: string
        }
        Update: {
          content?: string
          content_type?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          error_message?: string | null
          id?: string
          image_url?: string | null
          posted_at?: string | null
          psychological_strategy?: string | null
          quality_score?: Json | null
          scheduled_at?: string | null
          status?: string
          target_audience?: string | null
          thread_id?: string | null
          thread_order?: number | null
          tweet_id?: string | null
          updated_at?: string
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
          role?: Database["public"]["Enums"]["app_role"]
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
      ayn_prediction_vote_counts: {
        Row: {
          agree_count: number | null
          disagree_count: number | null
          prediction_id: string | null
          total_votes: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ayn_prediction_votes_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "ayn_predictions"
            referencedColumns: ["id"]
          },
        ]
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
      get_profile_business_context: {
        Args: { _user_id: string; p_encryption_key?: string }
        Returns: string
      }
      get_public_creator_profile: {
        Args: { p_creator_id: string }
        Returns: Json
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
      has_active_access: { Args: { _user_id: string }; Returns: boolean }
      has_duty_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_faq_helpful: { Args: { faq_id: string }; Returns: undefined }
      increment_faq_view: { Args: { faq_id: string }; Returns: undefined }
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
      refresh_accuracy_calibration: { Args: never; Returns: undefined }
      refresh_intelligence_brief: { Args: never; Returns: undefined }
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
    },
  },
} as const
