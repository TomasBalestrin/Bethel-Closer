import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/authStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Target, TrendingUp } from 'lucide-react'
import { MONTHLY_QUOTA } from '@/types'

export function QuotaProgressBar() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  const { data, isLoading } = useQuery({
    queryKey: ['quota-progress', user?.profileId],
    queryFn: async () => {
      // Get current month boundaries
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

      // Get total entries for the month
      let query = supabase
        .from('clients')
        .select('entry_value')
        .eq('is_sold', true)
        .gte('sold_at', startOfMonth.toISOString())
        .lte('sold_at', endOfMonth.toISOString())

      if (!isAdmin && user?.profileId) {
        query = query.eq('closer_id', user.profileId)
      }

      const { data: sales, error: salesError } = await query

      if (salesError) throw salesError

      const totalEntry = sales?.reduce((sum, s) => sum + (s.entry_value || 0), 0) || 0

      // For admin, get closer count to calculate total quota
      let closerCount = 1
      if (isAdmin) {
        const { count, error: countError } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'closer')
          .eq('status', 'active')

        if (!countError && count) {
          closerCount = count
        }
      }

      const quota = isAdmin ? closerCount * MONTHLY_QUOTA : MONTHLY_QUOTA

      return {
        totalEntry,
        quota,
        closerCount,
        progress: Math.min((totalEntry / quota) * 100, 100)
      }
    },
    enabled: !!user
  })

  if (isLoading) {
    return <Skeleton className="h-24" />
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  const progressColor = data?.progress && data.progress >= 100
    ? 'bg-green-500'
    : data?.progress && data.progress >= 75
      ? 'bg-yellow-500'
      : 'bg-primary'

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Target className="w-4 h-4" />
          Cota Minima Mensal
          {isAdmin && data?.closerCount && (
            <span className="text-xs text-muted-foreground font-normal">
              ({data.closerCount} closers)
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Entradas</span>
            <span className="font-medium">
              {formatCurrency(data?.totalEntry || 0)} / {formatCurrency(data?.quota || MONTHLY_QUOTA)}
            </span>
          </div>
          <Progress
            value={data?.progress || 0}
            className="h-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{(data?.progress || 0).toFixed(1)}% da cota</span>
            {data?.progress && data.progress >= 100 && (
              <span className="text-green-500 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Meta atingida!
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
