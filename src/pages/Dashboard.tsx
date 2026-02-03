import { useQuery } from '@tanstack/react-query'
import {
  Users,
  Phone,
  DollarSign,
  Target,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/authStore'
import { formatCurrency } from '@/lib/utils'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts'

interface StatCardProps {
  title: string
  value: string | number
  description: string
  icon: React.ReactNode
  trend?: {
    value: number
    isPositive: boolean
  }
}

function StatCard({ title, value, description, icon, trend }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-muted-foreground">{description}</span>
          {trend && (
            <Badge variant={trend.isPositive ? 'success' : 'destructive'} className="text-xs">
              {trend.isPositive ? (
                <ArrowUpRight className="h-3 w-3 mr-1" />
              ) : (
                <ArrowDownRight className="h-3 w-3 mr-1" />
              )}
              {trend.value}%
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const { user } = useAuthStore()

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      const [clientsResult, callsResult, salesResult] = await Promise.all([
        supabase.from('clients').select('*', { count: 'exact' }),
        supabase.from('calls').select('*', { count: 'exact' }).gte('scheduled_at', startOfMonth),
        supabase.from('clients').select('sale_value').eq('status', 'closed_won').gte('created_at', startOfMonth)
      ])

      const totalRevenue = salesResult.data?.reduce((sum, c) => sum + (c.sale_value || 0), 0) || 0

      return {
        totalClients: clientsResult.count || 0,
        callsThisMonth: callsResult.count || 0,
        salesThisMonth: salesResult.data?.length || 0,
        revenueThisMonth: totalRevenue
      }
    }
  })

  const { data: chartData } = useQuery({
    queryKey: ['dashboard-chart'],
    queryFn: async () => {
      // Mock data for chart - in production, this would come from Supabase
      return [
        { name: 'Jan', calls: 65, sales: 12, revenue: 48000 },
        { name: 'Fev', calls: 72, sales: 15, revenue: 62000 },
        { name: 'Mar', calls: 80, sales: 18, revenue: 75000 },
        { name: 'Abr', calls: 68, sales: 14, revenue: 55000 },
        { name: 'Mai', calls: 85, sales: 20, revenue: 82000 },
        { name: 'Jun', calls: 92, sales: 22, revenue: 95000 }
      ]
    }
  })

  const { data: recentCalls } = useQuery({
    queryKey: ['recent-calls'],
    queryFn: async () => {
      const { data } = await supabase
        .from('calls')
        .select(`
          *,
          client:clients(name, email)
        `)
        .order('scheduled_at', { ascending: false })
        .limit(5)

      return data || []
    }
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Bem-vindo de volta, {user?.name}!
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total de Clientes"
          value={stats?.totalClients || 0}
          description="Clientes cadastrados"
          icon={<Users className="h-4 w-4" />}
          trend={{ value: 12, isPositive: true }}
        />
        <StatCard
          title="Ligações do Mês"
          value={stats?.callsThisMonth || 0}
          description="Ligações realizadas"
          icon={<Phone className="h-4 w-4" />}
          trend={{ value: 8, isPositive: true }}
        />
        <StatCard
          title="Vendas do Mês"
          value={stats?.salesThisMonth || 0}
          description="Fechamentos"
          icon={<Target className="h-4 w-4" />}
          trend={{ value: 15, isPositive: true }}
        />
        <StatCard
          title="Receita do Mês"
          value={formatCurrency(stats?.revenueThisMonth || 0)}
          description="Faturamento"
          icon={<DollarSign className="h-4 w-4" />}
          trend={{ value: 23, isPositive: true }}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Performance Mensal</CardTitle>
            <CardDescription>Ligações e vendas nos últimos 6 meses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="calls"
                    stroke="hsl(var(--primary))"
                    fillOpacity={1}
                    fill="url(#colorCalls)"
                    name="Ligações"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Receita Mensal</CardTitle>
            <CardDescription>Faturamento nos últimos 6 meses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis className="text-xs" tickFormatter={(value) => `R$${value / 1000}k`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Bar
                    dataKey="revenue"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                    name="Receita"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ligações Recentes</CardTitle>
            <CardDescription>Suas últimas ligações</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentCalls?.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma ligação registrada
                </p>
              ) : (
                recentCalls?.map((call) => (
                  <div
                    key={call.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Phone className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{call.client?.name || 'Cliente'}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(call.scheduled_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={
                        call.status === 'completed'
                          ? 'success'
                          : call.status === 'scheduled'
                          ? 'secondary'
                          : 'destructive'
                      }
                    >
                      {call.status === 'completed'
                        ? 'Concluída'
                        : call.status === 'scheduled'
                        ? 'Agendada'
                        : call.status}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Metas do Mês</CardTitle>
            <CardDescription>Seu progresso este mês</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Ligações</span>
                <span className="text-sm text-muted-foreground">
                  {stats?.callsThisMonth || 0} / 100
                </span>
              </div>
              <Progress value={(stats?.callsThisMonth || 0)} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Vendas</span>
                <span className="text-sm text-muted-foreground">
                  {stats?.salesThisMonth || 0} / 20
                </span>
              </div>
              <Progress value={(stats?.salesThisMonth || 0) * 5} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Receita</span>
                <span className="text-sm text-muted-foreground">
                  {formatCurrency(stats?.revenueThisMonth || 0)} / {formatCurrency(100000)}
                </span>
              </div>
              <Progress value={(stats?.revenueThisMonth || 0) / 1000} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
