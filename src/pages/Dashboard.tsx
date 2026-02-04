import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Phone,
  DollarSign,
  Target,
  TrendingUp,
  BookOpen,
  Calendar,
  Star,
  Receipt,
  Building2,
  GraduationCap,
  ShoppingCart,
  Monitor,
  Flag,
  Users
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/authStore'
import { formatCurrency } from '@/lib/utils'
import { getDailyVerse } from '@/lib/verses'
import type { TicketType } from '@/types'

// Product/Ticket type configuration
const productConfig: Record<TicketType, { name: string; icon: React.ReactNode; bgColor: string; iconBg: string }> = {
  '29_90': {
    name: 'Elite Premium',
    icon: <ShoppingCart className="h-5 w-5 text-white" />,
    bgColor: 'bg-purple-50 dark:bg-purple-950/30',
    iconBg: 'bg-purple-600'
  },
  '12k': {
    name: 'Implementação Comercial',
    icon: <Building2 className="h-5 w-5 text-white" />,
    bgColor: 'bg-muted',
    iconBg: 'bg-gray-600 dark:bg-gray-500'
  },
  '80k': {
    name: 'Mentoria Premium Julia',
    icon: <GraduationCap className="h-5 w-5 text-white" />,
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    iconBg: 'bg-emerald-500'
  },
  'impl_ia': {
    name: 'Implementação de IA',
    icon: <Monitor className="h-5 w-5 text-white" />,
    bgColor: 'bg-teal-50 dark:bg-teal-950/30',
    iconBg: 'bg-teal-500'
  }
}

// Role labels and colors
const roleConfig: Record<string, { label: string; color: string }> = {
  admin: { label: 'Administrador', color: 'bg-red-500' },
  lider: { label: 'Líder', color: 'bg-blue-500' },
  closer: { label: 'Especialista Elite', color: 'bg-emerald-500' }
}

// Get greeting based on time of day
function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

// Get current month date range
function getMonthDateRange(): { start: Date; end: Date; label: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const formatDate = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  return {
    start,
    end,
    label: `${formatDate(start)} - ${formatDate(end)}`
  }
}

interface MetricCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  variant?: 'default' | 'green' | 'orange'
}

function MetricCard({ title, value, icon, variant = 'default' }: MetricCardProps) {
  const bgColors = {
    default: 'bg-card',
    green: 'bg-emerald-50 dark:bg-emerald-950/30',
    orange: 'bg-orange-50 dark:bg-orange-950/30'
  }

  const iconBgColors = {
    default: 'bg-muted text-muted-foreground',
    green: 'bg-emerald-500 text-white',
    orange: 'bg-orange-400 text-white'
  }

  return (
    <Card className={`${bgColors[variant]} border shadow-sm`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">{title}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
          </div>
          <div className={`h-10 w-10 rounded-full flex items-center justify-center ${iconBgColors[variant]}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface ProductCardProps {
  name: string
  icon: React.ReactNode
  iconBg: string
  bgColor: string
  count: number
  callsPercent: number
  sales: number
  conversionRate: number
}

function ProductCard({ name, icon, iconBg, bgColor, count, callsPercent, sales, conversionRate }: ProductCardProps) {
  return (
    <Card className={`${bgColor} border shadow-sm`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <p className="text-sm font-medium text-foreground/80">{name}</p>
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${iconBg}`}>
            {icon}
          </div>
        </div>
        <p className="text-3xl font-bold text-foreground mb-2">{count}</p>
        <p className="text-xs text-muted-foreground">
          {callsPercent.toFixed(0)}% das calls | {sales} vendas
          <br />
          ({conversionRate.toFixed(0)}% conv.)
        </p>
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const { user, profile } = useAuthStore()
  const dailyVerse = getDailyVerse(user?.id)
  const [funnelFilter, setFunnelFilter] = useState<string>('all')
  const [closerFilter, setCloserFilter] = useState<string>('all')
  const dateRange = getMonthDateRange()

  const isAdmin = profile?.role === 'admin' || profile?.role === 'lider'

  // Fetch closers list (admin/lider only)
  const { data: closers = [] } = useQuery({
    queryKey: ['dashboard-closers'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, user_id, name, email')
        .order('name')
      return data || []
    },
    enabled: isAdmin
  })

  // Fetch dashboard stats
  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats', dateRange.start.toISOString(), closerFilter, isAdmin],
    queryFn: async () => {
      const startOfMonth = dateRange.start.toISOString()
      const endOfMonth = dateRange.end.toISOString()

      // Build queries with optional closer_id filter (closer_id = profiles.id)
      let clientsQuery = supabase.from('clients').select('id, ticket_type, status, sale_value, entry_value, created_at, closer_id')
      let callsQuery = supabase.from('calls').select('id, status, quality_score, client_id, closer_id').gte('scheduled_at', startOfMonth).lte('scheduled_at', endOfMonth)
      let salesQuery = supabase.from('clients').select('id, sale_value, entry_value, ticket_type, closer_id').eq('status', 'closed_won').gte('created_at', startOfMonth).lte('created_at', endOfMonth)
      let allCallsQuery = supabase.from('calls').select('id, quality_score, closer_id').eq('status', 'completed')

      // If admin is filtering by specific closer, apply the filter
      if (isAdmin && closerFilter !== 'all') {
        clientsQuery = clientsQuery.eq('closer_id', closerFilter)
        salesQuery = salesQuery.eq('closer_id', closerFilter)
        callsQuery = callsQuery.eq('closer_id', closerFilter)
        allCallsQuery = allCallsQuery.eq('closer_id', closerFilter)
      }

      const [clientsResult, callsResult, salesResult, allCallsResult] = await Promise.all([
        clientsQuery,
        callsQuery,
        salesQuery,
        allCallsQuery
      ])

      const clients = clientsResult.data || []
      const calls = callsResult.data || []
      const sales = salesResult.data || []
      const allCalls = allCallsResult.data || []

      // Calculate metrics
      const totalCalls = calls.length
      const totalSales = sales.length
      const conversionRate = totalCalls > 0 ? (totalSales / totalCalls) * 100 : 0
      const totalSaleValue = sales.reduce((sum, c) => sum + (c.sale_value || 0), 0)
      const totalEntryValue = sales.reduce((sum, c) => sum + (c.entry_value || 0), 0)

      // Average call score
      const completedCallsWithScore = allCalls.filter(c => c.quality_score !== null)
      const avgCallScore = completedCallsWithScore.length > 0
        ? completedCallsWithScore.reduce((sum, c) => sum + (c.quality_score || 0), 0) / completedCallsWithScore.length
        : null

      // Product breakdown
      const productStats = Object.keys(productConfig).reduce((acc, key) => {
        const ticketType = key as TicketType
        const productClients = clients.filter(c => c.ticket_type === ticketType)
        const productSales = sales.filter(c => c.ticket_type === ticketType)
        const productCallsCount = calls.filter(c => {
          const client = clients.find(cl => cl.id === c.client_id)
          return client?.ticket_type === ticketType
        }).length

        acc[ticketType] = {
          count: productClients.length,
          calls: productCallsCount,
          callsPercent: totalCalls > 0 ? (productCallsCount / totalCalls) * 100 : 0,
          sales: productSales.length,
          conversionRate: productCallsCount > 0 ? (productSales.length / productCallsCount) * 100 : 0
        }
        return acc
      }, {} as Record<TicketType, { count: number; calls: number; callsPercent: number; sales: number; conversionRate: number }>)

      return {
        totalCalls,
        totalSales,
        conversionRate,
        totalSaleValue,
        totalEntryValue,
        avgCallScore,
        productStats
      }
    }
  })

  // Fetch monthly goal
  const { data: monthlyGoal } = useQuery({
    queryKey: ['monthly-goal'],
    queryFn: async () => {
      const now = new Date()

      // Try with year column first, fallback to without
      let result = await supabase
        .from('monthly_goals')
        .select('*')
        .eq('month', now.getMonth() + 1)
        .eq('year', now.getFullYear())
        .maybeSingle()

      if (result.error) {
        // year column might not exist - try without it
        result = await supabase
          .from('monthly_goals')
          .select('*')
          .eq('month', now.getMonth() + 1)
          .maybeSingle()

        if (result.error) {
          console.warn('Monthly goal fetch error:', result.error.message)
          return null
        }
      }
      return result.data
    },
    retry: false
  })

  // Cota mínima (minimum quota) - fixed at R$ 80,000
  const cotaMinima = 80000
  const cotaProgress = stats?.totalSaleValue ? (stats.totalSaleValue / cotaMinima) * 100 : 0
  const cotaRemaining = cotaMinima - (stats?.totalSaleValue || 0)

  const userName = user?.name?.split(' ')[0] || profile?.name?.split(' ')[0] || 'Usuário'
  const userRole = profile?.role || 'closer'
  const roleInfo = roleConfig[userRole] || roleConfig.closer

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
              {getGreeting()}, {userName}!
            </h1>
            <Badge className={`${roleInfo.color} text-white border-0 px-3 py-1`}>
              {roleInfo.label}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {isAdmin
              ? closerFilter === 'all'
                ? 'Visão geral do desempenho da equipe'
                : `Desempenho de ${closers.find(c => c.id === closerFilter)?.name || 'closer'}`
              : 'Confira seu desempenho e acompanhe suas metas'}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {isAdmin && (
            <Select value={closerFilter} onValueChange={setCloserFilter}>
              <SelectTrigger className="w-[200px] bg-card">
                <Users className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Todos os Closers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Closers</SelectItem>
                {closers.map((closer) => (
                  <SelectItem key={closer.id} value={closer.id}>
                    {closer.name || closer.email || 'Sem nome'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={funnelFilter} onValueChange={setFunnelFilter}>
            <SelectTrigger className="w-[180px] bg-card">
              <SelectValue placeholder="Todos os Funis" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Funis</SelectItem>
              <SelectItem value="29_90">Elite Premium</SelectItem>
              <SelectItem value="12k">Implementação Comercial</SelectItem>
              <SelectItem value="80k">Mentoria Premium Julia</SelectItem>
              <SelectItem value="impl_ia">Implementação de IA</SelectItem>
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="bg-card">
                <Calendar className="h-4 w-4 mr-2" />
                {dateRange.label}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-4" align="end">
              <p className="text-sm text-muted-foreground">
                Período atual: {dateRange.label}
              </p>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Versículo do Dia */}
      <Card className="bg-muted border shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
              <BookOpen className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <p className="text-sm font-medium text-primary">Versículo do Dia</p>
                <Badge variant="secondary" className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border-0 text-xs">
                  {dailyVerse.category}
                </Badge>
              </div>
              <p className="text-foreground mb-2">"{dailyVerse.text}"</p>
              <p className="text-sm font-semibold text-foreground/80">— {dailyVerse.reference}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cota e Meta */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Cota Mínima */}
        <Card className="border shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Target className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-foreground">Cota Mínima</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">
                {formatCurrency(stats?.totalSaleValue || 0)} de {formatCurrency(cotaMinima)}
              </span>
              <span className="text-sm font-medium">{Math.min(cotaProgress, 100).toFixed(0)}%</span>
            </div>
            <Progress value={Math.min(cotaProgress, 100)} className="h-2 mb-3" />
            <p className="text-xs text-amber-600">
              Faltam {formatCurrency(Math.max(cotaRemaining, 0))} para atingir a cota
            </p>
          </CardContent>
        </Card>

        {/* Meta Mensal */}
        <Card className="border shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Flag className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-foreground">Meta Mensal</span>
            </div>
            {monthlyGoal ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Meta de vendas: {formatCurrency(monthlyGoal.target_revenue || 0)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Meta de ligações: {monthlyGoal.target_calls || 0}
                </p>
              </div>
            ) : (
              <p className="text-sm text-primary">
                Meta não definida pelo líder
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stats Grid - Row 1 */}
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="Total de Calls"
          value={stats?.totalCalls || 0}
          icon={<Phone className="h-5 w-5" />}
          variant="default"
        />
        <MetricCard
          title="Vendas Fechadas"
          value={stats?.totalSales || 0}
          icon={<Target className="h-5 w-5" />}
          variant="green"
        />
        <MetricCard
          title="Taxa de Conversão"
          value={`${(stats?.conversionRate || 0).toFixed(0)}%`}
          icon={<TrendingUp className="h-5 w-5" />}
          variant="default"
        />
      </div>

      {/* Stats Grid - Row 2 */}
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="Valor Total Vendido"
          value={formatCurrency(stats?.totalSaleValue || 0)}
          icon={<DollarSign className="h-5 w-5" />}
          variant="default"
        />
        <MetricCard
          title="Total de Entradas"
          value={formatCurrency(stats?.totalEntryValue || 0)}
          icon={<Receipt className="h-5 w-5" />}
          variant="green"
        />
        <MetricCard
          title="Nota Média de Calls"
          value={stats?.avgCallScore != null ? `${stats.avgCallScore.toFixed(0)}` : '-'}
          icon={<Star className="h-5 w-5" />}
          variant="orange"
        />
      </div>

      {/* Número de Ofertas por Produto */}
      <div>
        <h2 className="text-lg font-bold text-foreground mb-4">Número de Ofertas por Produto</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Object.entries(productConfig).map(([key, config]) => {
            const ticketType = key as TicketType
            const productStat = stats?.productStats?.[ticketType] || {
              count: 0,
              callsPercent: 0,
              sales: 0,
              conversionRate: 0
            }

            return (
              <ProductCard
                key={key}
                name={config.name}
                icon={config.icon}
                iconBg={config.iconBg}
                bgColor={config.bgColor}
                count={productStat.count}
                callsPercent={productStat.callsPercent}
                sales={productStat.sales}
                conversionRate={productStat.conversionRate}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
