import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, Check, CheckCheck, Trash2, Phone, UserPlus, DollarSign, Calendar, Trophy, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/authStore'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Notification {
  id: string
  user_id: string
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
  goal_achieved: Trophy
}

const notificationColors = {
  call_scheduled: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',
  client_added: 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400',
  sale_closed: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400',
  call_reminder: 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400',
  goal_achieved: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600 dark:text-yellow-400'
}

export default function NotificationsPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  // Fetch notifications from Supabase
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      if (!user?.id) return []

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user?.id || '')
        .order('created_at', { ascending: false })

      if (error) {
        // If table doesn't exist, generate notifications from recent activities
        return await generateNotificationsFromActivity()
      }

      return (data || []) as Notification[]
    }
  })

  // Generate notifications from real activity data when table doesn't exist
  async function generateNotificationsFromActivity(): Promise<Notification[]> {
    if (!user?.id) return []

    const notifications: Notification[] = []

    // Get recent calls
    const { data: recentCalls } = await supabase
      .from('calls')
      .select(`*, client:clients(name)`)
      .eq('closer_id', user?.id || '')
      .order('created_at', { ascending: false })
      .limit(10)

    recentCalls?.forEach(call => {
      if (call.status === 'scheduled') {
        const callDate = new Date(call.scheduled_at)
        const now = new Date()
        const isUpcoming = callDate > now && callDate.getTime() - now.getTime() < 24 * 60 * 60 * 1000

        if (isUpcoming) {
          notifications.push({
            id: `call-reminder-${call.id}`,
            user_id: user?.id || '',
            type: 'call_reminder',
            title: 'Lembrete de ligação',
            message: `Você tem uma ligação agendada com ${call.client?.name || 'cliente'} em breve`,
            read: false,
            created_at: call.created_at
          })
        }

        notifications.push({
          id: `call-scheduled-${call.id}`,
          user_id: user?.id || '',
          type: 'call_scheduled',
          title: 'Ligação agendada',
          message: `Ligação com ${call.client?.name || 'cliente'} agendada para ${new Date(call.scheduled_at).toLocaleDateString('pt-BR')}`,
          read: true,
          created_at: call.created_at
        })
      }

      if (call.status === 'completed') {
        notifications.push({
          id: `call-completed-${call.id}`,
          user_id: user?.id || '',
          type: 'call_scheduled',
          title: 'Ligação concluída',
          message: `Ligação com ${call.client?.name || 'cliente'} foi concluída${call.duration_minutes ? ` (${call.duration_minutes} min)` : ''}`,
          read: true,
          created_at: call.updated_at || call.created_at
        })
      }
    })

    // Get recent sales
    const { data: recentSales } = await supabase
      .from('clients')
      .select('id, name, sale_value, updated_at')
      .eq('closer_id', user?.id || '')
      .eq('status', 'closed_won')
      .order('updated_at', { ascending: false })
      .limit(5)

    recentSales?.forEach(sale => {
      notifications.push({
        id: `sale-${sale.id}`,
        user_id: user?.id || '',
        type: 'sale_closed',
        title: 'Venda realizada!',
        message: `Venda fechada com ${sale.name}${sale.sale_value ? ` - R$ ${sale.sale_value.toLocaleString('pt-BR')}` : ''}`,
        read: true,
        created_at: sale.updated_at
      })
    })

    // Get recently added clients
    const { data: recentClients } = await supabase
      .from('clients')
      .select('id, name, created_at')
      .eq('closer_id', user?.id || '')
      .order('created_at', { ascending: false })
      .limit(5)

    recentClients?.forEach(client => {
      notifications.push({
        id: `client-${client.id}`,
        user_id: user?.id || '',
        type: 'client_added',
        title: 'Novo cliente',
        message: `${client.name} foi adicionado à sua carteira`,
        read: true,
        created_at: client.created_at
      })
    })

    // Sort by date
    notifications.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return notifications
  }

  const markAsRead = useMutation({
    mutationFn: async (id: string) => {
      // Try to update in Supabase
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id)

      if (error) {
        // Table might not exist, just invalidate to regenerate
        // Notifications table might not exist yet - non-critical
      }
      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast.success('Notificação marcada como lida')
    }
  })

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      if (!user?.id) return

      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user?.id || '')
        .eq('read', false)

      if (error) {
        // Notifications table might not exist yet - non-critical
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast.success('Todas as notificações marcadas como lidas')
    }
  })

  const deleteNotification = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id)

      if (error) {
        // Notifications table might not exist yet - non-critical
      }
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
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredNotifications.length === 0 ? (
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
                    const colorClass = notificationColors[notification.type] || 'bg-gray-100 text-gray-600'
                    return (
                      <div
                        key={notification.id}
                        className={`flex items-start gap-4 p-4 rounded-lg border transition-colors ${
                          notification.read
                            ? 'bg-muted/30 border-transparent'
                            : 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900'
                        }`}
                      >
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                          notification.read ? 'bg-muted text-muted-foreground' : colorClass
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
