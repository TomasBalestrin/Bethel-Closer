import { useState, useMemo } from 'react'
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
  Loader2,
  Plus,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  UserPlus,
  ShieldAlert
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
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
import { Switch } from '@/components/ui/switch'
import { supabase } from '@/services/supabase'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/authStore'
import type { Squad, SquadMember } from '@/types'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

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

interface SquadWithMembers extends Squad {
  members: TeamMember[]
  leader?: TeamMember
}

const roleLabels: Record<string, string> = {
  closer: 'Closer',
  lider: 'Líder',
  admin: 'Admin'
}

const roleBadgeVariants = {
  closer: 'secondary',
  lider: 'default',
  admin: 'destructive'
} as const

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────

export default function TeamPage() {
  const { user, profile } = useAuthStore()
  const role = profile?.role || user?.role || 'closer'

  // Access check: only admin and lider can see this page
  if (role === 'closer') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <ShieldAlert className="h-16 w-16 text-muted-foreground/50 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Acesso Restrito</h2>
        <p className="text-muted-foreground">
          Este módulo é exclusivo para líderes e administradores.
        </p>
      </div>
    )
  }

  return <TeamContent role={role} userProfileId={profile?.id} />
}

// ─────────────────────────────────────────────
// Team Content (for admin & lider)
// ─────────────────────────────────────────────

function TeamContent({ role, userProfileId }: { role: string; userProfileId?: string }) {
  const queryClient = useQueryClient()
  const isAdmin = role === 'admin'

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [expandedSquads, setExpandedSquads] = useState<Set<string>>(new Set())

  // Dialogs
  const [goalDialogOpen, setGoalDialogOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null)
  const [memberGoalCalls, setMemberGoalCalls] = useState(100)
  const [memberGoalSales, setMemberGoalSales] = useState(20)
  const [memberGoalRevenue, setMemberGoalRevenue] = useState(100000)

  const [squadDialogOpen, setSquadDialogOpen] = useState(false)
  const [editingSquad, setEditingSquad] = useState<Squad | null>(null)
  const [squadName, setSquadName] = useState('')
  const [squadDescription, setSquadDescription] = useState('')
  const [squadLeaderId, setSquadLeaderId] = useState<string>('')

  const [membersDialogOpen, setMembersDialogOpen] = useState(false)
  const [managingSquad, setManagingSquad] = useState<Squad | null>(null)
  const [memberSelections, setMemberSelections] = useState<Set<string>>(new Set())

  const [deleteSquadId, setDeleteSquadId] = useState<string | null>(null)

  // ─────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────

  // Fetch all team members with stats (batch queries)
  const { data: teamMembers = [], isLoading: membersLoading } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const [profilesResult, clientsResult, callsResult, goalsResult] = await Promise.all([
        supabase.from('profiles').select('*').order('name'),
        supabase.from('clients').select('closer_id, status, sale_value'),
        supabase.from('calls').select('closer_id'),
        supabase.from('monthly_goals').select('*').order('month', { ascending: false })
      ])

      const profiles = profilesResult.data
      if (!profiles) return []

      const allClients = clientsResult.data || []
      const allCalls = callsResult.data || []
      const allGoals = goalsResult.data || []

      const clientsByCloser = new Map<string, { total: number; wonCount: number; revenue: number }>()
      for (const c of allClients) {
        const entry = clientsByCloser.get(c.closer_id) || { total: 0, wonCount: 0, revenue: 0 }
        entry.total++
        if (c.status === 'closed_won') {
          entry.wonCount++
          entry.revenue += c.sale_value || 0
        }
        clientsByCloser.set(c.closer_id, entry)
      }

      const callsByCloser = new Map<string, number>()
      for (const c of allCalls) {
        callsByCloser.set(c.closer_id, (callsByCloser.get(c.closer_id) || 0) + 1)
      }

      const goalByCloser = new Map<string, typeof allGoals[0]>()
      for (const g of allGoals) {
        if (!goalByCloser.has(g.closer_id)) {
          goalByCloser.set(g.closer_id, g)
        }
      }

      return profiles.map((member): TeamMember => {
        const clientStats = clientsByCloser.get(member.id) || clientsByCloser.get(member.user_id) || { total: 0, wonCount: 0, revenue: 0 }
        const callCount = (callsByCloser.get(member.id) || 0) + (callsByCloser.get(member.user_id) || 0)
        const currentGoal = goalByCloser.get(member.id) || goalByCloser.get(member.user_id)
        const goalProgress = currentGoal?.target_sales
          ? Math.round(clientStats.wonCount / currentGoal.target_sales * 100)
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
            clients: clientStats.total,
            calls: callCount,
            sales: clientStats.wonCount,
            revenue: clientStats.revenue,
            goalProgress: Math.min(goalProgress, 100)
          }
        }
      })
    }
  })

  // Fetch squads (graceful fallback if table doesn't exist)
  const { data: squads = [], isLoading: squadsLoading } = useQuery({
    queryKey: ['squads'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('squads')
          .select('*')
          .order('name')
        if (error) return []
        return data as Squad[]
      } catch {
        return []
      }
    }
  })

  // Fetch squad members
  const { data: squadMembers = [] } = useQuery({
    queryKey: ['squad-members'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('squad_members')
          .select('*')
        if (error) return []
        return data as SquadMember[]
      } catch {
        return []
      }
    }
  })

  // ─────────────────────────────────────────
  // Computed data
  // ─────────────────────────────────────────

  const squadsWithMembers = useMemo((): SquadWithMembers[] => {
    const memberMap = new Map(teamMembers.map(m => [m.id, m]))

    return squads.map(squad => {
      const memberIds = squadMembers
        .filter(sm => sm.squad_id === squad.id)
        .map(sm => sm.profile_id)
      const members = memberIds
        .map(id => memberMap.get(id))
        .filter(Boolean) as TeamMember[]
      const leader = squad.leader_id ? memberMap.get(squad.leader_id) : undefined

      return { ...squad, members, leader }
    })
  }, [squads, squadMembers, teamMembers])

  // For leader: only show their squad
  const visibleSquads = useMemo(() => {
    if (isAdmin) return squadsWithMembers
    // Leader sees only squads they lead
    return squadsWithMembers.filter(s => s.leader_id === userProfileId)
  }, [squadsWithMembers, isAdmin, userProfileId])

  // Members not in any squad
  const unassignedMembers = useMemo(() => {
    const assignedIds = new Set(squadMembers.map(sm => sm.profile_id))
    return teamMembers.filter(m => !assignedIds.has(m.id))
  }, [teamMembers, squadMembers])

  // Filtered members for search/role filter
  const filterMembers = (members: TeamMember[]) => {
    const searchLower = search.toLowerCase()
    return members.filter(member => {
      const matchesSearch = member.name.toLowerCase().includes(searchLower) ||
        member.email.toLowerCase().includes(searchLower)
      const matchesRole = roleFilter === 'all' || member.role === roleFilter
      return matchesSearch && matchesRole
    })
  }

  // Team totals (only visible members)
  const teamTotals = useMemo(() => {
    const visibleMemberIds = new Set<string>()
    if (isAdmin) {
      teamMembers.forEach(m => visibleMemberIds.add(m.id))
    } else {
      visibleSquads.forEach(s => s.members.forEach(m => visibleMemberIds.add(m.id)))
    }
    return teamMembers
      .filter(m => visibleMemberIds.has(m.id))
      .reduce(
        (acc, member) => ({
          members: acc.members + 1,
          clients: acc.clients + member.stats.clients,
          calls: acc.calls + member.stats.calls,
          sales: acc.sales + member.stats.sales,
          revenue: acc.revenue + member.stats.revenue
        }),
        { members: 0, clients: 0, calls: 0, sales: 0, revenue: 0 }
      )
  }, [teamMembers, visibleSquads, isAdmin])

  // ─────────────────────────────────────────
  // Mutations
  // ─────────────────────────────────────────

  const changeRole = useMutation({
    mutationFn: async ({ profileId, newRole }: { profileId: string; newRole: string }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', profileId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] })
      toast.success('Cargo atualizado!')
    },
    onError: (error) => {
      toast.error('Erro ao alterar cargo: ' + (error instanceof Error ? error.message : 'Erro'))
    }
  })

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
        }, { onConflict: 'closer_id,month,year' })

      if (error) {
        const { error: error2 } = await supabase
          .from('monthly_goals')
          .upsert({
            closer_id: selectedMember.user_id,
            month,
            target_calls: memberGoalCalls,
            target_sales: memberGoalSales,
            target_revenue: memberGoalRevenue
          }, { onConflict: 'closer_id,month' })

        if (error2) {
          await supabase.from('monthly_goals').insert({
            closer_id: selectedMember.user_id,
            month,
            target_calls: memberGoalCalls,
            target_sales: memberGoalSales,
            target_revenue: memberGoalRevenue
          })
        }
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

  const saveSquad = useMutation({
    mutationFn: async () => {
      const payload = {
        name: squadName.trim(),
        description: squadDescription.trim() || null,
        leader_id: squadLeaderId || null
      }
      if (editingSquad) {
        const { error } = await supabase.from('squads').update(payload).eq('id', editingSquad.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('squads').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['squads'] })
      toast.success(editingSquad ? 'Squad atualizado!' : 'Squad criado!')
      setSquadDialogOpen(false)
      setEditingSquad(null)
    },
    onError: (error) => {
      toast.error('Erro ao salvar squad: ' + (error instanceof Error ? error.message : 'Erro'))
    }
  })

  const deleteSquad = useMutation({
    mutationFn: async (squadId: string) => {
      const { error } = await supabase.from('squads').delete().eq('id', squadId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['squads'] })
      queryClient.invalidateQueries({ queryKey: ['squad-members'] })
      toast.success('Squad removido!')
      setDeleteSquadId(null)
    },
    onError: (error) => {
      toast.error('Erro ao remover squad: ' + (error instanceof Error ? error.message : 'Erro'))
    }
  })

  const saveMembers = useMutation({
    mutationFn: async () => {
      if (!managingSquad) return

      // Get current members of this squad
      const currentIds = squadMembers
        .filter(sm => sm.squad_id === managingSquad.id)
        .map(sm => sm.profile_id)

      const toAdd = [...memberSelections].filter(id => !currentIds.includes(id))
      const toRemove = currentIds.filter(id => !memberSelections.has(id))

      // Remove members no longer selected
      if (toRemove.length > 0) {
        const { error } = await supabase
          .from('squad_members')
          .delete()
          .eq('squad_id', managingSquad.id)
          .in('profile_id', toRemove)
        if (error) throw error
      }

      // Add new members
      if (toAdd.length > 0) {
        const { error } = await supabase
          .from('squad_members')
          .insert(toAdd.map(profileId => ({
            squad_id: managingSquad.id,
            profile_id: profileId
          })))
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['squad-members'] })
      toast.success('Membros do squad atualizados!')
      setMembersDialogOpen(false)
      setManagingSquad(null)
    },
    onError: (error) => {
      toast.error('Erro ao atualizar membros: ' + (error instanceof Error ? error.message : 'Erro'))
    }
  })

  // ─────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────

  const openGoalDialog = (member: TeamMember) => {
    setSelectedMember(member)
    setMemberGoalCalls(100)
    setMemberGoalSales(20)
    setMemberGoalRevenue(100000)
    setGoalDialogOpen(true)
  }

  const openCreateSquad = () => {
    setEditingSquad(null)
    setSquadName('')
    setSquadDescription('')
    setSquadLeaderId('')
    setSquadDialogOpen(true)
  }

  const openEditSquad = (squad: Squad) => {
    setEditingSquad(squad)
    setSquadName(squad.name)
    setSquadDescription(squad.description || '')
    setSquadLeaderId(squad.leader_id || '')
    setSquadDialogOpen(true)
  }

  const openManageMembers = (squad: Squad) => {
    setManagingSquad(squad)
    const currentIds = squadMembers
      .filter(sm => sm.squad_id === squad.id)
      .map(sm => sm.profile_id)
    setMemberSelections(new Set(currentIds))
    setMembersDialogOpen(true)
  }

  const toggleSquadExpanded = (squadId: string) => {
    setExpandedSquads(prev => {
      const next = new Set(prev)
      if (next.has(squadId)) next.delete(squadId)
      else next.add(squadId)
      return next
    })
  }

  const toggleMemberSelection = (profileId: string) => {
    setMemberSelections(prev => {
      const next = new Set(prev)
      if (next.has(profileId)) next.delete(profileId)
      else next.add(profileId)
      return next
    })
  }

  // Leaders that can be assigned
  const potentialLeaders = teamMembers.filter(m => m.role === 'lider' || m.role === 'admin')

  const isLoading = membersLoading || squadsLoading

  // ─────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Equipe</h1>
          <p className="text-muted-foreground">
            {isAdmin
              ? 'Gerencie squads e acompanhe a performance da equipe'
              : 'Acompanhe a performance do seu squad'
            }
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openCreateSquad}>
            <Plus className="h-4 w-4 mr-2" />
            Criar Squad
          </Button>
        )}
      </div>

      {/* Team Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Membros</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{teamTotals.members}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{teamTotals.clients}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Ligacoes</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{teamTotals.calls}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Vendas</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{teamTotals.sales}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Receita Total</CardTitle>
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
            <SelectItem value="lider">Lider</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Loading */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <>
          {/* Squads */}
          {visibleSquads.length > 0 ? (
            <div className="space-y-4">
              {visibleSquads.map(squad => {
                const filtered = filterMembers(squad.members)
                const isExpanded = expandedSquads.has(squad.id)
                const squadStats = squad.members.reduce(
                  (acc, m) => ({
                    clients: acc.clients + m.stats.clients,
                    calls: acc.calls + m.stats.calls,
                    sales: acc.sales + m.stats.sales,
                    revenue: acc.revenue + m.stats.revenue
                  }),
                  { clients: 0, calls: 0, sales: 0, revenue: 0 }
                )

                return (
                  <Card key={squad.id}>
                    <CardHeader
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => toggleSquadExpanded(squad.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isExpanded
                            ? <ChevronDown className="h-5 w-5 text-muted-foreground" />
                            : <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          }
                          <div>
                            <CardTitle className="text-lg">{squad.name}</CardTitle>
                            <CardDescription>
                              {squad.leader
                                ? `Lider: ${squad.leader.name}`
                                : 'Sem lider atribuido'
                              }
                              {' · '}
                              {squad.members.length} membro{squad.members.length !== 1 ? 's' : ''}
                              {squad.description && ` · ${squad.description}`}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-4" onClick={e => e.stopPropagation()}>
                          <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
                            <span>{squadStats.clients} clientes</span>
                            <span>{squadStats.sales} vendas</span>
                            <span className="text-green-600 dark:text-green-400 font-medium">
                              {formatCurrency(squadStats.revenue)}
                            </span>
                          </div>
                          {isAdmin && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEditSquad(squad)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Editar Squad
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openManageMembers(squad)}>
                                  <UserPlus className="h-4 w-4 mr-2" />
                                  Gerenciar Membros
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => setDeleteSquadId(squad.id)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Remover Squad
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    {isExpanded && (
                      <CardContent>
                        {filtered.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            {search || roleFilter !== 'all'
                              ? 'Nenhum membro corresponde aos filtros'
                              : 'Nenhum membro neste squad'
                            }
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {filtered.map(member => (
                              <MemberRow
                                key={member.id}
                                member={member}
                                canChangeRole={isAdmin || role === 'lider'}
                                onChangeRole={(newRole) =>
                                  changeRole.mutate({ profileId: member.id, newRole })
                                }
                                onSetGoal={() => openGoalDialog(member)}
                              />
                            ))}
                          </div>
                        )}
                      </CardContent>
                    )}
                  </Card>
                )
              })}

              {/* Unassigned members (admin only) */}
              {isAdmin && unassignedMembers.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Sem Squad</CardTitle>
                    <CardDescription>
                      {unassignedMembers.length} membro{unassignedMembers.length !== 1 ? 's' : ''} sem squad atribuido
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {filterMembers(unassignedMembers).map(member => (
                        <MemberRow
                          key={member.id}
                          member={member}
                          canChangeRole={true}
                          onChangeRole={(newRole) =>
                            changeRole.mutate({ profileId: member.id, newRole })
                          }
                          onSetGoal={() => openGoalDialog(member)}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            /* No squads yet - show flat list */
            <Card>
              <CardHeader>
                <CardTitle>Membros da Equipe</CardTitle>
                <CardDescription>
                  {isAdmin
                    ? 'Crie squads para organizar sua equipe'
                    : 'Voce ainda nao foi atribuido a nenhum squad'
                  }
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isAdmin && teamMembers.length > 0 ? (
                  <div className="space-y-3">
                    {filterMembers(teamMembers).map(member => (
                      <MemberRow
                        key={member.id}
                        member={member}
                        canChangeRole={true}
                        onChangeRole={(newRole) =>
                          changeRole.mutate({ profileId: member.id, newRole })
                        }
                        onSetGoal={() => openGoalDialog(member)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-medium">Nenhum membro encontrado</h3>
                    <p className="text-sm text-muted-foreground">
                      {isAdmin
                        ? 'Adicione membros na aba Admin e crie squads aqui'
                        : 'Aguarde ser adicionado a um squad'
                      }
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* Dialogs                                */}
      {/* ═══════════════════════════════════════ */}

      {/* Goal Dialog */}
      <Dialog open={goalDialogOpen} onOpenChange={(open) => {
        if (!open) { setGoalDialogOpen(false); setSelectedMember(null) }
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
              <Label>Meta de Ligacoes (mensal)</Label>
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
            <Button variant="outline" onClick={() => setGoalDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveGoal.mutate()} disabled={saveGoal.isPending}>
              {saveGoal.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Meta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Squad Create/Edit Dialog */}
      <Dialog open={squadDialogOpen} onOpenChange={(open) => {
        if (!open) { setSquadDialogOpen(false); setEditingSquad(null) }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSquad ? 'Editar Squad' : 'Criar Squad'}</DialogTitle>
            <DialogDescription>
              {editingSquad
                ? 'Atualize as informacoes do squad'
                : 'Crie um novo squad para organizar sua equipe'
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome do Squad</Label>
              <Input
                placeholder="Ex: Squad Alpha"
                value={squadName}
                onChange={(e) => setSquadName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Descricao (opcional)</Label>
              <Textarea
                placeholder="Descreva o squad..."
                value={squadDescription}
                onChange={(e) => setSquadDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Lider do Squad</Label>
              <Select value={squadLeaderId} onValueChange={setSquadLeaderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um lider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem lider</SelectItem>
                  {potentialLeaders.map(leader => (
                    <SelectItem key={leader.id} value={leader.id}>
                      {leader.name} ({roleLabels[leader.role]})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSquadDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => saveSquad.mutate()}
              disabled={saveSquad.isPending || !squadName.trim()}
            >
              {saveSquad.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingSquad ? 'Salvar' : 'Criar Squad'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Members Dialog */}
      <Dialog open={membersDialogOpen} onOpenChange={(open) => {
        if (!open) { setMembersDialogOpen(false); setManagingSquad(null) }
      }}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gerenciar Membros - {managingSquad?.name}</DialogTitle>
            <DialogDescription>
              Selecione os membros que fazem parte deste squad
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            {teamMembers.map(member => {
              const isSelected = memberSelections.has(member.id)
              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => toggleMemberSelection(member.id)}
                >
                  <div className="flex items-center gap-3">
                    <Switch checked={isSelected} onCheckedChange={() => toggleMemberSelection(member.id)} />
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={member.avatar_url} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{member.name}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  <Badge variant={roleBadgeVariants[member.role]}>
                    {roleLabels[member.role]}
                  </Badge>
                </div>
              )
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMembersDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMembers.mutate()} disabled={saveMembers.isPending}>
              {saveMembers.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar ({memberSelections.size} selecionado{memberSelections.size !== 1 ? 's' : ''})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Squad Confirmation */}
      <AlertDialog open={!!deleteSquadId} onOpenChange={(open) => { if (!open) setDeleteSquadId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Squad?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acao nao pode ser desfeita. Os membros serao desvinculados do squad, mas nao serao removidos do sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteSquadId && deleteSquad.mutate(deleteSquadId)}
            >
              {deleteSquad.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─────────────────────────────────────────────
// Member Row Component
// ─────────────────────────────────────────────

function MemberRow({
  member,
  canChangeRole,
  onChangeRole,
  onSetGoal
}: {
  member: TeamMember
  canChangeRole: boolean
  onChangeRole: (newRole: string) => void
  onSetGoal: () => void
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
      {/* Member Info */}
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarImage src={member.avatar_url} />
          <AvatarFallback className="bg-primary/10 text-primary text-sm">
            {member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium truncate">{member.name}</h4>
            {canChangeRole ? (
              <Select value={member.role} onValueChange={onChangeRole}>
                <SelectTrigger className="h-6 w-auto text-xs px-2 gap-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="closer">Closer</SelectItem>
                  <SelectItem value="lider">Lider</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Badge variant={roleBadgeVariants[member.role]}>
                {roleLabels[member.role]}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1 truncate">
              <Mail className="h-3 w-3 shrink-0" />
              {member.email}
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
        <div className="text-center">
          <p className="text-xl font-bold">{member.stats.clients}</p>
          <p className="text-xs text-muted-foreground">Clientes</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold">{member.stats.calls}</p>
          <p className="text-xs text-muted-foreground">Ligacoes</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold">{member.stats.sales}</p>
          <p className="text-xs text-muted-foreground">Vendas</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold text-green-600 dark:text-green-400">
            {formatCurrency(member.stats.revenue)}
          </p>
          <p className="text-xs text-muted-foreground">Receita</p>
        </div>
      </div>

      {/* Goal Progress */}
      <div className="w-full sm:w-28">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">Meta</span>
          <span className="text-xs font-medium">{member.stats.goalProgress}%</span>
        </div>
        <Progress value={member.stats.goalProgress} className="h-2" />
      </div>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="shrink-0">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onSetGoal}>
            <Target className="h-4 w-4 mr-2" />
            Definir meta
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
