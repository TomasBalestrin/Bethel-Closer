import { useState, useMemo, useRef } from 'react'
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
  MoreVertical,
  Pencil,
  Trash2,
  DollarSign,
  MapPin,
  Settings as SettingsIcon
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
import type { CrmCallClient, CrmCallStage } from '@/types'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// Schema
const clientSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  phone: z.string().optional().refine(v => !v || v.replace(/\D/g, '').length >= 10, 'Telefone inválido (mín. 10 dígitos)'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  company: z.string().optional(),
  niche: z.string().optional(),
  monthly_revenue: z.number().optional(),
  has_partner: z.boolean().default(false),
  funnel_source: z.string().optional(),
  sdr: z.string().optional(),
  product_offered: z.string().optional(),
  sale_value: z.number().optional(),
  notes: z.string().optional()
})

type ClientFormData = z.infer<typeof clientSchema>

// Column definitions
interface KanbanColumn {
  id: CrmCallStage
  title: string
  subtitle?: string
  color: string
  borderColor: string
  icon: React.ReactNode
}

const columns: KanbanColumn[] = [
  {
    id: 'call_realizada',
    title: 'Call Realizada',
    subtitle: 'Preencher dados',
    color: 'bg-blue-50',
    borderColor: 'border-t-blue-500',
    icon: <Phone className="h-4 w-4 text-blue-600" />
  },
  {
    id: 'repitch',
    title: 'RePitch',
    subtitle: '',
    color: 'bg-orange-50',
    borderColor: 'border-t-orange-500',
    icon: <Clock className="h-4 w-4 text-orange-600" />
  },
  {
    id: 'pos_call_0_2',
    title: 'Pós Call 0-2 dias',
    subtitle: 'Depoimentos e Conexão',
    color: 'bg-green-50',
    borderColor: 'border-t-green-500',
    icon: <Calendar className="h-4 w-4 text-green-600" />
  },
  {
    id: 'pos_call_3_7',
    title: 'Pós Call 3-7 dias',
    subtitle: 'Presente e Mentoria',
    color: 'bg-teal-50',
    borderColor: 'border-t-teal-500',
    icon: <MapPin className="h-4 w-4 text-teal-600" />
  }
]

export default function CrmCallsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<CrmCallClient | null>(null)
  const [deleteClientId, setDeleteClientId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [draggedClientId, setDraggedClientId] = useState<string | null>(null)
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const dragOverColumnRef = useRef<CrmCallStage | null>(null)

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      company: '',
      niche: '',
      monthly_revenue: undefined,
      has_partner: false,
      funnel_source: '',
      sdr: '',
      product_offered: '',
      sale_value: undefined,
      notes: ''
    }
  })

  const openDialog = (client?: CrmCallClient) => {
    if (client) {
      setEditingClient(client)
      form.reset({
        name: client.name,
        phone: client.phone || '',
        email: client.email || '',
        company: client.company || '',
        niche: client.niche || '',
        monthly_revenue: client.monthly_revenue || undefined,
        has_partner: client.has_partner,
        funnel_source: client.funnel_source || '',
        sdr: client.sdr || '',
        product_offered: client.product_offered || '',
        sale_value: client.sale_value || undefined,
        notes: client.notes || ''
      })
    } else {
      setEditingClient(null)
      form.reset({
        name: '',
        phone: '',
        email: '',
        company: '',
        niche: '',
        monthly_revenue: undefined,
        has_partner: false,
        funnel_source: '',
        sdr: '',
        product_offered: '',
        sale_value: undefined,
        notes: ''
      })
    }
    setIsDialogOpen(true)
  }

  // Fetch CRM Call clients
  const { data: clients, isLoading } = useQuery({
    queryKey: ['crm-call-clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_call_clients')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        // Table might not exist yet - return empty
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          return [] as CrmCallClient[]
        }
        throw error
      }
      return data as CrmCallClient[]
    }
  })

  // Filtered clients by search
  const filteredClients = useMemo(() => {
    if (!clients) return []
    if (!searchQuery.trim()) return clients
    const q = searchQuery.toLowerCase()
    return clients.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.company?.toLowerCase().includes(q) ||
      c.phone?.includes(q)
    )
  }, [clients, searchQuery])

  // Group by stage
  const clientsByStage = useMemo(() => {
    const grouped: Record<CrmCallStage, CrmCallClient[]> = {
      call_realizada: [],
      repitch: [],
      pos_call_0_2: [],
      pos_call_3_7: []
    }
    filteredClients.forEach(c => {
      if (grouped[c.stage]) {
        grouped[c.stage].push(c)
      }
    })
    return grouped
  }, [filteredClients])

  const createMutation = useMutation({
    mutationFn: async (data: ClientFormData) => {
      const { error } = await supabase.from('crm_call_clients').insert({
        ...data,
        email: data.email || null,
        phone: data.phone || null,
        company: data.company || null,
        niche: data.niche || null,
        monthly_revenue: data.monthly_revenue || null,
        funnel_source: data.funnel_source || null,
        sdr: data.sdr || null,
        product_offered: data.product_offered || null,
        sale_value: data.sale_value || null,
        notes: data.notes || null,
        stage: 'call_realizada',
        closer_id: user?.id
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-call-clients'] })
      toast.success('Cliente adicionado!')
      setIsDialogOpen(false)
      form.reset()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao adicionar cliente')
    }
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CrmCallClient> }) => {
      const { error } = await supabase.from('crm_call_clients').update(data).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-call-clients'] })
      toast.success('Cliente atualizado!')
      setIsDialogOpen(false)
      setEditingClient(null)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar cliente')
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('crm_call_clients').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-call-clients'] })
      toast.success('Cliente excluído!')
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

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, clientId: string) => {
    setDraggedClientId(clientId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', clientId)
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5'
    }
  }

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedClientId(null)
    dragOverColumnRef.current = null
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1'
    }
  }

  const handleDragOver = (e: React.DragEvent, stage: CrmCallStage) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    dragOverColumnRef.current = stage
  }

  const handleDrop = (e: React.DragEvent, stage: CrmCallStage) => {
    e.preventDefault()
    const clientId = e.dataTransfer.getData('text/plain')
    if (clientId) {
      const client = clients?.find(c => c.id === clientId)
      if (client && client.stage !== stage) {
        updateMutation.mutate({ id: clientId, data: { stage } })
      }
    }
    setDraggedClientId(null)
    dragOverColumnRef.current = null
  }

  const moveToStage = (clientId: string, stage: CrmCallStage) => {
    updateMutation.mutate({ id: clientId, data: { stage } })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">CRM Calls</h1>
          <p className="text-muted-foreground">
            Arraste os cards para atualizar o status
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => openDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Cliente
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, email ou empresa..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Kanban Board */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '60vh' }}>
          {columns.map((column) => (
            <div
              key={column.id}
              className={`flex-shrink-0 w-[280px] sm:w-[300px] rounded-lg border-t-4 ${column.borderColor} bg-card border border-border`}
              onDragOver={(e) => handleDragOver(e, column.id)}
              onDrop={(e) => handleDrop(e, column.id)}
            >
              {/* Column Header */}
              <div className="p-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {column.icon}
                    <span className="font-semibold text-sm">{column.title}</span>
                    <Badge variant="secondary" className="h-5 min-w-[20px] flex items-center justify-center text-xs">
                      {clientsByStage[column.id]?.length || 0}
                    </Badge>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                    <SettingsIcon className="h-4 w-4" />
                  </Button>
                </div>
                {column.subtitle && (
                  <p className="text-xs text-muted-foreground mt-1">{column.subtitle}</p>
                )}
              </div>

              {/* Column Content */}
              <div className="p-2 space-y-2 min-h-[200px]">
                {clientsByStage[column.id]?.length === 0 ? (
                  <div className="flex items-center justify-center h-[120px] border-2 border-dashed border-border rounded-lg">
                    <p className="text-sm text-muted-foreground">Arraste clientes aqui</p>
                  </div>
                ) : (
                  clientsByStage[column.id]?.map((client) => (
                    <ClientCard
                      key={client.id}
                      client={client}
                      isDragging={draggedClientId === client.id}
                      onDragStart={(e) => handleDragStart(e, client.id)}
                      onDragEnd={handleDragEnd}
                      onEdit={() => openDialog(client)}
                      onDelete={() => setDeleteClientId(client.id)}
                      onMoveToStage={(stage) => moveToStage(client.id, stage)}
                    />
                  ))
                )}
              </div>
            </div>
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingClient ? 'Editar Cliente' : 'Novo Cliente'}
            </DialogTitle>
            <DialogDescription>
              {editingClient ? 'Atualize as informações do cliente' : 'Adicione um novo cliente ao pipeline'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Contato */}
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Contato</p>
            </div>
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input placeholder="Nome do cliente" {...form.register('name')} />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input placeholder="(11) 99999-9999" {...form.register('phone')} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input placeholder="email@exemplo.com" {...form.register('email')} />
              </div>
            </div>

            {/* Negócio */}
            <div className="space-y-1 pt-2">
              <p className="text-sm font-medium text-muted-foreground">Negócio</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Empresa</Label>
                <Input placeholder="Nome da empresa" {...form.register('company')} />
              </div>
              <div className="space-y-2">
                <Label>Nicho</Label>
                <Input placeholder="Ex: Coaching, Consultoria..." {...form.register('niche')} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Faturamento Mensal (R$)</Label>
                <Input
                  type="number"
                  placeholder="0,00"
                  {...form.register('monthly_revenue', { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-2 flex items-end">
                <label className="flex items-center gap-2 cursor-pointer pb-2">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300"
                    {...form.register('has_partner')}
                  />
                  <span className="text-sm">Tem sócio</span>
                </label>
              </div>
            </div>

            {/* Origem */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Funil de Origem</Label>
                <Select
                  value={form.watch('funnel_source') || ''}
                  onValueChange={(v) => form.setValue('funnel_source', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Nenhum" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhum</SelectItem>
                    <SelectItem value="organico">Orgânico</SelectItem>
                    <SelectItem value="indicacao">Indicação</SelectItem>
                    <SelectItem value="trafego_pago">Tráfego Pago</SelectItem>
                    <SelectItem value="evento">Evento</SelectItem>
                    <SelectItem value="social">Redes Sociais</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>SDR</Label>
                <Select
                  value={form.watch('sdr') || ''}
                  onValueChange={(v) => form.setValue('sdr', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Nenhum" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhum</SelectItem>
                    <SelectItem value="sdr_1">SDR 1</SelectItem>
                    <SelectItem value="sdr_2">SDR 2</SelectItem>
                    <SelectItem value="sdr_3">SDR 3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Produto Ofertado</Label>
                <Select
                  value={form.watch('product_offered') || ''}
                  onValueChange={(v) => form.setValue('product_offered', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Nenhum" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhum</SelectItem>
                    <SelectItem value="crm_calls">CRM Calls (R$ 29,90)</SelectItem>
                    <SelectItem value="crm_intensivo">CRM Intensivo (R$ 12k)</SelectItem>
                    <SelectItem value="mentoria">Mentoria Premium (R$ 80k)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Valor da Venda (R$)</Label>
                <Input
                  type="number"
                  placeholder="0,00"
                  {...form.register('sale_value', { valueAsNumber: true })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                placeholder="Anotações sobre o cliente..."
                rows={2}
                {...form.register('notes')}
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
                {editingClient ? 'Salvar' : 'Adicionar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteClientId} onOpenChange={(open) => { if (!open) setDeleteClientId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Cliente</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este cliente do pipeline? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteClientId) deleteMutation.mutate(deleteClientId) }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// Client Card Component
interface ClientCardProps {
  client: CrmCallClient
  isDragging: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: (e: React.DragEvent) => void
  onEdit: () => void
  onDelete: () => void
  onMoveToStage: (stage: CrmCallStage) => void
}

function ClientCard({ client, isDragging, onDragStart, onDragEnd, onEdit, onDelete, onMoveToStage }: ClientCardProps) {
  const timeAgo = client.call_date
    ? formatDistanceToNow(new Date(client.call_date), { locale: ptBR, addSuffix: false })
    : client.created_at
    ? formatDistanceToNow(new Date(client.created_at), { locale: ptBR, addSuffix: false })
    : null

  return (
    <Card
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`cursor-grab active:cursor-grabbing transition-all ${isDragging ? 'opacity-50 scale-95' : 'hover:shadow-md'}`}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between mb-2">
          <h4 className="font-semibold text-sm">{client.name}</h4>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 -mr-1 -mt-1">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-4 w-4 mr-2" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {columns.filter(col => col.id !== client.stage).map(col => (
                <DropdownMenuItem key={col.id} onClick={() => onMoveToStage(col.id)}>
                  {col.icon}
                  <span className="ml-2">Mover para {col.title}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="space-y-1.5 text-xs text-muted-foreground">
          {client.call_date && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3" />
              <span>{new Date(client.call_date).toLocaleDateString('pt-BR')}</span>
              {timeAgo && (
                <>
                  <Clock className="h-3 w-3 ml-1" />
                  <span>{timeAgo}</span>
                </>
              )}
            </div>
          )}
          {!client.call_date && timeAgo && (
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              <span>{timeAgo}</span>
            </div>
          )}
          {client.phone && (
            <div className="flex items-center gap-1.5">
              <Phone className="h-3 w-3" />
              <span>{client.phone}</span>
            </div>
          )}
          {(client.sale_value != null && client.sale_value > 0) && (
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-3 w-3" />
              <span>R$ {client.sale_value.toLocaleString('pt-BR')}</span>
            </div>
          )}
          {client.niche && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3 w-3" />
              <span>{client.niche}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
