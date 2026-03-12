import { UserPlus, Phone, Flame, CheckCircle2, TrendingUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { PortfolioMetrics } from '@/types'

interface IndicationMetricsProps {
  metrics: PortfolioMetrics | undefined
  isLoading?: boolean
}

interface MetricCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  variant?: 'default' | 'indigo' | 'emerald' | 'amber'
}

function MetricCard({ title, value, subtitle, icon, variant = 'default' }: MetricCardProps) {
  const bgColors = {
    default: 'bg-card',
    indigo: 'bg-indigo-50 dark:bg-indigo-950/30',
    emerald: 'bg-emerald-50 dark:bg-emerald-950/30',
    amber: 'bg-amber-50 dark:bg-amber-950/30'
  }

  const iconBgColors = {
    default: 'bg-muted text-muted-foreground',
    indigo: 'bg-indigo-500 text-white',
    emerald: 'bg-emerald-500 text-white',
    amber: 'bg-amber-500 text-white'
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

export function IndicationMetrics({ metrics, isLoading }: IndicationMetricsProps) {
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

  const callCount = metrics?.indicationsBySource.call || 0
  const intensivoCount = metrics?.indicationsBySource.intensivo || 0

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <MetricCard
        title="Total de Indicacoes"
        value={metrics?.totalIndications || 0}
        icon={<UserPlus className="h-5 w-5" />}
        variant="default"
      />
      <MetricCard
        title="Call vs Intensivo"
        value={`${callCount} / ${intensivoCount}`}
        subtitle="Origem das indicacoes"
        icon={<Phone className="h-5 w-5" />}
        variant="indigo"
      />
      <MetricCard
        title="Indicacoes Fechadas"
        value={metrics?.closedIndications || 0}
        icon={<CheckCircle2 className="h-5 w-5" />}
        variant="emerald"
      />
      <MetricCard
        title="Taxa de Conversao"
        value={`${(metrics?.indicationConversionRate || 0).toFixed(1)}%`}
        icon={<TrendingUp className="h-5 w-5" />}
        variant="amber"
      />
    </div>
  )
}
