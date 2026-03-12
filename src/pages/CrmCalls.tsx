import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus,
  Search,
  Loader2,
  Trash2,
  RefreshCw
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { Switch } from '@/components/ui/switch'
import { supabase } from '@/services/supabase'
import { syncExistingCallsToCrm } from '@/services/driveSync'
import { useAuthStore } from '@/stores/authStore'
import { toast } from 'sonner'
import type { CrmCallClient } from '@/types'
import { KanbanBoard } from '@/components/crm/KanbanBoard'
import { CRMSettingsButton } from '@/components/crm/CRMSettingsButton'

// Schema
const clientSchema = z.object({
  name: z.string().min(1, 'Nome e obrigatorio'),
  phone: z.string().optional().refine(v => !v || v.replace(/\D/g, '').length >= 10, 'Telefone invalido (min. 10 digitos)'),
  email: z.string().email('Email invalido').optional().or(z.literal('')),
  company: z.string().optional(),
  niche: z.string().optional(),
  monthly_revenue: z.number().optional(),
  has_partner: z.boolean().default(false),
  funnel_source: z.string().optional(),
  sdr: z.string().optional(),
  product_offered: z.string().optional(),
  sale_value: z.number().optional(),
  notes: z.string().optional(),
  is_super_hot: z.boolean().default(false),
  is_indication: z.boolean().default(false)
})

type ClientFormData = z.infer<typeof clientSchema>

export default function CrmCallsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<CrmCallClient | null>(null)
  const [deleteClientId, setDeleteClientId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

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
      notes: '',
      is_super_hot: false,
      is_indication: false
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
        notes: client.notes || '',
        is_super_hot: client.is_super_hot || false,
        is_indication: client.is_indication || false
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
        notes: '',
        is_super_hot: false,
        is_indication: false
      })
    }
    setIsDialogOpen(true)
  }

  // Auto-sync existing analyzed calls to CRM clients on page load
  useEffect(() => {
    const syncCalls = async () => {
      // IMPORTANT: Use profileId (profiles.id) not user.id (auth.users.id)
      // because closer_id in calls table references profiles.id
      if (!user?.profileId) return

      try {
        const result = await syncExistingCallsToCrm(user.profileId)
        console.log(`[CrmCalls] Sync result:`, result)
        if (result.synced > 0) {
          console.log(`[CrmCalls] Synced ${result.synced} existing calls to CRM`)
          // Invalidate all related queries to refresh data across the app
          queryClient.invalidateQueries({ queryKey: ['crm-call-clients'] })
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
          queryClient.invalidateQueries({ queryKey: ['calls'] })
          queryClient.invalidateQueries({ queryKey: ['clients'] })
          toast.success(`${result.synced} cliente(s) criado(s) automaticamente das calls analisadas`)
        }
        if (result.errors.length > 0) {
          console.error('[CrmCalls] Sync errors:', result.errors)
        }
      } catch (err) {
        console.error('[CrmCalls] Auto-sync failed:', err)
      }
    }

    syncCalls()
  }, [user?.profileId, queryClient])

  // Manual sync function with feedback
  const handleManualSync = async () => {
    if (!user?.profileId || isSyncing) return

    setIsSyncing(true)
    try {
      const result = await syncExistingCallsToCrm(user.profileId)
      console.log('[CrmCalls] Manual sync result:', result)

      if (result.synced > 0) {
        queryClient.invalidateQueries({ queryKey: ['crm-call-clients'] })
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
        toast.success(`${result.synced} cliente(s) criado(s) das calls analisadas!`)
      } else if (result.skipped > 0 && result.errors.length === 0) {
        toast.info(`Todas as ${result.skipped} calls ja tem clientes no CRM`)
      } else if (result.errors.length > 0) {
        toast.error(`Erros na sincronizacao: ${result.errors.join(', ')}`)
      } else {
        toast.info('Nenhuma call analisada encontrada para sincronizar')
      }
    } catch (err) {
      console.error('[CrmCalls] Manual sync failed:', err)
      toast.error('Erro ao sincronizar calls')
    } finally {
      setIsSyncing(false)
    }
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
        is_super_hot: data.is_super_hot || false,
        is_indication: data.is_indication || false,
        stage: 'call_realizada',
        stage_entered_at: new Date().toISOString(),
        closer_id: user?.profileId
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
      toast.success('Cliente excluido!')
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

  // Handler for updating client (used by KanbanBoard)
  const handleUpdateClient = (id: string, data: Partial<CrmCallClient>) => {
    updateMutation.mutate({ id, data })
  }

  // Handler for portfolio migration (when moving to pos_21_carterizacao)
  const handlePortfolioMigration = (client: CrmCallClient) => {
    // TODO: Implement portfolio migration logic
    toast.info(`Cliente ${client.name} movido para carterizacao. Migracao para portfolio disponivel em breve.`)
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
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={handleManualSync}
            disabled={isSyncing}
            title="Sincronizar calls analisadas para o CRM"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Sincronizando...' : 'Sincronizar Calls'}
          </Button>
          <CRMSettingsButton />
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

      {/* Kanban Board - 10 Columns */}
      <KanbanBoard
        clients={filteredClients}
        isLoading={isLoading}
        onUpdateClient={handleUpdateClient}
        onEditClient={openDialog}
        onDeleteClient={(id) => setDeleteClientId(id)}
        onPortfolioMigration={handlePortfolioMigration}
      />

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
              {editingClient ? 'Atualize as informacoes do cliente' : 'Adicione um novo cliente ao pipeline'}
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

            {/* Negocio */}
            <div className="space-y-1 pt-2">
              <p className="text-sm font-medium text-muted-foreground">Negocio</p>
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
                  <span className="text-sm">Tem socio</span>
                </label>
              </div>
            </div>

            {/* Flags */}
            <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between">
                <Label htmlFor="is_super_hot" className="text-sm">Super Hot</Label>
                <Switch
                  id="is_super_hot"
                  checked={form.watch('is_super_hot')}
                  onCheckedChange={(checked) => form.setValue('is_super_hot', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="is_indication" className="text-sm">Indicacao</Label>
                <Switch
                  id="is_indication"
                  checked={form.watch('is_indication')}
                  onCheckedChange={(checked) => form.setValue('is_indication', checked)}
                />
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
                    <SelectItem value="organico">Organico</SelectItem>
                    <SelectItem value="indicacao">Indicacao</SelectItem>
                    <SelectItem value="trafego_pago">Trafego Pago</SelectItem>
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
              <Label>Observacoes</Label>
              <Textarea
                placeholder="Anotacoes sobre o cliente..."
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
              Tem certeza que deseja excluir este cliente do pipeline? Esta acao nao pode ser desfeita.
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
