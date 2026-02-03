import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus,
  Search,
  Phone,
  Calendar,
  Clock,
  Loader2,
  Sparkles,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Flame,
  Thermometer,
  Snowflake,
  Ban,
  CalendarDays,
  List,
  MoreVertical,
  Pencil,
  RefreshCw
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase } from '@/services/supabase'
import { analyzeCallTranscript } from '@/services/openai'
import { useAuthStore } from '@/stores/authStore'
import { formatDateTime, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import type { Call, CallStatus, CallClassification, Client } from '@/types'

const callSchema = z.object({
  client_id: z.string().min(1, 'Selecione um cliente'),
  scheduled_at: z.string().min(1, 'Selecione a data e hora'),
  classification: z.enum(['hot', 'warm', 'cold', 'not_qualified']).optional().nullable(),
  notes: z.string().optional()
})

type CallFormData = z.infer<typeof callSchema>

const statusLabels: Record<CallStatus, string> = {
  scheduled: 'Agendada',
  completed: 'Concluída',
  no_show: 'Não Compareceu',
  rescheduled: 'Reagendada',
  cancelled: 'Cancelada'
}

const statusIcons: Record<CallStatus, React.ReactNode> = {
  scheduled: <Calendar className="h-4 w-4" />,
  completed: <CheckCircle2 className="h-4 w-4" />,
  no_show: <XCircle className="h-4 w-4" />,
  rescheduled: <AlertCircle className="h-4 w-4" />,
  cancelled: <XCircle className="h-4 w-4" />
}

const statusColors: Record<CallStatus, 'default' | 'secondary' | 'success' | 'destructive' | 'warning'> = {
  scheduled: 'secondary',
  completed: 'success',
  no_show: 'destructive',
  rescheduled: 'warning',
  cancelled: 'destructive'
}

const classificationLabels: Record<CallClassification, string> = {
  hot: 'Quente',
  warm: 'Morno',
  cold: 'Frio',
  not_qualified: 'Não Qualificado'
}

const classificationIcons: Record<CallClassification, React.ReactNode> = {
  hot: <Flame className="h-4 w-4 text-red-500" />,
  warm: <Thermometer className="h-4 w-4 text-orange-500" />,
  cold: <Snowflake className="h-4 w-4 text-blue-500" />,
  not_qualified: <Ban className="h-4 w-4 text-gray-500" />
}

const classificationColors: Record<CallClassification, string> = {
  hot: 'bg-red-100 text-red-700 border-red-200',
  warm: 'bg-orange-100 text-orange-700 border-orange-200',
  cold: 'bg-blue-100 text-blue-700 border-blue-200',
  not_qualified: 'bg-gray-100 text-gray-700 border-gray-200'
}

export default function CallsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingCall, setEditingCall] = useState<(Call & { client: Client }) | null>(null)
  const [isRescheduling, setIsRescheduling] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<CallStatus | 'all'>('all')
  const [classificationFilter, setClassificationFilter] = useState<CallClassification | 'all'>('all')
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const { profile } = useAuthStore()
  const queryClient = useQueryClient()

  const form = useForm<CallFormData>({
    resolver: zodResolver(callSchema),
    defaultValues: {
      client_id: '',
      scheduled_at: '',
      classification: null,
      notes: ''
    }
  })

  const openDialog = (call?: Call & { client: Client }, reschedule = false) => {
    if (call) {
      setEditingCall(call)
      setIsRescheduling(reschedule)
      form.reset({
        client_id: call.client_id,
        scheduled_at: reschedule ? '' : call.scheduled_at.slice(0, 16),
        classification: call.classification || null,
        notes: call.notes || ''
      })
    } else {
      setEditingCall(null)
      setIsRescheduling(false)
      form.reset({
        client_id: '',
        scheduled_at: '',
        classification: null,
        notes: ''
      })
    }
    setIsDialogOpen(true)
  }

  const { data: calls, isLoading } = useQuery({
    queryKey: ['calls', searchQuery, statusFilter, classificationFilter],
    queryFn: async () => {
      let query = supabase
        .from('calls')
        .select(`
          *,
          client:clients(id, name, email, phone, ticket_type)
        `)
        .order('scheduled_at', { ascending: false })

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      if (classificationFilter !== 'all') {
        query = query.eq('classification', classificationFilter)
      }

      const { data, error } = await query

      if (error) throw error
      return data as (Call & { client: Client })[]
    }
  })

  const { data: clients } = useQuery({
    queryKey: ['clients-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, ticket_type')
        .order('name')

      if (error) throw error
      return data as Pick<Client, 'id' | 'name' | 'ticket_type'>[]
    }
  })

  const createMutation = useMutation({
    mutationFn: async (data: CallFormData) => {
      const { error } = await supabase.from('calls').insert({
        ...data,
        closer_id: profile?.id,
        status: 'scheduled'
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calls'] })
      toast.success('Ligação agendada com sucesso!')
      setIsDialogOpen(false)
      form.reset()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao agendar ligação')
    }
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Call> }) => {
      const { error } = await supabase.from('calls').update(data).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calls'] })
      toast.success('Ligação atualizada!')
      setIsDialogOpen(false)
      setEditingCall(null)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar ligação')
    }
  })

  const handleAnalyzeCall = async (call: Call & { client: Client }) => {
    if (!call.notes) {
      toast.error('Adicione anotações da ligação antes de analisar')
      return
    }

    setIsAnalyzing(call.id)
    try {
      const analysis = await analyzeCallTranscript(call.notes)

      await updateMutation.mutateAsync({
        id: call.id,
        data: {
          ai_summary: analysis.summary,
          ai_analysis: analysis,
          quality_score: analysis.score
        }
      })

      toast.success('Análise de IA concluída!')
    } catch (error) {
      toast.error('Erro ao analisar ligação')
    } finally {
      setIsAnalyzing(null)
    }
  }

  const handleCompleteCall = async (id: string, duration: number, notes?: string) => {
    const updateData: Partial<Call> = {
      status: 'completed',
      duration_minutes: duration
    }
    if (notes) {
      updateData.notes = notes
    }
    await updateMutation.mutateAsync({ id, data: updateData })
  }

  const handleReschedule = async (id: string, newDate: string) => {
    await updateMutation.mutateAsync({
      id,
      data: {
        scheduled_at: newDate,
        status: 'rescheduled'
      }
    })
    setIsDialogOpen(false)
  }

  const onSubmit = (data: CallFormData) => {
    if (isRescheduling && editingCall) {
      handleReschedule(editingCall.id, data.scheduled_at)
    } else if (editingCall) {
      updateMutation.mutate({
        id: editingCall.id,
        data: {
          scheduled_at: data.scheduled_at,
          classification: data.classification || undefined,
          notes: data.notes
        }
      })
    } else {
      createMutation.mutate(data)
    }
  }

  // Group calls by date for calendar view
  const callsByDate = calls?.reduce((acc, call) => {
    const date = formatDate(call.scheduled_at)
    if (!acc[date]) acc[date] = []
    acc[date].push(call)
    return acc
  }, {} as Record<string, (Call & { client: Client })[]>) || {}

  const scheduledCalls = calls?.filter(c => c.status === 'scheduled') || []
  const completedCalls = calls?.filter(c => c.status === 'completed') || []
  const otherCalls = calls?.filter(c => !['scheduled', 'completed'].includes(c.status)) || []

  // Stats
  const totalCalls = calls?.length || 0
  const hotCalls = calls?.filter(c => c.classification === 'hot').length || 0
  const callsWithScore = calls?.filter(c => c.quality_score) || []
  const avgScore = callsWithScore.length > 0
    ? callsWithScore.reduce((sum, c) => sum + (c.quality_score || 0), 0) / callsWithScore.length
    : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Ligações</h1>
          <p className="text-muted-foreground">
            Gerencie suas ligações e análises de IA
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border rounded-lg p-1">
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'calendar' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('calendar')}
            >
              <CalendarDays className="h-4 w-4" />
            </Button>
          </div>
          <Button onClick={() => openDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Agendar Ligação
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{totalCalls}</div>
            <p className="text-sm text-muted-foreground">Total de Ligações</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">{scheduledCalls.length}</div>
            <p className="text-sm text-muted-foreground">Agendadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600 flex items-center gap-2">
              <Flame className="h-5 w-5" />
              {hotCalls}
            </div>
            <p className="text-sm text-muted-foreground">Leads Quentes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{avgScore.toFixed(0)}%</div>
            <p className="text-sm text-muted-foreground">Score Médio IA</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar ligações..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as CallStatus | 'all')}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Status</SelectItem>
            {Object.entries(statusLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={classificationFilter}
          onValueChange={(value) => setClassificationFilter(value as CallClassification | 'all')}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Classificação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {Object.entries(classificationLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                <div className="flex items-center gap-2">
                  {classificationIcons[value as CallClassification]}
                  {label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Calls List or Calendar */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : viewMode === 'calendar' ? (
        // Calendar View
        <div className="space-y-6">
          {Object.entries(callsByDate).length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhuma ligação encontrada</p>
              </CardContent>
            </Card>
          ) : (
            Object.entries(callsByDate).map(([date, dateCalls]) => (
              <div key={date}>
                <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-primary" />
                  {date}
                </h3>
                <div className="space-y-3">
                  {dateCalls.map((call) => (
                    <CallCard
                      key={call.id}
                      call={call}
                      isAnalyzing={isAnalyzing === call.id}
                      onAnalyze={() => handleAnalyzeCall(call)}
                      onComplete={(duration, notes) => handleCompleteCall(call.id, duration, notes)}
                      onStatusChange={(status) => updateMutation.mutate({ id: call.id, data: { status } })}
                      onClassificationChange={(classification) => updateMutation.mutate({ id: call.id, data: { classification } })}
                      onEdit={() => openDialog(call)}
                      onReschedule={() => openDialog(call, true)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        // List View with Tabs
        <Tabs defaultValue="scheduled">
          <TabsList>
            <TabsTrigger value="scheduled">
              Agendadas ({scheduledCalls.length})
            </TabsTrigger>
            <TabsTrigger value="completed">
              Concluídas ({completedCalls.length})
            </TabsTrigger>
            <TabsTrigger value="other">
              Outras ({otherCalls.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="scheduled" className="mt-6">
            {scheduledCalls.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Nenhuma ligação agendada</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {scheduledCalls.map((call) => (
                  <CallCard
                    key={call.id}
                    call={call}
                    isAnalyzing={isAnalyzing === call.id}
                    onAnalyze={() => handleAnalyzeCall(call)}
                    onComplete={(duration, notes) => handleCompleteCall(call.id, duration, notes)}
                    onStatusChange={(status) => updateMutation.mutate({ id: call.id, data: { status } })}
                    onClassificationChange={(classification) => updateMutation.mutate({ id: call.id, data: { classification } })}
                    onEdit={() => openDialog(call)}
                    onReschedule={() => openDialog(call, true)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed" className="mt-6">
            {completedCalls.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <CheckCircle2 className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Nenhuma ligação concluída</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {completedCalls.map((call) => (
                  <CallCard
                    key={call.id}
                    call={call}
                    isAnalyzing={isAnalyzing === call.id}
                    onAnalyze={() => handleAnalyzeCall(call)}
                    onClassificationChange={(classification) => updateMutation.mutate({ id: call.id, data: { classification } })}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="other" className="mt-6">
            {otherCalls.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Nenhuma outra ligação</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {otherCalls.map((call) => (
                  <CallCard key={call.id} call={call} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Create/Edit/Reschedule Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsDialogOpen(false)
          setEditingCall(null)
          setIsRescheduling(false)
          form.reset()
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isRescheduling ? 'Reagendar Ligação' : editingCall ? 'Editar Ligação' : 'Agendar Ligação'}
            </DialogTitle>
            <DialogDescription>
              {isRescheduling
                ? 'Selecione uma nova data e hora para a ligação'
                : editingCall
                ? 'Atualize as informações da ligação'
                : 'Agende uma nova ligação com um cliente'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {!isRescheduling && (
              <div className="space-y-2">
                <Label>Cliente</Label>
                <Select
                  value={form.watch('client_id')}
                  onValueChange={(value) => form.setValue('client_id', value)}
                  disabled={!!editingCall}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients?.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.client_id && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.client_id.message}
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="scheduled_at">Data e Hora</Label>
              <Input
                id="scheduled_at"
                type="datetime-local"
                {...form.register('scheduled_at')}
              />
              {form.formState.errors.scheduled_at && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.scheduled_at.message}
                </p>
              )}
            </div>
            {!isRescheduling && (
              <>
                <div className="space-y-2">
                  <Label>Classificação do Lead</Label>
                  <Select
                    value={form.watch('classification') || ''}
                    onValueChange={(value) => form.setValue('classification', value as CallClassification || null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Não classificado</SelectItem>
                      {Object.entries(classificationLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          <div className="flex items-center gap-2">
                            {classificationIcons[value as CallClassification]}
                            {label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Observações</Label>
                  <Textarea
                    id="notes"
                    {...form.register('notes')}
                    placeholder="Adicione observações sobre a ligação..."
                    rows={3}
                  />
                </div>
              </>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => {
                setIsDialogOpen(false)
                setEditingCall(null)
                setIsRescheduling(false)
                form.reset()
              }}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {isRescheduling ? 'Reagendar' : editingCall ? 'Salvar' : 'Agendar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface CallCardProps {
  call: Call & { client: Client }
  isAnalyzing?: boolean
  onAnalyze?: () => void
  onComplete?: (duration: number, notes?: string) => void
  onStatusChange?: (status: CallStatus) => void
  onClassificationChange?: (classification: CallClassification) => void
  onEdit?: () => void
  onReschedule?: () => void
}

function CallCard({
  call,
  isAnalyzing,
  onAnalyze,
  onComplete,
  onStatusChange,
  onClassificationChange,
  onEdit,
  onReschedule
}: CallCardProps) {
  const [showCompleteForm, setShowCompleteForm] = useState(false)
  const [duration, setDuration] = useState('')
  const [notes, setNotes] = useState(call.notes || '')

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Phone className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">{call.client?.name || 'Cliente'}</CardTitle>
              <CardDescription className="flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDateTime(call.scheduled_at)}
                </span>
                {call.duration_minutes && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {call.duration_minutes} min
                  </span>
                )}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {call.classification && (
              <Badge className={`${classificationColors[call.classification]} border`}>
                {classificationIcons[call.classification]}
                <span className="ml-1">{classificationLabels[call.classification]}</span>
              </Badge>
            )}
            <Badge variant={statusColors[call.status]}>
              {statusIcons[call.status]}
              <span className="ml-1">{statusLabels[call.status]}</span>
            </Badge>
            {(onEdit || onReschedule) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onEdit && (
                    <DropdownMenuItem onClick={onEdit}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Editar
                    </DropdownMenuItem>
                  )}
                  {onReschedule && call.status === 'scheduled' && (
                    <DropdownMenuItem onClick={onReschedule}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Reagendar
                    </DropdownMenuItem>
                  )}
                  {onClassificationChange && (
                    <>
                      <DropdownMenuSeparator />
                      {Object.entries(classificationLabels).map(([value, label]) => (
                        <DropdownMenuItem
                          key={value}
                          onClick={() => onClassificationChange(value as CallClassification)}
                        >
                          {classificationIcons[value as CallClassification]}
                          <span className="ml-2">Marcar como {label}</span>
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {call.notes && !showCompleteForm && (
          <p className="text-sm text-muted-foreground">{call.notes}</p>
        )}

        {call.ai_summary && (
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Resumo IA</span>
              {call.quality_score !== null && (
                <Badge variant="outline" className="ml-auto">
                  Score: {call.quality_score}%
                </Badge>
              )}
            </div>
            <p className="text-sm">{call.ai_summary}</p>
          </div>
        )}

        {showCompleteForm ? (
          <div className="space-y-3 p-3 border rounded-lg bg-muted/50">
            <div className="space-y-2">
              <Label>Duração (minutos)</Label>
              <Input
                type="number"
                placeholder="Ex: 30"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Anotações da ligação</Label>
              <Textarea
                placeholder="Descreva os principais pontos discutidos..."
                value={notes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  if (duration && onComplete) {
                    onComplete(parseInt(duration), notes)
                    setShowCompleteForm(false)
                  }
                }}
                disabled={!duration}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Confirmar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowCompleteForm(false)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          (call.status === 'scheduled' || call.status === 'completed') && (
            <div className="flex flex-wrap gap-2">
              {call.status === 'scheduled' && onComplete && (
                <>
                  <Button size="sm" onClick={() => setShowCompleteForm(true)}>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Marcar como Concluída
                  </Button>
                  {onStatusChange && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onStatusChange('no_show')}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Não Compareceu
                    </Button>
                  )}
                </>
              )}
              {onAnalyze && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onAnalyze}
                  disabled={isAnalyzing || !call.notes}
                >
                  {isAnalyzing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Analisar com IA
                </Button>
              )}
            </div>
          )
        )}
      </CardContent>
    </Card>
  )
}
