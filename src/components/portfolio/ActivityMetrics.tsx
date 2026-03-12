import { Activity, Flame, Award, Calendar } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { PortfolioMetrics } from '@/types'

interface ActivityMetricsProps {
  metrics: PortfolioMetrics | undefined
  isLoading?: boolean
}

interface MetricCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  variant?: 'default' | 'orange' | 'purple' | 'cyan'
}

function MetricCard({ title, value, icon, variant = 'default' }: MetricCardProps) {
  const bgColors = {
    default: 'bg-card',
    orange: 'bg-orange-50 dark:bg-orange-950/30',
    purple: 'bg-purple-50 dark:bg-purple-950/30',
    cyan: 'bg-cyan-50 dark:bg-cyan-950/30'
  }

  const iconBgColors = {
    default: 'bg-muted text-muted-foreground',
    orange: 'bg-orange-500 text-white',
    purple: 'bg-purple-500 text-white',
    cyan: 'bg-cyan-500 text-white'
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

export function ActivityMetrics({ metrics, isLoading }: ActivityMetricsProps) {
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
        title="Total de Atividades"
        value={metrics?.totalActivities || 0}
        icon={<Activity className="h-5 w-5" />}
        variant="default"
      />
      <MetricCard
        title="Intensivos"
        value={metrics?.activitiesByType.intensivo || 0}
        icon={<Flame className="h-5 w-5" />}
        variant="orange"
      />
      <MetricCard
        title="Mentorias"
        value={metrics?.activitiesByType.mentoria || 0}
        icon={<Award className="h-5 w-5" />}
        variant="purple"
      />
      <MetricCard
        title="Eventos"
        value={metrics?.activitiesByType.evento || 0}
        icon={<Calendar className="h-5 w-5" />}
        variant="cyan"
      />
    </div>
  )
}
