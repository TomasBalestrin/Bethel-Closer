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
  AlertCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase } from '@/services/supabase'
import { analyzeCallTranscript } from '@/services/openai'
import { useAuthStore } from '@/stores/authStore'
import { formatDateTime } from '@/lib/utils'
import { toast } from 'sonner'
import type { Call, CallStatus, Client } from '@/types'

const callSchema = z.object({
  client_id: z.string().min(1, 'Selecione um cliente'),
  scheduled_at: z.string().min(1, 'Selecione a data e hora'),
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

export default function CallsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<CallStatus | 'all'>('all')
  const { profile } = useAuthStore()
  const queryClient = useQueryClient()

  const form = useForm<CallFormData>({
    resolver: zodResolver(callSchema),
    defaultValues: {
      client_id: '',
      scheduled_at: '',
      notes: ''
    }
  })

  const { data: calls, isLoading } = useQuery({
    queryKey: ['calls', searchQuery, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('calls')
        .select(`
          *,
          client:clients(id, name, email, phone)
        `)
        .order('scheduled_at', { ascending: false })

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
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
        .select('id, name')
        .order('name')

      if (error) throw error
      return data as Pick<Client, 'id' | 'name'>[]
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

  const handleCompleteCall = async (id: string, duration: number) => {
    await updateMutation.mutateAsync({
      id,
      data: {
        status: 'completed',
        duration_minutes: duration
      }
    })
  }

  const onSubmit = (data: CallFormData) => {
    createMutation.mutate(data)
  }

  const scheduledCalls = calls?.filter(c => c.status === 'scheduled') || []
  const completedCalls = calls?.filter(c => c.status === 'completed') || []
  const otherCalls = calls?.filter(c => !['scheduled', 'completed'].includes(c.status)) || []

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
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Agendar Ligação
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Agendar Ligação</DialogTitle>
              <DialogDescription>
                Agende uma nova ligação com um cliente
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label>Cliente</Label>
                <Select
                  value={form.watch('client_id')}
                  onValueChange={(value) => form.setValue('client_id', value)}
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
              <div className="space-y-2">
                <Label htmlFor="notes">Observações</Label>
                <Input id="notes" {...form.register('notes')} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Agendar
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
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
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(statusLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Calls List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
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
                    onComplete={(duration) => handleCompleteCall(call.id, duration)}
                    onStatusChange={(status) => updateMutation.mutate({ id: call.id, data: { status } })}
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
    </div>
  )
}

interface CallCardProps {
  call: Call & { client: Client }
  isAnalyzing?: boolean
  onAnalyze?: () => void
  onComplete?: (duration: number) => void
  onStatusChange?: (status: CallStatus) => void
}

function CallCard({ call, isAnalyzing, onAnalyze, onComplete, onStatusChange }: CallCardProps) {
  const [showDurationInput, setShowDurationInput] = useState(false)
  const [duration, setDuration] = useState('')

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
              <CardDescription className="flex items-center gap-2">
                <Calendar className="h-3 w-3" />
                {formatDateTime(call.scheduled_at)}
                {call.duration_minutes && (
                  <>
                    <Clock className="h-3 w-3 ml-2" />
                    {call.duration_minutes} min
                  </>
                )}
              </CardDescription>
            </div>
          </div>
          <Badge variant={statusColors[call.status]}>
            {statusIcons[call.status]}
            <span className="ml-1">{statusLabels[call.status]}</span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {call.notes && (
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

        {(call.status === 'scheduled' || call.status === 'completed') && (
          <div className="flex flex-wrap gap-2">
            {call.status === 'scheduled' && (
              <>
                {!showDurationInput ? (
                  <Button size="sm" onClick={() => setShowDurationInput(true)}>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Marcar como Concluída
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      placeholder="Duração (min)"
                      className="w-32"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        if (duration && onComplete) {
                          onComplete(parseInt(duration))
                          setShowDurationInput(false)
                        }
                      }}
                    >
                      Confirmar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowDurationInput(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                )}
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
        )}
      </CardContent>
    </Card>
  )
}
