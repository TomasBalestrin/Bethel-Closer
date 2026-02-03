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
  Trash2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/authStore'
import { formatCurrency, formatPhoneNumber, getInitials } from '@/lib/utils'
import { toast } from 'sonner'
import type { Client, ClientStatus, ClientSource } from '@/types'

const clientSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  phone: z.string().min(10, 'Telefone inválido'),
  company: z.string().optional(),
  status: z.enum(['lead', 'contacted', 'negotiating', 'closed_won', 'closed_lost']),
  source: z.enum(['organic', 'referral', 'ads', 'event', 'other']),
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

export default function ClientsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ClientStatus | 'all'>('all')
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
      notes: ''
    }
  })

  const { data: clients, isLoading } = useQuery({
    queryKey: ['clients', searchQuery, statusFilter],
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

      const { data, error } = await query

      if (error) throw error
      return data as Client[]
    }
  })

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

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clients').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Cliente excluído com sucesso!')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir cliente')
    }
  })

  const onSubmit = (data: ClientFormData) => {
    createMutation.mutate(data)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Clientes</h1>
          <p className="text-muted-foreground">
            Gerencie seus clientes e leads
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Cliente
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Novo Cliente</DialogTitle>
              <DialogDescription>
                Adicione um novo cliente ao seu CRM
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input id="name" {...form.register('name')} />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...form.register('email')} />
                {form.formState.errors.email && (
                  <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input id="phone" {...form.register('phone')} />
                {form.formState.errors.phone && (
                  <p className="text-sm text-destructive">{form.formState.errors.phone.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Empresa</Label>
                <Input id="company" {...form.register('company')} />
              </div>
              <div className="grid grid-cols-2 gap-4">
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
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Criar Cliente
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

      {/* Clients List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : clients?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">Nenhum cliente encontrado</p>
            <Button onClick={() => setIsDialogOpen(true)}>
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
                      <DropdownMenuItem>
                        <Pencil className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => deleteMutation.mutate(client.id)}
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
                <div className="flex items-center justify-between pt-2 border-t">
                  <Badge variant={statusColors[client.status]}>
                    {statusLabels[client.status]}
                  </Badge>
                  {client.sale_value && (
                    <span className="text-sm font-medium text-success">
                      {formatCurrency(client.sale_value)}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
