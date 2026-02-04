import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState } from 'react'
import {
  ArrowLeft,
  Phone,
  Mail,
  Building2,
  Calendar,
  DollarSign,
  MessageSquare,
  Loader2,
  Plus,
  Sparkles,
  Pencil,
  Tag,
  Clock,
  Activity,
  Send,
  Flame,
  Thermometer,
  Snowflake,
  CheckCircle2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { supabase } from '@/services/supabase'
import { suggestNextActions } from '@/services/openai'
import { formatCurrency, formatDate, formatDateTime, formatPhoneNumber, getInitials } from '@/lib/utils'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/authStore'
import type { Client, Call, ClientActivity, ClientNote, ClientStatus, ClientSource, TicketType, CallClassification } from '@/types'

const statusLabels: Record<ClientStatus, string> = {
  lead: 'Lead',
  contacted: 'Contactado',
  negotiating: 'Negociando',
  closed_won: 'Fechado (Ganho)',
  closed_lost: 'Fechado (Perdido)'
}

const statusColors: Record<ClientStatus, 'default' | 'secondary' | 'success' | 'destructive' | 'warning'> = {
  lead: 'secondary',
  contacted: 'default',
  negotiating: 'warning',
  closed_won: 'success',
  closed_lost: 'destructive'
}

const sourceLabels: Record<ClientSource, string> = {
  organic: 'Orgânico',
  referral: 'Indicação',
  ads: 'Anúncios',
  event: 'Evento',
  other: 'Outro'
}

const ticketTypeLabels: Record<TicketType, string> = {
  '29_90': 'Elite Premium',
  '12k': 'Implementação Comercial',
  '80k': 'Mentoria Premium Julia',
  'impl_ia': 'Implementação de IA'
}

const classificationIcons: Record<CallClassification, React.ReactNode> = {
  hot: <Flame className="h-4 w-4 text-red-500" />,
  warm: <Thermometer className="h-4 w-4 text-orange-500" />,
  cold: <Snowflake className="h-4 w-4 text-blue-500" />,
  not_qualified: <CheckCircle2 className="h-4 w-4 text-gray-500" />
}

const activityIcons: Record<string, React.ReactNode> = {
  call: <Phone className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  meeting: <Calendar className="h-4 w-4" />,
  note: <MessageSquare className="h-4 w-4" />,
  status_change: <Activity className="h-4 w-4" />
}

const callSchema = z.object({
  scheduled_at: z.string().min(1, 'Selecione a data e hora'),
  classification: z.enum(['hot', 'warm', 'cold', 'not_qualified']).optional().nullable(),
  notes: z.string().optional()
})

type CallFormData = z.infer<typeof callSchema>

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([])
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)
  const [isScheduleCallOpen, setIsScheduleCallOpen] = useState(false)
  const [newNote, setNewNote] = useState('')

  const callForm = useForm<CallFormData>({
    resolver: zodResolver(callSchema),
    defaultValues: {
      scheduled_at: '',
      classification: null,
      notes: ''
    }
  })

  const { data: client, isLoading } = useQuery({
    queryKey: ['client', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      return data as Client
    },
    enabled: !!id
  })

  const { data: calls } = useQuery({
    queryKey: ['client-calls', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calls')
        .select('*')
        .eq('client_id', id)
        .order('scheduled_at', { ascending: false })

      if (error) throw error
      return data as Call[]
    },
    enabled: !!id
  })

  const { data: activities } = useQuery({
    queryKey: ['client-activities', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_activities')
        .select(`
          *,
          user:profiles(name)
        `)
        .eq('client_id', id)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw error
      return data as (ClientActivity & { user: { name: string } })[]
    },
    enabled: !!id
  })

  const { data: notes } = useQuery({
    queryKey: ['client-notes', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_notes')
        .select(`
          *,
          user:profiles(name)
        `)
        .eq('client_id', id)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as (ClientNote & { user: { name: string } })[]
    },
    enabled: !!id
  })

  // Update client status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async (status: ClientStatus) => {
      const { error } = await supabase
        .from('clients')
        .update({ status })
        .eq('id', id)
      if (error) throw error

      // Log activity
      await supabase.from('client_activities').insert({
        client_id: id,
        user_id: user?.id,
        type: 'status_change',
        description: `Status alterado para ${statusLabels[status]}`
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client', id] })
      queryClient.invalidateQueries({ queryKey: ['client-activities', id] })
      toast.success('Status atualizado!')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar status')
    }
  })

  // Add note mutation
  const addNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      const { error } = await supabase.from('client_notes').insert({
        client_id: id,
        user_id: user?.id,
        content
      })
      if (error) throw error

      // Log activity
      await supabase.from('client_activities').insert({
        client_id: id,
        user_id: user?.id,
        type: 'note',
        description: 'Adicionou uma nota'
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-notes', id] })
      queryClient.invalidateQueries({ queryKey: ['client-activities', id] })
      toast.success('Nota adicionada!')
      setNewNote('')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao adicionar nota')
    }
  })

  // Schedule call mutation
  const scheduleCallMutation = useMutation({
    mutationFn: async (data: z.infer<typeof callSchema>) => {
      const { error } = await supabase.from('calls').insert({
        client_id: id,
        closer_id: user?.id,
        scheduled_at: data.scheduled_at,
        classification: data.classification,
        notes: data.notes,
        status: 'scheduled'
      })
      if (error) throw error

      // Log activity
      await supabase.from('client_activities').insert({
        client_id: id,
        user_id: user?.id,
        type: 'call',
        description: `Agendou ligação para ${formatDateTime(data.scheduled_at)}`
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-calls', id] })
      queryClient.invalidateQueries({ queryKey: ['client-activities', id] })
      toast.success('Ligação agendada!')
      setIsScheduleCallOpen(false)
      callForm.reset()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao agendar ligação')
    }
  })

  const handleGetAISuggestions = async () => {
    if (!client || !calls?.length) {
      toast.error('Não há dados suficientes para gerar sugestões')
      return
    }

    setIsLoadingSuggestions(true)
    try {
      const clientHistory = `
        Nome: ${client.name}
        Status: ${statusLabels[client.status]}
        Empresa: ${client.company || 'N/A'}
        Produto: ${client.ticket_type ? ticketTypeLabels[client.ticket_type] : 'N/A'}
        Total de ligações: ${calls.length}
      `
      const lastCall = calls[0]
      const lastCallSummary = lastCall?.ai_summary || lastCall?.notes || 'Sem informações da última ligação'

      const suggestions = await suggestNextActions(clientHistory, lastCallSummary)
      setAiSuggestions(suggestions)
    } catch (error) {
      toast.error('Erro ao gerar sugestões de IA')
    } finally {
      setIsLoadingSuggestions(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!client) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Cliente não encontrado</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/clients')}>
          Voltar para clientes
        </Button>
      </div>
    )
  }

  const completedCalls = calls?.filter(c => c.status === 'completed').length || 0
  const scheduledCalls = calls?.filter(c => c.status === 'scheduled').length || 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/clients')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="text-lg">{getInitials(client.name)}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-bold">{client.name}</h1>
              <div className="flex items-center gap-2 text-muted-foreground">
                {client.company && (
                  <span className="flex items-center gap-1">
                    <Building2 className="h-4 w-4" />
                    {client.company}
                  </span>
                )}
                {client.ticket_type && (
                  <Badge variant="outline" className="ml-2">
                    <Tag className="h-3 w-3 mr-1" />
                    {ticketTypeLabels[client.ticket_type]}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={client.status}
            onValueChange={(value) => updateStatusMutation.mutate(value as ClientStatus)}
          >
            <SelectTrigger className="w-[180px]">
              <Badge variant={statusColors[client.status]} className="mr-2">
                {statusLabels[client.status]}
              </Badge>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(statusLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" asChild>
            <Link to={`/clients`}>
              <Pencil className="h-4 w-4 mr-2" />
              Editar
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{calls?.length || 0}</div>
            <p className="text-sm text-muted-foreground">Total Ligações</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">{scheduledCalls}</div>
            <p className="text-sm text-muted-foreground">Agendadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{completedCalls}</div>
            <p className="text-sm text-muted-foreground">Concluídas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">
              {client.sale_value ? formatCurrency(client.sale_value) : '-'}
            </div>
            <p className="text-sm text-muted-foreground">Valor da Venda</p>
          </CardContent>
        </Card>
      </div>

      {/* Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Visão Geral</TabsTrigger>
              <TabsTrigger value="calls">Ligações ({calls?.length || 0})</TabsTrigger>
              <TabsTrigger value="notes">Notas ({notes?.length || 0})</TabsTrigger>
              <TabsTrigger value="activities">Atividades</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6 mt-6">
              {/* Contact Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Informações de Contato</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Mail className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Email</p>
                      <p className="font-medium">{client.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Phone className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Telefone</p>
                      <p className="font-medium">{formatPhoneNumber(client.phone)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Calendar className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Cliente desde</p>
                      <p className="font-medium">{formatDate(client.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Tag className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Origem</p>
                      <p className="font-medium">{sourceLabels[client.source]}</p>
                    </div>
                  </div>
                  {client.entry_value && (
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                        <DollarSign className="h-5 w-5 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Valor de Entrada</p>
                        <p className="font-medium">{formatCurrency(client.entry_value)}</p>
                      </div>
                    </div>
                  )}
                  {client.sale_value && (
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                        <DollarSign className="h-5 w-5 text-green-500" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Valor da Venda</p>
                        <p className="font-medium text-green-600">{formatCurrency(client.sale_value)}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Client Notes */}
              {client.notes && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Observações do Cliente</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground whitespace-pre-wrap">{client.notes}</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="calls" className="mt-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg">Histórico de Ligações</CardTitle>
                  <Button size="sm" onClick={() => setIsScheduleCallOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Nova Ligação
                  </Button>
                </CardHeader>
                <CardContent>
                  {calls?.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">
                      Nenhuma ligação registrada
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {calls?.map((call) => (
                        <div
                          key={call.id}
                          className="flex items-start gap-4 p-4 rounded-lg bg-muted/50"
                        >
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Phone className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <p className="font-medium">
                                  {formatDateTime(call.scheduled_at)}
                                </p>
                                {call.classification && (
                                  <span className="flex items-center gap-1">
                                    {classificationIcons[call.classification]}
                                  </span>
                                )}
                              </div>
                              <Badge
                                variant={
                                  call.status === 'completed' ? 'success' :
                                  call.status === 'scheduled' ? 'secondary' : 'destructive'
                                }
                              >
                                {call.status === 'completed' ? 'Concluída' :
                                 call.status === 'scheduled' ? 'Agendada' :
                                 call.status === 'no_show' ? 'Não Compareceu' :
                                 call.status === 'rescheduled' ? 'Reagendada' : call.status}
                              </Badge>
                            </div>
                            {call.duration_minutes && (
                              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                                <Clock className="h-3 w-3" />
                                Duração: {call.duration_minutes} minutos
                              </p>
                            )}
                            {call.ai_summary && (
                              <div className="mt-2 p-2 bg-background rounded border">
                                <p className="text-sm">
                                  <span className="font-medium text-primary flex items-center gap-1 mb-1">
                                    <Sparkles className="h-3 w-3" />
                                    Resumo IA
                                    {call.quality_score && (
                                      <Badge variant="outline" className="ml-2">
                                        Score: {call.quality_score}%
                                      </Badge>
                                    )}
                                  </span>
                                  {call.ai_summary}
                                </p>
                              </div>
                            )}
                            {call.notes && !call.ai_summary && (
                              <p className="text-sm text-muted-foreground mt-2">
                                {call.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notes" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Notas</CardTitle>
                  <CardDescription>Adicione notas e observações sobre este cliente</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Add Note Form */}
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Digite uma nota..."
                      value={newNote}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewNote(e.target.value)}
                      className="flex-1"
                      rows={2}
                    />
                    <Button
                      onClick={() => newNote && addNoteMutation.mutate(newNote)}
                      disabled={!newNote || addNoteMutation.isPending}
                    >
                      {addNoteMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  {/* Notes List */}
                  {notes?.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">
                      Nenhuma nota adicionada
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {notes?.map((note) => (
                        <div key={note.id} className="p-3 rounded-lg bg-muted/50 border">
                          <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                            <span>{note.user?.name || 'Usuário'}</span>
                            <span>{formatDateTime(note.created_at)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activities" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Timeline de Atividades</CardTitle>
                </CardHeader>
                <CardContent>
                  {activities?.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">
                      Nenhuma atividade registrada
                    </p>
                  ) : (
                    <div className="relative">
                      <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                      <div className="space-y-6">
                        {activities?.map((activity) => (
                          <div key={activity.id} className="flex items-start gap-4 relative">
                            <div className="h-8 w-8 rounded-full bg-background border-2 border-primary/20 flex items-center justify-center z-10">
                              {activityIcons[activity.type] || <Activity className="h-4 w-4" />}
                            </div>
                            <div className="flex-1 pt-1">
                              <p className="font-medium text-sm">{activity.description}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                <span>{activity.user?.name || 'Usuário'}</span>
                                <span>•</span>
                                <span>{formatDateTime(activity.created_at)}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* AI Suggestions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Sugestões de IA
              </CardTitle>
              <CardDescription>
                Próximas ações recomendadas para este cliente
              </CardDescription>
            </CardHeader>
            <CardContent>
              {aiSuggestions.length === 0 ? (
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={handleGetAISuggestions}
                  disabled={isLoadingSuggestions}
                >
                  {isLoadingSuggestions ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Gerando sugestões...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Gerar Sugestões
                    </>
                  )}
                </Button>
              ) : (
                <div className="space-y-3">
                  {aiSuggestions.map((suggestion, index) => (
                    <div
                      key={index}
                      className="p-3 rounded-lg bg-primary/5 border border-primary/10"
                    >
                      <p className="text-sm">{suggestion}</p>
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={handleGetAISuggestions}
                    disabled={isLoadingSuggestions}
                  >
                    Regenerar sugestões
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Ações Rápidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => setIsScheduleCallOpen(true)}
              >
                <Phone className="h-4 w-4 mr-2" />
                Agendar Ligação
              </Button>
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => window.open(`mailto:${client.email}`)}
              >
                <Mail className="h-4 w-4 mr-2" />
                Enviar Email
              </Button>
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => window.open(`https://wa.me/${client.phone.replace(/\D/g, '')}`)}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                WhatsApp
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Schedule Call Dialog */}
      <Dialog open={isScheduleCallOpen} onOpenChange={setIsScheduleCallOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agendar Ligação</DialogTitle>
            <DialogDescription>
              Agende uma nova ligação com {client.name}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={callForm.handleSubmit((data) => scheduleCallMutation.mutate(data))} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="scheduled_at">Data e Hora</Label>
              <Input
                id="scheduled_at"
                type="datetime-local"
                {...callForm.register('scheduled_at')}
              />
              {callForm.formState.errors.scheduled_at && (
                <p className="text-sm text-destructive">
                  {callForm.formState.errors.scheduled_at.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Classificação do Lead</Label>
              <Select
                value={callForm.watch('classification') || ''}
                onValueChange={(value) => callForm.setValue('classification', value ? value as CallClassification : null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Não classificado</SelectItem>
                  <SelectItem value="hot">
                    <div className="flex items-center gap-2">
                      <Flame className="h-4 w-4 text-red-500" />
                      Quente
                    </div>
                  </SelectItem>
                  <SelectItem value="warm">
                    <div className="flex items-center gap-2">
                      <Thermometer className="h-4 w-4 text-orange-500" />
                      Morno
                    </div>
                  </SelectItem>
                  <SelectItem value="cold">
                    <div className="flex items-center gap-2">
                      <Snowflake className="h-4 w-4 text-blue-500" />
                      Frio
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                {...callForm.register('notes')}
                placeholder="Adicione observações sobre a ligação..."
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsScheduleCallOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={scheduleCallMutation.isPending}>
                {scheduleCallMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Agendar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
