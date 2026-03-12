import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/authStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Crown, Briefcase, GraduationCap, Bot } from 'lucide-react'

interface ProductStatsCardsProps {
  dateRange?: {
    from: Date
    to: Date
  }
  funnelSource?: string
}

interface ProductStats {
  product: string
  calls: number
  sales: number
  conversion: number
}

const PRODUCTS_CONFIG = [
  {
    key: 'Mentoria Elite Premium',
    label: 'Elite Premium',
    icon: Crown,
    variant: 'accent' as const
  },
  {
    key: 'Implementacao Comercial',
    label: 'Impl. Comercial',
    icon: Briefcase,
    variant: 'default' as const
  },
  {
    key: 'Mentoria Premium',
    label: 'Mentoria Julia',
    icon: GraduationCap,
    variant: 'success' as const
  },
  {
    key: 'Implementacao de IA',
    label: 'Impl. de IA',
    icon: Bot,
    variant: 'warning' as const
  }
]

export function ProductStatsCards({ dateRange, funnelSource }: ProductStatsCardsProps) {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  const { data: stats, isLoading } = useQuery({
    queryKey: ['product-stats', dateRange, funnelSource, user?.profileId],
    queryFn: async () => {
      // Fetch clients
      let clientsQuery = supabase
        .from('clients')
        .select('id, product_offered, is_sold, created_at')

      if (!isAdmin && user?.profileId) {
        clientsQuery = clientsQuery.eq('closer_id', user.profileId)
      }

      if (dateRange?.from) {
        clientsQuery = clientsQuery.gte('created_at', dateRange.from.toISOString())
      }
      if (dateRange?.to) {
        clientsQuery = clientsQuery.lte('created_at', dateRange.to.toISOString())
      }

      if (funnelSource && funnelSource !== 'all') {
        clientsQuery = clientsQuery.eq('funnel_source', funnelSource)
      }

      const { data: clients, error: clientsError } = await clientsQuery

      if (clientsError) throw clientsError

      // Calculate stats per product
      const productStats: Record<string, ProductStats> = {}

      PRODUCTS_CONFIG.forEach(p => {
        productStats[p.key] = {
          product: p.key,
          calls: 0,
          sales: 0,
          conversion: 0
        }
      })

      clients?.forEach(client => {
        const product = client.product_offered
        if (product && productStats[product]) {
          productStats[product].calls++
          if (client.is_sold) {
            productStats[product].sales++
          }
        }
      })

      // Calculate conversion rates
      Object.values(productStats).forEach(stat => {
        stat.conversion = stat.calls > 0
          ? Math.round((stat.sales / stat.calls) * 100)
          : 0
      })

      return productStats
    },
    enabled: !!user
  })

  const getVariantClasses = (variant: string) => {
    switch (variant) {
      case 'accent':
        return 'border-l-4 border-l-yellow-500'
      case 'success':
        return 'border-l-4 border-l-green-500'
      case 'warning':
        return 'border-l-4 border-l-orange-500'
      default:
        return 'border-l-4 border-l-blue-500'
    }
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {PRODUCTS_CONFIG.map(product => {
        const Icon = product.icon
        const stat = stats?.[product.key]

        return (
          <Card key={product.key} className={getVariantClasses(product.variant)}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Icon className="w-4 h-4" />
                {product.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>Calls:</span>
                  <span className="font-medium text-foreground">{stat?.calls || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Vendas:</span>
                  <span className="font-medium text-green-500">{stat?.sales || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Conversao:</span>
                  <span className="font-medium text-foreground">{stat?.conversion || 0}%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
