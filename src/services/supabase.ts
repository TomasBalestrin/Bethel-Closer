import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase credentials not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          user_id: string
          name: string
          email: string
          avatar_url: string | null
          role: 'admin' | 'closer' | 'lider'
          phone: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      clients: {
        Row: {
          id: string
          name: string
          email: string
          phone: string
          company: string | null
          status: 'lead' | 'contacted' | 'negotiating' | 'closed_won' | 'closed_lost'
          source: 'organic' | 'referral' | 'ads' | 'event' | 'other'
          ticket_type: '29_90' | '12k' | '80k' | 'impl_ia' | null
          entry_value: number | null
          sale_value: number | null
          closer_id: string
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['clients']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['clients']['Insert']>
      }
      calls: {
        Row: {
          id: string
          client_id: string
          closer_id: string
          scheduled_at: string
          duration_minutes: number | null
          status: 'scheduled' | 'completed' | 'no_show' | 'rescheduled' | 'cancelled'
          classification: 'hot' | 'warm' | 'cold' | 'not_qualified' | null
          notes: string | null
          recording_url: string | null
          ai_summary: string | null
          ai_analysis: Record<string, unknown> | null
          quality_score: number | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['calls']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['calls']['Insert']>
      }
      client_activities: {
        Row: {
          id: string
          client_id: string
          user_id: string
          type: 'call' | 'email' | 'meeting' | 'note' | 'status_change'
          description: string
          metadata: Record<string, unknown> | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['client_activities']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['client_activities']['Insert']>
      }
      client_notes: {
        Row: {
          id: string
          client_id: string
          user_id: string
          content: string
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['client_notes']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['client_notes']['Insert']>
      }
      tags: {
        Row: {
          id: string
          name: string
          color: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['tags']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['tags']['Insert']>
      }
      client_tags: {
        Row: {
          id: string
          client_id: string
          tag_id: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['client_tags']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['client_tags']['Insert']>
      }
      monthly_goals: {
        Row: {
          id: string
          closer_id: string
          month: number
          year: number
          target_calls: number
          target_sales: number
          target_revenue: number
          actual_calls: number
          actual_sales: number
          actual_revenue: number
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['monthly_goals']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['monthly_goals']['Insert']>
      }
      crm_call_clients: {
        Row: {
          id: string
          name: string
          phone: string | null
          email: string | null
          company: string | null
          niche: string | null
          monthly_revenue: number | null
          has_partner: boolean
          funnel_source: string | null
          sdr: string | null
          product_offered: string | null
          stage: 'call_realizada' | 'repitch' | 'pos_call_0_2' | 'pos_call_3_7'
          call_date: string | null
          sale_value: number | null
          closer_id: string
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['crm_call_clients']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['crm_call_clients']['Insert']>
      }
      intensivo_events: {
        Row: {
          id: string
          name: string
          date: string
          location: string
          closer_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['intensivo_events']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['intensivo_events']['Insert']>
      }
      intensivo_leads: {
        Row: {
          id: string
          event_id: string
          name: string
          phone: string | null
          email: string | null
          company: string | null
          stage: 'abordagem_inicial' | 'nivel_consciencia' | 'convite_intensivo' | 'aguardando_confirmacao' | 'confirmados' | 'retirado_ingresso' | 'aquecimento_30d' | 'aquecimento_7d' | 'aquecimento_1d' | 'compareceram' | 'nao_compareceram' | 'sem_interesse'
          closer_id: string
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['intensivo_leads']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['intensivo_leads']['Insert']>
      }
    }
  }
}
