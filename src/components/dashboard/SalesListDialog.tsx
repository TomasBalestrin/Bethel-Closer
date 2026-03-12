import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/authStore'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { DollarSign, Calendar, Package, User } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface SalesListDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dateRange?: {
    from: Date
    to: Date
  }
  funnelSource?: string
}

interface Sale {
  id: string
  name: string
  product_offered: string | null
  sale_value: number | null
  entry_value: number | null
  sold_at: string
}

export function SalesListDialog({
  open,
  onOpenChange,
  dateRange,
  funnelSource
}: SalesListDialogProps) {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  const { data: sales, isLoading } = useQuery({
    queryKey: ['sales-list', dateRange, funnelSource, user?.profileId],
    queryFn: async () => {
      let query = supabase
        .from('clients')
        .select('id, name, product_offered, sale_value, entry_value, sold_at')
        .eq('is_sold', true)
        .not('sold_at', 'is', null)
        .order('sold_at', { ascending: false })

      if (!isAdmin && user?.profileId) {
        query = query.eq('closer_id', user.profileId)
      }

      if (dateRange?.from) {
        query = query.gte('sold_at', dateRange.from.toISOString())
      }
      if (dateRange?.to) {
        query = query.lte('sold_at', dateRange.to.toISOString())
      }

      if (funnelSource && funnelSource !== 'all') {
        query = query.eq('funnel_source', funnelSource)
      }

      const { data, error } = await query

      if (error) throw error
      return data as Sale[]
    },
    enabled: open
  })

  const totalSaleValue = sales?.reduce((sum, s) => sum + (s.sale_value || 0), 0) || 0
  const totalEntryValue = sales?.reduce((sum, s) => sum + (s.entry_value || 0), 0) || 0

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-500" />
            Vendas Fechadas
          </DialogTitle>
          <DialogDescription>
            {sales?.length || 0} vendas no periodo selecionado
          </DialogDescription>
        </DialogHeader>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
          <div>
            <p className="text-sm text-muted-foreground">Total Vendido</p>
            <p className="text-xl font-bold text-green-500">
              {formatCurrency(totalSaleValue)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Entradas</p>
            <p className="text-xl font-bold text-blue-500">
              {formatCurrency(totalEntryValue)}
            </p>
          </div>
        </div>

        <ScrollArea className="h-[400px] pr-4">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : sales && sales.length > 0 ? (
            <div className="space-y-3">
              {sales.map(sale => (
                <div
                  key={sale.id}
                  className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{sale.name}</span>
                      </div>

                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Package className="w-3 h-3" />
                        <span>{sale.product_offered || 'Produto nao especificado'}</span>
                      </div>

                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        <span>
                          {sale.sold_at
                            ? format(new Date(sale.sold_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                            : 'Data nao registrada'}
                        </span>
                      </div>
                    </div>

                    <div className="text-right space-y-1">
                      <Badge variant="default" className="bg-green-500">
                        {formatCurrency(sale.sale_value || 0)}
                      </Badge>
                      {sale.entry_value && sale.entry_value > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Entrada: {formatCurrency(sale.entry_value)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <DollarSign className="w-12 h-12 mb-2 opacity-50" />
              <p>Nenhuma venda no periodo</p>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
