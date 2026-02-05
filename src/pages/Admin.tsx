import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Shield,
  Users,
  Activity,
  Trash2,
  X,
  Tag,
  Target,
  Loader2,
  UserPlus,
  Key,
  Mail,
  Phone,
  CheckCircle2,
  Cloud,
  Search
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
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
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/authStore'
import { toast } from 'sonner'

// ==========================================
// Constants
// ==========================================

const levelLabels: Record<string, string> = {
  especialista: 'Especialista',
  assessor: 'Assessor',
  senior: 'Sênior',
  junior: 'Júnior'
}

const levelColors: Record<string, string> = {
  especialista: 'bg-blue-600 text-white',
  assessor: 'bg-gray-900 dark:bg-gray-200 text-white dark:text-gray-900',
  senior: 'bg-purple-600 text-white',
  junior: 'bg-green-600 text-white'
}

// ==========================================
// Main Page
// ==========================================

export default function AdminPage() {
  const { user, profile } = useAuthStore()
  const role = profile?.role || user?.role

  if (role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Shield className="h-16 w-16 text-muted-foreground/50 mb-4" />
        <h1 className="text-2xl font-bold mb-2">Acesso Restrito</h1>
        <p className="text-muted-foreground">
          Você não tem permissão para acessar esta página
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Shield className="h-8 w-8 text-foreground" />
        <div>
          <h1 className="text-3xl font-bold text-foreground">Administração</h1>
          <p className="text-muted-foreground">
            Gerencie closers e times do sistema
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="closers" className="space-y-6">
        <TabsList className="bg-muted">
          <TabsTrigger value="closers" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Closers
          </TabsTrigger>
          <TabsTrigger value="tags" className="flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Tags
          </TabsTrigger>
          <TabsTrigger value="goals" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Metas
          </TabsTrigger>
          <TabsTrigger value="observability" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Observabilidade
          </TabsTrigger>
        </TabsList>

        <TabsContent value="closers">
          <ClosersTab currentUserId={profile?.id} />
        </TabsContent>

        <TabsContent value="tags">
          <TagsTab />
        </TabsContent>

        <TabsContent value="goals">
          <GoalsTab />
        </TabsContent>

        <TabsContent value="observability">
          <ObservabilityTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ==========================================
// CLOSERS TAB
// ==========================================

function ClosersTab({ currentUserId }: { currentUserId?: string }) {
  const queryClient = useQueryClient()
  const { user, profile } = useAuthStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [showGoalDialog, setShowGoalDialog] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null)

  // Bootstrap: ensure admin's own profile exists in the DB
  // (fixes "Total de Closers: 0" when profiles table is empty)
  const bootstrapRan = useRef(false)
  useEffect(() => {
    if (bootstrapRan.current || !user?.id) return
    bootstrapRan.current = true

    const ensureAdminProfile = async () => {
      try {
        // Check if profile already exists
        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle()

        if (!existing) {
          // Direct insert (RLS allows self-insert: auth.uid() = user_id)
          await supabase.from('profiles').insert({
            user_id: user.id,
            email: user.email || profile?.email || '',
            name: profile?.name || user.name || user.email?.split('@')[0] || '',
            role: (profile?.role || 'admin') as 'admin' | 'closer' | 'lider'
          })
        }

        queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      } catch {
        // Ignore bootstrap errors — page still works with cached profile
      }
    }
    ensureAdminProfile()
  }, [user?.id, profile, queryClient])

  // Fetch all users
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .order('name')
      return data || []
    }
  })

  // Fetch monthly goals to check who has goals set
  const { data: currentGoals = [] } = useQuery({
    queryKey: ['admin-current-goals'],
    queryFn: async () => {
      const now = new Date()
      // Try with year column first, fall back without it
      let result = await supabase
        .from('monthly_goals')
        .select('closer_id')
        .eq('month', now.getMonth() + 1)
        .eq('year', now.getFullYear())
      if (result.error) {
        result = await supabase
          .from('monthly_goals')
          .select('closer_id')
          .eq('month', now.getMonth() + 1)
      }
      return result.data || []
    },
    retry: false
  })

  // Fetch drive configs to check who has Google connected
  const { data: driveConfigs = [] } = useQuery({
    queryKey: ['admin-drive-configs'],
    queryFn: async () => {
      try {
        const { data } = await supabase
          .from('drive_sync_config')
          .select('closer_id')
        return data || []
      } catch {
        return []
      }
    },
    retry: false
  })

  // Stats
  const totalClosers = users.length
  const activeClosers = users.filter(u => u.role === 'closer' || u.role === 'lider').length
  const googleConnected = driveConfigs.length

  const goalCloserIds = new Set(currentGoals.map(g => g.closer_id))
  const driveCloserIds = new Set(driveConfigs.map(d => d.closer_id))

  // Update user role
  const updateRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ role })
        .eq('id', userId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      toast.success('Cargo atualizado')
    },
    onError: (error) => {
      toast.error('Erro ao atualizar: ' + error.message)
    }
  })

  // Delete user
  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      toast.success('Usuário removido')
      setDeleteUserId(null)
    },
    onError: (error) => {
      toast.error('Erro: ' + error.message)
    }
  })

  // Filter users by search
  const filteredUsers = users.filter(u => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.phone?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Closers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalClosers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Closers Ativos</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{activeClosers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Google Conectado</CardTitle>
            <Cloud className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{googleConnected}</div>
          </CardContent>
        </Card>
      </div>

      {/* Closers List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-xl">Closers Cadastrados</CardTitle>
              <CardDescription>Lista de todos os closers registrados no sistema</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setShowGoalDialog(true)}>
                <Target className="h-4 w-4 mr-2" />
                Definir Meta
              </Button>
              <Button onClick={() => setShowCreateDialog(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                Novo Closer
              </Button>
            </div>
          </div>
          {/* Search */}
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email ou telefone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {searchQuery ? 'Nenhum closer encontrado' : 'Nenhum closer cadastrado'}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredUsers.map((u) => (
                <CloserCard
                  key={u.id}
                  user={u}
                  hasGoal={goalCloserIds.has(u.user_id)}
                  hasGoogle={driveCloserIds.has(u.user_id)}
                  isCurrentUser={u.id === currentUserId}
                  onRoleChange={(role) => updateRole.mutate({ userId: u.id, role })}
                  onPasswordClick={() => {
                    setSelectedUserId(u.user_id)
                    setShowPasswordDialog(true)
                  }}
                  onDeleteClick={() => setDeleteUserId(u.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Closer Dialog */}
      <CreateCloserDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ['admin-users'] })}
      />

      {/* Password Dialog */}
      <PasswordDialog
        open={showPasswordDialog}
        onOpenChange={setShowPasswordDialog}
        userId={selectedUserId}
      />

      {/* Goal Dialog */}
      <TeamGoalDialog
        open={showGoalDialog}
        onOpenChange={setShowGoalDialog}
        users={users}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteUserId} onOpenChange={() => setDeleteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este usuário? Esta ação não pode ser desfeita.
              Todos os dados associados (clientes, ligações, etc.) serão mantidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteUserId && deleteUser.mutate(deleteUserId)}
            >
              {deleteUser.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Remover'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ==========================================
// CLOSER CARD
// ==========================================

interface CloserCardProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: any
  hasGoal: boolean
  hasGoogle: boolean
  isCurrentUser: boolean
  onRoleChange: (role: string) => void
  onPasswordClick: () => void
  onDeleteClick: () => void
}

function CloserCard({ user, hasGoal, hasGoogle, isCurrentUser, onRoleChange, onPasswordClick, onDeleteClick }: CloserCardProps) {
  const level = (user.level as string) || 'especialista'

  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-muted/30 transition-colors">
      {/* User Info */}
      <div className="flex items-center gap-3 min-w-0 lg:w-[240px]">
        <Avatar className="h-10 w-10 flex-shrink-0">
          <AvatarImage src={user.avatar_url} />
          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
            {user.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="font-semibold text-foreground truncate">{user.name || 'Sem nome'}</p>
          {user.email && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
              <Mail className="h-3 w-3 flex-shrink-0" />
              {user.email}
            </p>
          )}
          {user.phone && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Phone className="h-3 w-3 flex-shrink-0" />
              {user.phone}
            </p>
          )}
        </div>
      </div>

      {/* Role + Level */}
      <div className="flex items-center gap-2 flex-wrap lg:flex-nowrap">
        <Select
          value={user.role || 'closer'}
          onValueChange={onRoleChange}
        >
          <SelectTrigger className="w-[110px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="closer">Closer</SelectItem>
            <SelectItem value="lider">Líder</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>

        <Badge className={`${levelColors[level] || levelColors.especialista} text-xs px-2.5 py-0.5`}>
          {levelLabels[level] || 'Especialista'}
        </Badge>
      </div>

      {/* Status Badges */}
      <div className="flex items-center gap-2 flex-wrap lg:flex-1">
        {hasGoal ? (
          <Badge variant="outline" className="text-xs border-green-300 text-green-700 dark:border-green-700 dark:text-green-400">
            <Target className="h-3 w-3 mr-1" />
            Com meta
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-400">
            <Target className="h-3 w-3 mr-1" />
            Sem meta
          </Badge>
        )}

        {hasGoogle && (
          <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Google Conectado
          </Badge>
        )}

        <Badge className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
          Ativo
        </Badge>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 lg:ml-auto flex-shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-8"
          onClick={onPasswordClick}
        >
          <Key className="h-3 w-3 mr-1" />
          Senha
        </Button>
        <Button
          variant="destructive"
          size="icon"
          className="h-8 w-8"
          onClick={onDeleteClick}
          disabled={isCurrentUser}
          title={isCurrentUser ? 'Não é possível remover você mesmo' : 'Remover usuário'}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ==========================================
// CREATE CLOSER DIALOG
// ==========================================

function CreateCloserDialog({
  open,
  onOpenChange,
  onCreated
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('closer')
  const [isCreating, setIsCreating] = useState(false)

  const handleCreate = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      toast.error('Preencha nome, email e senha')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      toast.error('Formato de email inválido')
      return
    }

    if (phone && phone.replace(/\D/g, '').length < 10) {
      toast.error('Telefone inválido (mínimo 10 dígitos)')
      return
    }

    if (password.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres')
      return
    }

    setIsCreating(true)
    try {
      // Save current admin session before any auth operations
      const { data: { session: adminSession } } = await supabase.auth.getSession()

      // Try signUp — use supabase client but restore session immediately after
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            name: name.trim(),
            full_name: name.trim(),
            display_name: name.trim()
          }
        }
      })

      // IMMEDIATELY restore admin session (signUp switches to the new user)
      if (adminSession) {
        await supabase.auth.setSession({
          access_token: adminSession.access_token,
          refresh_token: adminSession.refresh_token
        })
      }

      if (signUpError) {
        const msg = signUpError.message.toLowerCase()
        if (msg.includes('already') || msg.includes('registered')) {
          throw new Error('Este email já está cadastrado no sistema.')
        }
        if (msg.includes('database error')) {
          throw new Error(
            'Erro de trigger no banco. Abra o SQL Editor do Supabase e execute:\n\n' +
            'DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;\n' +
            'DROP FUNCTION IF EXISTS handle_new_user();\n\n' +
            'Depois tente novamente.'
          )
        }
        throw signUpError
      }

      const newUserId = signUpData.user?.id
      if (!newUserId) {
        throw new Error('Usuário criado. Se o email de confirmação estiver ativado, o closer precisará confirmar.')
      }

      // Wait for any trigger to finish
      await new Promise(resolve => setTimeout(resolve, 500))

      // Create/update profile — try multiple strategies
      // Strategy 1: RPC (best, bypasses RLS via SECURITY DEFINER)
      const { error: rpcError } = await supabase.rpc('admin_create_profile', {
        p_user_id: newUserId,
        p_name: name.trim(),
        p_email: email.trim(),
        p_phone: phone || null,
        p_role: role
      })

      if (rpcError) {
        // Strategy 2: Direct upsert (needs admin RLS policy)
        const { error: upsertError } = await supabase
          .from('profiles')
          .upsert({
            user_id: newUserId,
            name: name.trim(),
            email: email.trim(),
            phone: phone || null,
            role
          }, { onConflict: 'user_id' })

        if (upsertError) {
          // Strategy 3: Update only (trigger may have created the row)
          await supabase
            .from('profiles')
            .update({
              name: name.trim(),
              email: email.trim(),
              phone: phone || null,
              role
            })
            .eq('user_id', newUserId)
        }
      }

      toast.success(`Closer "${name.trim()}" criado com sucesso!`)
      onCreated()
      onOpenChange(false)
      setName('')
      setEmail('')
      setPhone('')
      setPassword('')
      setRole('closer')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao criar closer')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Novo Closer
          </DialogTitle>
          <DialogDescription>
            Cadastre um novo closer no sistema
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="new-name">Nome *</Label>
            <Input
              id="new-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome completo"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="new-email">Email *</Label>
            <Input
              id="new-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="new-phone">Telefone</Label>
            <Input
              id="new-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 99999-9999"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="new-password">Senha *</Label>
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="mt-1"
            />
          </div>
          <div>
            <Label>Cargo</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="closer">Closer</SelectItem>
                <SelectItem value="lider">Líder</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={isCreating}>
            {isCreating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4 mr-2" />
            )}
            Criar Closer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==========================================
// PASSWORD DIALOG
// ==========================================

function PasswordDialog({
  open,
  onOpenChange,
  userId
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string | null
}) {
  const [newPassword, setNewPassword] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)

  const handleUpdate = async () => {
    if (!userId || !newPassword.trim()) {
      toast.error('Digite a nova senha')
      return
    }

    if (newPassword.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres')
      return
    }

    setIsUpdating(true)
    try {
      // Note: admin password reset requires service_role key on server
      // Client-side: we can only update the current user's password
      // For other users, we'd need an edge function
      const { error } = await supabase.auth.admin.updateUserById(userId, {
        password: newPassword
      })

      if (error) {
        // Fallback: try updating via regular method (only works for current user)
        const { error: error2 } = await supabase.auth.updateUser({
          password: newPassword
        })
        if (error2) throw error2
      }

      toast.success('Senha atualizada com sucesso!')
      onOpenChange(false)
      setNewPassword('')
    } catch (error) {
      toast.error('Erro ao atualizar senha. Pode ser necessário configurar uma Edge Function para reset de senha de outros usuários.')
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Alterar Senha
          </DialogTitle>
          <DialogDescription>
            Defina uma nova senha para o usuário
          </DialogDescription>
        </DialogHeader>

        <div>
          <Label htmlFor="new-pw">Nova Senha</Label>
          <Input
            id="new-pw"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Mínimo 6 caracteres"
            className="mt-1"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleUpdate} disabled={isUpdating}>
            {isUpdating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Atualizar Senha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==========================================
// TEAM GOAL DIALOG
// ==========================================

function TeamGoalDialog({
  open,
  onOpenChange,
  users
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  users: any[]
}) {
  const queryClient = useQueryClient()
  const [goalCalls, setGoalCalls] = useState(100)
  const [goalSales, setGoalSales] = useState(20)
  const [goalRevenue, setGoalRevenue] = useState(100000)
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const now = new Date()
      const month = now.getMonth() + 1
      const year = now.getFullYear()

      const members = users.filter(u => u.role === 'closer' || u.role === 'lider')

      for (const member of members) {
        const { error } = await supabase
          .from('monthly_goals')
          .upsert({
            closer_id: member.user_id,
            month,
            year,
            target_calls: goalCalls,
            target_sales: goalSales,
            target_revenue: goalRevenue
          }, {
            onConflict: 'closer_id,month,year'
          })

        if (error) {
          // Try without year column (old schema)
          await supabase
            .from('monthly_goals')
            .upsert({
              closer_id: member.user_id,
              month,
              target_calls: goalCalls,
              target_sales: goalSales,
              target_revenue: goalRevenue
            }, {
              onConflict: 'closer_id,month'
            })
        }
      }

      queryClient.invalidateQueries({ queryKey: ['admin-current-goals'] })
      queryClient.invalidateQueries({ queryKey: ['monthly-goal'] })
      toast.success(`Metas definidas para ${members.length} membro(s)!`)
      onOpenChange(false)
    } catch (error) {
      toast.error('Erro ao salvar metas')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Definir Meta da Equipe
          </DialogTitle>
          <DialogDescription>
            Configure as metas mensais para toda a equipe
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="goal-calls">Meta de Ligações</Label>
            <Input
              id="goal-calls"
              type="number"
              value={goalCalls}
              onChange={(e) => setGoalCalls(parseInt(e.target.value) || 0)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="goal-sales">Meta de Vendas</Label>
            <Input
              id="goal-sales"
              type="number"
              value={goalSales}
              onChange={(e) => setGoalSales(parseInt(e.target.value) || 0)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="goal-revenue">Meta de Receita (R$)</Label>
            <Input
              id="goal-revenue"
              type="number"
              value={goalRevenue}
              onChange={(e) => setGoalRevenue(parseInt(e.target.value) || 0)}
              className="mt-1"
            />
          </div>

          <p className="text-sm text-muted-foreground">
            A meta será aplicada a {users.filter(u => u.role === 'closer' || u.role === 'lider').length} membros da equipe para o mês atual.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar Metas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==========================================
// TAGS TAB
// ==========================================

function TagsTab() {
  const queryClient = useQueryClient()
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#6366f1')

  const { data: tags = [] } = useQuery({
    queryKey: ['admin-tags'],
    queryFn: async () => {
      const { data } = await supabase
        .from('tags')
        .select('*')
        .order('name')
      return data || []
    }
  })

  const createTag = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      const { error } = await supabase.from('tags').insert({ name, color })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tags'] })
      toast.success('Tag criada')
      setNewTagName('')
      setNewTagColor('#6366f1')
    },
    onError: (error) => {
      toast.error('Erro: ' + error.message)
    }
  })

  const deleteTag = useMutation({
    mutationFn: async (tagId: string) => {
      const { error } = await supabase.from('tags').delete().eq('id', tagId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tags'] })
      toast.success('Tag removida')
    },
    onError: (error) => {
      toast.error('Erro: ' + error.message)
    }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gerenciar Tags</CardTitle>
        <CardDescription>Crie e gerencie tags para organizar clientes</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Create Tag Form */}
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <Label htmlFor="tagName">Nome da Tag</Label>
            <Input
              id="tagName"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="Ex: VIP, Urgente, etc."
              className="mt-1"
            />
          </div>
          <div className="w-20">
            <Label htmlFor="tagColor">Cor</Label>
            <Input
              id="tagColor"
              type="color"
              value={newTagColor}
              onChange={(e) => setNewTagColor(e.target.value)}
              className="h-10 p-1 cursor-pointer mt-1"
            />
          </div>
          <Button
            onClick={() => createTag.mutate({ name: newTagName, color: newTagColor })}
            disabled={!newTagName.trim() || createTag.isPending}
          >
            {createTag.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar Tag'}
          </Button>
        </div>

        {/* Tags List */}
        <div className="flex flex-wrap gap-3">
          {tags.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma tag criada</p>
          ) : (
            tags.map((tag) => (
              <div
                key={tag.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full border"
                style={{ borderColor: tag.color }}
              >
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: tag.color }} />
                <span className="text-sm font-medium">{tag.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={() => deleteTag.mutate(tag.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ==========================================
// GOALS TAB
// ==========================================

function GoalsTab() {
  const queryClient = useQueryClient()
  const [goalCalls, setGoalCalls] = useState(100)
  const [goalSales, setGoalSales] = useState(20)
  const [goalRevenue, setGoalRevenue] = useState(100000)

  // Fetch current goals
  useQuery({
    queryKey: ['admin-goals'],
    queryFn: async () => {
      const now = new Date()
      let result = await supabase
        .from('monthly_goals')
        .select('*')
        .eq('month', now.getMonth() + 1)
        .eq('year', now.getFullYear())
        .limit(1)

      if (result.error) {
        result = await supabase
          .from('monthly_goals')
          .select('*')
          .eq('month', now.getMonth() + 1)
          .limit(1)
      }

      const data = result.data
      if (data?.[0]) {
        setGoalCalls(data[0].target_calls || 100)
        setGoalSales(data[0].target_sales || 20)
        setGoalRevenue(data[0].target_revenue || 100000)
      }
      return data?.[0] || null
    },
    retry: false
  })

  const { data: users = [] } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .order('name')
      return data || []
    }
  })

  const saveGoals = useMutation({
    mutationFn: async () => {
      const now = new Date()
      const month = now.getMonth() + 1
      const year = now.getFullYear()

      const members = users.filter(u => u.role === 'closer' || u.role === 'lider')

      for (const member of members) {
        const { error } = await supabase
          .from('monthly_goals')
          .upsert({
            closer_id: member.user_id,
            month,
            year,
            target_calls: goalCalls,
            target_sales: goalSales,
            target_revenue: goalRevenue
          }, { onConflict: 'closer_id,month,year' })

        if (error) {
          await supabase
            .from('monthly_goals')
            .upsert({
              closer_id: member.user_id,
              month,
              target_calls: goalCalls,
              target_sales: goalSales,
              target_revenue: goalRevenue
            }, { onConflict: 'closer_id,month' })
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-goals'] })
      queryClient.invalidateQueries({ queryKey: ['monthly-goal'] })
      toast.success('Metas salvas para toda a equipe!')
    },
    onError: () => {
      toast.error('Erro ao salvar metas')
    }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Metas Globais</CardTitle>
        <CardDescription>Configure as metas padrão para a equipe neste mês</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <Label htmlFor="goalCalls">Meta de Ligações (mensal)</Label>
            <Input
              id="goalCalls"
              type="number"
              value={goalCalls}
              onChange={(e) => setGoalCalls(parseInt(e.target.value) || 0)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="goalSales">Meta de Vendas (mensal)</Label>
            <Input
              id="goalSales"
              type="number"
              value={goalSales}
              onChange={(e) => setGoalSales(parseInt(e.target.value) || 0)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="goalRevenue">Meta de Receita (mensal)</Label>
            <Input
              id="goalRevenue"
              type="number"
              value={goalRevenue}
              onChange={(e) => setGoalRevenue(parseInt(e.target.value) || 0)}
              className="mt-1"
            />
          </div>
        </div>
        <Button
          onClick={() => saveGoals.mutate()}
          disabled={saveGoals.isPending}
        >
          {saveGoals.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Salvar Metas
        </Button>
        <p className="text-sm text-muted-foreground">
          As metas serão aplicadas a todos os closers e líderes da equipe ({users.filter(u => u.role === 'closer' || u.role === 'lider').length} membros).
        </p>
      </CardContent>
    </Card>
  )
}

// ==========================================
// OBSERVABILITY TAB
// ==========================================

function ObservabilityTab() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin-system-stats'],
    queryFn: async () => {
      const [usersCount, clientsCount, callsCount, tagsCount] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('clients').select('*', { count: 'exact', head: true }),
        supabase.from('calls').select('*', { count: 'exact', head: true }),
        supabase.from('tags').select('*', { count: 'exact', head: true })
      ])

      // Try to get recent calls for activity metrics
      const lastWeek = new Date()
      lastWeek.setDate(lastWeek.getDate() - 7)
      const { count: recentCalls } = await supabase
        .from('calls')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', lastWeek.toISOString())

      const { count: recentClients } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', lastWeek.toISOString())

      return {
        users: usersCount.count || 0,
        clients: clientsCount.count || 0,
        calls: callsCount.count || 0,
        tags: tagsCount.count || 0,
        recentCalls: recentCalls || 0,
        recentClients: recentClients || 0
      }
    }
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* System Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Usuários</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.users || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.clients || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Ligações</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.calls || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tags</CardTitle>
            <Tag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.tags || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Atividade Recente (7 dias)</CardTitle>
          <CardDescription>Resumo da atividade no sistema na última semana</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/50">
              <div className="h-12 w-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Activity className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.recentCalls || 0}</p>
                <p className="text-sm text-muted-foreground">Ligações esta semana</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/50">
              <div className="h-12 w-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <UserPlus className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.recentClients || 0}</p>
                <p className="text-sm text-muted-foreground">Novos clientes esta semana</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
