import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, Check, CheckCheck, Trash2, Phone, UserPlus, DollarSign, Calendar } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
// Supabase will be used when notifications are fully implemented
// import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/authStore'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Notification {
  id: string
  type: 'call_scheduled' | 'client_added' | 'sale_closed' | 'call_reminder' | 'goal_achieved'
  title: string
  message: string
  read: boolean
  created_at: string
  metadata?: Record<string, unknown>
}

const notificationIcons = {
  call_scheduled: Calendar,
  client_added: UserPlus,
  sale_closed: DollarSign,
  call_reminder: Phone,
  goal_achieved: Check
}

// Mock notifications for now - in production would come from Supabase
const mockNotifications: Notification[] = [
  {
    id: '1',
    type: 'call_scheduled',
    title: 'Ligação agendada',
    message: 'Você tem uma ligação com João Silva às 14:00',
    read: false,
    created_at: new Date().toISOString()
  },
  {
    id: '2',
    type: 'sale_closed',
    title: 'Venda realizada!',
    message: 'Parabéns! Venda de R$ 12.000 fechada com Maria Santos',
    read: false,
    created_at: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: '3',
    type: 'client_added',
    title: 'Novo cliente',
    message: 'Carlos Oliveira foi adicionado à sua carteira',
    read: true,
    created_at: new Date(Date.now() - 86400000).toISOString()
  },
  {
    id: '4',
    type: 'goal_achieved',
    title: 'Meta atingida!',
    message: 'Você atingiu 80% da meta mensal de ligações',
    read: true,
    created_at: new Date(Date.now() - 172800000).toISOString()
  }
]

export default function NotificationsPage() {
  const { profile } = useAuthStore()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  const { data: notifications = mockNotifications } = useQuery({
    queryKey: ['notifications', profile?.id],
    queryFn: async () => {
      // In production, fetch from Supabase
      // const { data } = await supabase
      //   .from('notifications')
      //   .select('*')
      //   .eq('user_id', profile?.id)
      //   .order('created_at', { ascending: false })
      // return data || []
      return mockNotifications
    }
  })

  const markAsRead = useMutation({
    mutationFn: async (id: string) => {
      // In production, update in Supabase
      // await supabase.from('notifications').update({ read: true }).eq('id', id)
      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast.success('Notificação marcada como lida')
    }
  })

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      // In production, update all in Supabase
      return true
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast.success('Todas as notificações marcadas como lidas')
    }
  })

  const deleteNotification = useMutation({
    mutationFn: async (id: string) => {
      // In production, delete from Supabase
      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast.success('Notificação removida')
    }
  })

  const filteredNotifications = filter === 'unread'
    ? notifications.filter(n => !n.read)
    : notifications

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Notificações</h1>
          <p className="text-muted-foreground">
            {unreadCount > 0
              ? `Você tem ${unreadCount} notificação${unreadCount > 1 ? 'ões' : ''} não lida${unreadCount > 1 ? 's' : ''}`
              : 'Todas as notificações foram lidas'
            }
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            onClick={() => markAllAsRead.mutate()}
            disabled={markAllAsRead.isPending}
          >
            <CheckCheck className="h-4 w-4 mr-2" />
            Marcar todas como lidas
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as 'all' | 'unread')}>
        <TabsList>
          <TabsTrigger value="all">
            Todas ({notifications.length})
          </TabsTrigger>
          <TabsTrigger value="unread">
            Não lidas ({unreadCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={filter} className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>
                {filter === 'all' ? 'Todas as Notificações' : 'Notificações Não Lidas'}
              </CardTitle>
              <CardDescription>
                Suas notificações e alertas recentes
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Bell className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium">Nenhuma notificação</h3>
                  <p className="text-sm text-muted-foreground">
                    {filter === 'unread'
                      ? 'Você não tem notificações não lidas'
                      : 'Você não tem notificações ainda'
                    }
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredNotifications.map((notification) => {
                    const Icon = notificationIcons[notification.type] || Bell
                    return (
                      <div
                        key={notification.id}
                        className={`flex items-start gap-4 p-4 rounded-lg border transition-colors ${
                          notification.read
                            ? 'bg-muted/30 border-transparent'
                            : 'bg-blue-50/50 border-blue-100'
                        }`}
                      >
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                          notification.read
                            ? 'bg-muted text-muted-foreground'
                            : 'bg-blue-100 text-blue-600'
                        }`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{notification.title}</p>
                            {!notification.read && (
                              <Badge variant="default" className="text-xs">Nova</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {notification.message}
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">
                            {formatDistanceToNow(new Date(notification.created_at), {
                              addSuffix: true,
                              locale: ptBR
                            })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          {!notification.read && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => markAsRead.mutate(notification.id)}
                              title="Marcar como lida"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteNotification.mutate(notification.id)}
                            title="Remover"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
