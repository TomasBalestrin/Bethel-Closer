import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, User, Bell, Shield, Palette, Check, FileUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
import { getInitials } from '@/lib/utils'
import { toast } from 'sonner'
import ImportPage from '@/pages/Import'

const profileSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  phone: z.string().optional()
})

type ProfileFormData = z.infer<typeof profileSchema>

const passwordSchema = z.object({
  currentPassword: z.string().min(6, 'Mínimo 6 caracteres'),
  newPassword: z.string().min(6, 'Mínimo 6 caracteres'),
  confirmPassword: z.string().min(6, 'Mínimo 6 caracteres')
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'As senhas não conferem',
  path: ['confirmPassword']
})

type PasswordFormData = z.infer<typeof passwordSchema>

// Notification preferences stored in localStorage
interface NotificationPrefs {
  emailNotifications: boolean
  callReminders: boolean
  dailySummary: boolean
  pushNotifications: boolean
}

const defaultPrefs: NotificationPrefs = {
  emailNotifications: true,
  callReminders: true,
  dailySummary: false,
  pushNotifications: true
}

function getStoredPrefs(): NotificationPrefs {
  try {
    const stored = localStorage.getItem('notification-prefs')
    return stored ? { ...defaultPrefs, ...JSON.parse(stored) } : defaultPrefs
  } catch {
    return defaultPrefs
  }
}

function getStoredTheme(): string {
  return localStorage.getItem('app-theme') || 'light'
}

export default function SettingsPage() {
  const { user, profile, updateProfile, signOut } = useAuthStore()
  const [isLoading, setIsLoading] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(getStoredPrefs)
  const [theme, setTheme] = useState(getStoredTheme)

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: profile?.name || '',
      email: profile?.email || '',
      phone: profile?.phone || ''
    }
  })

  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    }
  })

  // Persist notification preferences
  const updateNotifPref = (key: keyof NotificationPrefs, value: boolean) => {
    const updated = { ...notifPrefs, [key]: value }
    setNotifPrefs(updated)
    localStorage.setItem('notification-prefs', JSON.stringify(updated))
    toast.success('Preferência atualizada')
  }

  // Apply theme via global ThemeInitializer
  useEffect(() => {
    localStorage.setItem('app-theme', theme)
    window.dispatchEvent(new Event('theme-changed'))
  }, [theme])

  // Reset form when profile loads
  useEffect(() => {
    if (profile) {
      form.reset({
        name: profile.name || '',
        email: profile.email || '',
        phone: profile.phone || ''
      })
    }
  }, [profile, form])

  const handleUpdateProfile = async (data: ProfileFormData) => {
    setIsLoading(true)
    try {
      await updateProfile(data)
      toast.success('Perfil atualizado com sucesso!')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar perfil')
    } finally {
      setIsLoading(false)
    }
  }

  const handleChangePassword = async (data: PasswordFormData) => {
    setIsChangingPassword(true)
    try {
      // First verify the current password by signing in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile?.email || '',
        password: data.currentPassword
      })

      if (signInError) {
        toast.error('Senha atual incorreta')
        return
      }

      // Update password
      const { error } = await supabase.auth.updateUser({
        password: data.newPassword
      })

      if (error) throw error

      toast.success('Senha alterada com sucesso!')
      passwordForm.reset()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao alterar senha')
    } finally {
      setIsChangingPassword(false)
    }
  }

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Máximo 2MB.')
      return
    }

    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${user?.id}.${fileExt}`
      const filePath = `avatars/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      await updateProfile({ avatar_url: urlData.publicUrl })
      toast.success('Foto atualizada com sucesso!')
    } catch {
      toast.error('Erro ao fazer upload. O bucket de storage pode não estar configurado.')
    }
  }

  const handleDeleteAccount = async () => {
    try {
      // Delete profile
      if (user?.id) {
        await supabase.from('profiles').delete().eq('user_id', user.id)
      }
      await signOut()
      toast.success('Conta excluída com sucesso')
    } catch {
      toast.error('Erro ao excluir conta')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">
          Gerencie suas preferências e configurações
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" />
            Perfil
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            Notificações
          </TabsTrigger>
          <TabsTrigger value="appearance" className="gap-2">
            <Palette className="h-4 w-4" />
            Aparência
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="h-4 w-4" />
            Segurança
          </TabsTrigger>
          <TabsTrigger value="import" className="gap-2">
            <FileUp className="h-4 w-4" />
            Importar Dados
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Informações do Perfil</CardTitle>
              <CardDescription>
                Atualize suas informações pessoais
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Avatar */}
              <div className="flex items-center gap-4">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={user?.avatar_url} />
                  <AvatarFallback className="text-xl">
                    {user?.name ? getInitials(user.name) : 'U'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <Button variant="outline" size="sm" asChild>
                    <label className="cursor-pointer">
                      Alterar foto
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/gif"
                        className="hidden"
                        onChange={handleAvatarUpload}
                      />
                    </label>
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">
                    JPG, PNG ou GIF. Máximo 2MB.
                  </p>
                </div>
              </div>

              <Separator />

              {/* Form */}
              <form onSubmit={form.handleSubmit(handleUpdateProfile)} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome</Label>
                    <Input id="name" {...form.register('name')} />
                    {form.formState.errors.name && (
                      <p className="text-sm text-destructive">
                        {form.formState.errors.name.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" {...form.register('email')} disabled />
                    <p className="text-xs text-muted-foreground">
                      O email não pode ser alterado
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input id="phone" {...form.register('phone')} />
                </div>
                <Button type="submit" disabled={isLoading}>
                  {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Salvar Alterações
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Preferências de Notificação</CardTitle>
              <CardDescription>
                Configure como deseja receber notificações
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Notificações por Email</p>
                  <p className="text-sm text-muted-foreground">
                    Receba atualizações importantes por email
                  </p>
                </div>
                <Switch
                  checked={notifPrefs.emailNotifications}
                  onCheckedChange={(v) => updateNotifPref('emailNotifications', v)}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Lembretes de Ligações</p>
                  <p className="text-sm text-muted-foreground">
                    Receba lembretes antes das ligações agendadas
                  </p>
                </div>
                <Switch
                  checked={notifPrefs.callReminders}
                  onCheckedChange={(v) => updateNotifPref('callReminders', v)}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Resumo Diário</p>
                  <p className="text-sm text-muted-foreground">
                    Receba um resumo diário das suas atividades
                  </p>
                </div>
                <Switch
                  checked={notifPrefs.dailySummary}
                  onCheckedChange={(v) => updateNotifPref('dailySummary', v)}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Notificações Push</p>
                  <p className="text-sm text-muted-foreground">
                    Receba notificações em tempo real no navegador
                  </p>
                </div>
                <Switch
                  checked={notifPrefs.pushNotifications}
                  onCheckedChange={(v) => updateNotifPref('pushNotifications', v)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance">
          <Card>
            <CardHeader>
              <CardTitle>Aparência</CardTitle>
              <CardDescription>
                Personalize a aparência do sistema
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label className="mb-3 block">Tema</Label>
                <div className="grid grid-cols-3 gap-4">
                  <Button
                    variant="outline"
                    className={`h-auto py-4 flex-col gap-2 ${theme === 'light' ? 'border-primary ring-2 ring-primary/20' : ''}`}
                    onClick={() => setTheme('light')}
                  >
                    <div className="h-8 w-8 rounded-full bg-white border" />
                    <span className="text-xs">Claro</span>
                    {theme === 'light' && <Check className="h-3 w-3 text-primary" />}
                  </Button>
                  <Button
                    variant="outline"
                    className={`h-auto py-4 flex-col gap-2 ${theme === 'dark' ? 'border-primary ring-2 ring-primary/20' : ''}`}
                    onClick={() => setTheme('dark')}
                  >
                    <div className="h-8 w-8 rounded-full bg-zinc-900" />
                    <span className="text-xs">Escuro</span>
                    {theme === 'dark' && <Check className="h-3 w-3 text-primary" />}
                  </Button>
                  <Button
                    variant="outline"
                    className={`h-auto py-4 flex-col gap-2 ${theme === 'system' ? 'border-primary ring-2 ring-primary/20' : ''}`}
                    onClick={() => setTheme('system')}
                  >
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-white to-zinc-900" />
                    <span className="text-xs">Sistema</span>
                    {theme === 'system' && <Check className="h-3 w-3 text-primary" />}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="import">
          <ImportPage />
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Segurança</CardTitle>
              <CardDescription>
                Gerencie suas configurações de segurança
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={passwordForm.handleSubmit(handleChangePassword)} className="space-y-4">
                <Label className="block">Alterar Senha</Label>
                <div className="space-y-3">
                  <div>
                    <Input
                      type="password"
                      placeholder="Senha atual"
                      {...passwordForm.register('currentPassword')}
                    />
                    {passwordForm.formState.errors.currentPassword && (
                      <p className="text-sm text-destructive mt-1">
                        {passwordForm.formState.errors.currentPassword.message}
                      </p>
                    )}
                  </div>
                  <div>
                    <Input
                      type="password"
                      placeholder="Nova senha"
                      {...passwordForm.register('newPassword')}
                    />
                    {passwordForm.formState.errors.newPassword && (
                      <p className="text-sm text-destructive mt-1">
                        {passwordForm.formState.errors.newPassword.message}
                      </p>
                    )}
                  </div>
                  <div>
                    <Input
                      type="password"
                      placeholder="Confirmar nova senha"
                      {...passwordForm.register('confirmPassword')}
                    />
                    {passwordForm.formState.errors.confirmPassword && (
                      <p className="text-sm text-destructive mt-1">
                        {passwordForm.formState.errors.confirmPassword.message}
                      </p>
                    )}
                  </div>
                  <Button type="submit" disabled={isChangingPassword}>
                    {isChangingPassword && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Alterar Senha
                  </Button>
                </div>
              </form>
              <Separator />
              <div>
                <p className="font-medium text-destructive">Zona de Perigo</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Ações irreversíveis relacionadas à sua conta
                </p>
                <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
                  Excluir Conta
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Account Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir sua conta? Esta ação não pode ser desfeita e todos os seus dados serão perdidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteAccount}
            >
              Excluir minha conta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
