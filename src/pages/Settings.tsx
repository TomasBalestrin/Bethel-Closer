import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, User, Bell, Shield, Palette } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useAuthStore } from '@/stores/authStore'
import { getInitials } from '@/lib/utils'
import { toast } from 'sonner'

const profileSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  phone: z.string().optional()
})

type ProfileFormData = z.infer<typeof profileSchema>

export default function SettingsPage() {
  const { user, profile, updateProfile } = useAuthStore()
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: profile?.name || '',
      email: profile?.email || '',
      phone: profile?.phone || ''
    }
  })

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
                  <Button variant="outline" size="sm">
                    Alterar foto
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
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Lembretes de Ligações</p>
                  <p className="text-sm text-muted-foreground">
                    Receba lembretes antes das ligações agendadas
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Resumo Diário</p>
                  <p className="text-sm text-muted-foreground">
                    Receba um resumo diário das suas atividades
                  </p>
                </div>
                <Switch />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Notificações Push</p>
                  <p className="text-sm text-muted-foreground">
                    Receba notificações em tempo real no navegador
                  </p>
                </div>
                <Switch defaultChecked />
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
                  <Button variant="outline" className="h-auto py-4 flex-col gap-2">
                    <div className="h-8 w-8 rounded-full bg-background border" />
                    <span className="text-xs">Claro</span>
                  </Button>
                  <Button variant="outline" className="h-auto py-4 flex-col gap-2">
                    <div className="h-8 w-8 rounded-full bg-zinc-900" />
                    <span className="text-xs">Escuro</span>
                  </Button>
                  <Button variant="outline" className="h-auto py-4 flex-col gap-2 border-primary">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-background to-zinc-900" />
                    <span className="text-xs">Sistema</span>
                  </Button>
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Modo Compacto</p>
                  <p className="text-sm text-muted-foreground">
                    Reduz o espaçamento entre elementos
                  </p>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>
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
              <div>
                <Label className="mb-2 block">Alterar Senha</Label>
                <div className="space-y-4">
                  <Input type="password" placeholder="Senha atual" />
                  <Input type="password" placeholder="Nova senha" />
                  <Input type="password" placeholder="Confirmar nova senha" />
                  <Button>Alterar Senha</Button>
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Autenticação de Dois Fatores</p>
                  <p className="text-sm text-muted-foreground">
                    Adicione uma camada extra de segurança
                  </p>
                </div>
                <Button variant="outline">Configurar</Button>
              </div>
              <Separator />
              <div>
                <p className="font-medium text-destructive">Zona de Perigo</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Ações irreversíveis relacionadas à sua conta
                </p>
                <Button variant="destructive">Excluir Conta</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
