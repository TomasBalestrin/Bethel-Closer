import { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  Phone,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  X,
  Star,
  Target,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Clock,
  FileText,
  FolderSync,
  Eye,
  BarChart3,
  ArrowRight,
  MessageSquare,
  ShieldAlert,
  Award,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Zap,
  Trash2,
  AlertCircle,
  MoreVertical,
  ExternalLink,
  UserPlus,
  Loader2 as Loader
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase } from '@/services/supabase'
import { analyzeCallTranscript } from '@/services/openai'
import { syncFromDrive, connectDrive, trySilentSync, isDriveConnected, getDriveConfig, deriveResultStatus } from '@/services/driveSync'
import type { SyncProgress } from '@/services/driveSync'
import { useAuthStore } from '@/stores/authStore'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { Call, CallResultStatus, CallAnalysisFull, Client } from '@/types'
import { DateRangePicker, ActiveFiltersChips, MergeCallDialog, type DateRange } from '@/components/calls'
import { isWithinInterval, parseISO } from 'date-fns'

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const CALLS_PER_PAGE = 18

type TabKey = 'total' | 'pendentes' | 'follow_up' | 'propostas' | 'vendidas' | 'perdidas'

const TAB_CONFIG: { key: TabKey; label: string; color: string }[] = [
  { key: 'total', label: 'Total', color: 'text-foreground' },
  { key: 'pendentes', label: 'Pendentes', color: 'text-yellow-600 dark:text-yellow-400' },
  { key: 'follow_up', label: 'Follow-up', color: 'text-blue-600 dark:text-blue-400' },
  { key: 'propostas', label: 'Propostas', color: 'text-purple-600 dark:text-purple-400' },
  { key: 'vendidas', label: 'Vendidas', color: 'text-green-600 dark:text-green-400' },
  { key: 'perdidas', label: 'Perdidas', color: 'text-red-600 dark:text-red-400' }
]

const RESULT_STATUS_BADGES: Record<CallResultStatus, { label: string; className: string }> = {
  pendente: { label: 'Pendente', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800' },
  follow_up: { label: 'Follow-up', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
  proposta: { label: 'Proposta', className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-800' },
  vendida: { label: 'Vendida', className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-800' },
  perdida: { label: 'Perdida', className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800' }
}

const ETAPA_LABELS: Record<string, string> = {
  conexao: 'Conexão Estratégica',
  abertura: 'Abertura',
  mapeamento_empresa: 'Mapeamento da Empresa',
  mapeamento_problema: 'Mapeamento do Problema',
  consultoria: 'Consultoria Estratégica',
  problematizacao: 'Problematização',
  solucao_imaginada: 'Solução Imaginada',
  transicao: 'Transição',
  pitch: 'Pitch',
  perguntas_compromisso: 'Perguntas de Compromisso',
  fechamento: 'Fechamento Estratégico',
  objecoes_negociacao: 'Quebra de Objeções'
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function getResultStatus(call: Call): CallResultStatus {
  const analysis = call.ai_analysis as CallAnalysisFull | undefined
  if (!analysis || !analysis.nota_geral) return 'pendente'
  if (analysis.result_status) return analysis.result_status
  return deriveResultStatus(analysis)
}

function getScoreColor(score: number): string {
  if (score >= 8) return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700'
  if (score >= 5) return 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/40 border-yellow-300 dark:border-yellow-700'
  return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-700'
}

function getScoreBgColor(score: number): string {
  if (score >= 8) return 'from-green-500 to-emerald-600'
  if (score >= 5) return 'from-yellow-500 to-orange-500'
  return 'from-red-500 to-rose-600'
}

function getLevelFromScore(score: number): { label: string; color: string } {
  if (score >= 8) return { label: 'Avançado', color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' }
  if (score >= 5) return { label: 'Intermediário', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300' }
  return { label: 'Iniciante', color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' }
}

function getCheckStatusIcon(status?: string) {
  if (status === 'ok') return <CheckCircle2 className="h-4 w-4 text-green-500" />
  if (status === 'parcial') return <AlertTriangle className="h-4 w-4 text-yellow-500" />
  return <XCircle className="h-4 w-4 text-red-500" />
}

// ──────────────────────────────────────────────
// Main Page Component
// ──────────────────────────────────────────────

export default function CallsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('total')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [selectedCall, setSelectedCall] = useState<(Call & { client?: Client }) | null>(null)
  const [showSummary, setShowSummary] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [isAnalyzing, setIsAnalyzing] = useState<string | null>(null)
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null)
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  // ── Queries ──

  const { data: calls, isLoading } = useQuery({
    queryKey: ['calls-analysis'],
    queryFn: async () => {
      console.log('[Calls] Fetching calls from database...')
      const { data, error } = await supabase
        .from('calls')
        .select(`*, client:clients(id, name, email, phone, company)`)
        .order('scheduled_at', { ascending: false })

      if (error) {
        console.error('[Calls] Error fetching calls:', error)
        throw error
      }
      console.log('[Calls] Fetched', data?.length || 0, 'calls')
      return data as (Call & { client?: Client })[]
    },
    refetchInterval: 60000 // Auto-refresh every 60s for near real-time
  })

  // ── Computed ──

  const callsWithStatus = useMemo(() => {
    if (!calls) return []
    return calls.map(call => ({
      ...call,
      _resultStatus: getResultStatus(call)
    }))
  }, [calls])

  const tabCounts = useMemo(() => {
    const counts: Record<TabKey, number> = { total: 0, pendentes: 0, follow_up: 0, propostas: 0, vendidas: 0, perdidas: 0 }
    const statusToTab: Record<CallResultStatus, TabKey> = {
      pendente: 'pendentes', follow_up: 'follow_up', proposta: 'propostas', vendida: 'vendidas', perdida: 'perdidas'
    }
    callsWithStatus.forEach(c => {
      counts.total++
      const tabKey = statusToTab[c._resultStatus]
      if (tabKey) counts[tabKey]++
    })
    return counts
  }, [callsWithStatus])

  const filteredCalls = useMemo(() => {
    let list = callsWithStatus

    // Tab filter
    if (activeTab !== 'total') {
      const statusMap: Record<string, CallResultStatus> = {
        pendentes: 'pendente', follow_up: 'follow_up', propostas: 'proposta', vendidas: 'vendida', perdidas: 'perdida'
      }
      list = list.filter(c => c._resultStatus === statusMap[activeTab])
    }

    // Date range filter
    if (dateRange?.from) {
      list = list.filter(c => {
        const callDate = parseISO(c.scheduled_at)
        if (dateRange.to) {
          return isWithinInterval(callDate, { start: dateRange.from!, end: dateRange.to })
        }
        return callDate >= dateRange.from!
      })
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(c =>
        c.client?.name?.toLowerCase().includes(q) ||
        (c.ai_analysis as CallAnalysisFull)?.identificacao?.nome_lead?.toLowerCase().includes(q) ||
        (c.ai_analysis as CallAnalysisFull)?.identificacao?.produto_ofertado?.toLowerCase().includes(q) ||
        (c.ai_analysis as CallAnalysisFull)?.dados_extraidos?.nicho_profissao?.toLowerCase().includes(q) ||
        c.notes?.toLowerCase().includes(q)
      )
    }

    return list
  }, [callsWithStatus, activeTab, searchQuery, dateRange])

  // Pagination
  const totalPages = Math.ceil(filteredCalls.length / CALLS_PER_PAGE)
  const paginatedCalls = useMemo(() => {
    const start = (currentPage - 1) * CALLS_PER_PAGE
    return filteredCalls.slice(start, start + CALLS_PER_PAGE)
  }, [filteredCalls, currentPage])

  // Period stats (from ALL calls, not filtered)
  const periodStats = useMemo(() => {
    const analyzed = callsWithStatus.filter(c => (c.ai_analysis as CallAnalysisFull)?.nota_geral)
    const totalScore = analyzed.reduce((sum, c) => sum + ((c.ai_analysis as CallAnalysisFull)?.nota_geral || 0), 0)
    return {
      total: callsWithStatus.length,
      avgScore: analyzed.length > 0 ? totalScore / analyzed.length : 0,
      analyzedPct: callsWithStatus.length > 0 ? Math.round((analyzed.length / callsWithStatus.length) * 100) : 0
    }
  }, [callsWithStatus])

  // Aggregated acertos/erros from all analyzed calls
  const { topAcertos, topErros } = useMemo(() => {
    const acertosMap = new Map<string, number>()
    const errosMap = new Map<string, number>()

    callsWithStatus.forEach(c => {
      const analysis = c.ai_analysis as CallAnalysisFull
      if (!analysis) return

      analysis.maiores_acertos?.forEach(a => {
        if (a.acerto && a.acerto !== 'nao_informado') {
          const key = a.acerto.length > 80 ? a.acerto.slice(0, 80) + '...' : a.acerto
          acertosMap.set(key, (acertosMap.get(key) || 0) + 1)
        }
      })

      analysis.maiores_erros?.forEach(e => {
        if (e.erro && e.erro !== 'nao_informado') {
          const key = e.erro.length > 80 ? e.erro.slice(0, 80) + '...' : e.erro
          errosMap.set(key, (errosMap.get(key) || 0) + 1)
        }
      })
    })

    const topAcertos = [...acertosMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    const topErros = [...errosMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    return { topAcertos, topErros }
  }, [callsWithStatus])

  // Reset page on filter change
  useEffect(() => { setCurrentPage(1) }, [activeTab, searchQuery, dateRange])

  // Clear all filters
  const handleClearAllFilters = useCallback(() => {
    setSearchQuery('')
    setActiveTab('total')
    setDateRange(undefined)
  }, [])

  // ── Actions ──

  const isSyncing = syncProgress?.status === 'importing' || syncProgress?.status === 'analyzing' || syncProgress?.status === 'connecting'

  // Handle sync result (shared between manual and auto sync)
  const handleSyncResult = useCallback((result: { imported: number; analyzed: number; errors: { fileName: string; error: string }[] | string[] }, silent?: boolean) => {
    if (result.imported > 0 || result.analyzed > 0) {
      queryClient.invalidateQueries({ queryKey: ['calls-analysis'] })
      if (!silent) {
        toast.success(`${result.imported} calls importadas, ${result.analyzed} analisadas`)
      }
    }
    if (result.errors.length > 0 && !silent) {
      toast.error(`${result.errors.length} erro(s) durante a sincronização`)
    }
    setTimeout(() => setSyncProgress(null), 5000)
  }, [queryClient])

  // Manual sync: connects Drive (with popup if first time) + syncs
  const handleSync = useCallback(async () => {
    if (!user?.profileId || isSyncing) return

    try {
      if (!isDriveConnected()) {
        // First time: connect with popup + auto-detect folder
        const { token, folderName } = await connectDrive((progress) => {
          setSyncProgress(progress)
        })

        if (folderName) {
          toast.success(`Pasta detectada: "${folderName}"`)
        }

        // Now sync with the obtained token
        const result = await syncFromDrive(user.id, (progress) => {
          setSyncProgress(progress)
        }, token)
        handleSyncResult(result)
      } else {
        // Already connected: regular sync
        const result = await syncFromDrive(user.id, (progress) => {
          setSyncProgress(progress)
        })
        handleSyncResult(result)
      }
    } catch (error) {
      setSyncProgress({ status: 'error', message: error instanceof Error ? error.message : 'Erro na sincronização' })
      setTimeout(() => setSyncProgress(null), 5000)
    }
  }, [user?.id, isSyncing, handleSyncResult])

  // Auto-sync on page load (silent, no popup)
  useEffect(() => {
    if (!user?.id || !isDriveConnected()) return

    let cancelled = false

    const autoSync = async () => {
      const result = await trySilentSync(user.id, (progress) => {
        if (!cancelled) setSyncProgress(progress)
      })
      if (result && !cancelled) {
        handleSyncResult(result, true) // silent = true (no toast for 0 imports)
        if (result.imported > 0) {
          toast.success(`Auto-sync: ${result.imported} novas calls importadas`)
        }
      }
    }

    // Initial auto-sync after a short delay (let page render first)
    const initialTimer = setTimeout(autoSync, 2000)

    // Periodic sync every 5 minutes
    const intervalTimer = setInterval(autoSync, 5 * 60 * 1000)

    return () => {
      cancelled = true
      clearTimeout(initialTimer)
      clearInterval(intervalTimer)
    }
  }, [user?.id, handleSyncResult])

  const handleAnalyzeCall = async (call: Call & { client?: Client }) => {
    if (!call.notes) {
      toast.error('Sem transcrição para analisar')
      return
    }

    setIsAnalyzing(call.id)
    try {
      const analysis = await analyzeCallTranscript(call.notes)
      const resultStatus = deriveResultStatus(analysis)

      await supabase
        .from('calls')
        .update({
          ai_summary: [
            analysis.identificacao?.produto_ofertado,
            analysis.dados_extraidos?.nicho_profissao,
            `Nota: ${analysis.nota_geral}/10`
          ].filter(Boolean).join(' | '),
          ai_analysis: {
            ...analysis,
            result_status: resultStatus,
            drive_file_id: (call.ai_analysis as CallAnalysisFull)?.drive_file_id
          },
          quality_score: analysis.nota_geral || 0
        })
        .eq('id', call.id)

      queryClient.invalidateQueries({ queryKey: ['calls-analysis'] })
      toast.success('Análise concluída!')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao analisar')
    } finally {
      setIsAnalyzing(null)
    }
  }

  const handleStatusChange = async (callId: string, newStatus: CallResultStatus) => {
    const call = calls?.find(c => c.id === callId)
    if (!call) return

    const currentAnalysis = (call.ai_analysis || {}) as CallAnalysisFull
    await supabase
      .from('calls')
      .update({
        ai_analysis: { ...currentAnalysis, result_status: newStatus }
      })
      .eq('id', callId)

    queryClient.invalidateQueries({ queryKey: ['calls-analysis'] })
    toast.success('Status atualizado!')
  }

  const handleDeleteCall = async (callId: string, callName: string) => {
    console.log('[Calls] Delete requested for:', callId, callName)
    const confirmed = window.confirm(`Tem certeza que deseja excluir a call "${callName}"?\n\nEsta ação não pode ser desfeita.`)
    if (!confirmed) {
      console.log('[Calls] Delete cancelled by user')
      return
    }

    try {
      console.log('[Calls] Deleting call:', callId)
      const { error, count } = await supabase
        .from('calls')
        .delete()
        .eq('id', callId)
        .select()

      console.log('[Calls] Delete result - error:', error, 'count:', count)

      if (error) throw error

      queryClient.invalidateQueries({ queryKey: ['calls-analysis'] })
      setSelectedCall(null)
      toast.success('Call excluída com sucesso!')
    } catch (error) {
      console.error('[Calls] Delete error:', error)
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir call')
    }
  }

  // ── Render ──

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Calls</h1>
          <p className="text-muted-foreground">
            Análise inteligente de calls com IA
          </p>
        </div>
        <div className="flex items-center gap-2">
          {syncProgress && syncProgress.status !== 'done' && syncProgress.status !== 'idle' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mr-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="hidden sm:inline">{syncProgress.message}</span>
              {syncProgress.current && syncProgress.total && (
                <span>({syncProgress.current}/{syncProgress.total})</span>
              )}
            </div>
          )}
          {isDriveConnected() && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 mr-1">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              {getDriveConfig().folderName || 'Drive conectado'}
            </div>
          )}
          <Button
            variant="outline"
            onClick={handleSync}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FolderSync className="h-4 w-4 mr-2" />
            )}
            {isDriveConnected() ? 'Sincronizar' : 'Conectar Drive'}
          </Button>
        </div>
      </div>

      {/* Sync Warning Banner */}
      {isSyncing && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Sincronização em andamento
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Mantenha esta aba aberta e em primeiro plano. A análise pode demorar 1-2 minutos por arquivo.
            </p>
          </div>
          {syncProgress && (
            <div className="text-right shrink-0">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                {syncProgress.current || 0}/{syncProgress.total || 0}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {syncProgress.status === 'analyzing' ? 'Analisando...' : syncProgress.status}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Status Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-transparent p-0">
          {TAB_CONFIG.map(tab => (
            <TabsTrigger
              key={tab.key}
              value={tab.key}
              className={cn(
                'data-[state=active]:bg-background data-[state=active]:shadow-sm border',
                'rounded-lg px-4 py-2 text-sm font-medium transition-all'
              )}
            >
              <span className={cn(activeTab === tab.key && tab.color)}>
                {tab.label}
              </span>
              <span className={cn(
                'ml-1.5 text-xs font-bold rounded-full px-1.5 py-0.5',
                activeTab === tab.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
              )}>
                {tabCounts[tab.key]}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Active Filters Chips */}
      <ActiveFiltersChips
        searchQuery={searchQuery}
        statusFilter={activeTab === 'total' ? 'all' : (activeTab === 'pendentes' ? 'pendente' : activeTab === 'propostas' ? 'proposta' : activeTab === 'vendidas' ? 'vendida' : activeTab === 'perdidas' ? 'perdida' : activeTab as CallResultStatus)}
        dateRange={dateRange}
        onClearSearch={() => setSearchQuery('')}
        onClearStatus={() => setActiveTab('total')}
        onClearDateRange={() => setDateRange(undefined)}
        onClearAll={handleClearAllFilters}
      />

      {/* Period Summary (Collapsible) */}
      <Card>
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => setShowSummary(!showSummary)}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <BarChart3 className="h-5 w-5 text-primary" />
            <span className="font-semibold">Resumo do Período</span>
            {showSummary ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <div onClick={(e) => e.stopPropagation()}>
            <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
          </div>
        </div>

        {showSummary && (
          <CardContent className="pt-0 pb-4 space-y-4">
            {/* Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-lg border p-4 text-center">
                <div className="text-3xl font-bold">{periodStats.total}</div>
                <div className="text-sm text-muted-foreground">Total de Calls</div>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <div className={cn('text-3xl font-bold', periodStats.avgScore >= 7 ? 'text-green-600' : periodStats.avgScore >= 4 ? 'text-yellow-600' : 'text-red-600')}>
                  {periodStats.avgScore.toFixed(1)}<span className="text-lg text-muted-foreground">/10</span>
                </div>
                <div className="text-sm text-muted-foreground">Nota Média</div>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <div className="text-3xl font-bold text-primary">{periodStats.analyzedPct}%</div>
                <div className="text-sm text-muted-foreground">Calls Analisadas</div>
              </div>
            </div>

            {/* Acertos & Erros */}
            {(topAcertos.length > 0 || topErros.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Maiores Acertos */}
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="h-4 w-4 text-green-600" />
                    <span className="font-semibold text-sm text-green-700 dark:text-green-400">Maiores Acertos</span>
                  </div>
                  <div className="space-y-2">
                    {topAcertos.map(([text, count], i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Badge variant="outline" className="shrink-0 text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800">
                          {count}x
                        </Badge>
                        <span className="text-sm">{text}</span>
                      </div>
                    ))}
                    {topAcertos.length === 0 && (
                      <p className="text-sm text-muted-foreground">Nenhum acerto identificado ainda</p>
                    )}
                  </div>
                </div>

                {/* Maiores Erros */}
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingDown className="h-4 w-4 text-red-600" />
                    <span className="font-semibold text-sm text-red-700 dark:text-red-400">Maiores Erros</span>
                  </div>
                  <div className="space-y-2">
                    {topErros.map(([text, count], i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Badge variant="outline" className="shrink-0 text-xs bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800">
                          {count}x
                        </Badge>
                        <span className="text-sm">{text}</span>
                      </div>
                    ))}
                    {topErros.length === 0 && (
                      <p className="text-sm text-muted-foreground">Nenhum erro identificado ainda</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, produto, nicho..."
          className="pl-9"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Call Cards Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : paginatedCalls.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Phone className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-lg mb-2">Nenhuma call encontrada</p>
            <p className="text-sm text-muted-foreground mb-4">
              {isDriveConnected()
                ? 'Nenhuma transcrição nova no Drive. As novas aparecerão automaticamente.'
                : 'Conecte o Google Drive para importar transcrições automaticamente'}
            </p>
            <Button variant="outline" onClick={handleSync}>
              <FolderSync className="h-4 w-4 mr-2" />
              {isDriveConnected() ? 'Sincronizar Agora' : 'Conectar Google Drive'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {paginatedCalls.map((call) => (
            <CallGridCard
              key={call.id}
              call={call}
              isAnalyzing={isAnalyzing === call.id}
              onView={() => setSelectedCall(call)}
              onAnalyze={() => handleAnalyzeCall(call)}
              onDelete={handleDeleteCall}
              onCallUpdated={() => queryClient.invalidateQueries({ queryKey: ['calls-analysis'] })}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {((currentPage - 1) * CALLS_PER_PAGE) + 1}–{Math.min(currentPage * CALLS_PER_PAGE, filteredCalls.length)} de {filteredCalls.length}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium">{currentPage}/{totalPages}</span>
            <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Call Detail Dialog */}
      <CallDetailDialog
        call={selectedCall}
        open={!!selectedCall}
        onClose={() => setSelectedCall(null)}
        onStatusChange={handleStatusChange}
        onAnalyze={handleAnalyzeCall}
        onDelete={handleDeleteCall}
        isAnalyzing={isAnalyzing === selectedCall?.id}
      />
    </div>
  )
}

// ──────────────────────────────────────────────
// Call Grid Card Component
// ──────────────────────────────────────────────

interface CallGridCardProps {
  call: Call & { client?: Client; _resultStatus?: CallResultStatus }
  isAnalyzing?: boolean
  onView: () => void
  onAnalyze: () => void
  onDelete: (callId: string, callName: string) => void
  onCallUpdated: () => void
}

function CallGridCard({ call, isAnalyzing, onView, onAnalyze, onDelete, onCallUpdated }: CallGridCardProps) {
  const [showMergeDialog, setShowMergeDialog] = useState(false)
  const analysis = call.ai_analysis as CallAnalysisFull | undefined
  const hasAnalysis = !!analysis?.nota_geral
  const score = analysis?.nota_geral || 0
  const resultStatus = call._resultStatus || getResultStatus(call)
  const statusBadge = RESULT_STATUS_BADGES[resultStatus]
  const level = hasAnalysis ? getLevelFromScore(score) : null

  // Get client name: prefer client, then AI-extracted nome_lead, then clean file name
  const nomeLead = analysis?.identificacao?.nome_lead
  const driveFileName = analysis?.drive_file_name as string | undefined

  // Extract a readable name from Drive file (e.g., "urd-tdzg-amp (2026-02-05 09:01 GMT-3) - Transcript" → cleaner format)
  const cleanDriveFileName = driveFileName
    ? driveFileName
        .replace(/ - Transcript$/i, '')  // Remove "- Transcript" suffix
        .replace(/\s*\([^)]+\)\s*$/, '') // Remove date/time in parentheses at the end
        .trim() || driveFileName
    : null

  const clientName = call.client?.name ||
    (nomeLead && nomeLead !== 'nao_informado' ? nomeLead : null) ||
    cleanDriveFileName ||
    'Call sem nome'
  const product = analysis?.identificacao?.produto_ofertado
  const niche = analysis?.dados_extraidos?.nicho_profissao
  const mainPain = analysis?.dados_extraidos?.dor_principal_declarada?.texto

  return (
    <Card
      className="cursor-pointer hover:shadow-md hover:border-primary/30 transition-all group relative overflow-hidden"
      onClick={onView}
    >
      {/* Score indicator bar at top */}
      {hasAnalysis && (
        <div className={cn('h-1 w-full bg-gradient-to-r', getScoreBgColor(score))} />
      )}

      <CardContent className={cn('p-4 space-y-3', !hasAnalysis && 'pt-4')}>
        {/* Top row: Name + Score + Menu */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-base truncate">{clientName}</h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {product && product !== 'nao_informado' && (
                <Badge variant="outline" className="text-xs">{product}</Badge>
              )}
              {niche && niche !== 'nao_informado' && (
                <Badge variant="secondary" className="text-xs">{niche}</Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {hasAnalysis ? (
              <div className={cn(
                'flex items-center justify-center w-10 h-10 rounded-full border-2 font-bold text-xs',
                getScoreColor(score)
              )}>
                {score}<span className="text-[8px] font-normal">/10</span>
              </div>
            ) : (
              <div className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-dashed border-muted-foreground/30">
                <Clock className="h-3 w-3 text-muted-foreground" />
              </div>
            )}

            {/* Dropdown Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={onView}>
                  <Eye className="h-4 w-4 mr-2" />
                  Ver detalhes
                </DropdownMenuItem>
                {!hasAnalysis && call.notes && (
                  <DropdownMenuItem onClick={onAnalyze} disabled={isAnalyzing}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    {isAnalyzing ? 'Analisando...' : 'Analisar com IA'}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setShowMergeDialog(true)}>
                  <Target className="h-4 w-4 mr-2" />
                  Juntar com outra call
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete(call.id, clientName)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir call
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Date */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {formatDate(call.scheduled_at)}
        </div>

        {/* Main Pain */}
        {mainPain && mainPain !== 'nao_informado' && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            <span className="font-medium text-foreground">Dor principal:</span> {mainPain}
          </p>
        )}

        {/* Bottom: Level + Status badges */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5">
            {level && (
              <Badge className={cn('text-xs border', level.color)}>
                {level.label}
              </Badge>
            )}
            <Badge className={cn('text-xs border', statusBadge.className)}>
              {statusBadge.label}
            </Badge>
          </div>

          {!hasAnalysis && call.notes && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={(e) => { e.stopPropagation(); onAnalyze() }}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Sparkles className="h-3 w-3 mr-1" />
              )}
              Analisar
            </Button>
          )}
        </div>
      </CardContent>

      {/* Merge Dialog */}
      <MergeCallDialog
        currentCall={call}
        onMergeComplete={() => {
          setShowMergeDialog(false)
          onCallUpdated()
        }}
        open={showMergeDialog}
        onOpenChange={setShowMergeDialog}
      />
    </Card>
  )
}

// ──────────────────────────────────────────────
// Call Detail Dialog
// ──────────────────────────────────────────────

interface CallDetailDialogProps {
  call: (Call & { client?: Client }) | null
  open: boolean
  onClose: () => void
  onStatusChange: (callId: string, status: CallResultStatus) => void
  onAnalyze: (call: Call & { client?: Client }) => void
  onDelete: (callId: string, callName: string) => void
  isAnalyzing?: boolean
}

function CallDetailDialog({ call, open, onClose, onStatusChange, onAnalyze, onDelete, isAnalyzing }: CallDetailDialogProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeSection, setActiveSection] = useState<string>('resumo')
  const [creatingClient, setCreatingClient] = useState(false)

  if (!call) return null

  const analysis = call.ai_analysis as CallAnalysisFull | undefined
  const hasAnalysis = !!analysis?.nota_geral
  const score = analysis?.nota_geral || 0
  const resultStatus = getResultStatus(call)

  // Get client name: prefer client, then AI-extracted nome_lead, then clean file name
  const nomeLead = analysis?.identificacao?.nome_lead
  const driveFileName = analysis?.drive_file_name as string | undefined
  const cleanDriveFileName = driveFileName
    ? driveFileName.replace(/ - Transcript$/i, '').replace(/\s*\([^)]+\)\s*$/, '').trim() || driveFileName
    : null

  const clientName = call.client?.name ||
    (nomeLead && nomeLead !== 'nao_informado' ? nomeLead : null) ||
    cleanDriveFileName ||
    'Call'

  const sections = [
    { key: 'resumo', label: 'Resumo', icon: <FileText className="h-4 w-4" /> },
    { key: 'etapas', label: 'Etapas', icon: <Target className="h-4 w-4" /> },
    { key: 'checklist', label: 'Checklist', icon: <ShieldAlert className="h-4 w-4" /> },
    { key: 'plano', label: 'Plano de Ação', icon: <Zap className="h-4 w-4" /> },
    { key: 'dados', label: 'Dados Extraídos', icon: <BarChart3 className="h-4 w-4" /> }
  ]

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="sticky top-0 bg-background z-10 border-b p-6 pb-4">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="text-xl">{clientName}</DialogTitle>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    {formatDate(call.scheduled_at)}
                  </Badge>
                  {analysis?.identificacao?.produto_ofertado && analysis.identificacao.produto_ofertado !== 'nao_informado' && (
                    <Badge variant="secondary" className="text-xs">
                      {analysis.identificacao.produto_ofertado}
                    </Badge>
                  )}
                  {analysis?.dados_extraidos?.nicho_profissao && analysis.dados_extraidos.nicho_profissao !== 'nao_informado' && (
                    <Badge variant="secondary" className="text-xs">
                      {analysis.dados_extraidos.nicho_profissao}
                    </Badge>
                  )}
                  {analysis?.framework_selecionado && (
                    <Badge variant="outline" className="text-xs text-primary border-primary/30">
                      {analysis.framework_selecionado}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Client Button */}
                {call.client_id ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      onClose()
                      navigate(`/clients/${call.client_id}`)
                    }}
                  >
                    <ExternalLink className="h-3 w-3 mr-1.5" />
                    Ver Cliente
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={creatingClient}
                    onClick={async () => {
                      setCreatingClient(true)
                      try {
                        const { data: newClient, error } = await supabase
                          .from('clients')
                          .insert({
                            name: clientName,
                            email: '',
                            phone: '',
                            company: analysis?.dados_extraidos?.nicho_profissao || null,
                            closer_id: call.closer_id,
                            status: 'lead',
                            source: 'organic',
                            notes: analysis?.dados_extraidos?.dor_principal_declarada?.texto || null
                          })
                          .select()
                          .single()

                        if (error) throw error

                        // Update call with client_id
                        await supabase
                          .from('calls')
                          .update({ client_id: newClient.id })
                          .eq('id', call.id)

                        queryClient.invalidateQueries({ queryKey: ['calls-analysis'] })
                        toast.success('Cliente criado com sucesso!')
                        onClose()
                        navigate(`/clients/${newClient.id}`)
                      } catch (err) {
                        console.error('Error creating client:', err)
                        toast.error('Erro ao criar cliente')
                      } finally {
                        setCreatingClient(false)
                      }
                    }}
                  >
                    {creatingClient ? (
                      <Loader className="h-3 w-3 mr-1.5 animate-spin" />
                    ) : (
                      <UserPlus className="h-3 w-3 mr-1.5" />
                    )}
                    Criar Cliente
                  </Button>
                )}

                {/* Status Selector */}
                <Select
                  value={resultStatus}
                  onValueChange={(v) => onStatusChange(call.id, v as CallResultStatus)}
                >
                  <SelectTrigger className="w-[120px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(RESULT_STATUS_BADGES).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Delete Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20"
                  onClick={() => onDelete(call.id, clientName)}
                  title="Excluir call"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>

                {/* Score Circle */}
                {hasAnalysis && (
                  <div className={cn(
                    'flex items-center justify-center w-14 h-14 rounded-full border-2 font-bold',
                    getScoreColor(score)
                  )}>
                    <div className="text-center">
                      <div className="text-lg leading-none">{score}</div>
                      <div className="text-[10px] font-normal opacity-70">/10</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </DialogHeader>

          {/* Section Tabs */}
          {hasAnalysis && (
            <div className="flex gap-1 mt-4 overflow-x-auto pb-1">
              {sections.map(s => (
                <Button
                  key={s.key}
                  size="sm"
                  variant={activeSection === s.key ? 'default' : 'ghost'}
                  className="text-xs shrink-0"
                  onClick={() => setActiveSection(s.key)}
                >
                  {s.icon}
                  <span className="ml-1.5">{s.label}</span>
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {!hasAnalysis ? (
            <div className="text-center py-8 space-y-4">
              <Sparkles className="h-12 w-12 mx-auto text-muted-foreground" />
              <div>
                <p className="text-lg font-medium">Call ainda não analisada</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Clique abaixo para analisar esta call com IA
                </p>
              </div>
              {call.notes && (
                <Button onClick={() => onAnalyze(call)} disabled={isAnalyzing}>
                  {isAnalyzing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Analisar com IA
                </Button>
              )}
              {call.notes && (
                <div className="mt-6 text-left">
                  <p className="text-sm font-medium mb-2">Transcrição:</p>
                  <div className="bg-muted/50 rounded-lg p-4 max-h-60 overflow-y-auto">
                    <p className="text-sm whitespace-pre-wrap">{call.notes}</p>
                  </div>
                </div>
              )}
            </div>
          ) : activeSection === 'resumo' ? (
            <ResumoSection analysis={analysis!} call={call} />
          ) : activeSection === 'etapas' ? (
            <EtapasSection analysis={analysis!} />
          ) : activeSection === 'checklist' ? (
            <ChecklistSection analysis={analysis!} />
          ) : activeSection === 'plano' ? (
            <PlanoSection analysis={analysis!} />
          ) : activeSection === 'dados' ? (
            <DadosSection analysis={analysis!} />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ──────────────────────────────────────────────
// Detail Dialog Sections
// ──────────────────────────────────────────────

function ResumoSection({ analysis, call }: { analysis: CallAnalysisFull; call: Call }) {
  return (
    <div className="space-y-6">
      {/* Nota Geral + Justificativa */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Star className="h-5 w-5 text-primary" />
          <span className="font-semibold">Nota Geral: {analysis.nota_geral}/10</span>
        </div>
        {analysis.justificativa_nota_geral && (
          <ul className="space-y-1 ml-8">
            {analysis.justificativa_nota_geral.map((j, i) => (
              <li key={i} className="text-sm text-muted-foreground">{j}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Venda info */}
      {analysis.identificacao?.houve_venda && (
        <div className={cn(
          'rounded-lg border p-4',
          analysis.identificacao.houve_venda === 'sim' ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800' :
          analysis.identificacao.houve_venda === 'nao' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800' :
          'bg-muted/50'
        )}>
          <span className="font-semibold text-sm">
            {analysis.identificacao.houve_venda === 'sim' ? 'Venda Realizada' :
             analysis.identificacao.houve_venda === 'nao' ? 'Venda Não Realizada' :
             'Resultado: Não informado'}
          </span>
        </div>
      )}

      {/* Ponto de Perda */}
      {analysis.ponto_de_perda_da_venda && analysis.ponto_de_perda_da_venda !== 'null' && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="font-semibold text-sm text-red-700 dark:text-red-400">Ponto de Perda da Venda</span>
          </div>
          <p className="text-sm font-medium ml-6">
            Etapa: {ETAPA_LABELS[analysis.ponto_de_perda_da_venda] || analysis.ponto_de_perda_da_venda}
          </p>
          {analysis.sinais_da_perda && analysis.sinais_da_perda.length > 0 && (
            <ul className="ml-6 space-y-1">
              {analysis.sinais_da_perda.map((s, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-1.5">
                  <ArrowRight className="h-3 w-3 mt-1 shrink-0 text-red-400" />
                  {s}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Se Vendeu */}
      {analysis.se_vendeu?.porque_comprou && analysis.se_vendeu.porque_comprou.length > 0 && (
        <div className="rounded-lg border border-green-200 dark:border-green-800 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-green-500" />
            <span className="font-semibold text-sm text-green-700 dark:text-green-400">Por que comprou</span>
          </div>
          {analysis.se_vendeu.porque_comprou.map((m, i) => (
            <div key={i} className="ml-6 text-sm">
              <span className="font-medium">{m.motivo}</span>
              {m.evidencia && <span className="text-muted-foreground"> — "{m.evidencia}"</span>}
            </div>
          ))}
          {analysis.se_vendeu.gatilhos_que_mais_pesaram && (
            <div className="ml-6 flex flex-wrap gap-1 mt-2">
              {analysis.se_vendeu.gatilhos_que_mais_pesaram.map((g, i) => (
                <Badge key={i} variant="outline" className="text-xs">{g}</Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Maiores Acertos */}
      {analysis.maiores_acertos && analysis.maiores_acertos.length > 0 && (
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <span className="font-semibold text-sm text-green-700 dark:text-green-400">Maiores Acertos</span>
          </div>
          {analysis.maiores_acertos.map((a, i) => (
            <div key={i} className="ml-6 rounded-lg bg-green-50 dark:bg-green-900/10 p-3 space-y-1">
              <p className="text-sm font-medium">{a.acerto}</p>
              {a.evidencia && a.evidencia !== 'nao_informado' && (
                <p className="text-xs text-muted-foreground italic">"{a.evidencia}"</p>
              )}
              {a.como_repetir && a.como_repetir !== 'nao_informado' && (
                <p className="text-xs text-green-700 dark:text-green-400">Como repetir: {a.como_repetir}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Maiores Erros */}
      {analysis.maiores_erros && analysis.maiores_erros.length > 0 && (
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-red-600" />
            <span className="font-semibold text-sm text-red-700 dark:text-red-400">Maiores Erros</span>
          </div>
          {analysis.maiores_erros.map((e, i) => (
            <div key={i} className="ml-6 rounded-lg bg-red-50 dark:bg-red-900/10 p-3 space-y-2">
              <p className="text-sm font-medium">{e.erro}</p>
              {e.evidencia && e.evidencia !== 'nao_informado' && (
                <p className="text-xs text-muted-foreground italic">"{e.evidencia}"</p>
              )}
              {e.impacto && e.impacto !== 'nao_informado' && (
                <p className="text-xs text-red-700 dark:text-red-400">Impacto: {e.impacto}</p>
              )}
              {e.frase_pronta && (
                <div className="text-xs space-y-1 mt-2 border-l-2 border-red-300 pl-3">
                  <p><span className="font-medium text-red-600">ANTES:</span> {e.frase_pronta.antes}</p>
                  <p><span className="font-medium text-green-600">DEPOIS:</span> {e.frase_pronta.depois}</p>
                </div>
              )}
              {e.como_corrigir && e.como_corrigir.length > 0 && (
                <ul className="text-xs space-y-0.5 mt-1">
                  {e.como_corrigir.map((c, ci) => (
                    <li key={ci} className="flex items-start gap-1">
                      <ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                      {c}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Dor Principal */}
      {analysis.dados_extraidos?.dor_principal_declarada?.texto &&
       analysis.dados_extraidos.dor_principal_declarada.texto !== 'nao_informado' && (
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Principal Dor</span>
          </div>
          <p className="text-sm ml-6">{analysis.dados_extraidos.dor_principal_declarada.texto}</p>
          {analysis.dados_extraidos.dor_principal_declarada.evidencia &&
           analysis.dados_extraidos.dor_principal_declarada.evidencia !== 'nao_informado' && (
            <p className="text-xs text-muted-foreground ml-6 mt-1 italic">
              "{analysis.dados_extraidos.dor_principal_declarada.evidencia}"
            </p>
          )}
        </div>
      )}

      {/* Transcrição */}
      {call.notes && (
        <details className="rounded-lg border">
          <summary className="p-4 cursor-pointer font-semibold text-sm flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Ver Transcrição Completa
          </summary>
          <div className="px-4 pb-4">
            <div className="bg-muted/50 rounded-lg p-4 max-h-60 overflow-y-auto">
              <p className="text-sm whitespace-pre-wrap">{call.notes}</p>
            </div>
          </div>
        </details>
      )}
    </div>
  )
}

function EtapasSection({ analysis }: { analysis: CallAnalysisFull }) {
  const [expandedEtapa, setExpandedEtapa] = useState<string | null>(null)

  if (!analysis.analise_por_etapa) {
    return <p className="text-sm text-muted-foreground">Análise por etapa não disponível</p>
  }

  const etapas = Object.entries(analysis.analise_por_etapa)

  return (
    <div className="space-y-3">
      {etapas.map(([key, etapa]) => {
        if (!etapa || typeof etapa !== 'object') return null
        const isExpanded = expandedEtapa === key
        const nota = etapa.nota ?? 0

        return (
          <div key={key} className="rounded-lg border overflow-hidden">
            <button
              onClick={() => setExpandedEtapa(isExpanded ? null : key)}
              className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border',
                  getScoreColor(nota)
                )}>
                  {nota}
                </div>
                <div className="text-left">
                  <span className="font-medium text-sm">{ETAPA_LABELS[key] || key}</span>
                  {etapa.aconteceu && (
                    <Badge
                      variant="outline"
                      className={cn('ml-2 text-xs',
                        etapa.aconteceu === 'sim' ? 'text-green-600 border-green-300' :
                        etapa.aconteceu === 'parcial' ? 'text-yellow-600 border-yellow-300' :
                        'text-red-600 border-red-300'
                      )}
                    >
                      {etapa.aconteceu === 'sim' ? 'Sim' : etapa.aconteceu === 'parcial' ? 'Parcial' : 'Não'}
                    </Badge>
                  )}
                </div>
              </div>
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {isExpanded && (
              <div className="p-4 pt-0 space-y-3 border-t">
                {etapa.funcao_cumprida && (
                  <p className="text-sm text-muted-foreground">{etapa.funcao_cumprida}</p>
                )}

                {/* Pontos Fortes */}
                {etapa.ponto_forte && etapa.ponto_forte.length > 0 && (
                  <div>
                    <span className="text-xs font-semibold text-green-600">Pontos Fortes:</span>
                    <ul className="mt-1">
                      {etapa.ponto_forte.map((p, i) => (
                        <li key={i} className="text-sm flex items-start gap-1.5">
                          <CheckCircle2 className="h-3 w-3 mt-1 text-green-500 shrink-0" />
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Pontos Fracos */}
                {etapa.ponto_fraco && etapa.ponto_fraco.length > 0 && (
                  <div>
                    <span className="text-xs font-semibold text-red-600">Pontos Fracos:</span>
                    <ul className="mt-1">
                      {etapa.ponto_fraco.map((p, i) => (
                        <li key={i} className="text-sm flex items-start gap-1.5">
                          <XCircle className="h-3 w-3 mt-1 text-red-500 shrink-0" />
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Erro de Execução */}
                {etapa.erro_de_execucao && etapa.erro_de_execucao !== 'nao_informado' && (
                  <div className="bg-red-50 dark:bg-red-900/10 rounded p-2">
                    <span className="text-xs font-semibold text-red-600">Erro:</span>
                    <p className="text-sm">{etapa.erro_de_execucao}</p>
                    {etapa.impacto_no_lead && etapa.impacto_no_lead !== 'nao_informado' && (
                      <p className="text-xs text-red-600 mt-1">Impacto: {etapa.impacto_no_lead}</p>
                    )}
                  </div>
                )}

                {/* Frase Melhor (Antes/Depois) */}
                {etapa.frase_melhor && (etapa.frase_melhor.antes || etapa.frase_melhor.depois) && (
                  <div className="border-l-2 border-primary pl-3 space-y-1">
                    <span className="text-xs font-semibold">Antes vs Depois:</span>
                    {etapa.frase_melhor.antes && (
                      <p className="text-xs"><span className="text-red-600 font-medium">ANTES:</span> {etapa.frase_melhor.antes}</p>
                    )}
                    {etapa.frase_melhor.depois && (
                      <p className="text-xs"><span className="text-green-600 font-medium">DEPOIS:</span> {etapa.frase_melhor.depois}</p>
                    )}
                  </div>
                )}

                {/* Como Corrigir */}
                {etapa.como_corrigir && etapa.como_corrigir.length > 0 && (
                  <div>
                    <span className="text-xs font-semibold text-primary">Como Corrigir:</span>
                    <ul className="mt-1 space-y-0.5">
                      {etapa.como_corrigir.map((c, i) => (
                        <li key={i} className="text-xs flex items-start gap-1.5">
                          <ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Perguntas de Aprofundamento */}
                {etapa.perguntas_de_aprofundamento && etapa.perguntas_de_aprofundamento.length > 0 && (
                  <div>
                    <span className="text-xs font-semibold text-muted-foreground">Perguntas sugeridas:</span>
                    <ul className="mt-1 space-y-0.5">
                      {etapa.perguntas_de_aprofundamento.map((q, i) => (
                        <li key={i} className="text-xs flex items-start gap-1.5 text-muted-foreground">
                          <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                          {q}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Risco Principal */}
                {etapa.risco_principal_da_etapa && etapa.risco_principal_da_etapa !== 'nao_informado' && (
                  <div className="text-xs bg-yellow-50 dark:bg-yellow-900/10 rounded p-2">
                    <span className="font-semibold text-yellow-700 dark:text-yellow-400">Risco principal:</span>
                    <span className="ml-1">{etapa.risco_principal_da_etapa}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ChecklistSection({ analysis }: { analysis: CallAnalysisFull }) {
  if (!analysis.checklist_erros_recorrentes) {
    return <p className="text-sm text-muted-foreground">Checklist não disponível</p>
  }

  const checkLabels: Record<string, string> = {
    abertura_ancoragem_script: 'Abertura (Ancoragem e Script)',
    profundidade_nao_fugir_assunto: 'Profundidade (Não fugir do assunto)',
    emocao_e_tensao: 'Emoção e Tensão',
    prova_social_seeds_durante_perguntas: 'Prova Social / Seeds durante perguntas',
    objecao_real_vs_declarada: 'Objeção Real vs Declarada',
    negociacao_maximizar_receita: 'Negociação (Maximizar Receita)'
  }

  const checks = Object.entries(analysis.checklist_erros_recorrentes)

  return (
    <div className="space-y-3">
      {checks.map(([key, check]) => {
        if (!check || typeof check !== 'object') return null

        return (
          <div key={key} className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center gap-2">
              {getCheckStatusIcon(check.status)}
              <span className="font-medium text-sm">{checkLabels[key] || key}</span>
              <Badge
                variant="outline"
                className={cn('text-xs ml-auto',
                  check.status === 'ok' ? 'text-green-600 border-green-300' :
                  check.status === 'parcial' ? 'text-yellow-600 border-yellow-300' :
                  'text-red-600 border-red-300'
                )}
              >
                {check.status === 'ok' ? 'OK' : check.status === 'parcial' ? 'Parcial' : 'Falhou'}
              </Badge>
            </div>

            {check.evidencias && check.evidencias.length > 0 && (
              <div className="ml-6 space-y-1">
                {check.evidencias.map((e, i) => (
                  <p key={i} className="text-xs text-muted-foreground italic">"{e}"</p>
                ))}
              </div>
            )}

            {check.correcao && (
              <div className="ml-6 text-xs bg-primary/5 rounded p-2">
                <span className="font-medium">Correção:</span> {check.correcao}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function PlanoSection({ analysis }: { analysis: CallAnalysisFull }) {
  const plano = analysis.plano_de_acao_direto
  if (!plano) {
    return <p className="text-sm text-muted-foreground">Plano de ação não disponível</p>
  }

  return (
    <div className="space-y-4">
      {/* Ajuste #1 */}
      {plano.ajuste_numero_1 && (
        <div className="rounded-lg border border-primary/30 p-4 space-y-3 bg-primary/5">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <span className="font-semibold">Ajuste N°1 (Prioridade Máxima)</span>
          </div>
          {plano.ajuste_numero_1.diagnostico && (
            <p className="text-sm ml-7">{plano.ajuste_numero_1.diagnostico}</p>
          )}
          {plano.ajuste_numero_1.o_que_fazer_na_proxima_call && (
            <ul className="ml-7 space-y-1">
              {plano.ajuste_numero_1.o_que_fazer_na_proxima_call.map((a, i) => (
                <li key={i} className="text-sm flex items-start gap-1.5">
                  <ArrowRight className="h-3 w-3 mt-1 shrink-0 text-primary" />
                  {a}
                </li>
              ))}
            </ul>
          )}
          {plano.ajuste_numero_1.script_30_segundos && (
            <div className="ml-7 bg-background rounded-lg p-3 border">
              <span className="text-xs font-semibold text-muted-foreground">Script 30s:</span>
              <p className="text-sm mt-1 italic">"{plano.ajuste_numero_1.script_30_segundos}"</p>
            </div>
          )}
        </div>
      )}

      {/* Treino Recomendado */}
      {plano.treino_recomendado && plano.treino_recomendado.length > 0 && (
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Treino Recomendado</span>
          </div>
          {plano.treino_recomendado.map((t, i) => (
            <div key={i} className="ml-6 rounded bg-muted/50 p-3 space-y-1">
              <p className="text-sm font-medium">{t.habilidade}</p>
              {t.como_treinar && <p className="text-xs text-muted-foreground">{t.como_treinar}</p>}
              {t.meta_objetiva && (
                <p className="text-xs"><span className="font-medium">Meta:</span> {t.meta_objetiva}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Próxima Ação com Lead */}
      {plano.proxima_acao_com_lead && (
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Próxima Ação com Lead</span>
            {plano.proxima_acao_com_lead.status && (
              <Badge variant="outline" className="text-xs ml-2">
                {plano.proxima_acao_com_lead.status}
              </Badge>
            )}
          </div>
          {plano.proxima_acao_com_lead.passo && (
            <p className="text-sm ml-6">{plano.proxima_acao_com_lead.passo}</p>
          )}
          {plano.proxima_acao_com_lead.mensagem_sugerida_whats && (
            <div className="ml-6 bg-green-50 dark:bg-green-900/10 rounded-lg p-3 border border-green-200 dark:border-green-800">
              <span className="text-xs font-semibold text-green-700 dark:text-green-400">Mensagem sugerida (WhatsApp):</span>
              <p className="text-sm mt-1">{plano.proxima_acao_com_lead.mensagem_sugerida_whats}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DadosSection({ analysis }: { analysis: CallAnalysisFull }) {
  const dados = analysis.dados_extraidos
  if (!dados) {
    return <p className="text-sm text-muted-foreground">Dados extraídos não disponíveis</p>
  }

  const fields: { label: string; value: string | undefined }[] = [
    { label: 'Nicho/Profissão', value: dados.nicho_profissao },
    { label: 'Modelo de Venda', value: dados.modelo_de_venda },
    { label: 'Ticket Médio', value: dados.ticket_medio },
    { label: 'Faturamento Bruto', value: dados.faturamento_mensal_bruto },
    { label: 'Faturamento Líquido', value: dados.faturamento_mensal_liquido },
    { label: 'Equipe', value: dados.equipe },
    { label: 'Estrutura Comercial', value: dados.estrutura_comercial },
    { label: 'Objetivo 12 Meses', value: dados.objetivo_12_meses },
    { label: 'Urgência (0-10)', value: dados.urgencia_declarada },
    { label: 'Importância (0-10)', value: dados.importancia_declarada }
  ]

  return (
    <div className="space-y-4">
      {/* Identificação */}
      <div className="rounded-lg border p-4 space-y-2">
        <span className="font-semibold text-sm">Identificação</span>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div><span className="text-muted-foreground">Lead:</span> {analysis.identificacao?.nome_lead || 'N/I'}</div>
          <div><span className="text-muted-foreground">Closer:</span> {analysis.identificacao?.nome_closer || 'N/I'}</div>
          <div><span className="text-muted-foreground">Produto:</span> {analysis.identificacao?.produto_ofertado || 'N/I'}</div>
          <div><span className="text-muted-foreground">Venda:</span> {analysis.identificacao?.houve_venda || 'N/I'}</div>
        </div>
      </div>

      {/* Dados Grid */}
      <div className="rounded-lg border p-4 space-y-2">
        <span className="font-semibold text-sm">Dados da Empresa/Lead</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {fields.map((f, i) => (
            f.value && f.value !== 'nao_informado' ? (
              <div key={i} className="text-sm py-1">
                <span className="text-muted-foreground">{f.label}:</span>
                <span className="ml-1 font-medium">{f.value}</span>
              </div>
            ) : null
          ))}
        </div>
      </div>

      {/* Canais de Aquisição */}
      {dados.canais_aquisicao && dados.canais_aquisicao.length > 0 && (
        <div className="rounded-lg border p-4 space-y-2">
          <span className="font-semibold text-sm">Canais de Aquisição</span>
          <div className="flex flex-wrap gap-1">
            {dados.canais_aquisicao.map((c, i) => (
              <Badge key={i} variant="secondary" className="text-xs">{c}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Dor Profunda */}
      {dados.dor_profunda?.texto && dados.dor_profunda.texto !== 'nao_informado' && (
        <div className="rounded-lg border p-4 space-y-1">
          <span className="font-semibold text-sm">Dor Profunda</span>
          <p className="text-sm">{dados.dor_profunda.texto}</p>
          {dados.dor_profunda.evidencia && dados.dor_profunda.evidencia !== 'nao_informado' && (
            <p className="text-xs text-muted-foreground italic">"{dados.dor_profunda.evidencia}"</p>
          )}
        </div>
      )}

      {/* Objeções */}
      {dados.objecoes_levantadas && dados.objecoes_levantadas.length > 0 && (
        <div className="rounded-lg border p-4 space-y-2">
          <span className="font-semibold text-sm">Objeções Levantadas</span>
          {dados.objecoes_levantadas.map((o, i) => (
            <div key={i} className="text-sm py-1 border-b last:border-0">
              <span className="font-medium">{o.objecao}</span>
              {o.evidencia && o.evidencia !== 'nao_informado' && (
                <span className="text-xs text-muted-foreground ml-1">— "{o.evidencia}"</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
