import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users,
  Phone,
  Target,
  DollarSign,
  Mail,
  MoreVertical,
  Search,
  Filter,
  Loader2
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
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
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { supabase } from '@/services/supabase'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'

interface TeamMember {
  id: string
  user_id: string
  name: string
  email: string
  role: 'closer' | 'lider' | 'admin'
  avatar_url?: string
  phone?: string
  stats: {
    clients: number
    calls: number
    sales: number
    revenue: number
    goalProgress: number
  }
}

const roleLabels = {
  closer: 'Closer',
  lider: 'Líder',
  admin: 'Admin'
}

const roleBadgeVariants = {
  closer: 'secondary',
  lider: 'default',
  admin: 'destructive'
} as const

export default function TeamPage() {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [goalDialogOpen, setGoalDialogOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null)
  const [memberGoalCalls, setMemberGoalCalls] = useState(100)
  const [memberGoalSales, setMemberGoalSales] = useState(20)
  const [memberGoalRevenue, setMemberGoalRevenue] = useState(100000)
  const queryClient = useQueryClient()

  const { data: teamMembers = [], isLoading } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .order('name')

      if (!profiles) return []

      // Get stats for each member
      const membersWithStats: TeamMember[] = await Promise.all(
        profiles.map(async (member) => {
          const [clientsResult, callsResult, salesResult, goalsResult] = await Promise.all([
            supabase.from('clients').select('*', { count: 'exact' }).eq('closer_id', member.user_id),
            supabase.from('calls').select('*', { count: 'exact' }).eq('closer_id', member.user_id),
            supabase.from('clients').select('sale_value').eq('closer_id', member.user_id).eq('status', 'closed_won'),
            supabase.from('monthly_goals').select('*').eq('closer_id', member.user_id).order('month', { ascending: false }).limit(1)
          ])

          const totalRevenue = salesResult.data?.reduce((sum, c) => sum + (c.sale_value || 0), 0) || 0
          const currentGoal = goalsResult.data?.[0]
          const goalProgress = currentGoal?.target_sales
            ? Math.round((salesResult.data?.length || 0) / currentGoal.target_sales * 100)
            : 0

          return {
            id: member.id,
            user_id: member.user_id,
            name: member.name,
            email: member.email,
            role: member.role as 'closer' | 'lider' | 'admin',
            avatar_url: member.avatar_url,
            phone: member.phone,
            stats: {
              clients: clientsResult.count || 0,
              calls: callsResult.count || 0,
              sales: salesResult.data?.length || 0,
              revenue: totalRevenue,
              goalProgress: Math.min(goalProgress, 100)
            }
          }
        })
      )

      return membersWithStats
    }
  })

  // Filter members
  const filteredMembers = teamMembers.filter(member => {
    const matchesSearch = member.name.toLowerCase().includes(search.toLowerCase()) ||
      member.email.toLowerCase().includes(search.toLowerCase())
    const matchesRole = roleFilter === 'all' || member.role === roleFilter
    return matchesSearch && matchesRole
  })

  // Calculate team totals
  const teamTotals = teamMembers.reduce(
    (acc, member) => ({
      members: acc.members + 1,
      clients: acc.clients + member.stats.clients,
      calls: acc.calls + member.stats.calls,
      sales: acc.sales + member.stats.sales,
      revenue: acc.revenue + member.stats.revenue
    }),
    { members: 0, clients: 0, calls: 0, sales: 0, revenue: 0 }
  )

  const saveGoal = useMutation({
    mutationFn: async () => {
      if (!selectedMember) return

      const now = new Date()
      const month = now.getMonth() + 1
      const year = now.getFullYear()

      const { error } = await supabase
        .from('monthly_goals')
        .upsert({
          closer_id: selectedMember.user_id,
          month,
          year,
          target_calls: memberGoalCalls,
          target_sales: memberGoalSales,
          target_revenue: memberGoalRevenue
        }, {
          onConflict: 'closer_id,month,year'
        })

      if (error) {
        // Try insert if upsert fails
        await supabase.from('monthly_goals').insert({
          closer_id: selectedMember.user_id,
          month,
          year,
          target_calls: memberGoalCalls,
          target_sales: memberGoalSales,
          target_revenue: memberGoalRevenue
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] })
      toast.success(`Meta definida para ${selectedMember?.name}!`)
      setGoalDialogOpen(false)
      setSelectedMember(null)
    },
    onError: (error) => {
      toast.error('Erro ao salvar meta: ' + (error instanceof Error ? error.message : 'Erro'))
    }
  })

  const openGoalDialog = (member: TeamMember) => {
    setSelectedMember(member)
    setMemberGoalCalls(100)
    setMemberGoalSales(20)
    setMemberGoalRevenue(100000)
    setGoalDialogOpen(true)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Equipe</h1>
        <p className="text-muted-foreground">
          Gerencie e acompanhe a performance da sua equipe
        </p>
      </div>

      {/* Team Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Membros
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{teamTotals.members}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Clientes
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{teamTotals.clients}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Ligações
            </CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{teamTotals.calls}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Vendas
            </CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{teamTotals.sales}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Receita Total
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(teamTotals.revenue)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filtrar por cargo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os cargos</SelectItem>
            <SelectItem value="closer">Closer</SelectItem>
            <SelectItem value="lider">Líder</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Team Members List */}
      <Card>
        <CardHeader>
          <CardTitle>Membros da Equipe</CardTitle>
          <CardDescription>
            {filteredMembers.length} membro{filteredMembers.length !== 1 ? 's' : ''} encontrado{filteredMembers.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">Nenhum membro encontrado</h3>
              <p className="text-sm text-muted-foreground">
                {search || roleFilter !== 'all'
                  ? 'Tente ajustar os filtros de busca'
                  : 'Adicione membros à equipe'
                }
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  {/* Member Info */}
                  <div className="flex items-center gap-4 flex-1">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={member.avatar_url} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{member.name}</h4>
                        <Badge variant={roleBadgeVariants[member.role]}>
                          {roleLabels[member.role]}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {member.email}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
                    <div className="text-center">
                      <p className="text-2xl font-bold">{member.stats.clients}</p>
                      <p className="text-xs text-muted-foreground">Clientes</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">{member.stats.calls}</p>
                      <p className="text-xs text-muted-foreground">Ligações</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">{member.stats.sales}</p>
                      <p className="text-xs text-muted-foreground">Vendas</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-600">
                        {formatCurrency(member.stats.revenue)}
                      </p>
                      <p className="text-xs text-muted-foreground">Receita</p>
                    </div>
                  </div>

                  {/* Goal Progress */}
                  <div className="w-full sm:w-32">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Meta</span>
                      <span className="text-xs font-medium">{member.stats.goalProgress}%</span>
                    </div>
                    <Progress value={member.stats.goalProgress} className="h-2" />
                  </div>

                  {/* Actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>Ver perfil</DropdownMenuItem>
                      <DropdownMenuItem>Ver clientes</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openGoalDialog(member)}>
                        Definir meta
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Goal Setting Dialog */}
      <Dialog open={goalDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setGoalDialogOpen(false)
          setSelectedMember(null)
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Definir Meta - {selectedMember?.name}</DialogTitle>
            <DialogDescription>
              Configure as metas mensais para este membro da equipe
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Meta de Ligações (mensal)</Label>
              <Input
                type="number"
                value={memberGoalCalls}
                onChange={(e) => setMemberGoalCalls(parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label>Meta de Vendas (mensal)</Label>
              <Input
                type="number"
                value={memberGoalSales}
                onChange={(e) => setMemberGoalSales(parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label>Meta de Receita (mensal, R$)</Label>
              <Input
                type="number"
                value={memberGoalRevenue}
                onChange={(e) => setMemberGoalRevenue(parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGoalDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => saveGoal.mutate()} disabled={saveGoal.isPending}>
              {saveGoal.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Meta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
