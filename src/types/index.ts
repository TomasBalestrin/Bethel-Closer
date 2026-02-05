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
export type TicketType = '29_90' | '12k' | '80k' | 'impl_ia'

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
export type CallResultStatus = 'pendente' | 'follow_up' | 'proposta' | 'vendida' | 'perdida'

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
  ai_analysis?: CallAnalysisFull
  quality_score?: number
  created_at: string
  updated_at: string
}

// Full AI Analysis from Master Prompt
export interface CallAnalysisFull {
  framework_selecionado?: string
  confianca_framework?: number
  motivo_escolha_framework?: string[]

  identificacao?: {
    nome_lead?: string
    nome_closer?: string
    produto_ofertado?: string
    houve_venda?: string
  }

  dados_extraidos?: {
    nicho_profissao?: string
    modelo_de_venda?: string
    ticket_medio?: string
    faturamento_mensal_bruto?: string
    faturamento_mensal_liquido?: string
    equipe?: string
    canais_aquisicao?: string[]
    estrutura_comercial?: string
    dor_principal_declarada?: { texto?: string; evidencia?: string }
    dor_profunda?: { texto?: string; evidencia?: string }
    objetivo_12_meses?: string
    urgencia_declarada?: string
    importancia_declarada?: string
    objecoes_levantadas?: Array<{ objecao?: string; evidencia?: string }>
    motivo_compra_ou_nao_compra?: Array<{ motivo?: string; evidencia?: string }>
  }

  nota_geral?: number
  justificativa_nota_geral?: string[]

  maiores_acertos?: Array<{
    acerto?: string
    evidencia?: string
    porque_importa?: string
    como_repetir?: string
  }>

  maiores_erros?: Array<{
    erro?: string
    evidencia?: string
    impacto?: string
    como_corrigir?: string[]
    frase_pronta?: { antes?: string; depois?: string }
  }>

  ponto_de_perda_da_venda?: string | null
  sinais_da_perda?: string[]

  se_vendeu?: {
    porque_comprou?: Array<{ motivo?: string; evidencia?: string }>
    gatilhos_que_mais_pesaram?: string[]
  }

  checklist_erros_recorrentes?: Record<string, {
    status?: string
    evidencias?: string[]
    correcao?: string
  }>

  analise_por_etapa?: Record<string, {
    aconteceu?: string
    nota?: number
    funcao_cumprida?: string
    evidencias?: string[]
    ponto_forte?: string[]
    ponto_fraco?: string[]
    erro_de_execucao?: string
    impacto_no_lead?: string
    como_corrigir?: string[]
    frase_melhor?: { antes?: string; depois?: string }
    perguntas_de_aprofundamento?: string[]
    seeds_prova_social?: { usadas?: string[]; faltaram?: string[] }
    risco_principal_da_etapa?: string
  }>

  plano_de_acao_direto?: {
    ajuste_numero_1?: {
      diagnostico?: string
      o_que_fazer_na_proxima_call?: string[]
      script_30_segundos?: string
    }
    treino_recomendado?: Array<{
      habilidade?: string
      como_treinar?: string
      meta_objetiva?: string
    }>
    proxima_acao_com_lead?: {
      status?: string
      passo?: string
      mensagem_sugerida_whats?: string
    }
  }

  // Metadata
  result_status?: CallResultStatus
  drive_file_id?: string

  // Legacy compatibility
  sentiment?: string
  key_points?: string[]
  objections?: string[]
  next_steps?: string[]
  buying_signals?: string[]
  risk_factors?: string[]
  recommended_actions?: string[]
  score?: number
  summary?: string
  [key: string]: unknown
}

// Legacy alias
export type AIAnalysis = CallAnalysisFull

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

// CRM Calls Pipeline types
export type CrmCallStage = 'call_realizada' | 'repitch' | 'pos_call_0_2' | 'pos_call_3_7'

export interface CrmCallClient {
  id: string
  name: string
  phone?: string
  email?: string
  company?: string
  niche?: string
  monthly_revenue?: number
  has_partner: boolean
  funnel_source?: string
  sdr?: string
  product_offered?: string
  stage: CrmCallStage
  call_date?: string
  sale_value?: number
  closer_id: string
  notes?: string
  created_at: string
  updated_at: string
}

// CRM Intensivo types
export type IntensivoStage =
  | 'abordagem_inicial'
  | 'nivel_consciencia'
  | 'convite_intensivo'
  | 'aguardando_confirmacao'
  | 'confirmados'
  | 'retirado_ingresso'
  | 'aquecimento_30d'
  | 'aquecimento_7d'
  | 'aquecimento_1d'
  | 'compareceram'
  | 'nao_compareceram'
  | 'sem_interesse'

export interface IntensivoEvent {
  id: string
  name: string
  date: string
  location: string
  closer_id?: string
  created_at: string
  updated_at: string
}

export interface IntensivoLead {
  id: string
  event_id: string
  name: string
  phone?: string
  email?: string
  company?: string
  stage: IntensivoStage
  closer_id: string
  notes?: string
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
