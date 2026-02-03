import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Shield,
  Users,
  UserPlus,
  Settings,
  Database,
  Activity,
  Trash2,
  Edit,
  MoreVertical,
  Check,
  X,
  Tag,
  Target
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
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
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/authStore'
import { toast } from 'sonner'

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

export default function AdminPage() {
  const { profile } = useAuthStore()
  const queryClient = useQueryClient()
  const [editingUser, setEditingUser] = useState<string | null>(null)
  const [newRole, setNewRole] = useState<string>('')
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#6366f1')

  // Fetch all users
  const { data: users = [] } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
      return data || []
    }
  })

  // Fetch all tags
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

  // Fetch system stats
  const { data: systemStats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const [usersCount, clientsCount, callsCount, tagsCount] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('clients').select('*', { count: 'exact', head: true }),
        supabase.from('calls').select('*', { count: 'exact', head: true }),
        supabase.from('tags').select('*', { count: 'exact', head: true })
      ])

      return {
        users: usersCount.count || 0,
        clients: clientsCount.count || 0,
        calls: callsCount.count || 0,
        tags: tagsCount.count || 0
      }
    }
  })

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
      toast.success('Cargo atualizado com sucesso')
      setEditingUser(null)
    },
    onError: (error) => {
      toast.error('Erro ao atualizar cargo: ' + error.message)
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
      toast.success('Usuário removido com sucesso')
      setDeleteUserId(null)
    },
    onError: (error) => {
      toast.error('Erro ao remover usuário: ' + error.message)
    }
  })

  // Create tag
  const createTag = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      const { error } = await supabase
        .from('tags')
        .insert({ name, color })

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tags'] })
      toast.success('Tag criada com sucesso')
      setNewTagName('')
      setNewTagColor('#6366f1')
    },
    onError: (error) => {
      toast.error('Erro ao criar tag: ' + error.message)
    }
  })

  // Delete tag
  const deleteTag = useMutation({
    mutationFn: async (tagId: string) => {
      const { error } = await supabase
        .from('tags')
        .delete()
        .eq('id', tagId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tags'] })
      toast.success('Tag removida com sucesso')
    },
    onError: (error) => {
      toast.error('Erro ao remover tag: ' + error.message)
    }
  })

  // Check if current user is admin
  if (profile?.role !== 'admin') {
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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Administração</h1>
        <p className="text-muted-foreground">
          Gerencie usuários, tags e configurações do sistema
        </p>
      </div>

      {/* System Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Usuários
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{systemStats?.users || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Clientes
            </CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{systemStats?.clients || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ligações
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{systemStats?.calls || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tags
            </CardTitle>
            <Tag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{systemStats?.tags || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">
            <Users className="h-4 w-4 mr-2" />
            Usuários
          </TabsTrigger>
          <TabsTrigger value="tags">
            <Tag className="h-4 w-4 mr-2" />
            Tags
          </TabsTrigger>
          <TabsTrigger value="goals">
            <Target className="h-4 w-4 mr-2" />
            Metas
          </TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>Gerenciar Usuários</CardTitle>
              <CardDescription>
                Visualize e gerencie os usuários do sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-4 rounded-lg border"
                  >
                    <div className="flex items-center gap-4">
                      <Avatar>
                        <AvatarImage src={user.avatar_url} />
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {user.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{user.name}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {editingUser === user.id ? (
                        <div className="flex items-center gap-2">
                          <Select
                            value={newRole}
                            onValueChange={setNewRole}
                          >
                            <SelectTrigger className="w-[120px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="closer">Closer</SelectItem>
                              <SelectItem value="lider">Líder</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => updateRole.mutate({ userId: user.id, role: newRole })}
                          >
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditingUser(null)}
                          >
                            <X className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Badge variant={roleBadgeVariants[user.role as keyof typeof roleBadgeVariants]}>
                            {roleLabels[user.role as keyof typeof roleLabels]}
                          </Badge>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditingUser(user.id)
                                  setNewRole(user.role)
                                }}
                              >
                                <Edit className="h-4 w-4 mr-2" />
                                Alterar cargo
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setDeleteUserId(user.id)}
                                disabled={user.id === profile?.id}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Remover usuário
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tags Tab */}
        <TabsContent value="tags">
          <Card>
            <CardHeader>
              <CardTitle>Gerenciar Tags</CardTitle>
              <CardDescription>
                Crie e gerencie tags para organizar clientes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Create Tag Form */}
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <Label htmlFor="tagName">Nome da Tag</Label>
                  <Input
                    id="tagName"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="Ex: VIP, Urgente, etc."
                  />
                </div>
                <div className="w-24">
                  <Label htmlFor="tagColor">Cor</Label>
                  <Input
                    id="tagColor"
                    type="color"
                    value={newTagColor}
                    onChange={(e) => setNewTagColor(e.target.value)}
                    className="h-10 p-1 cursor-pointer"
                  />
                </div>
                <Button
                  onClick={() => createTag.mutate({ name: newTagName, color: newTagColor })}
                  disabled={!newTagName.trim() || createTag.isPending}
                >
                  Criar Tag
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
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
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
        </TabsContent>

        {/* Goals Tab */}
        <TabsContent value="goals">
          <Card>
            <CardHeader>
              <CardTitle>Metas Globais</CardTitle>
              <CardDescription>
                Configure as metas padrão para a equipe
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label htmlFor="goalCalls">Meta de Ligações (mensal)</Label>
                  <Input
                    id="goalCalls"
                    type="number"
                    defaultValue={100}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="goalSales">Meta de Vendas (mensal)</Label>
                  <Input
                    id="goalSales"
                    type="number"
                    defaultValue={20}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="goalRevenue">Meta de Receita (mensal)</Label>
                  <Input
                    id="goalRevenue"
                    type="number"
                    defaultValue={100000}
                    className="mt-1"
                  />
                </div>
              </div>
              <Button>Salvar Metas</Button>
              <p className="text-sm text-muted-foreground">
                As metas individuais podem ser configuradas na página de equipe
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete User Dialog */}
      <AlertDialog open={!!deleteUserId} onOpenChange={() => setDeleteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este usuário? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteUserId && deleteUser.mutate(deleteUserId)}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
