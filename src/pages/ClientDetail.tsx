import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
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
  Sparkles
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase } from '@/services/supabase'
import { suggestNextActions } from '@/services/openai'
import { formatCurrency, formatDate, formatPhoneNumber, getInitials } from '@/lib/utils'
import { toast } from 'sonner'
import type { Client, Call, ClientActivity } from '@/types'
import { useState } from 'react'

const statusLabels: Record<string, string> = {
  lead: 'Lead',
  contacted: 'Contactado',
  negotiating: 'Negociando',
  closed_won: 'Fechado (Ganho)',
  closed_lost: 'Fechado (Perdido)'
}

const statusColors: Record<string, 'default' | 'secondary' | 'success' | 'destructive' | 'warning'> = {
  lead: 'secondary',
  contacted: 'default',
  negotiating: 'warning',
  closed_won: 'success',
  closed_lost: 'destructive'
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([])
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)

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
        .select('*')
        .eq('client_id', id)
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) throw error
      return data as ClientActivity[]
    },
    enabled: !!id
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
              {client.company && (
                <p className="text-muted-foreground flex items-center gap-1">
                  <Building2 className="h-4 w-4" />
                  {client.company}
                </p>
              )}
            </div>
          </div>
        </div>
        <Badge variant={statusColors[client.status]} className="text-sm">
          {statusLabels[client.status]}
        </Badge>
      </div>

      {/* Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Visão Geral</TabsTrigger>
              <TabsTrigger value="calls">Ligações ({calls?.length || 0})</TabsTrigger>
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
                  {client.sale_value && (
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                        <DollarSign className="h-5 w-5 text-success" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Valor da Venda</p>
                        <p className="font-medium text-success">{formatCurrency(client.sale_value)}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Notes */}
              {client.notes && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Anotações</CardTitle>
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
                  <Button size="sm">
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
                            <div className="flex items-center justify-between">
                              <p className="font-medium">
                                {formatDate(call.scheduled_at)}
                              </p>
                              <Badge
                                variant={
                                  call.status === 'completed' ? 'success' :
                                  call.status === 'scheduled' ? 'secondary' : 'destructive'
                                }
                              >
                                {call.status === 'completed' ? 'Concluída' :
                                 call.status === 'scheduled' ? 'Agendada' : call.status}
                              </Badge>
                            </div>
                            {call.duration_minutes && (
                              <p className="text-sm text-muted-foreground">
                                Duração: {call.duration_minutes} minutos
                              </p>
                            )}
                            {call.ai_summary && (
                              <p className="text-sm mt-2 p-2 bg-background rounded border">
                                <span className="font-medium text-primary">Resumo IA:</span>{' '}
                                {call.ai_summary}
                              </p>
                            )}
                            {call.notes && (
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

            <TabsContent value="activities" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Atividades Recentes</CardTitle>
                </CardHeader>
                <CardContent>
                  {activities?.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">
                      Nenhuma atividade registrada
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {activities?.map((activity) => (
                        <div key={activity.id} className="flex items-start gap-4">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                            <MessageSquare className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-medium">{activity.description}</p>
                            <p className="text-sm text-muted-foreground">
                              {formatDate(activity.created_at)}
                            </p>
                          </div>
                        </div>
                      ))}
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
              <Button className="w-full justify-start" variant="outline">
                <Phone className="h-4 w-4 mr-2" />
                Agendar Ligação
              </Button>
              <Button className="w-full justify-start" variant="outline">
                <Mail className="h-4 w-4 mr-2" />
                Enviar Email
              </Button>
              <Button className="w-full justify-start" variant="outline">
                <MessageSquare className="h-4 w-4 mr-2" />
                Adicionar Nota
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
