import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/services/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Server,
  Zap,
  TrendingUp,
  AlertCircle
} from 'lucide-react'
import { SystemMetrics24h } from '@/types'

export function SystemMetricsDashboard() {
  const { data: metrics, isLoading, error } = useQuery({
    queryKey: ['system-metrics-24h'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_metrics_24h')
        .select('*')

      if (error) throw error
      return data as SystemMetrics24h[]
    },
    refetchInterval: 60000 // Refresh every minute
  })

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          <AlertCircle className="w-8 h-8 mx-auto mb-2" />
          Erro ao carregar metricas
        </CardContent>
      </Card>
    )
  }

  const getHealthColor = (successRate: number) => {
    if (successRate >= 99) return 'text-green-500'
    if (successRate >= 95) return 'text-yellow-500'
    return 'text-red-500'
  }

  const getHealthBadge = (successRate: number) => {
    if (successRate >= 99) return <Badge className="bg-green-500">Saudavel</Badge>
    if (successRate >= 95) return <Badge className="bg-yellow-500">Atencao</Badge>
    return <Badge variant="destructive">Critico</Badge>
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  // Calculate overall health
  const overallSuccessRate = metrics && metrics.length > 0
    ? metrics.reduce((sum, m) => sum + m.success_rate_pct, 0) / metrics.length
    : 100

  const totalErrors = metrics?.reduce((sum, m) => sum + m.error_count, 0) || 0
  const totalOperations = metrics?.reduce((sum, m) => sum + m.total_operations, 0) || 0

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Saude Geral</p>
                <p className={`text-2xl font-bold ${getHealthColor(overallSuccessRate)}`}>
                  {overallSuccessRate.toFixed(1)}%
                </p>
              </div>
              <Activity className={`w-8 h-8 ${getHealthColor(overallSuccessRate)}`} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Operacoes</p>
                <p className="text-2xl font-bold">{totalOperations.toLocaleString()}</p>
              </div>
              <Zap className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Erros (24h)</p>
                <p className="text-2xl font-bold text-red-500">{totalErrors}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Servicos Ativos</p>
                <p className="text-2xl font-bold">{metrics?.length || 0}</p>
              </div>
              <Server className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Service Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {metrics?.map(service => (
          <Card key={service.service}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg capitalize">
                  {service.service.replace(/_/g, ' ')}
                </CardTitle>
                {getHealthBadge(service.success_rate_pct)}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Success Rate */}
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Taxa de Sucesso</span>
                  <span className={getHealthColor(service.success_rate_pct)}>
                    {service.success_rate_pct.toFixed(1)}%
                  </span>
                </div>
                <Progress
                  value={service.success_rate_pct}
                  className="h-2"
                />
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Operacoes</p>
                  <p className="font-medium">{service.total_operations.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Erros</p>
                  <p className="font-medium text-red-500">{service.error_count}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Tempo Medio</p>
                  <p className="font-medium">{formatDuration(service.avg_duration_ms)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Tempo Max</p>
                  <p className="font-medium">{formatDuration(service.max_duration_ms)}</p>
                </div>
              </div>

              {/* Warnings */}
              {service.warning_count > 0 && (
                <div className="flex items-center gap-2 text-sm text-yellow-500">
                  <AlertTriangle className="w-4 h-4" />
                  {service.warning_count} avisos
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {(!metrics || metrics.length === 0) && (
          <Card className="col-span-full">
            <CardContent className="p-6 text-center text-muted-foreground">
              <Server className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma metrica disponivel nas ultimas 24 horas</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
