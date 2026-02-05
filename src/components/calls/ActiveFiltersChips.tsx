import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { CallResultStatus } from '@/types'
import type { DateRange } from './DateRangePicker'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface ActiveFiltersChipsProps {
  searchQuery: string
  statusFilter: CallResultStatus | 'all'
  dateRange: DateRange | undefined
  closerFilter?: string
  onClearSearch: () => void
  onClearStatus: () => void
  onClearDateRange: () => void
  onClearCloser?: () => void
  onClearAll: () => void
}

const statusLabels: Record<CallResultStatus, string> = {
  pendente: 'Pendente',
  follow_up: 'Follow-up',
  proposta: 'Proposta',
  vendida: 'Vendida',
  perdida: 'Perdida'
}

export function ActiveFiltersChips({
  searchQuery,
  statusFilter,
  dateRange,
  closerFilter,
  onClearSearch,
  onClearStatus,
  onClearDateRange,
  onClearCloser,
  onClearAll
}: ActiveFiltersChipsProps) {
  const hasFilters = searchQuery || statusFilter !== 'all' || dateRange?.from || (closerFilter && closerFilter !== 'all')

  if (!hasFilters) return null

  const formatDateRange = () => {
    if (!dateRange?.from) return ''
    if (dateRange.to) {
      return `${format(dateRange.from, 'dd/MM', { locale: ptBR })} - ${format(dateRange.to, 'dd/MM', { locale: ptBR })}`
    }
    return format(dateRange.from, 'dd/MM/yyyy', { locale: ptBR })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Filtros ativos:</span>

      {searchQuery && (
        <Badge variant="secondary" className="gap-1 pr-1">
          Busca: "{searchQuery}"
          <button
            onClick={onClearSearch}
            className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
          >
            <X className="w-3 h-3" />
          </button>
        </Badge>
      )}

      {statusFilter !== 'all' && (
        <Badge variant="secondary" className="gap-1 pr-1">
          Status: {statusLabels[statusFilter]}
          <button
            onClick={onClearStatus}
            className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
          >
            <X className="w-3 h-3" />
          </button>
        </Badge>
      )}

      {dateRange?.from && (
        <Badge variant="secondary" className="gap-1 pr-1">
          Período: {formatDateRange()}
          <button
            onClick={onClearDateRange}
            className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
          >
            <X className="w-3 h-3" />
          </button>
        </Badge>
      )}

      {closerFilter && closerFilter !== 'all' && onClearCloser && (
        <Badge variant="secondary" className="gap-1 pr-1">
          Closer: {closerFilter}
          <button
            onClick={onClearCloser}
            className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
          >
            <X className="w-3 h-3" />
          </button>
        </Badge>
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={onClearAll}
        className="text-muted-foreground hover:text-foreground h-6 px-2 text-xs"
      >
        Limpar todos
      </Button>
    </div>
  )
}
