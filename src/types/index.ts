// User types
export type UserRole = 'admin' | 'closer' | 'lider' | 'financeiro'

// Closer levels (8 levels as per PRD)
export type CloserLevel =
  | 'assessor'
  | 'executivo'
  | 'pro'
  | 'elite'
  | 'especialista'
  | 'especialista_pro'
  | 'especialista_elite'
  | 'lider'

// Closer classification by AI (5 levels)
export type CloserClassification =
  | 'iniciante'
  | 'intermediario'
  | 'avancado'
  | 'alta_performance'
  | 'elite'

// Lead classification
export type LeadClassification = 'pos_venda' | 'follow'

// Lead temperature
export type LeadTemperature = 'quente' | 'morno' | 'frio'

export interface User {
  id: string           // auth.users.id - for authentication
  profileId: string    // profiles.id - for data relationships (calls, clients, etc.)
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
  // New PRD fields
  closer_level?: CloserLevel
  google_connected?: boolean
  google_email?: string
  drive_folder_id?: string
  drive_folder_name?: string
  auto_import_enabled?: boolean
  import_frequency?: string
  import_file_types?: string[]
  import_name_patterns?: string[]
  last_sync_at?: string
  status?: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

// User Role Record (separate table as per PRD)
export interface UserRoleRecord {
  id: string
  user_id: string
  role: UserRole
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

// CRM Calls Pipeline types - 10 Kanban columns
export type CrmCallStage =
  | 'call_realizada'      // Call Realizada - Preencher dados (blue)
  | 'repitch'             // RePitch (orange)
  | 'pos_call_0_2'        // Pos Call 0-2 dias - Depoimentos e Conexao (cyan)
  | 'pos_call_3_7'        // Pos Call 3-7 dias - Presente e Mentoria (green)
  | 'pos_call_8_15'       // Pos Call 8-15 dias - Feedback e Oferta (yellow)
  | 'pos_call_16_21'      // Pos Call 16-21 dias - Convite Intensivo (purple)
  | 'sinal_compromisso'   // Sinal de Compromisso (indigo)
  | 'venda_realizada'     // Venda Realizada (emerald)
  | 'aluno_nao_fit'       // Aluno Nao Fit (red)
  | 'pos_21_carterizacao' // Pos 21 dias - Carterizacao (slate)

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
  entry_value?: number
  contract_validity?: string
  sale_notes?: string
  closer_id: string
  notes?: string
  is_super_hot?: boolean
  is_indication?: boolean
  is_sold?: boolean
  sold_at?: string
  stage_entered_at?: string
  tags?: string[]
  created_at: string
  updated_at: string
}

// CRM Kanban Column definitions
export interface KanbanColumnDef {
  id: CrmCallStage
  title: string
  subtitle?: string
  color: string
  borderColor: string
  bgColor: string
}

// CRM Column Settings (user customizable)
export interface CrmColumnSettings {
  id: string
  user_id: string
  column_id: CrmCallStage
  custom_title?: string
  custom_subtitle?: string
  created_at: string
  updated_at: string
}

// CRM Automation types
export type AutomationTriggerType =
  | 'days_in_column'
  | 'followup_date_reached'
  | 'tag_added'
  | 'data_completed'
  | 'no_interaction'

export type AutomationActionType =
  | 'move_to_column'
  | 'add_tag'
  | 'remove_tag'
  | 'send_notification'
  | 'mark_super_hot'

export interface CrmAutomation {
  id: string
  user_id: string
  name: string
  description?: string
  is_active: boolean
  trigger_type: AutomationTriggerType
  trigger_config: {
    column_id?: CrmCallStage
    days?: number
    tag_name?: string
    fields?: string[]
  }
  action_type: AutomationActionType
  action_config: {
    target_column?: CrmCallStage
    tag_name?: string
    notification_message?: string
  }
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
// Squad types
export interface Squad {
  id: string
  name: string
  description?: string
  leader_id?: string
  created_at: string
  updated_at: string
}

export interface SquadMember {
  id: string
  squad_id: string
  profile_id: string
  created_at: string
}

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

// Portfolio types
export type PortfolioTicketType = '29_90' | '12k' | '80k'

export type StudentActivityType = 'intensivo' | 'mentoria' | 'evento'

export type IndicationSource = 'call' | 'intensivo'

export interface PortfolioStudent {
  id: string
  name: string
  email?: string
  phone?: string
  company?: string
  ticket_type: PortfolioTicketType
  original_ticket_type?: PortfolioTicketType
  closer_id: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface StudentActivity {
  id: string
  student_id: string
  type: StudentActivityType
  title: string
  description?: string
  event_date?: string
  created_at: string
}

export interface StudentIndication {
  id: string
  student_id: string
  indicated_name: string
  indicated_phone?: string
  indicated_email?: string
  source: IndicationSource
  is_closed: boolean
  closed_at?: string
  notes?: string
  created_at: string
}

export interface PortfolioFilters {
  ticketType: 'all' | PortfolioTicketType
  activities: 'all' | 'with' | 'without' | 'intensivo' | 'mentoria' | 'evento'
  indications: 'all' | 'with' | 'without'
  dateRange?: {
    from: Date
    to: Date
  }
  month?: string // YYYY-MM format
}

export interface PortfolioMetrics {
  totalStudents: number
  ascensions29To12k: { count: number; percentage: number }
  ascensions12kTo80k: { count: number; percentage: number }
  totalAscensions: number
  ticketCounts: Record<PortfolioTicketType, number>
  totalActivities: number
  activitiesByType: Record<StudentActivityType, number>
  totalIndications: number
  indicationsBySource: Record<IndicationSource, number>
  closedIndications: number
  indicationConversionRate: number
}

// ============================================================
// Notification types
// ============================================================

export type NotificationType = 'followup' | 'alert' | 'info' | 'success' | 'warning'

export interface Notification {
  id: string
  user_id: string
  title: string
  message: string
  type: NotificationType
  read: boolean
  metadata?: Record<string, unknown>
  created_at: string
}

// ============================================================
// Import types
// ============================================================

export type ImportFileStatus = 'pending' | 'processing' | 'completed' | 'error'

export interface ImportedFile {
  id: string
  user_id: string
  drive_file_id: string
  file_name: string
  file_type?: string
  file_size?: number
  status: ImportFileStatus
  retry_count: number
  started_processing_at?: string
  completed_at?: string
  error_message?: string
  call_id?: string
  content_hash?: string
  created_at: string
  updated_at: string
}

export interface ImportProgress {
  id: string
  user_id: string
  session_id: string
  total_files: number
  processed_files: number
  successful_files: number
  failed_files: number
  current_file?: string
  status: string
  started_at: string
  completed_at?: string
}

export interface UserImportSession {
  id: string
  user_id: string
  session_type: 'manual' | 'auto' | 'initial'
  files_found: number
  files_processed: number
  files_successful: number
  files_skipped: number
  files_failed: number
  started_at: string
  completed_at?: string
  metadata?: Record<string, unknown>
}

// ============================================================
// System Observability types
// ============================================================

export type LogLevel = 'info' | 'warning' | 'error' | 'debug'

export interface SystemLog {
  id: string
  level: LogLevel
  service: string
  operation?: string
  user_id?: string
  duration_ms?: number
  error_message?: string
  stack_trace?: string
  metadata?: Record<string, unknown>
  created_at: string
}

export interface ApiCost {
  id: string
  service: string
  model?: string
  operation?: string
  tokens_input: number
  tokens_output: number
  estimated_cost_usd: number
  user_id?: string
  call_id?: string
  metadata?: Record<string, unknown>
  created_at: string
}

export interface ApiRateLimit {
  id: string
  user_id: string
  service: string
  window_start: string
  request_count: number
  tokens_used: number
  created_at: string
  updated_at: string
}

export interface SystemMetrics24h {
  service: string
  error_count: number
  warning_count: number
  total_operations: number
  avg_duration_ms: number
  max_duration_ms: number
  success_rate_pct: number
}

// ============================================================
// Admin Audit types
// ============================================================

export interface AdminAuditLog {
  id: string
  performed_by: string
  action_type: string
  entity_type: string
  entity_id?: string
  old_value?: Record<string, unknown>
  new_value?: Record<string, unknown>
  metadata?: Record<string, unknown>
  ip_address?: string
  user_agent?: string
  created_at: string
}

// ============================================================
// Backup types
// ============================================================

export interface CallBackup {
  id: string
  call_id: string
  data: Record<string, unknown>
  operation: 'UPDATE' | 'DELETE'
  backed_up_at: string
  backed_up_by?: string
}

export interface ClientBackup {
  id: string
  client_id: string
  data: Record<string, unknown>
  operation: 'UPDATE' | 'DELETE'
  backed_up_at: string
  backed_up_by?: string
}

// ============================================================
// Daily Verse types
// ============================================================

export interface DailyVerse {
  id: string
  day_of_year: number
  verse_text: string
  reference: string
  created_at: string
}

// ============================================================
// Intensivo Editions (enhanced)
// ============================================================

export interface IntensiveEdition {
  id: string
  name: string
  event_date: string
  location?: string
  description?: string
  is_active: boolean
  created_by?: string
  created_at: string
  updated_at: string
}

export interface IntensiveLeadNote {
  id: string
  lead_id: string
  user_id?: string
  content: string
  created_at: string
}

// ============================================================
// Client Extra tables
// ============================================================

export interface ClientMentoriaExtra {
  id: string
  client_id: string
  mentoria_name: string
  mentoria_date?: string
  notes?: string
  created_at: string
}

export interface ClientIntensivoParticipation {
  id: string
  client_id: string
  edition_id?: string
  participated: boolean
  participation_date?: string
  notes?: string
  created_at: string
}

// ============================================================
// Constants
// ============================================================

// Funnel sources (21 options as per PRD)
export const FUNNEL_SOURCES = [
  '50 scripts',
  'Teste dos Arquetipos',
  'MPM',
  'Implementacao de IA da Julia',
  'Social Selling Julia',
  'Social Selling Cleiton',
  'Social Selling Bethel',
  'Social Selling Kennedy',
  'Formulario Instagram Cleiton',
  'Formulario Instagram Julia',
  'Formulario Instagram Bethel',
  'Formulario Instagram Kennedy',
  'Formulario Youtube',
  'Indicacao de Aluno',
  'Indicacao de Mentorado',
  'Indicacao de Vendedor',
  'Indicacao Elite Premium',
  'Implementacao Comercial',
  'Implementacao Personalizada IA',
  'Mentoria Julia',
  'Elite Premium',
  'Bethel Club'
] as const

export type FunnelSource = typeof FUNNEL_SOURCES[number]

// SDRs (6 as per PRD)
export const SDRS = ['Jaque', 'Dienifer', 'Nathali', 'Thalita', 'Maria', 'Carlos'] as const
export type SDR = typeof SDRS[number]

// Products offered
export const PRODUCTS = [
  'Mentoria Premium',
  'Mentoria Elite Premium',
  'Implementacao Comercial',
  'Bethel Club',
  'Intensivo da Alta Performance',
  'Implementacao de IA'
] as const
export type ProductOffered = typeof PRODUCTS[number]

// Closer Level Display Config
export const CLOSER_LEVEL_CONFIG: Record<CloserLevel, { label: string; color: string }> = {
  assessor: { label: 'Assessor', color: 'gray' },
  executivo: { label: 'Executivo', color: 'amber' },
  pro: { label: 'Pro', color: 'slate' },
  elite: { label: 'Elite', color: 'yellow' },
  especialista: { label: 'Especialista', color: 'blue' },
  especialista_pro: { label: 'Especialista Pro', color: 'purple' },
  especialista_elite: { label: 'Especialista Elite', color: 'emerald' },
  lider: { label: 'Lider', color: 'pink' }
}

// CRM Kanban Column Definitions
export const CRM_COLUMNS: KanbanColumnDef[] = [
  { id: 'call_realizada', title: 'Call Realizada', subtitle: 'Preencher dados', color: 'blue', borderColor: 'border-blue-500', bgColor: 'bg-blue-500/10' },
  { id: 'repitch', title: 'RePitch', color: 'orange', borderColor: 'border-orange-500', bgColor: 'bg-orange-500/10' },
  { id: 'pos_call_0_2', title: 'Pos Call 0-2 dias', subtitle: 'Depoimentos e Conexao', color: 'cyan', borderColor: 'border-cyan-500', bgColor: 'bg-cyan-500/10' },
  { id: 'pos_call_3_7', title: 'Pos Call 3-7 dias', subtitle: 'Presente e Mentoria', color: 'green', borderColor: 'border-green-500', bgColor: 'bg-green-500/10' },
  { id: 'pos_call_8_15', title: 'Pos Call 8-15 dias', subtitle: 'Feedback e Oferta', color: 'yellow', borderColor: 'border-yellow-500', bgColor: 'bg-yellow-500/10' },
  { id: 'pos_call_16_21', title: 'Pos Call 16-21 dias', subtitle: 'Convite Intensivo', color: 'purple', borderColor: 'border-purple-500', bgColor: 'bg-purple-500/10' },
  { id: 'sinal_compromisso', title: 'Sinal de Compromisso', color: 'indigo', borderColor: 'border-indigo-500', bgColor: 'bg-indigo-500/10' },
  { id: 'venda_realizada', title: 'Venda Realizada', color: 'emerald', borderColor: 'border-emerald-500', bgColor: 'bg-emerald-500/10' },
  { id: 'aluno_nao_fit', title: 'Aluno Nao Fit', color: 'red', borderColor: 'border-red-500', bgColor: 'bg-red-500/10' },
  { id: 'pos_21_carterizacao', title: 'Pos 21 dias', subtitle: 'Carterizacao', color: 'slate', borderColor: 'border-slate-500', bgColor: 'bg-slate-500/10' }
]

// Intensivo Kanban Column Definitions (14 columns as per PRD)
export const INTENSIVO_COLUMNS = [
  { id: 'abordagem_inicial', title: 'Abordagem Inicial', color: 'blue' },
  { id: 'nivel_consciencia', title: 'Nivel de Consciencia', color: 'purple' },
  { id: 'convite_intensivo', title: 'Convite pro Intensivo', color: 'cyan' },
  { id: 'aguardando_confirmacao', title: 'Aguardando Confirmacao', color: 'yellow' },
  { id: 'confirmados', title: 'Confirmados', color: 'green' },
  { id: 'retirado_ingresso', title: 'Retirado o Ingresso', color: 'emerald' },
  { id: 'aquecimento_30d', title: 'Aquecimento -30 dias', color: 'orange' },
  { id: 'aquecimento_15d', title: 'Aquecimento -15 dias', color: 'orange' },
  { id: 'aquecimento_7d', title: 'Aquecimento -7 dias', color: 'orange' },
  { id: 'aquecimento_1d', title: 'Aquecimento -1 dia', color: 'red' },
  { id: 'compareceram', title: 'Compareceram', color: 'green' },
  { id: 'nao_compareceram', title: 'Nao Compareceram', color: 'red' },
  { id: 'sem_interesse', title: 'Nao tem interesse', color: 'gray' },
  { id: 'proximo_intensivo', title: 'Chamar no Proximo', color: 'indigo' }
] as const

// Error Checklist Keys
export const ERROR_CHECKLIST_KEYS = [
  'abertura_ancoragem_script',
  'profundidade_nao_fugir_assunto',
  'emocao_e_tensao',
  'prova_social_seeds_durante_perguntas',
  'objecao_real_vs_declarada',
  'negociacao_maximizar_receita'
] as const

export const ERROR_CHECKLIST_LABELS: Record<typeof ERROR_CHECKLIST_KEYS[number], string> = {
  abertura_ancoragem_script: 'Abertura / Ancoragem / Script',
  profundidade_nao_fugir_assunto: 'Profundidade (Nao Fugir do Assunto)',
  emocao_e_tensao: 'Emocao e Tensao',
  prova_social_seeds_durante_perguntas: 'Prova Social / Seeds Durante Perguntas',
  objecao_real_vs_declarada: 'Objecao Real vs Declarada',
  negociacao_maximizar_receita: 'Negociacao (Maximizar Receita)'
}

// Analysis Stages (12 as per PRD)
export const ANALYSIS_STAGES = [
  'conexao',
  'abertura',
  'mapeamento_empresa',
  'mapeamento_problema',
  'consultoria',
  'problematizacao',
  'solucao_imaginada',
  'transicao',
  'pitch',
  'perguntas_compromisso',
  'fechamento',
  'objecoes_negociacao'
] as const

export const ANALYSIS_STAGE_LABELS: Record<typeof ANALYSIS_STAGES[number], string> = {
  conexao: 'Conexao Estrategica',
  abertura: 'Abertura',
  mapeamento_empresa: 'Mapeamento da Empresa',
  mapeamento_problema: 'Mapeamento do Problema / Dor Profunda',
  consultoria: 'Consultoria Estrategica',
  problematizacao: 'Problematizacao',
  solucao_imaginada: 'Solucao Imaginada',
  transicao: 'Transicao',
  pitch: 'Pitch',
  perguntas_compromisso: 'Perguntas de Compromisso',
  fechamento: 'Fechamento Estrategico',
  objecoes_negociacao: 'Quebra de Objecoes / Negociacao'
}

// Legacy stage key mapping
export const LEGACY_STAGE_MAPPING: Record<string, string> = {
  mapeamento_negocio: 'mapeamento_empresa',
  mapeamento_problemas: 'mapeamento_problema',
  contorno_objecoes: 'objecoes_negociacao'
}

// Cota minima mensal
export const MONTHLY_QUOTA = 15000 // R$ 15.000 por closer

// Master admin email
export const MASTER_ADMIN_EMAIL = 'tomasbalestrin@gmail.com'
