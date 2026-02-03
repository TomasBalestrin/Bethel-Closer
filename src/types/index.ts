// User types
export type UserRole = 'admin' | 'closer' | 'lider'

export interface User {
  id: string
  email: string
  name: string
  avatar_url?: string
  role: UserRole
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  user_id: string
  name: string
  email: string
  avatar_url?: string
  role: UserRole
  phone?: string
  created_at: string
  updated_at: string
}

// Client types
export type ClientStatus = 'lead' | 'contacted' | 'negotiating' | 'closed_won' | 'closed_lost'
export type ClientSource = 'organic' | 'referral' | 'ads' | 'event' | 'other'
export type TicketType = '29_90' | '12k' | '80k'

export interface Client {
  id: string
  name: string
  email: string
  phone: string
  company?: string
  status: ClientStatus
  source: ClientSource
  ticket_type?: TicketType
  entry_value?: number
  sale_value?: number
  closer_id: string
  notes?: string
  tags?: string[]
  created_at: string
  updated_at: string
}

export interface ClientActivity {
  id: string
  client_id: string
  user_id: string
  type: 'call' | 'email' | 'meeting' | 'note' | 'status_change'
  description: string
  metadata?: Record<string, unknown>
  created_at: string
}

export interface ClientNote {
  id: string
  client_id: string
  user_id: string
  content: string
  created_at: string
  updated_at: string
}

// Call types
export type CallStatus = 'scheduled' | 'completed' | 'no_show' | 'rescheduled' | 'cancelled'
export type CallClassification = 'hot' | 'warm' | 'cold' | 'not_qualified'

export interface Call {
  id: string
  client_id: string
  closer_id: string
  scheduled_at: string
  duration_minutes?: number
  status: CallStatus
  classification?: CallClassification
  notes?: string
  recording_url?: string
  ai_summary?: string
  ai_analysis?: AIAnalysis
  quality_score?: number
  created_at: string
  updated_at: string
}

export interface AIAnalysis {
  sentiment: 'positive' | 'neutral' | 'negative'
  key_points: string[]
  objections: string[]
  next_steps: string[]
  buying_signals: string[]
  risk_factors: string[]
  recommended_actions: string[]
  score: number
}

// Dashboard types
export interface DashboardStats {
  totalClients: number
  newClientsThisMonth: number
  totalCalls: number
  callsThisMonth: number
  conversionRate: number
  totalRevenue: number
  revenueThisMonth: number
  avgCallDuration: number
}

export interface MonthlyGoal {
  id: string
  closer_id: string
  month: string
  target_calls: number
  target_sales: number
  target_revenue: number
  actual_calls: number
  actual_sales: number
  actual_revenue: number
  created_at: string
  updated_at: string
}

// Tag types
export interface Tag {
  id: string
  name: string
  color: string
  created_at: string
}

// Pagination
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// API Response
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}
