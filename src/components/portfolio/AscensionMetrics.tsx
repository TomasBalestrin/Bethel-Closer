import { Users, TrendingUp, ArrowUpRight, Zap } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { PortfolioMetrics } from '@/types'

interface AscensionMetricsProps {
  metrics: PortfolioMetrics | undefined
  isLoading?: boolean
}

interface MetricCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  variant?: 'default' | 'pink' | 'blue' | 'green'
}

function MetricCard({ title, value, subtitle, icon, variant = 'default' }: MetricCardProps) {
  const bgColors = {
    default: 'bg-card',
    pink: 'bg-pink-50 dark:bg-pink-950/30',
    blue: 'bg-blue-50 dark:bg-blue-950/30',
    green: 'bg-emerald-50 dark:bg-emerald-950/30'
  }

  const iconBgColors = {
    default: 'bg-muted text-muted-foreground',
    pink: 'bg-pink-500 text-white',
    blue: 'bg-blue-500 text-white',
    green: 'bg-emerald-500 text-white'
  }

  return (
    <Card className={`${bgColors[variant]} border shadow-sm`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">{title}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div className={`h-10 w-10 rounded-full flex items-center justify-center ${iconBgColors[variant]}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function AscensionMetrics({ metrics, isLoading }: AscensionMetricsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-5">
              <div className="h-4 bg-muted rounded w-24 mb-2" />
              <div className="h-8 bg-muted rounded w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <MetricCard
        title="Total de Alunos"
        value={metrics?.totalStudents || 0}
        icon={<Users className="h-5 w-5" />}
        variant="default"
      />
      <MetricCard
        title="Ascensao 29.90 para 12K"
        value={metrics?.ascensions29To12k.count || 0}
        subtitle={`${(metrics?.ascensions29To12k.percentage || 0).toFixed(1)}% de conversao`}
        icon={<TrendingUp className="h-5 w-5" />}
        variant="pink"
      />
      <MetricCard
        title="Ascensao 12K para 80K"
        value={metrics?.ascensions12kTo80k.count || 0}
        subtitle={`${(metrics?.ascensions12kTo80k.percentage || 0).toFixed(1)}% de conversao`}
        icon={<ArrowUpRight className="h-5 w-5" />}
        variant="blue"
      />
      <MetricCard
        title="Total de Ascensoes"
        value={metrics?.totalAscensions || 0}
        icon={<Zap className="h-5 w-5" />}
        variant="green"
      />
    </div>
  )
}
