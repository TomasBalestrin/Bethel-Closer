import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus,
  Search,
  MoreHorizontal,
  Phone,
  Mail,
  Building2,
  Loader2,
  Eye,
  Pencil,
  Trash2,
  DollarSign,
  Tag,
  Filter
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/authStore'
import { formatCurrency, formatPhoneNumber, getInitials } from '@/lib/utils'
import { toast } from 'sonner'
import type { Client, ClientStatus, ClientSource, TicketType } from '@/types'

const clientSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  phone: z.string().min(10, 'Telefone inválido'),
  company: z.string().optional(),
  status: z.enum(['lead', 'contacted', 'negotiating', 'closed_won', 'closed_lost']),
  source: z.enum(['organic', 'referral', 'ads', 'event', 'other']),
  ticket_type: z.enum(['29_90', '12k', '80k']).optional().nullable(),
  entry_value: z.number().optional().nullable(),
  sale_value: z.number().optional().nullable(),
  notes: z.string().optional()
})

type ClientFormData = z.infer<typeof clientSchema>

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
  '29_90': 'CRM Calls (R$ 29,90)',
  '12k': 'CRM Intensivo (R$ 12k)',
  '80k': 'Mentoria Premium (R$ 80k)'
}

export default function ClientsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [deleteClientId, setDeleteClientId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ClientStatus | 'all'>('all')
  const [ticketFilter, setTicketFilter] = useState<TicketType | 'all'>('all')
  const { profile } = useAuthStore()
  const queryClient = useQueryClient()

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      company: '',
      status: 'lead',
      source: 'organic',
      ticket_type: null,
      entry_value: null,
      sale_value: null,
      notes: ''
    }
  })

  // Reset form when dialog opens/closes or editing changes
  const openDialog = (client?: Client) => {
    if (client) {
      setEditingClient(client)
      form.reset({
        name: client.name,
        email: client.email,
        phone: client.phone,
        company: client.company || '',
        status: client.status,
        source: client.source,
        ticket_type: client.ticket_type || null,
        entry_value: client.entry_value || null,
        sale_value: client.sale_value || null,
        notes: client.notes || ''
      })
    } else {
      setEditingClient(null)
      form.reset({
        name: '',
        email: '',
        phone: '',
        company: '',
        status: 'lead',
        source: 'organic',
        ticket_type: null,
        entry_value: null,
        sale_value: null,
        notes: ''
      })
    }
    setIsDialogOpen(true)
  }

  const { data: clients, isLoading } = useQuery({
    queryKey: ['clients', searchQuery, statusFilter, ticketFilter],
    queryFn: async () => {
      let query = supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false })

      if (searchQuery) {
        query = query.or(`name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%`)
      }

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      if (ticketFilter !== 'all') {
        query = query.eq('ticket_type', ticketFilter)
      }

      const { data, error } = await query

      if (error) throw error
      return data as Client[]
    }
  })

  // Tags query - will be used in future for tag filtering
  // const { data: tags = [] } = useQuery({
  //   queryKey: ['tags'],
  //   queryFn: async () => {
  //     const { data, error } = await supabase
  //       .from('tags')
  //       .select('*')
  //       .order('name')
  //     if (error) throw error
  //     return data as TagType[]
  //   }
  // })

  const createMutation = useMutation({
    mutationFn: async (data: ClientFormData) => {
      const { error } = await supabase.from('clients').insert({
        ...data,
        closer_id: profile?.id
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Cliente criado com sucesso!')
      setIsDialogOpen(false)
      form.reset()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao criar cliente')
    }
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ClientFormData }) => {
      const { error } = await supabase.from('clients').update(data).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Cliente atualizado com sucesso!')
      setIsDialogOpen(false)
      setEditingClient(null)
      form.reset()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar cliente')
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clients').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Cliente excluído com sucesso!')
      setDeleteClientId(null)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir cliente')
    }
  })

  const onSubmit = (data: ClientFormData) => {
    if (editingClient) {
      updateMutation.mutate({ id: editingClient.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  // Stats
  const totalClients = clients?.length || 0
  const leadCount = clients?.filter(c => c.status === 'lead').length || 0
  const negotiatingCount = clients?.filter(c => c.status === 'negotiating').length || 0
  const closedWonCount = clients?.filter(c => c.status === 'closed_won').length || 0
  const totalRevenue = clients?.reduce((sum, c) => sum + (c.sale_value || 0), 0) || 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Carteira de Clientes</h1>
          <p className="text-muted-foreground">
            Gerencie seus clientes e leads
          </p>
        </div>
        <Button onClick={() => openDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Cliente
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{totalClients}</div>
            <p className="text-sm text-muted-foreground">Total de Clientes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">{leadCount}</div>
            <p className="text-sm text-muted-foreground">Leads</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-amber-600">{negotiatingCount}</div>
            <p className="text-sm text-muted-foreground">Em Negociação</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalRevenue)}</div>
            <p className="text-sm text-muted-foreground">{closedWonCount} Vendas Fechadas</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar clientes..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as ClientStatus | 'all')}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <Filter className="h-4 w-4 mr-2" />
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
          value={ticketFilter}
          onValueChange={(value) => setTicketFilter(value as TicketType | 'all')}
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <Tag className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Produto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Produtos</SelectItem>
            {Object.entries(ticketTypeLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Clients List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : clients?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">Nenhum cliente encontrado</p>
            <Button onClick={() => openDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar primeiro cliente
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clients?.map((client) => (
            <Card key={client.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>{getInitials(client.name)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-base">{client.name}</CardTitle>
                      {client.company && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {client.company}
                        </p>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link to={`/clients/${client.id}`}>
                          <Eye className="h-4 w-4 mr-2" />
                          Ver detalhes
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openDialog(client)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeleteClientId(client.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  {client.email}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-4 w-4" />
                  {formatPhoneNumber(client.phone)}
                </div>
                {client.ticket_type && (
                  <div className="flex items-center gap-2 text-sm">
                    <Tag className="h-4 w-4 text-primary" />
                    <span className="font-medium">{ticketTypeLabels[client.ticket_type]}</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t">
                  <Badge variant={statusColors[client.status]}>
                    {statusLabels[client.status]}
                  </Badge>
                  {client.sale_value ? (
                    <span className="text-sm font-medium text-green-600 flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      {formatCurrency(client.sale_value)}
                    </span>
                  ) : client.entry_value ? (
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      {formatCurrency(client.entry_value)}
                    </span>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsDialogOpen(false)
          setEditingClient(null)
          form.reset()
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingClient ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
            <DialogDescription>
              {editingClient ? 'Atualize as informações do cliente' : 'Adicione um novo cliente ao seu CRM'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Info */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input id="name" {...form.register('name')} />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input id="email" type="email" {...form.register('email')} />
                {form.formState.errors.email && (
                  <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone *</Label>
                <Input id="phone" {...form.register('phone')} placeholder="(11) 99999-9999" />
                {form.formState.errors.phone && (
                  <p className="text-sm text-destructive">{form.formState.errors.phone.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Empresa</Label>
                <Input id="company" {...form.register('company')} />
              </div>
            </div>

            {/* Status and Source */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={form.watch('status')}
                  onValueChange={(value) => form.setValue('status', value as ClientStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Origem</Label>
                <Select
                  value={form.watch('source')}
                  onValueChange={(value) => form.setValue('source', value as ClientSource)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(sourceLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Ticket Type and Values */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Produto/Ticket</Label>
                <Select
                  value={form.watch('ticket_type') || ''}
                  onValueChange={(value) => form.setValue('ticket_type', value as TicketType || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhum</SelectItem>
                    {Object.entries(ticketTypeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="entry_value">Valor de Entrada</Label>
                <Input
                  id="entry_value"
                  type="number"
                  step="0.01"
                  placeholder="R$ 0,00"
                  {...form.register('entry_value', { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sale_value">Valor da Venda</Label>
                <Input
                  id="sale_value"
                  type="number"
                  step="0.01"
                  placeholder="R$ 0,00"
                  {...form.register('sale_value', { valueAsNumber: true })}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                {...form.register('notes')}
                placeholder="Adicione observações sobre o cliente..."
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => {
                setIsDialogOpen(false)
                setEditingClient(null)
                form.reset()
              }}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {editingClient ? 'Salvar Alterações' : 'Criar Cliente'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteClientId} onOpenChange={() => setDeleteClientId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Cliente</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este cliente? Esta ação não pode ser desfeita.
              Todas as ligações e atividades relacionadas também serão removidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteClientId && deleteMutation.mutate(deleteClientId)}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
