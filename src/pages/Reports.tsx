import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp,
  Users,
  Phone,
  DollarSign,
  Target,
  Download,
  Calendar
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { supabase } from '@/services/supabase'
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
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

export default function ReportsPage() {
  const [period, setPeriod] = useState('month')

  // Fetch team performance data
  const { data: teamStats } = useQuery({
    queryKey: ['team-stats', period],
    queryFn: async () => {
      const { data: closers } = await supabase
        .from('profiles')
        .select('id, name, role')
        .in('role', ['closer', 'lider'])

      // Get stats for each closer
      const stats = await Promise.all(
        (closers || []).map(async (closer) => {
          const [clientsResult, callsResult, salesResult] = await Promise.all([
            supabase.from('clients').select('*', { count: 'exact' }).eq('closer_id', closer.id),
            supabase.from('calls').select('*', { count: 'exact' }).eq('closer_id', closer.id),
            supabase.from('clients').select('sale_value').eq('closer_id', closer.id).eq('status', 'closed_won')
          ])

          const totalRevenue = salesResult.data?.reduce((sum, c) => sum + (c.sale_value || 0), 0) || 0

          return {
            id: closer.id,
            name: closer.name,
            role: closer.role,
            clients: clientsResult.count || 0,
            calls: callsResult.count || 0,
            sales: salesResult.data?.length || 0,
            revenue: totalRevenue,
            conversion: callsResult.count ? ((salesResult.data?.length || 0) / callsResult.count * 100).toFixed(1) : 0
          }
        })
      )

      return stats
    }
  })

  // Monthly performance chart data
  const { data: monthlyData } = useQuery({
    queryKey: ['monthly-performance', period],
    queryFn: async () => {
      // Mock data - in production would aggregate from Supabase
      return [
        { name: 'Jan', calls: 320, sales: 48, revenue: 192000 },
        { name: 'Fev', calls: 380, sales: 56, revenue: 248000 },
        { name: 'Mar', calls: 420, sales: 68, revenue: 312000 },
        { name: 'Abr', calls: 360, sales: 52, revenue: 228000 },
        { name: 'Mai', calls: 450, sales: 72, revenue: 356000 },
        { name: 'Jun', calls: 480, sales: 82, revenue: 412000 }
      ]
    }
  })

  // Status distribution for pie chart
  const { data: statusDistribution } = useQuery({
    queryKey: ['status-distribution'],
    queryFn: async () => {
      const { data } = await supabase
        .from('clients')
        .select('status')

      const counts: Record<string, number> = {}
      data?.forEach(client => {
        counts[client.status] = (counts[client.status] || 0) + 1
      })

      return [
        { name: 'Lead', value: counts['lead'] || 0 },
        { name: 'Contactado', value: counts['contacted'] || 0 },
        { name: 'Negociando', value: counts['negotiating'] || 0 },
        { name: 'Fechado', value: counts['closed_won'] || 0 },
        { name: 'Perdido', value: counts['closed_lost'] || 0 }
      ]
    }
  })

  // Calculate totals
  const totals = teamStats?.reduce(
    (acc, stat) => ({
      clients: acc.clients + stat.clients,
      calls: acc.calls + stat.calls,
      sales: acc.sales + stat.sales,
      revenue: acc.revenue + stat.revenue
    }),
    { clients: 0, calls: 0, sales: 0, revenue: 0 }
  ) || { clients: 0, calls: 0, sales: 0, revenue: 0 }

  const overallConversion = totals.calls > 0
    ? ((totals.sales / totals.calls) * 100).toFixed(1)
    : '0'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Relatórios</h1>
          <p className="text-muted-foreground">
            Análise de performance da equipe
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[180px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Esta semana</SelectItem>
              <SelectItem value="month">Este mês</SelectItem>
              <SelectItem value="quarter">Este trimestre</SelectItem>
              <SelectItem value="year">Este ano</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Clientes
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.clients}</div>
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
            <div className="text-2xl font-bold">{totals.calls}</div>
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
            <div className="text-2xl font-bold">{totals.sales}</div>
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
            <div className="text-2xl font-bold">{formatCurrency(totals.revenue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Taxa Conversão
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallConversion}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Performance Mensal</CardTitle>
            <CardDescription>Evolução de ligações e vendas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyData}>
                  <defs>
                    <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
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
                    stroke="#3b82f6"
                    fillOpacity={1}
                    fill="url(#colorCalls)"
                    name="Ligações"
                  />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    stroke="#10b981"
                    fillOpacity={1}
                    fill="url(#colorSales)"
                    name="Vendas"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribuição de Status</CardTitle>
            <CardDescription>Status dos clientes no funil</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {statusDistribution?.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Receita Mensal</CardTitle>
          <CardDescription>Faturamento por mês</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
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
                <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Receita" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Team Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle>Performance por Closer</CardTitle>
          <CardDescription>Ranking de performance da equipe</CardDescription>
        </CardHeader>
        <CardContent>
          {!teamStats || teamStats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">Nenhum closer encontrado</h3>
              <p className="text-sm text-muted-foreground">
                Adicione closers para ver a performance da equipe
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Closer</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">Clientes</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">Ligações</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">Vendas</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">Conversão</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {teamStats
                    .sort((a, b) => b.revenue - a.revenue)
                    .map((stat, index) => (
                      <tr key={stat.id} className="border-b last:border-0">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                              {index + 1}
                            </div>
                            <div>
                              <p className="font-medium">{stat.name}</p>
                              <p className="text-xs text-muted-foreground capitalize">{stat.role}</p>
                            </div>
                          </div>
                        </td>
                        <td className="text-center py-3 px-4">{stat.clients}</td>
                        <td className="text-center py-3 px-4">{stat.calls}</td>
                        <td className="text-center py-3 px-4">
                          <Badge variant="secondary">{stat.sales}</Badge>
                        </td>
                        <td className="text-center py-3 px-4">
                          <div className="flex items-center justify-center gap-2">
                            <Progress value={Number(stat.conversion)} className="w-16 h-2" />
                            <span className="text-sm">{stat.conversion}%</span>
                          </div>
                        </td>
                        <td className="text-right py-3 px-4 font-medium">
                          {formatCurrency(stat.revenue)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
