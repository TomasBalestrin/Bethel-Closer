import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus,
  Search,
  Loader2,
  MoreVertical,
  Pencil,
  Trash2,
  Calendar,
  MapPin,
  Clock,
  Users,
  CheckCircle2,
  Ticket,
  UserX,
  XCircle,
  MessageSquare,
  Eye,
  Send,
  Timer,
  Flame,
  LayoutGrid,
  Columns3
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
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
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/authStore'
import { toast } from 'sonner'
import type { IntensivoEvent, IntensivoLead, IntensivoStage } from '@/types'
import { differenceInDays, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// Schemas
const leadSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  phone: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  company: z.string().optional(),
  notes: z.string().optional()
})

const eventSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  date: z.string().min(1, 'Data é obrigatória'),
  location: z.string().min(1, 'Local é obrigatório')
})

type LeadFormData = z.infer<typeof leadSchema>
type EventFormData = z.infer<typeof eventSchema>

// Column definitions
interface KanbanColumn {
  id: IntensivoStage
  title: string
  color: string
  bgColor: string
  icon: React.ReactNode
  tabGroup?: string
}

const allColumns: KanbanColumn[] = [
  { id: 'abordagem_inicial', title: 'Abordagem Inicial', color: 'bg-purple-500', bgColor: 'bg-purple-50', icon: <MessageSquare className="h-4 w-4 text-white" />, tabGroup: 'abordagem' },
  { id: 'nivel_consciencia', title: 'Nível de Consciência', color: 'bg-cyan-500', bgColor: 'bg-cyan-50', icon: <Eye className="h-4 w-4 text-white" />, tabGroup: 'abordagem' },
  { id: 'convite_intensivo', title: 'Convite pro Intensivo', color: 'bg-green-500', bgColor: 'bg-green-50', icon: <Send className="h-4 w-4 text-white" />, tabGroup: 'abordagem' },
  { id: 'aguardando_confirmacao', title: 'Aguardando Confirmação', color: 'bg-yellow-500', bgColor: 'bg-yellow-50', icon: <Clock className="h-4 w-4 text-white" />, tabGroup: 'abordagem' },
  { id: 'confirmados', title: 'Confirmados', color: 'bg-emerald-500', bgColor: 'bg-emerald-50', icon: <CheckCircle2 className="h-4 w-4 text-white" />, tabGroup: 'confirmados' },
  { id: 'retirado_ingresso', title: 'Retirado o Ingresso', color: 'bg-teal-500', bgColor: 'bg-teal-50', icon: <Ticket className="h-4 w-4 text-white" />, tabGroup: 'ingressos' },
  { id: 'aquecimento_30d', title: 'Aquecimento -30 dias', color: 'bg-orange-400', bgColor: 'bg-orange-50', icon: <Timer className="h-4 w-4 text-white" /> },
  { id: 'aquecimento_7d', title: 'Aquecimento -7 dias', color: 'bg-orange-500', bgColor: 'bg-orange-50', icon: <Timer className="h-4 w-4 text-white" /> },
  { id: 'aquecimento_1d', title: 'Aquecimento -1 dia', color: 'bg-orange-600', bgColor: 'bg-orange-50', icon: <Timer className="h-4 w-4 text-white" /> },
  { id: 'compareceram', title: 'Compareceram', color: 'bg-green-700', bgColor: 'bg-green-50', icon: <Users className="h-4 w-4 text-white" />, tabGroup: 'compareceram' },
  { id: 'nao_compareceram', title: 'Não Compareceram', color: 'bg-red-600', bgColor: 'bg-red-50', icon: <UserX className="h-4 w-4 text-white" />, tabGroup: 'nao_compareceram' },
  { id: 'sem_interesse', title: 'Sem Interesse', color: 'bg-gray-500', bgColor: 'bg-gray-50', icon: <XCircle className="h-4 w-4 text-white" />, tabGroup: 'sem_interesse' }
]

// Tab filter definitions
type TabFilter = 'total' | 'abordagem' | 'confirmados' | 'ingressos' | 'compareceram' | 'nao_compareceram' | 'sem_interesse'

interface TabDef {
  id: TabFilter
  label: string
  icon: React.ReactNode
  color: string
  stages: IntensivoStage[]
}

const tabs: TabDef[] = [
  { id: 'total', label: 'Total', icon: <Users className="h-4 w-4" />, color: 'text-foreground', stages: [] },
  { id: 'abordagem', label: 'Abordagem', icon: <MessageSquare className="h-4 w-4" />, color: 'text-blue-600 dark:text-blue-400', stages: ['abordagem_inicial', 'nivel_consciencia', 'convite_intensivo', 'aguardando_confirmacao'] },
  { id: 'confirmados', label: 'Confirmados', icon: <CheckCircle2 className="h-4 w-4" />, color: 'text-green-600 dark:text-green-400', stages: ['confirmados'] },
  { id: 'ingressos', label: 'Ingressos', icon: <Ticket className="h-4 w-4" />, color: 'text-blue-700 dark:text-blue-300', stages: ['retirado_ingresso'] },
  { id: 'compareceram', label: 'Compareceram', icon: <Users className="h-4 w-4" />, color: 'text-emerald-700 dark:text-emerald-400', stages: ['compareceram'] },
  { id: 'nao_compareceram', label: 'Não Comparec.', icon: <UserX className="h-4 w-4" />, color: 'text-red-600 dark:text-red-400', stages: ['nao_compareceram'] },
  { id: 'sem_interesse', label: 'Sem Interesse', icon: <XCircle className="h-4 w-4" />, color: 'text-muted-foreground', stages: ['sem_interesse'] }
]

export default function CrmIntensivoPage() {
  const [isLeadDialogOpen, setIsLeadDialogOpen] = useState(false)
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false)
  const [editingLead, setEditingLead] = useState<IntensivoLead | null>(null)
  const [deleteLeadId, setDeleteLeadId] = useState<string | null>(null)
  const [selectedEventId, setSelectedEventId] = useState<string>('')
  const [activeTab, setActiveTab] = useState<TabFilter>('total')
  const [viewMode, setViewMode] = useState<'kanban' | 'grid'>('kanban')
  const [searchQuery, setSearchQuery] = useState('')
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null)
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  const leadForm = useForm<LeadFormData>({
    resolver: zodResolver(leadSchema),
    defaultValues: { name: '', phone: '', email: '', company: '', notes: '' }
  })

  const eventForm = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: { name: '', date: '', location: '' }
  })

  // Fetch events
  const { data: events } = useQuery({
    queryKey: ['intensivo-events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('intensivo_events')
        .select('*')
        .order('date', { ascending: false })
      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) return [] as IntensivoEvent[]
        throw error
      }
      return data as IntensivoEvent[]
    }
  })

  // Auto-select first event
  const currentEventId = selectedEventId || events?.[0]?.id || ''
  const currentEvent = events?.find(e => e.id === currentEventId)

  // Fetch leads for selected event
  const { data: leads, isLoading } = useQuery({
    queryKey: ['intensivo-leads', currentEventId],
    queryFn: async () => {
      if (!currentEventId) return [] as IntensivoLead[]
      const { data, error } = await supabase
        .from('intensivo_leads')
        .select('*')
        .eq('event_id', currentEventId)
        .order('created_at', { ascending: false })
      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) return [] as IntensivoLead[]
        throw error
      }
      return data as IntensivoLead[]
    },
    enabled: !!currentEventId
  })

  // Search filter
  const filteredLeads = useMemo(() => {
    if (!leads) return []
    let result = leads
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(l =>
        l.name.toLowerCase().includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.company?.toLowerCase().includes(q) ||
        l.phone?.includes(q)
      )
    }
    return result
  }, [leads, searchQuery])

  // Group by stage
  const leadsByStage = useMemo(() => {
    const grouped: Record<IntensivoStage, IntensivoLead[]> = {
      abordagem_inicial: [], nivel_consciencia: [], convite_intensivo: [],
      aguardando_confirmacao: [], confirmados: [], retirado_ingresso: [],
      aquecimento_30d: [], aquecimento_7d: [], aquecimento_1d: [],
      compareceram: [], nao_compareceram: [], sem_interesse: []
    }
    filteredLeads.forEach(l => {
      if (grouped[l.stage]) grouped[l.stage].push(l)
    })
    return grouped
  }, [filteredLeads])

  // Tab counts
  const tabCounts = useMemo(() => {
    const counts: Record<TabFilter, number> = {
      total: filteredLeads.length,
      abordagem: 0, confirmados: 0, ingressos: 0,
      compareceram: 0, nao_compareceram: 0, sem_interesse: 0
    }
    tabs.forEach(tab => {
      if (tab.id !== 'total') {
        counts[tab.id] = tab.stages.reduce((sum, stage) => sum + (leadsByStage[stage]?.length || 0), 0)
      }
    })
    return counts
  }, [filteredLeads, leadsByStage])

  // Event stats
  const eventStats = useMemo(() => {
    const total = filteredLeads.length
    const confirmados = (leadsByStage.confirmados?.length || 0) +
      (leadsByStage.retirado_ingresso?.length || 0) +
      (leadsByStage.aquecimento_30d?.length || 0) +
      (leadsByStage.aquecimento_7d?.length || 0) +
      (leadsByStage.aquecimento_1d?.length || 0) +
      (leadsByStage.compareceram?.length || 0)
    const ingressos = leadsByStage.retirado_ingresso?.length || 0
    const compareceram = leadsByStage.compareceram?.length || 0
    const comparecimentoPct = total > 0 ? Math.round((compareceram / total) * 100) : 0
    return { total, confirmados, ingressos, comparecimentoPct }
  }, [filteredLeads, leadsByStage])

  // Countdown
  const daysUntilEvent = currentEvent
    ? differenceInDays(new Date(currentEvent.date), new Date())
    : 0

  // Visible columns based on active tab
  const visibleColumns = useMemo(() => {
    if (activeTab === 'total') return allColumns
    const tab = tabs.find(t => t.id === activeTab)
    if (!tab) return allColumns
    return allColumns.filter(col => tab.stages.includes(col.id))
  }, [activeTab])

  // Mutations
  const createLeadMutation = useMutation({
    mutationFn: async (data: LeadFormData) => {
      const { error } = await supabase.from('intensivo_leads').insert({
        ...data,
        email: data.email || null,
        phone: data.phone || null,
        company: data.company || null,
        notes: data.notes || null,
        event_id: currentEventId,
        stage: 'abordagem_inicial',
        closer_id: user?.id
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intensivo-leads'] })
      toast.success('Lead adicionado!')
      setIsLeadDialogOpen(false)
      leadForm.reset()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao adicionar lead')
    }
  })

  const updateLeadMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<IntensivoLead> }) => {
      const { error } = await supabase.from('intensivo_leads').update(data).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intensivo-leads'] })
      toast.success('Lead atualizado!')
      setIsLeadDialogOpen(false)
      setEditingLead(null)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar lead')
    }
  })

  const deleteLeadMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('intensivo_leads').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intensivo-leads'] })
      toast.success('Lead excluído!')
      setDeleteLeadId(null)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir lead')
    }
  })

  const createEventMutation = useMutation({
    mutationFn: async (data: EventFormData) => {
      const { error } = await supabase.from('intensivo_events').insert({
        ...data,
        closer_id: user?.id
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intensivo-events'] })
      toast.success('Evento criado!')
      setIsEventDialogOpen(false)
      eventForm.reset()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao criar evento')
    }
  })

  const openLeadDialog = (lead?: IntensivoLead) => {
    if (lead) {
      setEditingLead(lead)
      leadForm.reset({
        name: lead.name,
        phone: lead.phone || '',
        email: lead.email || '',
        company: lead.company || '',
        notes: lead.notes || ''
      })
    } else {
      setEditingLead(null)
      leadForm.reset({ name: '', phone: '', email: '', company: '', notes: '' })
    }
    setIsLeadDialogOpen(true)
  }

  const onLeadSubmit = (data: LeadFormData) => {
    if (editingLead) {
      updateLeadMutation.mutate({ id: editingLead.id, data })
    } else {
      createLeadMutation.mutate(data)
    }
  }

  // Drag & Drop
  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    setDraggedLeadId(leadId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', leadId)
    if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.opacity = '0.5'
  }

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedLeadId(null)
    if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.opacity = '1'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, stage: IntensivoStage) => {
    e.preventDefault()
    const leadId = e.dataTransfer.getData('text/plain')
    if (leadId) {
      const lead = leads?.find(l => l.id === leadId)
      if (lead && lead.stage !== stage) {
        updateLeadMutation.mutate({ id: leadId, data: { stage } })
      }
    }
    setDraggedLeadId(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
            <Flame className="h-6 w-6 text-orange-500" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">CRM Intensivo</h1>
            <p className="text-muted-foreground">
              Gerencie leads para o Intensivo da Alta Performance
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center border rounded-lg p-1">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('kanban')}
            >
              <Columns3 className="h-4 w-4" />
            </Button>
          </div>

          {/* Event Selector */}
          {events && events.length > 0 ? (
            <Select value={currentEventId} onValueChange={setSelectedEventId}>
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder="Selecione um evento" />
              </SelectTrigger>
              <SelectContent>
                {events.map(event => (
                  <SelectItem key={event.id} value={event.id}>
                    <span className="font-medium">{event.name}</span>
                    <span className="text-muted-foreground ml-1">
                      ({format(new Date(event.date), 'dd/MM/yyyy')})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Button variant="outline" onClick={() => setIsEventDialogOpen(true)}>
              Criar Evento
            </Button>
          )}

          <Button onClick={() => {
            if (!currentEventId) {
              setIsEventDialogOpen(true)
            } else {
              openLeadDialog()
            }
          }}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Lead
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
              activeTab === tab.id
                ? 'bg-card shadow-sm border-border'
                : 'bg-transparent border-transparent hover:bg-muted'
            } ${tab.color}`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            <span className="font-bold ml-0.5">{tabCounts[tab.id]}</span>
          </button>
        ))}
      </div>

      {/* Event Info Card */}
      {currentEvent && (
        <Card className="border-orange-200 dark:border-orange-900 bg-orange-50/30 dark:bg-orange-950/20">
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
                  <Calendar className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">{currentEvent.name}</h3>
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <span>{format(new Date(currentEvent.date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {currentEvent.location}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-6">
                {daysUntilEvent > 0 && (
                  <Badge variant="destructive" className="px-3 py-1 text-sm">
                    <Timer className="h-3.5 w-3.5 mr-1" />
                    Faltam {daysUntilEvent} dias
                  </Badge>
                )}
                <div className="flex items-center gap-4 text-sm">
                  <div className="text-center">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                    </div>
                    <div className="font-bold">{eventStats.total}</div>
                    <div className="text-xs text-muted-foreground">Total</div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </div>
                    <div className="font-bold">{eventStats.confirmados}</div>
                    <div className="text-xs text-muted-foreground">Confirmados</div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Ticket className="h-3.5 w-3.5" />
                    </div>
                    <div className="font-bold">{eventStats.ingressos}</div>
                    <div className="text-xs text-muted-foreground">Ingressos</div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-green-600 dark:text-green-400">{eventStats.comparecimentoPct}%</div>
                    <div className="text-xs text-muted-foreground">Comparecimento</div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="max-w-lg">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, empresa, telefone ou email..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Countdown Banner */}
      {currentEvent && daysUntilEvent > 0 && (
        <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900 rounded-lg px-4 py-3 flex items-center gap-2">
          <Timer className="h-5 w-5 text-orange-500" />
          <span className="text-orange-600 dark:text-orange-400 font-semibold">
            Faltam {daysUntilEvent} dias para o evento
          </span>
        </div>
      )}

      {/* No event fallback */}
      {!currentEventId && !isLoading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Flame className="h-12 w-12 text-orange-300 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum evento cadastrado</h3>
            <p className="text-muted-foreground mb-4">Crie um evento Intensivo para começar a gerenciar leads</p>
            <Button onClick={() => setIsEventDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Evento
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Kanban Board */}
      {currentEventId && (
        isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : viewMode === 'kanban' ? (
          <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '55vh' }}>
            {visibleColumns.map(column => (
              <div
                key={column.id}
                className="flex-shrink-0 w-[260px] rounded-lg bg-card border border-border flex flex-col"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, column.id)}
              >
                {/* Column Header */}
                <div className={`${column.color} rounded-t-lg px-3 py-2.5 flex items-center justify-between`}>
                  <div className="flex items-center gap-2 text-white">
                    {column.icon}
                    <span className="font-semibold text-sm truncate">{column.title}</span>
                  </div>
                  <Badge className="bg-white/20 text-white border-0 text-xs min-w-[22px] flex items-center justify-center">
                    {leadsByStage[column.id]?.length || 0}
                  </Badge>
                </div>

                {/* Column Content */}
                <div className="p-2 space-y-2 flex-1 min-h-[150px]">
                  {(leadsByStage[column.id]?.length || 0) === 0 ? (
                    <div className="flex items-center justify-center h-[100px] text-sm text-muted-foreground">
                      Nenhum lead
                    </div>
                  ) : (
                    leadsByStage[column.id]?.map(lead => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        isDragging={draggedLeadId === lead.id}
                        onDragStart={(e) => handleDragStart(e, lead.id)}
                        onDragEnd={handleDragEnd}
                        onEdit={() => openLeadDialog(lead)}
                        onDelete={() => setDeleteLeadId(lead.id)}
                        onMoveToStage={(stage) => updateLeadMutation.mutate({ id: lead.id, data: { stage } })}
                      />
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Grid View
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredLeads.length === 0 ? (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                Nenhum lead encontrado
              </div>
            ) : (
              filteredLeads.map(lead => {
                const col = allColumns.find(c => c.id === lead.stage)
                return (
                  <Card key={lead.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-semibold text-sm">{lead.name}</h4>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openLeadDialog(lead)}>
                              <Pencil className="h-4 w-4 mr-2" /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setDeleteLeadId(lead.id)} className="text-destructive focus:text-destructive">
                              <Trash2 className="h-4 w-4 mr-2" /> Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      {col && (
                        <Badge className={`${col.color} text-white border-0 text-xs mb-2`}>
                          {col.title}
                        </Badge>
                      )}
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {lead.company && <p>{lead.company}</p>}
                        {lead.phone && <p>{lead.phone}</p>}
                        {lead.email && <p>{lead.email}</p>}
                      </div>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </div>
        )
      )}

      {/* Lead Dialog */}
      <Dialog open={isLeadDialogOpen} onOpenChange={(open) => {
        if (!open) { setIsLeadDialogOpen(false); setEditingLead(null); leadForm.reset() }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingLead ? 'Editar Lead' : 'Novo Lead'}</DialogTitle>
            <DialogDescription>
              {editingLead ? 'Atualize as informações do lead' : 'Adicione um novo lead ao funil do Intensivo'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={leadForm.handleSubmit(onLeadSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input placeholder="Nome do lead" {...leadForm.register('name')} />
              {leadForm.formState.errors.name && (
                <p className="text-sm text-destructive">{leadForm.formState.errors.name.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input placeholder="(11) 99999-9999" {...leadForm.register('phone')} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input placeholder="email@exemplo.com" {...leadForm.register('email')} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Input placeholder="Nome da empresa" {...leadForm.register('company')} />
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea placeholder="Anotações..." rows={2} {...leadForm.register('notes')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setIsLeadDialogOpen(false); setEditingLead(null); leadForm.reset() }}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createLeadMutation.isPending || updateLeadMutation.isPending}>
                {(createLeadMutation.isPending || updateLeadMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingLead ? 'Salvar' : 'Adicionar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Event Dialog */}
      <Dialog open={isEventDialogOpen} onOpenChange={(open) => {
        if (!open) { setIsEventDialogOpen(false); eventForm.reset() }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Evento Intensivo</DialogTitle>
            <DialogDescription>Crie um evento para gerenciar os leads do Intensivo</DialogDescription>
          </DialogHeader>
          <form onSubmit={eventForm.handleSubmit((data) => createEventMutation.mutate(data))} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome do Evento *</Label>
              <Input placeholder="Ex: Intensivo Março 2026" {...eventForm.register('name')} />
              {eventForm.formState.errors.name && (
                <p className="text-sm text-destructive">{eventForm.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Data *</Label>
              <Input type="date" {...eventForm.register('date')} />
              {eventForm.formState.errors.date && (
                <p className="text-sm text-destructive">{eventForm.formState.errors.date.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Local *</Label>
              <Input placeholder="Ex: São Paulo - SP" {...eventForm.register('location')} />
              {eventForm.formState.errors.location && (
                <p className="text-sm text-destructive">{eventForm.formState.errors.location.message}</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setIsEventDialogOpen(false); eventForm.reset() }}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createEventMutation.isPending}>
                {createEventMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar Evento
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Lead Dialog */}
      <AlertDialog open={!!deleteLeadId} onOpenChange={(open) => { if (!open) setDeleteLeadId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Lead</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este lead? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteLeadId) deleteLeadMutation.mutate(deleteLeadId) }}
            >
              <Trash2 className="h-4 w-4 mr-2" /> Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// Lead Card Component
interface LeadCardProps {
  lead: IntensivoLead
  isDragging: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: (e: React.DragEvent) => void
  onEdit: () => void
  onDelete: () => void
  onMoveToStage: (stage: IntensivoStage) => void
}

function LeadCard({ lead, isDragging, onDragStart, onDragEnd, onEdit, onDelete, onMoveToStage }: LeadCardProps) {
  return (
    <Card
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`cursor-grab active:cursor-grabbing transition-all ${isDragging ? 'opacity-50 scale-95' : 'hover:shadow-md'}`}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between mb-1">
          <h4 className="font-semibold text-sm">{lead.name}</h4>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 -mr-1 -mt-1">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[300px] overflow-y-auto">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-4 w-4 mr-2" /> Editar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {allColumns.filter(c => c.id !== lead.stage).map(col => (
                <DropdownMenuItem key={col.id} onClick={() => onMoveToStage(col.id)}>
                  <div className={`h-3 w-3 rounded-full ${col.color} mr-2`} />
                  <span className="text-xs">{col.title}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4 mr-2" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="space-y-1 text-xs text-muted-foreground">
          {lead.company && <p>{lead.company}</p>}
          {lead.phone && <p>{lead.phone}</p>}
          {lead.email && <p className="truncate">{lead.email}</p>}
        </div>
      </CardContent>
    </Card>
  )
}
